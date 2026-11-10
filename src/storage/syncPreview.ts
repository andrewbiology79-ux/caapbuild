import { getDb, type CqScope, type QbDatabase } from '../db/db';
import { scopeRoot, DATA_FILE } from './folderLayout';
import { scanTree, readText } from './nativeStore';
import { withSyncLock } from './syncLock';
import { ProgressTracker, type ProgressCallback } from './syncProgress';
import { peekPending } from './writer';
import {
  buildNodes,
  identifyNodes,
  needsDataRead,
  topicIdOfDataNode,
  compareFolderToApp,
  compareAppToFolder,
  summarize,
  hasAnyChange,
  makeStamp,
  SCOPE_LABEL,
  type AppSnapshot,
  type FileDataMap,
  type FilePayload,
  type FolderNode,
  type PreviewEntry,
  type ConflictEntry,
  type ExtraEntry,
  type PreviewTotals,
  type ImageInfo,
} from './syncCompare';

/**
 * ধাপ ২ - প্রিভিউ (ড্রাই-রান): "এখন সিঙ্ক করলে কী কী বদলাবে" হিসাব করে। ফোল্ডার বা ডেটাবেসে কিছুই লেখে না, মোছে না, সরায় না।
 *
 * তুলনার নিয়ম syncCompare.ts-এ (আসল স্ক্যানারও একই নিয়ম ব্যবহার করে)। এই ফাইল শুধু ফোল্ডার ও ডেটাবেস থেকে
 * তথ্য জোগাড় করে সেই খাঁটি ফাংশনে দেয়। দুটো ফাংশনই withSyncLock-এর ভেতরে চলে, তাই চলার সময় অন্য কোনো
 * সিঙ্ক লেখা বা স্ক্যান পাশাপাশি চলে না।
 *
 * মনে রাখো: অ্যাপের জমে থাকা বদল প্রিভিউয়ের আগে ফোল্ডারে লেখা হয় না (লিখলে ফোল্ডারে বাইরে থেকে বদলানো ফাইল
 * চুপচাপ ঢাকা পড়ত)। জমে থাকা বদল "অ্যাপের দিক" ধরে হিসাব হয়; দুই দিকেই বদলালে সেটা কনফ্লিক্ট হিসেবে ওঠে।
 */

export type SyncDirection = 'folder-to-app' | 'app-to-folder';

export interface SyncPreview {
  direction: SyncDirection;
  /** names the Sync_Conflicts/<stamp> folder - the real sync reuses it so the shown path is the real path */
  stamp: string;
  createdAt: number;
  entries: PreviewEntry[];
  conflicts: ConflictEntry[];
  /** অপ্রয়োজনীয় জিনিস - কনফ্লিক্ট নয়, নিজের ফোল্ডারের unnecessary/-তে সরবে */
  extras: ExtraEntry[];
  warnings: string[];
  /** a scope that could not be read: the other scope is still shown */
  errors: string[];
  /** folders -> app: more than half of the folders look deleted (the real scan asks before deleting) */
  massDelete?: { count: number; total: number };
  totals: PreviewTotals;
  /** nothing would change and there is no conflict / extra item */
  empty: boolean;
}

const SCOPES: CqScope[] = ['type', 'chapter'];
const READ_PARALLEL = 4;

async function snapshotApp(sdb: QbDatabase): Promise<AppSnapshot> {
  const [subjects, chapters, topics, rows, questions, stimuli, images] = await Promise.all([
    sdb.subjects.toArray(),
    sdb.chapters.toArray(),
    sdb.topics.toArray(),
    sdb.syncState.toArray(),
    sdb.questions.toArray(),
    sdb.stimuli.toArray(),
    sdb.images.toArray(),
  ]);
  const questionsByTopic = new Map<string, typeof questions>();
  for (const q of questions) {
    const list = questionsByTopic.get(q.topicId);
    if (list) list.push(q);
    else questionsByTopic.set(q.topicId, [q]);
  }
  const stimuliByTopic = new Map<string, typeof stimuli>();
  for (const s of stimuli) {
    const list = stimuliByTopic.get(s.topicId);
    if (list) list.push(s);
    else stimuliByTopic.set(s.topicId, [s]);
  }
  const imageById = new Map<string, ImageInfo>();
  for (const im of images) imageById.set(im.id, { id: im.id, hasBlob: !!im.blob, topicId: im.topicId });
  return { subjects, chapters, topics, rows, questionsByTopic, stimuliByTopic, imageById };
}

/** Read the given data.json files a few at a time */
async function readDataFiles(root: string, nodes: FolderNode[], onRead?: (n: FolderNode) => void): Promise<FileDataMap> {
  const out: FileDataMap = new Map();
  let next = 0;
  const worker = async () => {
    while (next < nodes.length) {
      const n = nodes[next++];
      const text = await readText(`${root}/${n.path}/${DATA_FILE}`);
      let payload: FilePayload | null = null;
      if (text !== null) {
        try {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed === 'object') {
            payload = {
              stimuli: Array.isArray(parsed.stimuli) ? parsed.stimuli : [],
              questions: Array.isArray(parsed.questions) ? parsed.questions : [],
              images: Array.isArray(parsed.images) ? parsed.images : [],
            };
          }
        } catch {
          payload = null;
        }
      }
      out.set(n.path, { payload });
      onRead?.(n);
    }
  };
  await Promise.all(Array.from({ length: Math.min(READ_PARALLEL, nodes.length) }, worker));
  return out;
}

