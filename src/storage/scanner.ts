import { getDb, type CqScope, type QbDatabase, type Stimulus, type Question, type SyncRow } from '../db/db';
import {
  scopeRoot,
  kindOfDepth,
  FOLDER_META,
  DATA_FILE,
  MEDIA_DIR,
  imageIdFromFileName,
  type FolderKind,
  type FolderMeta,
} from './folderLayout';
import { scanTree, readText, writeText, makeDir } from './nativeStore';
import { sha256Hex, sameContent } from './hash';
import { markSyncTx, markTopicDirty, markEntityDirty, forgetWritten, isTopicPending } from './writer';
import { askDeleteConfirm, type DeleteRequest } from './deleteConfirm';
import { isUnderUnreadable, rowPathOf, pickTopLevel, missingIds } from './scanSafety';

/**
 * Folders -> app.
 *
 * The folder tree is the real data. This reads it (one native call), compares it with what the app
 * knows (syncState) and brings the app database in line:
 *   - new folder              -> new subject / chapter / type
 *   - folder renamed / moved  -> item renamed / moved (recognised by the id in ".folder.json")
 *   - folder deleted          -> item deleted (with everything inside it)
 *   - data.json changed       -> questions / stimuli of that type updated
 *   - media/ files            -> picture index updated
 * Pending app changes are always written into the folders BEFORE a scan (see syncEngine.ts), so every
 * difference found here really comes from outside the app.
 */

export interface ScanSummary {
  scope: CqScope;
  added: number;
  renamed: number;
  deleted: number;
  topicsUpdated: number;
  warnings: string[];
  /** something in the app database changed */
  changed: boolean;
  /** the scan could not run (folder not readable ...) - nothing was changed */
  error?: string;
  /** ধাপ ১.৫: ফোল্ডারের কিছু অংশ পড়া যায়নি - ওই অংশে কিছু মোছা/বদলানো হয়নি */
  incomplete?: boolean;
}

export interface ScanOptions {
  /**
   * অ্যাপ থেকে কিছু মুছতে যাওয়ার আগে জিজ্ঞাসা (ফোল্ডার না পেলে / data.json থেকে প্রশ্ন বাদ পড়লে)।
   * true = মুছো, false = রেখে দাও। না দিলে deleteConfirm.ts-এর ডায়ালগ (SyncRunner) ব্যবহার হয়।
   */
  confirmDelete?: (req: DeleteRequest) => Promise<boolean>;
}

interface Node {
  path: string;
  name: string;
  depth: number;
  kind: FolderKind;
  metaText?: string;
  id?: string;
  isNew?: boolean;
  parent?: Node;
  order?: number;
  hasData: boolean;
  dataMtime: number;
  dataSize: number;
  mediaFiles: string[];
}

const DEFAULT_MARKS: Record<string, number> = { 'ক': 1, 'খ': 2, 'গ': 3, 'ঘ': 4 };

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
}

function normStimulus(s: any, topicId: string, id: string): Stimulus {
  const imageIds: string[] = Array.isArray(s?.imageIds) ? s.imageIds.filter((x: any) => typeof x === 'string') : [];
  return {
    ...s,
    id,
    topicId,
    text: typeof s?.text === 'string' ? s.text : '',
    imageIds,
    usedInBoards: Array.isArray(s?.usedInBoards) ? s.usedInBoards : [],
  };
}

function normQuestion(q: any, index: number, topicId: string, id: string, stimulusId?: string): Question {
  const type = ['ক', 'খ', 'গ', 'ঘ'].includes(q?.type) ? q.type : 'ক';
  const marks = Number(q?.marks);
  const rating = Number(q?.rating);
  const order = Number(q?.order);
  return {
    ...q,
    id,
    topicId,
    stimulusId,
    type,
    marks: Number.isFinite(marks) && marks > 0 ? marks : DEFAULT_MARKS[type] ?? 1,
    questionText: typeof q?.questionText === 'string' ? q.questionText : '',
    solutionText: typeof q?.solutionText === 'string' ? q.solutionText : '',
    solutionImageIds: Array.isArray(q?.solutionImageIds) ? q.solutionImageIds.filter((x: any) => typeof x === 'string') : [],
    rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? Math.round(rating) : 3,
    order: Number.isFinite(order) ? order : index + 1,
    usedInBoards: Array.isArray(q?.usedInBoards) ? q.usedInBoards : [],
  };
}

