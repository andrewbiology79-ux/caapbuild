import { db, getDb, type Category, type CqScope, type DbImage, type Paper } from '../db/db';
import { sanitizeFolderName, baseOfDirName, NOMEDIA_FILE } from './folderLayout';
import { pathExists, statPath, makeDir, readText, writeText, writeTextSafe, writeBase64, renamePath, copyFile, removeDir } from './nativeStore';
import { imageFilePath } from './imageStore';
import { blobToBase64 } from '../utils/fileExport';
import { withSyncLock } from './syncLock';
import {
  CATEGORY_ROOT,
  CATEGORY_SYNC_META_KEY,
  categoryDataPath,
  categoryDirNameFor,
  categoryDirPath,
  categoryMediaDir,
  categoryMediaPath,
  categoryMetaPath,
  categoryMetaToText,
  normalizeCategorySyncState,
  parseCategoryData,
  type CategorySyncState,
} from './categoryLayout';
import {
  bankPathOf,
  buildCategoryCopies,
  buildVerifiedCategoryData,
  previousCopiesOf,
  type BankLookup,
  type BankQuestionRef,
  type PreviousCopies,
} from './categoryCopies';

/**
 * অংশ ১খ (প্রথম অর্ধেক) - অ্যাপ -> ক্যাটেগরি ফোল্ডার: একটা ক্যাটেগরির ফোল্ডার লেখা।
 *
 *   Category/<নাম>/  .folder.json  +  data.json (.tmp/.bak দিয়ে)  +  media/ (ছবি + .nomedia)
 *
 * এখানে আছে: ফোল্ডারের নাম ঠিক করা/নাম বদল, .folder.json, ব্যাংক থেকে কপি জোগাড়, ছবি media/-তে রাখা,
 * data.json যাচাই করে লেখা, সিঙ্কের স্মৃতি (db.meta) হালনাগাদ।
 * এখানে নেই (দ্বিতীয় অর্ধেক): Dexie hook ও debounce, ফর্ম খোলা থাকলে অপেক্ষা, \"অটো সিঙ্ক হচ্ছে…\" লাইন,
 * ক্যাটেগরি মোছা, unnecessary/-তে সরানো, main.tsx/syncEngine-এ জোড়া লাগানো।
 */

/* ------------------------------------------------------------------
 * সিঙ্কের স্মৃতি (db.meta)
 * ---------------------------------------------------------------- */

export async function loadCategorySyncState(): Promise<CategorySyncState> {
  const rec = await db.meta.get(CATEGORY_SYNC_META_KEY);
  return normalizeCategorySyncState(rec?.value);
}

export async function saveCategorySyncState(state: CategorySyncState): Promise<void> {
  await db.meta.put({ key: CATEGORY_SYNC_META_KEY, value: state });
}

/* ------------------------------------------------------------------
 * ব্যাংক থেকে কপি জোগাড় (Type CQ ও Chapter CQ দুই ডেটাবেসেই খোঁজে)
 * ---------------------------------------------------------------- */

