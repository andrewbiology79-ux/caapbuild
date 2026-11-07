import { getDb, type CqScope, type QbDatabase, type Stimulus, type Question } from '../db/db';
import {
  scopeRoot,
  entityPath,
  sanitizeFolderName,
  baseOfDirName,
  pickDirName,
  mediaDirOf,
  imageFileName,
  FOLDER_META,
  DATA_FILE,
  NOMEDIA_FILE,
  type FolderKind,
  type FolderMeta,
} from './folderLayout';
import { pathExists, statPath, makeDir, writeText, writeBase64, removeDir, removeFile, renamePath, copyFile } from './nativeStore';
import { imageFilePath, blobDimensions } from './imageStore';
import { blobToBase64 } from '../utils/fileExport';
import { withSyncLock } from './syncLock';

/**
 * App -> folders ("write-through").
 *
 * Dexie hooks notice every change of subjects / chapters / types / stimuli / questions / pictures
 * (whatever function of api.ts made it) and queue it. A short while later (debounced) the queue is
 * written into the storage folders: folders are created / renamed / deleted and each changed
 * type's data.json + media/ pictures are rewritten.
 */

const SCOPES: CqScope[] = ['type', 'chapter'];
const DEBOUNCE_MS = 800;

interface Pending {
  entities: Map<string, FolderKind>;
  deletes: Set<string>;
  topics: Set<string>;
  imageDeletes: Array<{ id: string; topicId?: string }>;
}

const pending: Record<CqScope, Pending> = {
  type: { entities: new Map(), deletes: new Set(), topics: new Set(), imageDeletes: [] },
  chapter: { entities: new Map(), deletes: new Set(), topics: new Set(), imageDeletes: [] },
};

let timer: ReturnType<typeof setTimeout> | null = null;
let hooksInstalled = false;
let writesEnabled = false;
let lastWriteAt = 0;
let onWriteError: ((message: string) => void) | null = null;

/** what we last wrote (so identical files are not written again) */
const lastMeta = new Map<string, string>();
const lastData = new Map<string, string>();
const nomediaDone = new Set<string>();

/** Hooks only queue work while folder sync is switched on */
export function setWritesEnabled(on: boolean): void {
  writesEnabled = on;
}

/** When the app last wrote into the folders (the folder watcher ignores events caused by our own writes) */
export function getLastWriteAt(): number {
  return lastWriteAt;
}

export function setWriteErrorHandler(fn: ((message: string) => void) | null): void {
  onWriteError = fn;
}

export function hasPendingWrites(): boolean {
  return SCOPES.some((s) => {
    const p = pending[s];
    return p.entities.size + p.deletes.size + p.topics.size + p.imageDeletes.length > 0;
  });
}

function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    flushAllWrites().catch((err) => console.warn('Folder sync write failed:', err));
  }, DEBOUNCE_MS);
}

const isSyncTx = (tx: any): boolean => !writesEnabled || (!!tx && tx.qbSync === true);

/** Run `fn` inside a transaction whose changes are NOT sent back to the folders (used when reading folders -> app) */
export function markSyncTx(tx: any): void {
  if (tx) tx.qbSync = true;
}

export function installWriteHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;

  for (const scope of SCOPES) {
    const sdb = getDb(scope);
    const p = pending[scope];

    const entityTables: Array<[any, FolderKind]> = [
      [sdb.subjects, 'subject'],
      [sdb.chapters, 'chapter'],
      [sdb.topics, 'topic'],
    ];
    for (const [table, kind] of entityTables) {
      table.hook('creating', function (_pk: any, obj: any, tx: any) {
        if (isSyncTx(tx)) return;
        p.entities.set(obj.id, kind);
        p.deletes.delete(obj.id);
        schedule();
      });
      table.hook('updating', function (_mods: any, pk: any, _obj: any, tx: any) {
        if (isSyncTx(tx)) return;
        p.entities.set(pk, kind);
        schedule();
      });
      table.hook('deleting', function (pk: any, _obj: any, tx: any) {
        if (isSyncTx(tx)) return;
        p.deletes.add(pk);
        p.entities.delete(pk);
        schedule();
      });
    }

    const contentTables: any[] = [sdb.stimuli, sdb.questions];
    for (const table of contentTables) {
      table.hook('creating', function (_pk: any, obj: any, tx: any) {
        if (isSyncTx(tx) || !obj?.topicId) return;
        p.topics.add(obj.topicId);
        schedule();
      });
      table.hook('updating', function (mods: any, _pk: any, obj: any, tx: any) {
        if (isSyncTx(tx)) return;
        if (obj?.topicId) p.topics.add(obj.topicId);
        if (mods && typeof mods.topicId === 'string') p.topics.add(mods.topicId);
        schedule();
      });
      table.hook('deleting', function (_pk: any, obj: any, tx: any) {
        if (isSyncTx(tx) || !obj?.topicId) return;
        p.topics.add(obj.topicId);
        schedule();
      });
    }

    sdb.images.hook('deleting', function (_pk: any, obj: any, tx: any) {
      if (isSyncTx(tx) || !obj) return;
      p.imageDeletes.push({ id: obj.id, topicId: obj.topicId });
      schedule();
    });
  }
}