function insideDuplicate(n: FolderNode, dup: Set<FolderNode>): boolean {
  for (let p: FolderNode | undefined = n; p; p = p.parent) if (dup.has(p)) return true;
  return false;
}

async function previewScope(direction: SyncDirection, scope: CqScope, stamp: string, tracker?: ProgressTracker) {
  const sdb = getDb(scope);
  const root = scopeRoot(scope);
  const scopeName = SCOPE_LABEL[scope];
  tracker?.setPhase('list', scopeName);
  const listing = await scanTree(root);
  tracker?.step(1, scopeName, 'snapshot');
  const app = await snapshotApp(sdb);
  tracker?.step(1, scopeName);
  const folderRows = app.rows.filter((r) => r.kind !== 'data' && r.dirName).length;

  if (!listing.exists) {
    if (folderRows > 0 && direction === 'folder-to-app') {
      throw new Error('Question_Bank ফোল্ডার পাওয়া যায়নি (কিছু মোছা হবে না)');
    }
    // app -> folder: nothing exists yet, the compare below sees an empty tree and lists everything as "create"
  }

  const nodes = listing.exists ? buildNodes(scope, listing.entries) : [];
  const rowById = new Map(app.rows.map((r) => [r.id, r]));
  const { dupNodes } = identifyNodes(nodes, rowById, new Map());

  // which data.json files have to be read
  const dataDepth = scope === 'type' ? 3 : 2;
  const toRead: FolderNode[] = [];
  for (const n of nodes) {
    if (n.depth !== dataDepth || !n.hasData || insideDuplicate(n, dupNodes)) continue;
    if (direction === 'app-to-folder') {
      toRead.push(n); // this direction needs the exact difference, so every file is read
      continue;
    }
    const topicId = topicIdOfDataNode(scope, n, app.topics);
    const dataRow = topicId ? rowById.get(`data:${topicId}`) : undefined;
    if (needsDataRead(n, false, dataRow)) toRead.push(n);
  }
  // এখন জানা গেল কয়টি ফাইল পড়তে হবে - মোট একক বাড়ে (বার পিছোয় না, লাফায়ও না)
  tracker?.addTotal(toRead.length);
  tracker?.setPhase('read', scopeName);
  const fileData = await readDataFiles(root, toRead, (n) => tracker?.step(1, `${scopeName} › ${n.path}`));

  tracker?.setPhase('compare', scopeName);
  const result =
    direction === 'folder-to-app'
      ? compareFolderToApp({ scope, stamp, nodes, app, fileData, pending: peekPending(scope) })
      : compareAppToFolder({ scope, stamp, nodes, app, fileData });
  tracker?.step(1, scopeName);
  return result;
}

async function runPreview(direction: SyncDirection, onProgress?: ProgressCallback): Promise<SyncPreview> {
  const stamp = makeStamp();
  // প্রতি স্কোপে ৩টি নিশ্চিত একক (তালিকা পড়া, অ্যাপের তথ্য, তুলনা); data.json পড়ার সংখ্যা জানা গেলে যোগ হয়
  const tracker = onProgress ? new ProgressTracker(onProgress, SCOPES.length * 3, 'list') : undefined;
  tracker?.setPhase('list');
  const out: SyncPreview = {
    direction,
    stamp,
    createdAt: Date.now(),
    entries: [],
    conflicts: [],
    extras: [],
    warnings: [],
    errors: [],
    totals: summarize([], []),
    empty: true,
  };

  await withSyncLock(async () => {
    for (const scope of SCOPES) {
      try {
        const r = await previewScope(direction, scope, stamp, tracker);
        out.entries.push(...r.entries);
        out.conflicts.push(...r.conflicts);
        out.extras.push(...r.extras);
        out.warnings.push(...r.warnings);
        if (r.massDelete) {
          out.massDelete = out.massDelete
            ? { count: out.massDelete.count + r.massDelete.count, total: out.massDelete.total + r.massDelete.total }
            : r.massDelete;
        }
      } catch (err: any) {
        console.warn(`Sync preview (${scope}) failed:`, err);
        out.errors.push(`${scope === 'chapter' ? 'Chapter CQ' : 'Type CQ'}: ${err?.message || String(err)}`);
      }
    }
  });

  out.totals = summarize(out.entries, out.conflicts, out.extras);
  out.empty = !hasAnyChange(out.totals);
  tracker?.finish();
  return out;
}

/** "ফোল্ডার থেকে সিঙ্ক করুন" - ফোল্ডারের তথ্য অ্যাপে এলে কী বদলাবে (কিছু লেখে না) */
export function previewFolderToApp(onProgress?: ProgressCallback): Promise<SyncPreview> {
  return runPreview('folder-to-app', onProgress);
}

/** "অ্যাপ থেকে ফোল্ডারে সিঙ্ক করুন" - অ্যাপের তথ্য ফোল্ডারে গেলে কী বদলাবে (কিছু লেখে না) */
export function previewAppToFolder(onProgress?: ProgressCallback): Promise<SyncPreview> {
  return runPreview('app-to-folder', onProgress);
}