/** ids-এর প্রশ্নগুলো (উদ্দীপক ও পথসহ) আগে থেকে পড়ে একটা সহজ lookup ফাংশন দেয় */
export async function buildBankLookup(ids: string[]): Promise<BankLookup> {
  const found = new Map<string, BankQuestionRef>();
  const remaining = new Set(ids);

  for (const scope of ['type', 'chapter'] as CqScope[]) {
    if (remaining.size === 0) break;
    const sdb = getDb(scope);
    const list = Array.from(remaining);
    const questions = await sdb.questions.bulkGet(list);
    const have = questions.filter((q): q is NonNullable<typeof q> => !!q);
    if (have.length === 0) continue;

    const topics = new Map((await sdb.topics.bulkGet(Array.from(new Set(have.map((q) => q.topicId))))).filter(Boolean).map((t) => [t!.id, t!]));
    const chapters = new Map((await sdb.chapters.bulkGet(Array.from(new Set(Array.from(topics.values()).map((t) => t.chapterId))))).filter(Boolean).map((c) => [c!.id, c!]));
    const subjects = new Map((await sdb.subjects.bulkGet(Array.from(new Set(Array.from(chapters.values()).map((c) => c.subjectId))))).filter(Boolean).map((s) => [s!.id, s!]));
    const stimIds = Array.from(new Set(have.map((q) => q.stimulusId).filter((x): x is string => !!x)));
    const stimuli = new Map((await sdb.stimuli.bulkGet(stimIds)).filter(Boolean).map((s) => [s!.id, s!]));

    for (const q of have) {
      const topic = topics.get(q.topicId);
      const chapter = topic ? chapters.get(topic.chapterId) : undefined;
      const subject = chapter ? subjects.get(chapter.subjectId) : undefined;
      // পথ না পেলে (এতিম প্রশ্ন) কপি বানানো যায় না - আগের data.json-এর কপিই কাজে লাগবে
      if (!topic || !chapter || !subject) continue;
      found.set(q.id, {
        question: q,
        stimulus: q.stimulusId ? stimuli.get(q.stimulusId) : undefined,
        path: bankPathOf(scope, subject.name, chapter.name, topic.name),
      });
      remaining.delete(q.id);
    }
  }
  return (id) => found.get(id);
}

/** ফোল্ডারে আগে থাকা data.json-এর কপি (পড়া না গেলে খালি) */
async function readPreviousCopies(dirName: string): Promise<PreviousCopies> {
  const text = await readText(categoryDataPath(dirName));
  if (!text) return previousCopiesOf(null);
  const parsed = parseCategoryData(text);
  return parsed.ok ? previousCopiesOf(parsed.data) : previousCopiesOf(null);
}

/* ------------------------------------------------------------------
 * ফোল্ডারের নাম
 * ---------------------------------------------------------------- */

export type ResolvedDir = { kind: 'ready'; dirName: string; created: boolean; renamedFrom?: string } | { kind: 'missing'; dirName: string };

/** অন্য ক্যাটেগরিগুলো যে ফোল্ডারের নাম নিয়েছে (ছোট হাতের) */
function takenNames(state: CategorySyncState, selfId: string): Set<string> {
  const out = new Set<string>();
  for (const [id, row] of Object.entries(state.categories)) if (id !== selfId) out.add(row.dirName.toLowerCase());
  return out;
}

async function freeDirName(name: string, taken: Set<string>): Promise<string> {
  const local = new Set(taken);
  for (let i = 0; i < 50; i++) {
    const cand = categoryDirNameFor(name, local);
    if (!(await pathExists(categoryDirPath(cand)))) return cand;
    local.add(cand.toLowerCase());
  }
  return categoryDirNameFor(`${name} ${Date.now()}`, local);
}

/**
 * ক্যাটেগরির ফোল্ডার ঠিক করা: নেই -> তৈরি; আছে কিন্তু নাম বদলেছে -> নাম বদল; আছে ও ঠিক -> যেমন আছে।
 * আগে লেখা ফোল্ডার ডিস্ক থেকে উধাও (ফাইল ম্যানেজারে মোছা): allowCreate না দিলে 'missing' - নিজে থেকে আবার তৈরি হয় না
 * (দ্বিতীয় অর্ধেকে ব্যবহারকারীকে জিজ্ঞেস করার পথ আসবে)।
 */
export async function resolveCategoryDir(cat: Pick<Category, 'id' | 'name'>, state: CategorySyncState, allowCreate = true): Promise<ResolvedDir> {
  const known = state.categories[cat.id]?.dirName;
  const want = sanitizeFolderName(cat.name);
  const taken = takenNames(state, cat.id);

  if (!known) {
    const dirName = await freeDirName(cat.name, taken);
    return { kind: 'ready', dirName, created: true };
  }

  if (!(await pathExists(categoryDirPath(known)))) {
    if (!allowCreate) return { kind: 'missing', dirName: known };
    const dirName = await freeDirName(cat.name, taken);
    return { kind: 'ready', dirName, created: true };
  }

  const same = known.toLowerCase() === want.toLowerCase() || baseOfDirName(known).toLowerCase() === want.toLowerCase();
  if (same) return { kind: 'ready', dirName: known, created: false };

  const to = await freeDirName(cat.name, taken);
  return { kind: 'ready', dirName: to, created: false, renamedFrom: known };
}