/** Mark everything of a scope as changed (used by the one-time migration) */
export async function markEverythingDirty(scope: CqScope): Promise<void> {
  const sdb = getDb(scope);
  const p = pending[scope];
  (await sdb.subjects.toArray()).forEach((e) => p.entities.set(e.id, 'subject'));
  (await sdb.chapters.toArray()).forEach((e) => p.entities.set(e.id, 'chapter'));
  const topics = await sdb.topics.toArray();
  topics.forEach((e) => {
    p.entities.set(e.id, 'topic');
    p.topics.add(e.id);
  });
}

/** Mark one subject / chapter / type as changed (creates its folder if it has none yet) */
export function markEntityDirty(scope: CqScope, kind: FolderKind, id: string): void {
  pending[scope].entities.set(id, kind);
}

/** Mark one topic as changed (e.g. its data.json was damaged outside the app) */
export function markTopicDirty(scope: CqScope, topicId: string): void {
  pending[scope].topics.add(topicId);
}

/** Write everything that is queued. `strict` = throw on the first error (used by the migration) */
export function flushAllWrites(strict = false): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  return withSyncLock(async () => {
    for (const scope of SCOPES) {
      try {
        await flushScope(scope);
      } catch (err: any) {
        console.warn(`Folder sync (${scope}) failed:`, err);
        if (strict) throw err;
        onWriteError?.(err?.message || String(err));
      }
    }
    lastWriteAt = Date.now();
  });
}

/** Forget cached "what was written" info and queued work (after folders were rebuilt from scratch) */
export function resetWriterCaches(): void {
  lastMeta.clear();
  lastData.clear();
  nomediaDone.clear();
}

/* ------------------------------------------------------------------ */

async function entityRow(sdb: QbDatabase, kind: FolderKind, id: string): Promise<any> {
  const table = kind === 'subject' ? sdb.subjects : kind === 'chapter' ? sdb.chapters : sdb.topics;
  return table.get(id);
}

async function flushScope(scope: CqScope): Promise<void> {
  const sdb = getDb(scope);
  const p = pending[scope];

  // take the queue (changes that arrive while we write are handled by the next round)
  const deletes = Array.from(p.deletes);
  const entities = Array.from(p.entities.entries());
  const imageDeletes = p.imageDeletes.splice(0);
  p.deletes.clear();
  p.entities.clear();
  const topicIds = new Set(p.topics);
  p.topics.clear();

  try {
    // 1) deleted subjects / chapters / types -> delete their folders
    const delPaths: string[] = [];
    for (const id of deletes) {
      const row = await sdb.syncState.get(id);
      if (!row || row.kind === 'data') continue;
      if (row.dirName) {
        const path = await entityPath(sdb, scope, id);
        if (path) delPaths.push(path);
      }
    }
    for (const path of delPaths) await removeDir(path);
    for (const id of deletes) {
      await sdb.syncState.delete(id);
      await sdb.syncState.delete(`data:${id}`);
      topicIds.delete(id);
    }

    // 2) created / renamed / moved items -> folders (parents first)
    for (const kind of ['subject', 'chapter', 'topic'] as FolderKind[]) {
      for (const [id, k] of entities) {
        if (k !== kind) continue;
        const ent = await entityRow(sdb, kind, id);
        if (!ent) continue;
        const created = await ensureEntity(sdb, scope, kind, ent);
        if (created && kind === 'topic') topicIds.add(id);
      }
    }

    // 3) changed types -> data.json + media/
    for (const topicId of topicIds) {
      const topic = await sdb.topics.get(topicId);
      if (!topic) continue;
      await flushTopic(sdb, scope, topic);
    }

    // 4) deleted pictures -> delete their files
    for (const img of imageDeletes) {
      if (!img.topicId) continue;
      const stillThere = await sdb.images.get(img.id);
      if (stillThere) continue;
      const dir = await entityPath(sdb, scope, img.topicId);
      if (dir) await removeFile(`${mediaDirOf(dir)}/${imageFileName(img.id)}`);
    }
  } catch (err) {
    // put the work back so the next round tries again
    deletes.forEach((id) => p.deletes.add(id));
    entities.forEach(([id, k]) => p.entities.set(id, k));
    topicIds.forEach((id) => p.topics.add(id));
    throw err;
  }
}