function parseMeta(text: string | undefined, kind: FolderKind): FolderMeta | null {
  if (!text) return null;
  try {
    const m = JSON.parse(text);
    if (m && typeof m.id === 'string' && m.id && m.kind === kind) return m as FolderMeta;
  } catch {
    /* ignore */
  }
  return null;
}

/** Build the folder tree from the flat native listing */
function buildNodes(scope: CqScope, entries: Array<{ p: string; d: boolean; s: number; m: number; t?: string }>): Node[] {
  const maxDepth = scope === 'type' ? 3 : 2;
  const nodes = new Map<string, Node>();

  const getNode = (path: string): Node | null => {
    let n = nodes.get(path);
    if (n) return n;
    const parts = path.split('/');
    const kind = kindOfDepth(scope, parts.length);
    if (!kind) return null;
    n = { path, name: parts[parts.length - 1], depth: parts.length, kind, hasData: false, dataMtime: 0, dataSize: 0, mediaFiles: [] };
    nodes.set(path, n);
    return n;
  };

  for (const e of entries) {
    const parts = e.p.split('/');
    const last = parts[parts.length - 1];
    const dirParts = e.d ? parts : parts.slice(0, -1);
    if (dirParts.some((x) => x.startsWith('.'))) continue; // hidden folders are not part of the bank

    if (e.d) {
      if (parts.length <= maxDepth) getNode(e.p);
      continue;
    }

    // a file
    const parentParts = parts.slice(0, -1);
    if (parentParts.length === 0) continue;

    if (parentParts.length <= maxDepth) {
      const n = getNode(parentParts.join('/'));
      if (!n) continue;
      if (last === FOLDER_META) n.metaText = e.t;
      else if (last === DATA_FILE && parentParts.length === maxDepth) {
        n.hasData = true;
        n.dataMtime = e.m;
        n.dataSize = e.s;
      }
    } else if (parentParts.length === maxDepth + 1 && parentParts[parentParts.length - 1] === MEDIA_DIR) {
      const n = getNode(parentParts.slice(0, -1).join('/'));
      if (n && imageIdFromFileName(last)) n.mediaFiles.push(last);
    }
  }

  // parents
  for (const n of nodes.values()) {
    if (n.depth > 1) n.parent = nodes.get(n.path.split('/').slice(0, -1).join('/'));
  }
  return Array.from(nodes.values()).sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path));
}

interface TopicPlan {
  node: Node;
  topicId: string;
  chapterId: string;
  isNewTopic: boolean;
  /** parsed data.json (only when it has to be applied) */
  payload?: { stimuli: any[]; questions: any[]; images: any[] };
  remap: boolean;
  mtime: number;
  size: number;
  /** SHA-256 of the data.json text that was read (ধাপ ২.২) */
  sha256?: string;
  warning?: string;
  /** নিশ্চিতকরণে "রেখে দাও": ফাইলে নেই এমন প্রশ্ন/উদ্দীপক অ্যাপে থাকবে, ফাইল আবার লেখা হবে */
  keepDropped?: boolean;
  /** এই টাইপের অ্যাপ-বদল এখনো ফোল্ডারে লেখা হয়নি - ফাইলের কপি এবার অ্যাপে বসানো নয় */
  skip?: boolean;
}