/* ------------------------------------------------------------------
 * ছবি media/-তে রাখা
 * ---------------------------------------------------------------- */

async function findImageRecord(id: string): Promise<{ rec: DbImage; scope: CqScope } | null> {
  for (const scope of ['type', 'chapter'] as CqScope[]) {
    const rec = await getDb(scope).images.get(id);
    if (rec) return { rec, scope };
  }
  return null;
}

/** ছবির ফাইল ক্যাটেগরির media/-তে আছে কি না দেখে, না থাকলে রাখে। ফেরত: যে ছবির উৎস পাওয়া যায়নি তাদের id */
export async function placeCategoryImages(dirName: string, imageIds: string[]): Promise<string[]> {
  const mediaDir = categoryMediaDir(dirName);
  await makeDir(mediaDir);
  await writeText(`${mediaDir}/${NOMEDIA_FILE}`, ''); // ছবি গ্যালারিতে আসে না

  const missing: string[] = [];
  for (const id of imageIds) {
    const target = categoryMediaPath(dirName, id);
    const st = await statPath(target);
    if (st && !st.isDir && st.size > 0) continue;

    const hit = await findImageRecord(id);
    if (!hit) {
      missing.push(id);
      continue;
    }
    const { rec, scope } = hit;
    if (rec.blob) {
      const dataUrl = await blobToBase64(rec.blob);
      const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      await writeBase64(target, b64);
    } else {
      const src = await imageFilePath(getDb(scope), rec);
      if (src && (await pathExists(src))) await copyFile(src, target);
      else {
        missing.push(id);
        continue;
      }
    }
    const after = await statPath(target);
    if (!after || after.size === 0) throw new Error('ছবির ফাইল লেখা যায়নি');
  }
  return missing;
}

/* ------------------------------------------------------------------
 * একটা ক্যাটেগরি লেখা
 * ---------------------------------------------------------------- */

export interface WriteCategoryResult {
  id: string;
  status: 'written' | 'unchanged' | 'folder-missing' | 'refused';
  dirName?: string;
  /** refused/folder-missing হলে কারণ */
  reason?: string;
  warnings: string[];
  /** media/-তে রাখা যায়নি এমন ছবির id (উৎসই পাওয়া যায়নি) */
  missingImages: string[];
}

/** শেষ যে লেখা দিয়েছি (একই হলে আবার লিখি না): dirName -> data.json-এর লেখা */
const lastData = new Map<string, string>();
const lastMeta = new Map<string, string>();

export function resetCategoryWriterCaches(): void {
  lastData.clear();
  lastMeta.clear();
}

/**
 * একটা ক্যাটেগরির ফোল্ডার লেখা (লকের ভেতর থেকে ডাকতে হবে - দেখুন writeCategories)।
 * state পরিবর্তন হয় (ডাকা কোড শেষে saveCategorySyncState করবে)।
 */