async function siblingDirNames(sdb: QbDatabase, kind: FolderKind, parentId: string | undefined, selfId: string): Promise<Set<string>> {
  const rows = await sdb.syncState.where('kind').equals(kind).toArray();
  const out = new Set<string>();
  for (const r of rows) {
    if (r.id !== selfId && r.parentId === parentId && r.dirName) out.add(r.dirName);
  }
  return out;
}

async function writeFolderMeta(path: string, meta: FolderMeta): Promise<void> {
  const text = JSON.stringify(meta);
  const file = `${path}/${FOLDER_META}`;
  if (lastMeta.get(file) === text) return;
  await writeText(file, text);
  lastMeta.set(file, text);
}

/**
 * Make sure a subject / chapter / type has its folder (create, rename or move it).
 * Returns true when the folder was created just now.
 */
export async function ensureEntity(sdb: QbDatabase, scope: CqScope, kind: FolderKind, ent: any): Promise<boolean> {
  const id: string = ent.id;
  const parentId: string | undefined = kind === 'subject' ? undefined : kind === 'chapter' ? ent.subjectId : ent.chapterId;

  // the parent needs its folder first
  let parentPath = scopeRoot(scope);
  if (parentId) {
    let prow = await sdb.syncState.get(parentId);
    if (!prow) {
      const pKind: FolderKind = kind === 'chapter' ? 'subject' : 'chapter';
      const pEnt = await entityRow(sdb, pKind, parentId);
      if (!pEnt) return false;
      await ensureEntity(sdb, scope, pKind, pEnt);
      prow = await sdb.syncState.get(parentId);
      if (!prow) return false;
    }
    const pp = await entityPath(sdb, scope, parentId);
    if (!pp) return false;
    parentPath = pp;
  }

  const row = await sdb.syncState.get(id);
  const meta: FolderMeta = { id, kind, name: ent.name, order: Number.isFinite(ent.order) ? ent.order : 0 };

  // Chapter CQ: the hidden default topic has no folder, its questions live in the chapter folder
  if (kind === 'topic' && scope === 'chapter') {
    if (!row || row.parentId !== parentId) {
      await sdb.syncState.put({ id, kind, parentId, dirName: '' });
      return !row;
    }
    return false;
  }

  const desired = sanitizeFolderName(ent.name);

  if (!row) {
    const taken = await siblingDirNames(sdb, kind, parentId, id);
    const dirName = await pickDirName(desired, taken, (c) => pathExists(`${parentPath}/${c}`));
    const path = `${parentPath}/${dirName}`;
    await makeDir(path);
    await sdb.syncState.put({ id, kind, parentId, dirName });
    await writeFolderMeta(path, meta);
    return true;
  }

  // existing folder: rename / move when needed
  const oldParentPath = row.parentId ? await entityPath(sdb, scope, row.parentId) : scopeRoot(scope);
  if (!oldParentPath) return false;
  const oldPath = `${oldParentPath}/${row.dirName}`;

  if (!(await pathExists(oldPath))) {
    // The folder was removed outside the app: the next scan will delete the item here too
    // (folder = the real data), so nothing is re-created.
    return false;
  }

  const sameParent = row.parentId === parentId;
  const nameStillMatches = row.dirName === desired || baseOfDirName(row.dirName || '') === desired;

  let dirName = row.dirName || desired;
  if (!sameParent || !nameStillMatches) {
    const taken = await siblingDirNames(sdb, kind, parentId, id);
    dirName = await pickDirName(desired, taken, (c) => pathExists(`${parentPath}/${c}`));
    const newPath = `${parentPath}/${dirName}`;
    if (newPath !== oldPath) await renamePath(oldPath, newPath);
    await sdb.syncState.put({ id, kind, parentId, dirName });
  }
  await writeFolderMeta(`${parentPath}/${dirName}`, meta);
  return false;
}

/* ------------------------------------------------------------------ */

const IMG_MARKER_RE = /\[\[img:([^\]\s]+)\]\]/g;

function collectImageIds(stimuli: Stimulus[], questions: Question[]): string[] {
  const ids = new Set<string>();
  const fromText = (t?: string | null) => {
    if (!t) return;
    const re = new RegExp(IMG_MARKER_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) ids.add(m[1]);
  };
  for (const s of stimuli) {
    (s.imageIds || []).forEach((i) => ids.add(i));
    fromText(s.text);
  }
  for (const q of questions) {
    (q.solutionImageIds || []).forEach((i) => ids.add(i));
    fromText(q.solutionText);
    fromText(q.questionText);
    fromText(q.answerText);
  }
  return Array.from(ids);
}