export async function scanScope(scope: CqScope, opts: ScanOptions = {}): Promise<ScanSummary> {
  const sdb = getDb(scope);
  const root = scopeRoot(scope);
  const summary: ScanSummary = { scope, added: 0, renamed: 0, deleted: 0, topicsUpdated: 0, warnings: [], changed: false };

  let listing;
  try {
    listing = await scanTree(root);
  } catch (err: any) {
    summary.error = err?.message || 'ফোল্ডার পড়া যায়নি';
    return summary;
  }

  const rowCount = await sdb.syncState.where('kind').anyOf('subject', 'chapter', 'topic').count();
  if (!listing.exists) {
    if (rowCount > 0) {
      summary.error = 'Question_Bank ফোল্ডার পাওয়া যায়নি (কিছু মোছা হয়নি)';
      return summary;
    }
    await makeDir(root);
    return summary;
  }

  // ধাপ ১.৫: নেটিভ স্ক্যান কিছু ফোল্ডার পড়তে না পারলে (listFiles() ব্যর্থ) তালিকা অসম্পূর্ণ - ওই অংশের
  // ফোল্ডার/ফাইল "নেই" নয়, "দেখা যায়নি"। তাই ওই অংশে কিছু মোছা বা data.json নতুন করে লেখা হয় না।
  const unreadable: string[] = Array.isArray(listing.unreadable) ? listing.unreadable : [];
  const incomplete = listing.complete === false || unreadable.length > 0;
  if (incomplete) {
    summary.incomplete = true;
    const sample = unreadable.filter((u) => u).slice(0, 2).join(', ');
    summary.warnings.push(
      `ফোল্ডারের কিছু অংশ পড়া যায়নি${sample ? ` (${sample})` : ''} - ওই অংশে কিছু মোছা বা বদলানো হয়নি; পরের সিঙ্কে আবার চেষ্টা হবে`
    );
  }

  const nodes = buildNodes(scope, listing.entries);

  // ---- snapshot of the app database ----
  const [subjects, chapters, topics, rows] = await Promise.all([
    sdb.subjects.toArray(),
    sdb.chapters.toArray(),
    sdb.topics.toArray(),
    sdb.syncState.toArray(),
  ]);
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const chapterById = new Map(chapters.map((c) => [c.id, c]));
  const topicById = new Map(topics.map((t) => [t.id, t]));
  const rowById = new Map<string, SyncRow>(rows.map((r) => [r.id, r]));

  const orderMax = new Map<string, number>(); // parent id -> highest order in use
  const bump = (key: string, order: number) => orderMax.set(key, Math.max(orderMax.get(key) ?? 0, order || 0));
  subjects.forEach((s) => bump('', s.order));
  chapters.forEach((c) => bump(c.subjectId, c.order));
  topics.forEach((t) => bump(t.chapterId, t.order));

  // ---- identify folders (id from .folder.json) ----
  // a folder that was COPIED in the file manager carries the same id twice: the one that still has
  // the name we know stays the original, the other one becomes a NEW item
  const byId = new Map<string, Node[]>();
  for (const n of nodes) {
    const meta = parseMeta(n.metaText, n.kind);
    if (!meta) continue;
    n.id = meta.id;
    n.order = Number.isFinite(meta.order) ? meta.order : undefined;
    const list = byId.get(meta.id) ?? [];
    list.push(n);
    byId.set(meta.id, list);
  }
  const dupNodes = new Set<Node>();
  for (const [id, list] of byId) {
    if (list.length < 2) continue;
    const known = rowById.get(id)?.dirName;
    const keeper = list.find((n) => n.name === known) ?? list[0];
    for (const n of list) if (n !== keeper) dupNodes.add(n);
  }
  for (const n of nodes) {
    if (!n.id || dupNodes.has(n)) {
      n.id = newId();
      n.isNew = true;
    }
  }
  for (const n of nodes) {
    if (n.isNew) {
      const key = n.parent?.id ?? '';
      n.order = (orderMax.get(key) ?? 0) + 1;
      bump(key, n.order);
    }
  }

  const diskIds = new Set(nodes.map((n) => n.id as string));

  // ---- deleted folders ----
  // ফোল্ডার না পেলে আগে জিজ্ঞাসা (আইটেম সংখ্যাসহ); "রেখে দাও" দিলে অ্যাপে থাকে ও ফোল্ডার আবার তৈরি হয়।
  const confirmDelete = opts.confirmDelete ?? askDeleteConfirm;
  const folderRows = rows.filter((r) => r.kind !== 'data' && r.dirName);
  let deletedRows = folderRows.filter((r) => !diskIds.has(r.id));
  if (incomplete && deletedRows.length > 0) {
    // যে অংশ পড়া যায়নি তার ভেতরের কিছুই "মুছে গেছে" ধরা নয়
    const skippedRows = deletedRows.filter((r) => isUnderUnreadable(rowPathOf(r, rowById), unreadable));
    if (skippedRows.length > 0) {
      const skipIds = new Set(skippedRows.map((r) => r.id));
      deletedRows = deletedRows.filter((r) => !skipIds.has(r.id));
    }
  }
  const declinedRowIds = new Set<string>();
  if (deletedRows.length > 0) {
    const deletedIds = new Set(deletedRows.map((r) => r.id));
    const topLevel = pickTopLevel(deletedRows);
    const affectedTopicIds = topics.filter((t) => deletedIds.has(t.id) || deletedIds.has(t.chapterId)).map((t) => t.id);
    const questionCount = affectedTopicIds.length ? await sdb.questions.where('topicId').anyOf(affectedTopicIds).count() : 0;
    const req: DeleteRequest = {
      kind: 'folders',
      scope,
      total: deletedRows.length,
      items: topLevel.map((r) => ({ name: r.dirName || r.id, kind: r.kind as FolderKind })),
      questionCount,
    };
    const ok = await confirmDelete(req);
    if (!ok) {
      deletedRows.forEach((r) => declinedRowIds.add(r.id));
      deletedRows = [];
      summary.warnings.push(`${declinedRowIds.size}টি ফোল্ডার পাওয়া যাচ্ছে না - অ্যাপে রেখে দেওয়া হয়েছে, ফোল্ডার আবার তৈরি হবে`);
    }
  }

  // ---- write ".folder.json" for new / copied folders (file IO must happen before the database transaction) ----
  for (const n of nodes) {
    if (!n.isNew) continue;
    const meta: FolderMeta = { id: n.id as string, kind: n.kind, name: n.name, order: n.order ?? 0 };
    try {
      await writeText(`${root}/${n.path}/${FOLDER_META}`, JSON.stringify(meta));
    } catch (err) {
      console.warn('Could not write folder info:', err);
    }
  }

  // ---- data.json of every type / chapter folder ----
  const dataDepth = scope === 'type' ? 3 : 2;
  const plans: TopicPlan[] = [];
  for (const n of nodes) {
    if (n.depth !== dataDepth) continue;
    const id = n.id as string;
    const chapterNode = scope === 'type' ? n.parent : n;
    const chapterId = chapterNode?.id as string;
    if (!chapterId) continue;

    let topicId: string;
    let isNewTopic = false;
    if (scope === 'type') {
      topicId = id;
      isNewTopic = !topicById.has(id);
    } else {
      const existing = topics.filter((t) => t.chapterId === chapterId).sort((a, b) => a.order - b.order)[0];
      topicId = existing?.id ?? '';
      isNewTopic = !existing;
    }

    const dataRow = topicId ? rowById.get(`data:${topicId}`) : undefined;
    const isDup = dupNodes.has(n);
    const needRead = n.hasData && (isDup || n.isNew || !dataRow || dataRow.mtime !== n.dataMtime || dataRow.size !== n.dataSize);

    if (!n.hasData) {
      // ধাপ ১.৫: ফোল্ডারই পড়া যায়নি - data.json "নেই" নয়, "দেখা যায়নি" (ওভাররাইট নয়)
      if (incomplete && isUnderUnreadable(n.path, unreadable)) continue;
      // no data.json yet (new folder) or it was deleted -> it is written again from the app's copy
      if (topicId) plans.push({ node: n, topicId, chapterId, isNewTopic, remap: false, mtime: 0, size: 0 });
      continue;
    }
    if (!needRead) continue;

    const plan: TopicPlan = { node: n, topicId, chapterId, isNewTopic, remap: isDup, mtime: n.dataMtime, size: n.dataSize };
    const text = await readText(`${root}/${n.path}/${DATA_FILE}`);
    if (text !== null) plan.sha256 = await sha256Hex(text);
    // ধাপ ২.২: mtime/size বদলেছে কিন্তু লেখা হুবহু আগের মতো (ক্লাউড সিঙ্ক / ফাইল ম্যানেজার ফাইল ছুঁয়েছে) ->
    // অ্যাপে কিছু প্রয়োগ নয়; শুধু নতুন mtime/size মনে রাখা, যাতে আবার পড়তে না হয়।
    if (dataRow && !isDup && !n.isNew && sameContent(dataRow.sha256, plan.sha256)) {
      await sdb.syncState.put({ ...dataRow, mtime: n.dataMtime, size: n.dataSize });
      continue;
    }
    let parsed: any = null;
    if (text !== null) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }
    if (!parsed || typeof parsed !== 'object') {
      plan.warning = `${n.path}/${DATA_FILE} পড়া যায়নি (ফাইলে ভুল আছে) - আগের তথ্য রাখা হয়েছে`;
      plans.push(plan); // still remembered, so the warning is not repeated until the file changes
      continue;
    }
    plan.payload = {
      stimuli: Array.isArray(parsed.stimuli) ? parsed.stimuli : [],
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
      images: Array.isArray(parsed.images) ? parsed.images : [],
    };
    if (scope === 'chapter' && !topicId) {
      const wanted = typeof parsed?.topic?.id === 'string' ? parsed.topic.id : '';
      topicId = wanted && !topicById.has(wanted) && !isDup ? wanted : newId();
      plan.topicId = topicId;
      plan.isNewTopic = true;
    }
    plans.push(plan);
  }

  // ---- data.json থেকে প্রশ্ন/উদ্দীপক বাদ পড়লে (অ্যাপ থেকেও মুছে যেত) আগে জিজ্ঞাসা ----
  for (const plan of plans) {
    if (!plan.payload || !plan.topicId) continue;
    // অ্যাপের বদল এখনো ফোল্ডারে যায়নি (লেখা ব্যর্থ ছিল) - ফাইলের কপি বসালে সেই বদল হারাবে; এবার বাদ
    if (isTopicPending(scope, plan.topicId)) {
      plan.skip = true;
      summary.warnings.push(`"${plan.node.name}": অ্যাপের বদল ফোল্ডারে লেখা বাকি - ফাইলের কপি এবার অ্যাপে বসানো হয়নি`);
      continue;
    }
    if (plan.isNewTopic || plan.remap) continue; // নতুন টাইপে মোছার কিছু নেই
    const oldQ = (await sdb.questions.where('topicId').equals(plan.topicId).primaryKeys()) as string[];
    const oldS = (await sdb.stimuli.where('topicId').equals(plan.topicId).primaryKeys()) as string[];
    const newQ = new Set<string>(plan.payload.questions.filter((q: any) => q && typeof q.id === 'string').map((q: any) => q.id));
    const newS = new Set<string>(plan.payload.stimuli.filter((x: any) => x && typeof x.id === 'string').map((x: any) => x.id));
    const dropQ = missingIds(oldQ, newQ).length;
    const dropS = missingIds(oldS, newS).length;
    if (dropQ + dropS === 0) continue;
    const label = scope === 'type' ? (topicById.get(plan.topicId)?.name ?? plan.node.name) : plan.node.name;
    const ok = await confirmDelete({ kind: 'questions', scope, name: label, questionCount: dropQ, stimulusCount: dropS });
    if (!ok) {
      plan.keepDropped = true;
      summary.warnings.push(`"${label}": ফাইলে নেই এমন ${dropQ}টি প্রশ্ন অ্যাপে রেখে দেওয়া হয়েছে, ফাইল আবার লেখা হবে`);
    }
  }

  // ---- apply everything to the app database (no file IO inside this transaction) ----
  const missingData: string[] = [];
  const entityOrphans: Array<{ kind: FolderKind; id: string }> = [];
  const deletedQuestionCount = { n: 0 };

  await sdb.transaction(
    'rw',
    [sdb.subjects, sdb.chapters, sdb.topics, sdb.stimuli, sdb.questions, sdb.images, sdb.syncState],
    async (tx) => {
      markSyncTx(tx);

      // 0) "রেখে দাও" দেওয়া ফোল্ডার: সিঙ্ক-রেকর্ড মুছে দিলে নিচের (4) ধাপ এগুলোকে "ফোল্ডারহীন" ধরে আবার তৈরি করে
      for (const id of declinedRowIds) {
        await sdb.syncState.delete(id);
        await sdb.syncState.delete(`data:${id}`);
      }

      // 1) deletions
      for (const r of deletedRows) {
        const kind = r.kind as FolderKind;
        const gone = await cascadeDelete(sdb, scope, kind, r.id, deletedQuestionCount);
        if (gone) summary.deleted++;
      }

      // 2) folders -> subjects / chapters / types
      for (const n of nodes) {
        const id = n.id as string;
        const dirName = n.name;
        const parentId = n.parent?.id as string | undefined;

        if (n.kind === 'subject') {
          const ent = subjectById.get(id);
          if (!ent) {
            if (rowById.has(id) && !n.isNew) continue; // deleted inside the app a moment ago
            await sdb.subjects.put({ id, name: dirName, order: n.order ?? 1 });
            await sdb.syncState.put({ id, kind: 'subject', dirName });
            summary.added++;
          } else {
            const row = rowById.get(id);
            const patch: any = {};
            if (row && row.dirName !== dirName) patch.name = dirName;
            if (n.order !== undefined && n.order !== ent.order) patch.order = n.order;
            if (Object.keys(patch).length) {
              await sdb.subjects.update(id, patch);
              if (patch.name) summary.renamed++;
            }
            if (!row || row.dirName !== dirName) await sdb.syncState.put({ id, kind: 'subject', dirName });
          }
        } else if (n.kind === 'chapter') {
          if (!parentId) continue;
          const ent = chapterById.get(id);
          if (!ent) {
            if (rowById.has(id) && !n.isNew) continue;
            await sdb.chapters.put({ id, subjectId: parentId, name: dirName, order: n.order ?? 1 });
            await sdb.syncState.put({ id, kind: 'chapter', parentId, dirName });
            summary.added++;
          } else {
            const row = rowById.get(id);
            const patch: any = {};
            if (row && row.dirName !== dirName) patch.name = dirName;
            if (ent.subjectId !== parentId) patch.subjectId = parentId;
            if (n.order !== undefined && n.order !== ent.order) patch.order = n.order;
            if (Object.keys(patch).length) {
              await sdb.chapters.update(id, patch);
              if (patch.name || patch.subjectId) summary.renamed++;
            }
            if (!row || row.dirName !== dirName || row.parentId !== parentId) {
              await sdb.syncState.put({ id, kind: 'chapter', parentId, dirName });
            }
          }
        } else if (n.kind === 'topic') {
          if (!parentId) continue;
          const ent = topicById.get(id);
          if (!ent) {
            if (rowById.has(id) && !n.isNew) continue;
            await sdb.topics.put({ id, chapterId: parentId, name: dirName, order: n.order ?? 1 });
            await sdb.syncState.put({ id, kind: 'topic', parentId, dirName });
            summary.added++;
          } else {
            const row = rowById.get(id);
            const patch: any = {};
            if (row && row.dirName !== dirName) patch.name = dirName;
            if (ent.chapterId !== parentId) patch.chapterId = parentId;
            if (n.order !== undefined && n.order !== ent.order) patch.order = n.order;
            if (Object.keys(patch).length) {
              await sdb.topics.update(id, patch);
              if (patch.name || patch.chapterId) summary.renamed++;
            }
            if (!row || row.dirName !== dirName || row.parentId !== parentId) {
              await sdb.syncState.put({ id, kind: 'topic', parentId, dirName });
            }
          }
        }
      }

      // 3) data.json -> questions / stimuli, media/ -> picture index
      for (const plan of plans) {
        const { node, chapterId } = plan;
        const topicId = plan.topicId;
        if (!topicId) continue;
        if (plan.skip) continue;

        if (plan.isNewTopic && !(await sdb.topics.get(topicId))) {
          const siblings = await sdb.topics.where('chapterId').equals(chapterId).toArray();
          await sdb.topics.put({
            id: topicId,
            chapterId,
            name: scope === 'chapter' ? 'সকল প্রশ্ন' : node.name,
            order: siblings.reduce((m, t) => Math.max(m, t.order || 0), 0) + 1,
          });
          if (scope === 'chapter') await sdb.syncState.put({ id: topicId, kind: 'topic', parentId: chapterId, dirName: '' });
        }

        if (plan.warning) {
          summary.warnings.push(plan.warning);
          await sdb.syncState.put({ id: `data:${topicId}`, kind: 'data', mtime: plan.mtime, size: plan.size, sha256: plan.sha256 });
          continue;
        }
        if (!plan.payload) {
          if (!node.hasData) missingData.push(topicId);
          continue;
        }

        // questions & stimuli
        const stimIdMap = new Map<string, string>();
        const stimuli: Stimulus[] = [];
        for (const s of plan.payload.stimuli) {
          if (!s || typeof s.id !== 'string') continue;
          const id = plan.remap ? newId() : s.id;
          stimIdMap.set(s.id, id);
          stimuli.push(normStimulus(s, topicId, id));
        }
        const questions: Question[] = [];
        plan.payload.questions.forEach((q: any, i: number) => {
          if (!q || typeof q.id !== 'string') return;
          const id = plan.remap ? newId() : q.id;
          const stimulusId = q.stimulusId ? stimIdMap.get(q.stimulusId) ?? q.stimulusId : undefined;
          questions.push(normQuestion(q, i, topicId, id, stimulusId));
        });

        const oldQ = await sdb.questions.where('topicId').equals(topicId).primaryKeys();
        const oldS = await sdb.stimuli.where('topicId').equals(topicId).primaryKeys();
        const newQIds = new Set(questions.map((q) => q.id));
        const newSIds = new Set(stimuli.map((s) => s.id));
        const dropQ = (oldQ as string[]).filter((id) => !newQIds.has(id));
        const dropS = (oldS as string[]).filter((id) => !newSIds.has(id));
        if (!plan.keepDropped) {
          if (dropQ.length) await sdb.questions.bulkDelete(dropQ);
          if (dropS.length) await sdb.stimuli.bulkDelete(dropS);
          deletedQuestionCount.n += dropQ.length;
        }
        if (stimuli.length) await sdb.stimuli.bulkPut(stimuli);
        if (questions.length) await sdb.questions.bulkPut(questions);

        // pictures: sizes from data.json + every file found in media/
        const metaImages = new Map<string, any>();
        for (const im of plan.payload.images) if (im && typeof im.id === 'string') metaImages.set(im.id, im);
        const fileIds = node.mediaFiles.map((f) => ({ file: f, id: imageIdFromFileName(f) as string }));
        const allIds = Array.from(new Set([...metaImages.keys(), ...fileIds.map((x) => x.id)]));
        const have = await sdb.images.bulkGet(allIds);
        const puts: any[] = [];
        for (let i = 0; i < allIds.length; i++) {
          const id = allIds[i];
          const rec = have[i];
          const meta = metaImages.get(id);
          const file = fileIds.find((x) => x.id === id)?.file;
          if (!file && !rec) continue; // listed in data.json but the file is missing
          if (!rec) {
            puts.push({ id, fileName: meta?.fileName || file || `${id}.webp`, topicId, w: meta?.w, h: meta?.h });
            continue;
          }
          if (rec.blob) continue;
          const holder = rec.topicId ? await sdb.topics.get(rec.topicId) : null;
          if (!holder) puts.push({ ...rec, topicId });
          else if (rec.topicId === topicId && meta?.w && (rec.w !== meta.w || rec.h !== meta.h)) puts.push({ ...rec, w: meta.w, h: meta.h });
        }
        if (puts.length) await sdb.images.bulkPut(puts);

        await sdb.syncState.put({ id: `data:${topicId}`, kind: 'data', mtime: plan.mtime, size: plan.size, sha256: plan.sha256 });
        summary.topicsUpdated++;
      }

      // 4) items the app has but that never got a folder (heal)
      const nowRows = new Set((await sdb.syncState.toArray()).map((r) => r.id));
      for (const s of await sdb.subjects.toArray()) if (!nowRows.has(s.id)) entityOrphans.push({ kind: 'subject', id: s.id });
      for (const c of await sdb.chapters.toArray()) if (!nowRows.has(c.id)) entityOrphans.push({ kind: 'chapter', id: c.id });
      for (const t of await sdb.topics.toArray()) if (!nowRows.has(t.id)) entityOrphans.push({ kind: 'topic', id: t.id });
    }
  );

  // ---- follow-up work (file IO again) ----
  for (const topicId of missingData) {
    if (!topicId) continue;
    forgetWritten(topicId);
    markTopicDirty(scope, topicId); // data.json is (re)written from the app's copy
  }
  for (const plan of plans) {
    if (plan.skip) continue;
    if (plan.topicId && plan.payload) forgetWritten(plan.topicId);
    if (plan.topicId && plan.keepDropped) markTopicDirty(scope, plan.topicId); // রাখা প্রশ্নসহ data.json আবার লেখা
    if (plan.topicId && plan.isNewTopic && scope === 'type') markTopicDirty(scope, plan.topicId);
  }
  for (const o of entityOrphans) markEntityDirty(scope, o.kind, o.id);

  if (summary.deleted > 0 || deletedQuestionCount.n > 0) await pruneSelection(sdb);

  summary.changed = summary.added + summary.renamed + summary.deleted + summary.topicsUpdated > 0;
  return summary;
}