export async function writeCategoryFolder(cat: Category, state: CategorySyncState, opts: { allowCreate?: boolean } = {}): Promise<WriteCategoryResult> {
  const result: WriteCategoryResult = { id: cat.id, status: 'unchanged', warnings: [], missingImages: [] };

  const dir = await resolveCategoryDir(cat, state, opts.allowCreate ?? true);
  if (dir.kind === 'missing') {
    return { ...result, status: 'folder-missing', dirName: dir.dirName, reason: 'ফোল্ডারটা ফাইল ম্যানেজারে মোছা/সরানো হয়েছে - আবার তৈরি করা হয়নি' };
  }

  // প্রশ্নপত্র ও কপি জোগাড় এবং যাচাই - ফোল্ডারে হাত দেওয়ার আগে (যাচাই না মিললে কিছুই লেখা/বদলানো হয় না)
  const papers: Paper[] = await db.papers.where('categoryId').equals(cat.id).toArray();
  const ids = Array.from(new Set(papers.flatMap((p) => (Array.isArray(p.questionIds) ? p.questionIds.filter((x) => typeof x === 'string') : []))));
  const lookup = await buildBankLookup(ids);
  const previousDir = dir.renamedFrom ?? dir.dirName;
  const previous = await readPreviousCopies(previousDir); // নতুন ফোল্ডার হলে ফাইল নেই -> খালি
  const copies = buildCategoryCopies(papers, lookup, previous);
  result.warnings.push(...copies.warnings);

  const verified = buildVerifiedCategoryData({ category: cat, papers, copies });
  if (!verified.ok) {
    return { ...result, status: 'refused', dirName: dir.renamedFrom ?? dir.dirName, reason: `${verified.reason}: ${verified.problems.slice(0, 3).join('; ')}` };
  }
  result.warnings.push(...verified.warnings);

  // ফোল্ডার তৈরি / নাম বদল
  let dirName = dir.dirName;
  let changed = false;
  if (dir.renamedFrom) {
    await renamePath(categoryDirPath(dir.renamedFrom), categoryDirPath(dirName));
    lastData.delete(dir.renamedFrom);
    lastMeta.delete(dir.renamedFrom);
    changed = true;
  } else if (dir.created) {
    await makeDir(CATEGORY_ROOT);
    await makeDir(categoryDirPath(dirName));
    changed = true;
  }

  // .folder.json
  const metaText = categoryMetaToText(cat);
  if (lastMeta.get(dirName) !== metaText || dir.created) {
    await writeText(categoryMetaPath(dirName), metaText);
    lastMeta.set(dirName, metaText);
    changed = true;
  }

  // ছবি (data.json-এর আগে, যাতে ফাইল যা বলে media/-তে তা-ই থাকে)
  result.missingImages = await placeCategoryImages(dirName, verified.file.images.map((i) => i.id));
  if (result.missingImages.length) {
    result.warnings.push(`${result.missingImages.length}টি ছবির উৎস পাওয়া যায়নি (media/-তে রাখা হয়নি): ${result.missingImages.slice(0, 3).join(', ')}`);
  }

  // data.json
  const dataFile = categoryDataPath(dirName);
  const same = lastData.get(dirName) === verified.text && (await pathExists(dataFile));
  if (!same) {
    await writeTextSafe(dataFile, verified.text);
    lastData.set(dirName, verified.text);
    changed = true;
  }

  // সিঙ্কের স্মৃতি
  const st = await statPath(dataFile);
  state.categories[cat.id] = { dirName, ...(st ? { dataMtime: st.mtime, dataSize: st.size } : {}) };
  for (const p of papers) state.papers[p.id] = { categoryId: cat.id };

  return { ...result, status: changed ? 'written' : 'unchanged', dirName };
}

/**
 * কয়েকটা ক্যাটেগরি লেখা (সিঙ্ক লকের ভেতরে; স্মৃতি একবার পড়ে একবার সেভ)।
 * strict = প্রথম ব্যর্থতায় exception (দ্বিতীয় অর্ধেকের চালক ব্যবহার করবে)।
 */
export function writeCategories(categoryIds: string[], opts: { allowCreate?: boolean; strict?: boolean; onUnit?: (name: string) => void } = {}): Promise<WriteCategoryResult[]> {
  return withSyncLock(async () => {
    const state = await loadCategorySyncState();
    const results: WriteCategoryResult[] = [];
    try {
      for (const id of categoryIds) {
        const cat = await db.categories.get(id);
        if (!cat) continue;
        try {
          results.push(await writeCategoryFolder(cat, state, { allowCreate: opts.allowCreate }));
        } catch (err: any) {
          if (opts.strict) throw err;
          results.push({ id, status: 'refused', reason: err?.message || String(err), warnings: [], missingImages: [] });
        }
        opts.onUnit?.(cat.name);
      }
    } finally {
      await saveCategorySyncState(state); // যতদূর লেখা হয়েছে তার স্মৃতি রাখা হয়
    }
    return results;
  });
}


/* ------------------------------------------------------------------
 * অংশ ১খ-২ (প্রথম ছোট ধাপ): ক্যাটেগরি/প্রশ্নপত্রের অটো-লেখা hook
 * ---------------------------------------------------------------- */