interface ImageMeta {
  id: string;
  fileName: string;
  w?: number;
  h?: number;
}

/** Make sure the picture file is in this topic's media/ folder (write a new picture, or copy it from another topic) */
async function placeImage(sdb: QbDatabase, scope: CqScope, id: string, topicId: string, topicDir: string): Promise<ImageMeta | null> {
  const mediaDir = mediaDirOf(topicDir);
  const target = `${mediaDir}/${imageFileName(id)}`;
  const rec = await sdb.images.get(id);

  if (!rec) {
    return (await pathExists(target)) ? { id, fileName: imageFileName(id) } : null;
  }

  if (rec.blob) {
    const dataUrl = await blobToBase64(rec.blob);
    const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    await writeBase64(target, b64);
    const st = await statPath(target);
    if (!st || st.size === 0) throw new Error('ছবির ফাইল লেখা যায়নি');
    const dims = (await blobDimensions(rec.blob)) ?? undefined;
    // the file is safely on disk -> the database record no longer needs the blob
    await sdb.images.put({ id, fileName: rec.fileName, topicId, w: dims?.w ?? rec.w, h: dims?.h ?? rec.h });
    return { id, fileName: rec.fileName, w: dims?.w ?? rec.w, h: dims?.h ?? rec.h };
  }

  const meta: ImageMeta = { id, fileName: rec.fileName, w: rec.w, h: rec.h };
  if (rec.topicId === topicId) return meta;

  // the picture belongs to another topic (copied / pasted question): keep a copy in this topic's media/ too
  if (!(await pathExists(target))) {
    const src = await imageFilePath(sdb, rec);
    if (src && (await pathExists(src))) await copyFile(src, target);
  } else if (!rec.topicId || !(await imageFilePath(sdb, rec))) {
    await sdb.images.put({ ...rec, topicId });
  }
  return meta;
}

/** Write one type's data.json (+ its pictures into media/) */
export async function flushTopic(sdb: QbDatabase, scope: CqScope, topic: any): Promise<void> {
  let dirPath = await entityPath(sdb, scope, topic.id);
  if (!dirPath) {
    await ensureEntity(sdb, scope, 'topic', topic);
    dirPath = await entityPath(sdb, scope, topic.id);
  }
  if (!dirPath) return;
  if (!(await pathExists(dirPath))) return; // folder removed outside the app -> the next scan handles it

  const [stimuli, questionsRaw] = await Promise.all([
    sdb.stimuli.where('topicId').equals(topic.id).toArray(),
    sdb.questions.where('topicId').equals(topic.id).toArray(),
  ]);
  const questions = questionsRaw.sort((a, b) => (a.order || 0) - (b.order || 0));

  const mediaDir = mediaDirOf(dirPath);
  const imageIds = collectImageIds(stimuli, questions);
  if (imageIds.length > 0 || (await pathExists(mediaDir))) {
    await makeDir(mediaDir);
    if (!nomediaDone.has(mediaDir)) {
      await writeText(`${mediaDir}/${NOMEDIA_FILE}`, ''); // keeps the pictures out of the phone's gallery
      nomediaDone.add(mediaDir);
    }
  } else {
    await makeDir(mediaDir);
    await writeText(`${mediaDir}/${NOMEDIA_FILE}`, '');
    nomediaDone.add(mediaDir);
  }

  const images: ImageMeta[] = [];
  for (const id of imageIds) {
    const m = await placeImage(sdb, scope, id, topic.id, dirPath);
    if (m) images.push(m);
  }

  const payload = {
    version: '2.0',
    type: 'qb-topic-data',
    scope,
    topic: { id: topic.id, chapterId: topic.chapterId, name: topic.name, order: topic.order },
    stimuli,
    questions,
    images,
  };
  const text = JSON.stringify(payload, null, 2);
  const file = `${dirPath}/${DATA_FILE}`;

  if (lastData.get(topic.id) === text && (await pathExists(file))) return;
  await writeText(file, text);
  lastData.set(topic.id, text);
  const st = await statPath(file);
  await sdb.syncState.put({ id: `data:${topic.id}`, kind: 'data', mtime: st?.mtime ?? 0, size: st?.size ?? 0 });
}

/** Forget what we last wrote for a topic (after the folder side changed) */
export function forgetWritten(topicId: string): void {
  lastData.delete(topicId);
}