/** Delete an item and everything below it (used when its folder was deleted outside the app) */
async function cascadeDelete(
  sdb: QbDatabase,
  scope: CqScope,
  kind: FolderKind,
  id: string,
  counter: { n: number }
): Promise<boolean> {
  let found = false;
  if (kind === 'subject') {
    const chapters = await sdb.chapters.where('subjectId').equals(id).toArray();
    for (const c of chapters) await cascadeDelete(sdb, scope, 'chapter', c.id, counter);
    found = !!(await sdb.subjects.get(id));
    await sdb.subjects.delete(id);
  } else if (kind === 'chapter') {
    const topics = await sdb.topics.where('chapterId').equals(id).toArray();
    for (const t of topics) await cascadeDelete(sdb, scope, 'topic', t.id, counter);
    found = !!(await sdb.chapters.get(id));
    await sdb.chapters.delete(id);
  } else {
    const qIds = await sdb.questions.where('topicId').equals(id).primaryKeys();
    counter.n += qIds.length;
    await sdb.questions.bulkDelete(qIds as string[]);
    const sIds = await sdb.stimuli.where('topicId').equals(id).primaryKeys();
    await sdb.stimuli.bulkDelete(sIds as string[]);
    await sdb.images.where('topicId').equals(id).delete();
    found = !!(await sdb.topics.get(id));
    await sdb.topics.delete(id);
  }
  await sdb.syncState.delete(id);
  await sdb.syncState.delete(`data:${id}`);
  return found;
}

/** Remove deleted questions from the "selected questions" list */
async function pruneSelection(sdb: QbDatabase): Promise<void> {
  try {
    const rec = await sdb.meta.get('selectedQuestionIds');
    const ids: string[] = Array.isArray(rec?.value) ? rec!.value : [];
    if (ids.length === 0) return;
    const found = await sdb.questions.bulkGet(ids);
    const keep = ids.filter((_, i) => !!found[i]);
    if (keep.length !== ids.length) await sdb.meta.put({ key: 'selectedQuestionIds', value: keep });
  } catch (err) {
    console.warn('Selection cleanup failed:', err);
  }
}