import { autoSyncStore } from './autoSyncStatus';
import { waitForEditorsClosed } from './editorGuard';

const CATEGORY_DEBOUNCE_MS = 800;
let categoryHooksInstalled = false;
let categoryWritesEnabled = false;
let categoryTimer: ReturnType<typeof setTimeout> | null = null;
let categoryFlush: Promise<void> | null = null;
let categoryErrorHandler: ((message: string) => void) | null = null;
const dirtyCategoryIds = new Set<string>();
const deletedCategoryIds = new Set<string>();

export function setCategoryWritesEnabled(enabled: boolean): void {
  categoryWritesEnabled = enabled;
  if (!enabled && categoryTimer) {
    clearTimeout(categoryTimer);
    categoryTimer = null;
  }
  if (enabled && (dirtyCategoryIds.size || deletedCategoryIds.size)) scheduleCategoryWrite();
}

export function setCategoryWriteErrorHandler(handler: ((message: string) => void) | null): void {
  categoryErrorHandler = handler;
}

function queueCategoryWrite(id: unknown): void {
  if (!categoryWritesEnabled || typeof id !== 'string' || !id) return;
  deletedCategoryIds.delete(id);
  dirtyCategoryIds.add(id);
  scheduleCategoryWrite();
}

function queueCategoryDelete(id: unknown): void {
  if (!categoryWritesEnabled || typeof id !== 'string' || !id) return;
  dirtyCategoryIds.delete(id);
  deletedCategoryIds.add(id);
  scheduleCategoryWrite();
}

function queueAllCategoryWrites(): void {
  if (!categoryWritesEnabled) return;
  void db.categories.toArray().then((categories) => {
    for (const category of categories) queueCategoryWrite(category.id);
  }).catch((err) => {
    categoryErrorHandler?.(err?.message || String(err));
  });
}

function scheduleCategoryWrite(): void {
  if (categoryTimer) clearTimeout(categoryTimer);
  categoryTimer = setTimeout(() => {
    categoryTimer = null;
    void flushCategoryWrites();
  }, CATEGORY_DEBOUNCE_MS);
}

/** ক্যাটেগরির ফোল্ডার মুছে ফেলা কেবল অ্যাপের category delete hook থেকে আসে। */
async function removeDeletedCategoryFolders(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await withSyncLock(async () => {
    const state = await loadCategorySyncState();
    for (const id of ids) {
      // delete-এর পরে একই id আবার তৈরি হলে পুরনো ফোল্ডার মুছবে না।
      if (await db.categories.get(id)) continue;
      const row = state.categories[id];
      if (row?.dirName) await removeDir(categoryDirPath(row.dirName));
      delete state.categories[id];
      for (const [paperId, paperRow] of Object.entries(state.papers)) {
        if (paperRow.categoryId === id) delete state.papers[paperId];
      }
    }
    await saveCategorySyncState(state);
  });
}

/**
 * Dexie hooks: categories/papers-এর নির্দিষ্ট ক্যাটেগরি; ব্যাংকের প্রশ্ন/উদ্দীপক/ছবির বদলে
 * সংশ্লিষ্ট সব ক্যাটেগরি queue হয়। এতে কোনো ব্যবহৃত কপি stale থেকে যায় না।
 */
export function installCategoryWriteHooks(): void {
  if (categoryHooksInstalled) return;
  categoryHooksInstalled = true;

  db.categories.hook('creating', (_pk, obj, tx: any) => {
    if (!categoryWritesEnabled || tx?.qbSync) return;
    queueCategoryWrite(obj?.id);
  });
  db.categories.hook('updating', (_mods, pk, _obj, tx: any) => {
    if (!categoryWritesEnabled || tx?.qbSync) return;
    queueCategoryWrite(pk);
  });
  db.categories.hook('deleting', (pk, _obj, tx: any) => {
    if (!categoryWritesEnabled || tx?.qbSync) return;
    queueCategoryDelete(pk);
  });

  db.papers.hook('creating', (_pk, obj, tx: any) => {
    if (!categoryWritesEnabled || tx?.qbSync) return;
    queueCategoryWrite(obj?.categoryId);
  });
  db.papers.hook('updating', (mods, pk, obj, tx: any) => {
    if (!categoryWritesEnabled || tx?.qbSync) return;
    queueCategoryWrite(obj?.categoryId);
    queueCategoryWrite(mods?.categoryId);
    // categoryId undefined হলে কাগজটি অশ্রেণিবদ্ধে গেছে/সেখান থেকে এসেছে; সব ক্যাটেগরি
    // পুনর্লিখলে পুরনো ক্যাটেগরির data.json-ও সঠিকভাবে পরিষ্কার হয়।
    if (Object.prototype.hasOwnProperty.call(mods || {}, 'categoryId')) queueAllCategoryWrites();
  });
  db.papers.hook('deleting', (_pk, obj, tx: any) => {
    if (!categoryWritesEnabled || tx?.qbSync) return;
    queueCategoryWrite(obj?.categoryId);
  });

  // Question, stimulus ও image দুই CQ database-এই থাকতে পারে। এই পরিবর্তনগুলো কোন
  // ক্যাটেগরির প্রশ্নপত্রে ব্যবহৃত তা নির্ধারণের জন্য নিরাপদ conservative refresh।
  for (const scope of ['type', 'chapter'] as CqScope[]) {
    const sdb = getDb(scope);
    for (const table of [sdb.questions, sdb.stimuli, sdb.images]) {
      table.hook('creating', (_pk, _obj, tx: any) => {
        if (!categoryWritesEnabled || tx?.qbSync) return;
        queueAllCategoryWrites();
      });
      table.hook('updating', (_mods, _pk, _obj, tx: any) => {
        if (!categoryWritesEnabled || tx?.qbSync) return;
        queueAllCategoryWrites();
      });
      table.hook('deleting', (_pk, _obj, tx: any) => {
        if (!categoryWritesEnabled || tx?.qbSync) return;
        queueAllCategoryWrites();
      });
    }
  }
}

/** debounce শেষে editor বন্ধ হওয়া পর্যন্ত অপেক্ষা করে, তারপর একবারে dirty category লেখে। */
export function flushCategoryWrites(): Promise<void> {
  if (categoryFlush) return categoryFlush;
  if (categoryTimer) {
    clearTimeout(categoryTimer);
    categoryTimer = null;
  }
  if (!categoryWritesEnabled || (!dirtyCategoryIds.size && !deletedCategoryIds.size)) return Promise.resolve();

  categoryFlush = (async () => {
    const showStatus = !autoSyncStore.isRunning();
    const deletes = Array.from(deletedCategoryIds);
    const writes = Array.from(dirtyCategoryIds);
    if (showStatus) autoSyncStore.start();
    try {
      const openEditors = await waitForEditorsClosed(() => !categoryWritesEnabled);
      if (!openEditors) {
        if (showStatus) autoSyncStore.finish(false);
        return;
      }
      deletedCategoryIds.clear();
      dirtyCategoryIds.clear();
      await removeDeletedCategoryFolders(deletes);
      if (writes.length) {
        const results = await writeCategories(writes, { allowCreate: false });
        const failures = results.filter((r) => r.status === 'refused' || r.status === 'folder-missing');
        const warnings = results.flatMap((r) => r.warnings);
        if (failures.length) {
          const message = failures.map((r) => r.reason || r.status).slice(0, 3).join('; ');
          categoryErrorHandler?.(message);
        }
        if (warnings.length) categoryErrorHandler?.(warnings[0]);
      }
      if (showStatus) autoSyncStore.finish(writes.length > 0 || deletes.length > 0);
    } catch (err: any) {
      // exception হলে কাজগুলো ফেরত queue-তে যায়; পরের debounce-এ আবার চেষ্টা হবে।
      writes.forEach((id) => dirtyCategoryIds.add(id));
      deletes.forEach((id) => deletedCategoryIds.add(id));
      categoryErrorHandler?.(err?.message || String(err));
      if (showStatus) autoSyncStore.fail();
    } finally {
      categoryFlush = null;
      if (dirtyCategoryIds.size || deletedCategoryIds.size) scheduleCategoryWrite();
    }
  })();
  return categoryFlush;
}
