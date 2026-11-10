import { db, chapterDb, type QbDatabase, type Question, type Stimulus, type Paper, type Topic, type Chapter, type Subject } from '../db/db';
import { generateId } from '../db/api';
import { blobToBase64, base64ToBlob, exportJsonFile } from './fileExport';
import { BACKUP_FOLDERS } from './storageAccess';
import { hydrateImages } from '../storage/imageStore';
import { pauseSync, resumeSync, flushAfterBulkChange } from '../storage/syncEngine';
import {
  buildBackupText,
  parseBackupText,
  planImport,
  emptyScope,
  type BackupBody,
  type BackupCounts,
  type BackupImage,
  type ImportPlan,
  type LocalScopeSnapshot,
  type LocalSnapshot,
  type ParsedBackup,
} from './categoryBackupCore';

declare const __APP_VERSION__: string;
const appVersion = (): string => (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev');

export interface Progress {
  stage: string;
  done: number;
  total: number;
}
export type ProgressFn = (p: Progress) => void;

const IMG_MARKER_RE = /\[\[img:([^\]\s]+)\]\]/g;
function markerIds(text: string | undefined | null): string[] {
  if (!text) return [];
  const out: string[] = [];
  const re = new RegExp(IMG_MARKER_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return out;
}

const uniq = <T,>(list: T[]): T[] => Array.from(new Set(list));

/** ids are looked up in the first database, whatever is not found there in the second one */
async function fetchRows<T extends { id: string }>(
  tableOf: (d: QbDatabase) => { bulkGet: (ids: string[]) => Promise<Array<T | undefined>> },
  ids: string[],
  first: QbDatabase,
  second: QbDatabase
): Promise<{ firstRows: T[]; secondRows: T[]; missing: string[] }> {
  if (ids.length === 0) return { firstRows: [], secondRows: [], missing: [] };
  const a = (await tableOf(first).bulkGet(ids)).filter(Boolean) as T[];
  const have = new Set(a.map((r) => r.id));
  const rest = ids.filter((id) => !have.has(id));
  const b = rest.length ? ((await tableOf(second).bulkGet(rest)).filter(Boolean) as T[]) : [];
  const have2 = new Set(b.map((r) => r.id));
  return { firstRows: a, secondRows: b, missing: rest.filter((id) => !have2.has(id)) };
}

/* ------------------------------------------------------------------ */
/* Backup                                                              */
/* ------------------------------------------------------------------ */

export interface CollectResult {
  body: BackupBody;
  /** questions a paper points to but that exist in neither database */
  missingQuestions: number;
  /** pictures a question / stimulus points to but whose file could not be read */
  missingImages: number;
}

/** Everything the chosen categories need: papers, every question (Type CQ + Chapter CQ), stimuli, hierarchy, pictures */
export async function collectBackupBody(categoryIds: string[], onProgress?: ProgressFn): Promise<CollectResult> {
  onProgress?.({ stage: 'ক্যাটেগরি ও প্রশ্নপত্র পড়া হচ্ছে', done: 0, total: 1 });

  const catRows = ((await db.categories.bulkGet(categoryIds)).filter(Boolean) as Array<{
    id: string;
    name: string;
    order: number;
    createdAt: number;
  }>).sort((a, b) => (a.order || 0) - (b.order || 0));
  if (catRows.length === 0) throw new Error('কোনো ক্যাটেগরি পাওয়া যায়নি');

  const categories: BackupBody['categories'] = [];
  const allPapers: Paper[] = [];
  for (const c of catRows) {
    const papers = await db.papers.where('categoryId').equals(c.id).toArray();
    categories.push({ id: c.id, name: c.name, order: c.order, createdAt: c.createdAt, papers });
    allPapers.push(...papers);
  }

  // ---- questions: Type CQ first, the rest from Chapter CQ ----
  const questionIds = uniq(allPapers.flatMap((p) => p.questionIds || []));
  const q = await fetchRows<Question>((d) => d.questions as any, questionIds, db, chapterDb);
  const questions = { type: q.firstRows, chapter: q.secondRows };

  // ---- stimuli (looked up next to their question's database first) ----
  const stimuli: { type: Stimulus[]; chapter: Stimulus[] } = { type: [], chapter: [] };
  const seenStim = new Set<string>();
  for (const scope of ['type', 'chapter'] as const) {
    const first = scope === 'type' ? db : chapterDb;
    const second = scope === 'type' ? chapterDb : db;
    const ids = uniq(questions[scope].map((x) => x.stimulusId).filter(Boolean) as string[]).filter((id) => !seenStim.has(id));
    const r = await fetchRows<Stimulus>((d) => d.stimuli as any, ids, first, second);
    for (const s of r.firstRows) {
      seenStim.add(s.id);
      stimuli[scope].push(s);
    }
    for (const s of r.secondRows) {
      seenStim.add(s.id);
      stimuli[scope === 'type' ? 'chapter' : 'type'].push(s);
    }
  }

  // ---- hierarchy (topic > chapter > subject) of each scope ----
  const scopes: BackupBody['scopes'] = { type: emptyScope(), chapter: emptyScope() };
  for (const scope of ['type', 'chapter'] as const) {
    const sdb = scope === 'type' ? db : chapterDb;
    const data = scopes[scope];
    data.questions = questions[scope];
    data.stimuli = stimuli[scope];
    const topicIds = uniq([...data.questions.map((x) => x.topicId), ...data.stimuli.map((x) => x.topicId)].filter(Boolean));
    data.topics = ((await sdb.topics.bulkGet(topicIds)).filter(Boolean) as Topic[]);
    const chapterIds = uniq(data.topics.map((t) => t.chapterId).filter(Boolean));
    data.chapters = ((await sdb.chapters.bulkGet(chapterIds)).filter(Boolean) as Chapter[]);
    const subjectIds = uniq(data.chapters.map((c) => c.subjectId).filter(Boolean));
    data.subjects = ((await sdb.subjects.bulkGet(subjectIds)).filter(Boolean) as Subject[]);
  }

  // ---- pictures: list fields + [[img:id]] markers in texts (also paper-only edits) ----
  const wanted: { type: Set<string>; chapter: Set<string> } = { type: new Set(), chapter: new Set() };
  for (const scope of ['type', 'chapter'] as const) {
    const w = wanted[scope];
    for (const s of scopes[scope].stimuli) {
      (s.imageIds || []).forEach((id) => w.add(id));
      markerIds(s.text).forEach((id) => w.add(id));
    }
    for (const x of scopes[scope].questions) {
      (x.solutionImageIds || []).forEach((id) => w.add(id));
      markerIds(x.questionText).forEach((id) => w.add(id));
      markerIds(x.solutionText).forEach((id) => w.add(id));
      markerIds(x.answerText).forEach((id) => w.add(id));
    }
  }
  for (const p of allPapers) {
    const edits = p.edits;
    if (!edits) continue;
    for (const e of Object.values(edits.questions || {})) {
      markerIds(e.questionText).forEach((id) => wanted.type.add(id));
      markerIds(e.solutionText).forEach((id) => wanted.type.add(id));
    }
    for (const e of Object.values(edits.stimuli || {})) markerIds(e.text).forEach((id) => wanted.type.add(id));
  }

  let missingImages = 0;
  const doneImages = new Set<string>();
  const totalImages = wanted.type.size + wanted.chapter.size;
  let processed = 0;
  for (const scope of ['type', 'chapter'] as const) {
    const first = scope === 'type' ? db : chapterDb;
    const second = scope === 'type' ? chapterDb : db;
    const ids = Array.from(wanted[scope]).filter((id) => !doneImages.has(id));
    const found = new Set<string>();
    for (const sdb of [first, second]) {
      const left = ids.filter((id) => !found.has(id));
      if (left.length === 0) break;
      const recs = await hydrateImages(sdb, await sdb.images.where('id').anyOf(left).toArray());
      for (const rec of recs) {
        if (!rec.blob || found.has(rec.id)) continue;
        found.add(rec.id);
        doneImages.add(rec.id);
        const image: BackupImage = { id: rec.id, fileName: rec.fileName || `${rec.id}.webp`, data: await blobToBase64(rec.blob) };
        scopes[scope].images.push(image);
        processed++;
        if (processed % 5 === 0) onProgress?.({ stage: 'ছবি জমা হচ্ছে', done: processed, total: Math.max(totalImages, 1) });
      }
    }
    missingImages += ids.filter((id) => !found.has(id)).length;
  }
  onProgress?.({ stage: 'ছবি জমা হয়েছে', done: totalImages, total: Math.max(totalImages, 1) });

  return { body: { categories, scopes }, missingQuestions: q.missing.length, missingImages };
}

export interface BackupResult {
  ok: boolean;
  counts: BackupCounts;
  bytes: number;
  missingQuestions: number;
  missingImages: number;
}

/**
 * Safe backup: build -> re-read the finished text with the same checks an import uses (checksum, counts) ->
 * only then write the file (size is checked after writing). A file that fails a check is never reported as saved.
 */
export async function exportCategoryBackup(categoryIds: string[], onProgress?: ProgressFn): Promise<BackupResult> {
  const { body, missingQuestions, missingImages } = await collectBackupBody(categoryIds, onProgress);

  onProgress?.({ stage: 'ফাইল তৈরি ও চেকসাম বসানো হচ্ছে', done: 0, total: 1 });
  const built = await buildBackupText(body, appVersion());

  // self-check: the exact text that will be written must read back correctly
  onProgress?.({ stage: 'ফাইল যাচাই করা হচ্ছে', done: 0, total: 1 });
  const back = await parseBackupText(built.text);
  const same =
    back.counts.categories === built.counts.categories &&
    back.counts.papers === built.counts.papers &&
    back.counts.questions === built.counts.questions &&
    back.counts.stimuli === built.counts.stimuli &&
    back.counts.images === built.counts.images;
  if (!same) throw new Error('তৈরি ব্যাকআপ ফাইল যাচাইয়ে মেলেনি - ফাইল সেভ করা হয়নি, আবার চেষ্টা করুন');

  onProgress?.({ stage: 'ফাইল সেভ করা হচ্ছে', done: 0, total: 1 });
  const dateStr = new Date().toISOString().split('T')[0];
  const ok = await exportJsonFile(`qb-category-backup-${dateStr}.json`, built.text, {
    folder: BACKUP_FOLDERS.categoryBackup,
    verifySize: true,
  });
  return { ok, counts: built.counts, bytes: built.text.length, missingQuestions, missingImages };
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

async function snapshotScope(sdb: QbDatabase): Promise<LocalScopeSnapshot> {
  const [subjects, chapters, topics, qIds, sIds, iIds] = await Promise.all([
    sdb.subjects.toArray(),
    sdb.chapters.toArray(),
    sdb.topics.toArray(),
    sdb.questions.toCollection().primaryKeys(),
    sdb.stimuli.toCollection().primaryKeys(),
    sdb.images.toCollection().primaryKeys(),
  ]);
  return {
    subjects,
    chapters,
    topics,
    questionIds: new Set(qIds as string[]),
    stimulusIds: new Set(sIds as string[]),
    imageIds: new Set(iIds as string[]),
  };
}

export async function loadLocalSnapshot(): Promise<LocalSnapshot> {
  const [type, chapter, categories, papers] = await Promise.all([
    snapshotScope(db),
    snapshotScope(chapterDb),
    db.categories.toArray(),
    db.papers.toArray(),
  ]);
  return {
    type,
    chapter,
    categories: categories.map((c) => ({ id: c.id, name: c.name, order: c.order })),
    papers,
  };
}

export interface Analysis {
  parsed: ParsedBackup;
  plan: ImportPlan;
}

/** Read + check a backup file and work out what an import would add. Writes nothing. */
export async function analyzeBackupText(text: string): Promise<Analysis> {
  const parsed = await parseBackupText(text);
  const local = await loadLocalSnapshot();
  const plan = planImport(parsed, local, generateId);
  return { parsed, plan };
}

export interface ImportResult {
  categoriesAdded: number;
  categoriesMerged: number;
  papersAdded: number;
  papersSkipped: number;
  questionsAdded: number;
  imagesAdded: number;
  /** every added row was read back from the database after the import */
  verified: boolean;
}

async function addChunks(table: any, rows: any[], size = 200, tick?: (n: number) => void): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    const part = rows.slice(i, i + size);
    await table.bulkAdd(part);
    tick?.(part.length);
  }
}

interface AddedIds {
  subjects: string[];
  chapters: string[];
  topics: string[];
  stimuli: string[];
  questions: string[];
  images: string[];
}

function toImageRows(images: BackupImage[]): Array<{ id: string; fileName: string; blob: Blob }> {
  const rows: Array<{ id: string; fileName: string; blob: Blob }> = [];
  for (const img of images) {
    try {
      rows.push({ id: img.id, fileName: img.fileName || `${img.id}.webp`, blob: base64ToBlob(img.data) });
    } catch (e) {
      console.warn('Skipping unreadable image in backup:', img.id, e);
    }
  }
  return rows;
}

/** Add the missing rows of one scope in ONE transaction: all of it is written or nothing is */
async function writeScope(
  sdb: QbDatabase,
  plan: ImportPlan['scopes']['type'],
  extra: ((sdb: QbDatabase) => Promise<void>) | null,
  tables: any[],
  tick: (n: number) => void
): Promise<AddedIds> {
  const imageRows = toImageRows(plan.images);
  const added: AddedIds = {
    subjects: plan.subjects.map((x) => x.id),
    chapters: plan.chapters.map((x) => x.id),
    topics: plan.topics.map((x) => x.id),
    stimuli: plan.stimuli.map((x) => x.id),
    questions: plan.questions.map((x) => x.id),
    images: imageRows.map((x) => x.id),
  };
  await sdb.transaction('rw', tables, async () => {
    await addChunks(sdb.subjects, plan.subjects, 200, tick);
    await addChunks(sdb.chapters, plan.chapters, 200, tick);
    await addChunks(sdb.topics, plan.topics, 200, tick);
    await addChunks(sdb.stimuli, plan.stimuli, 200, tick);
    await addChunks(sdb.questions, plan.questions, 200, tick);
    await addChunks(sdb.images, imageRows, 40, tick);
    if (extra) await extra(sdb);
  });
  return added;
}

async function removeAdded(sdb: QbDatabase, added: AddedIds): Promise<void> {
  await sdb.transaction('rw', [sdb.subjects, sdb.chapters, sdb.topics, sdb.stimuli, sdb.questions, sdb.images], async () => {
    await sdb.questions.bulkDelete(added.questions);
    await sdb.stimuli.bulkDelete(added.stimuli);
    await sdb.topics.bulkDelete(added.topics);
    await sdb.chapters.bulkDelete(added.chapters);
    await sdb.subjects.bulkDelete(added.subjects);
    await sdb.images.bulkDelete(added.images);
  });
}

async function countPresent(table: any, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  return ((await table.bulkGet(ids)) as any[]).filter(Boolean).length;
}

/**
 * Safe import. Nothing that already exists is overwritten or deleted - only missing things are added.
 *  1. Chapter CQ rows go in first (one transaction)
 *  2. then Type CQ rows + categories + papers (one transaction) - papers appear only after their questions exist
 *  3. if step 2 fails, what step 1 added is taken out again, so the database stays exactly as it was
 *  4. afterwards every added row is read back to confirm it is really there
 * Folder sync is paused meanwhile and the folders are written once at the end.
 */
export async function runCategoryImport(plan: ImportPlan, onProgress?: ProgressFn): Promise<ImportResult> {
  const total =
    plan.totals.newSubjects +
    plan.totals.newChapters +
    plan.totals.newTopics +
    plan.totals.newStimuli +
    plan.totals.newQuestions +
    plan.totals.newImages +
    plan.totals.newPapers +
    plan.totals.newCategories;
  let done = 0;
  const tick = (n: number) => {
    done += n;
    onProgress?.({ stage: 'ডেটা যোগ হচ্ছে', done: Math.min(done, total), total: Math.max(total, 1) });
  };

  pauseSync();
  let chapterAdded: AddedIds | null = null;
  try {
    onProgress?.({ stage: 'শুরু হচ্ছে', done: 0, total: Math.max(total, 1) });

    // 1) Chapter CQ
    const chapterTables = [chapterDb.subjects, chapterDb.chapters, chapterDb.topics, chapterDb.stimuli, chapterDb.questions, chapterDb.images];
    chapterAdded = await writeScope(chapterDb, plan.scopes.chapter, null, chapterTables, tick);

    // 2) Type CQ + categories + papers
    const typeTables = [db.subjects, db.chapters, db.topics, db.stimuli, db.questions, db.images, db.categories, db.papers];
    const catIdByName = new Map<string, string>();
    const newCategoryRows: Array<{ id: string; name: string; order: number; createdAt: number }> = [];
    for (const c of plan.categories) {
      if (c.existingId) {
        catIdByName.set(c.name.trim().toLowerCase(), c.existingId);
      } else {
        const id = generateId();
        catIdByName.set(c.name.trim().toLowerCase(), id);
        newCategoryRows.push({ id, name: c.name, order: c.order || 0, createdAt: c.createdAt || Date.now() });
      }
    }
    const isNewCategory = new Set(plan.categories.filter((c) => c.isNew).map((c) => c.name.trim().toLowerCase()));
    const paperRows: Paper[] = plan.papersToAdd.map(({ categoryName, paper }) => {
      const key = categoryName.trim().toLowerCase();
      const row: Paper = { ...paper, categoryId: catIdByName.get(key), category: categoryName };
      // a paper merged into an existing category must not bring its own manual position along
      if (!isNewCategory.has(key)) delete row.order;
      return row;
    });

    const typeAdded = await writeScope(
      db,
      plan.scopes.type,
      async (sdb) => {
        await addChunks(sdb.categories, newCategoryRows, 200, tick);
        await addChunks(sdb.papers, paperRows, 100, tick);
      },
      typeTables,
      tick
    ).catch(async (err) => {
      // type step failed (its own transaction already rolled back) -> take step 1 out again
      if (chapterAdded) {
        try {
          await removeAdded(chapterDb, chapterAdded);
        } catch (undoErr) {
          console.error('Could not undo Chapter CQ rows after a failed import:', undoErr);
          throw new Error(
            'ইম্পোর্ট ব্যর্থ হয়েছে এবং Chapter CQ-তে কিছু প্রশ্ন আংশিক যোগ হয়ে থাকতে পারে। ফোল্ডার থেকে সিঙ্ক করে বা ব্যাকআপ ফাইল আবার ইম্পোর্ট করে ঠিক করুন'
          );
        }
      }
      throw err;
    });

    // 3) read back
    onProgress?.({ stage: 'যাচাই করা হচ্ছে', done: total, total: Math.max(total, 1) });
    const okParts = await Promise.all([
      countPresent(db.questions, typeAdded.questions).then((n) => n === typeAdded.questions.length),
      countPresent(chapterDb.questions, chapterAdded.questions).then((n) => n === chapterAdded!.questions.length),
      countPresent(db.stimuli, typeAdded.stimuli).then((n) => n === typeAdded.stimuli.length),
      countPresent(chapterDb.stimuli, chapterAdded.stimuli).then((n) => n === chapterAdded!.stimuli.length),
      countPresent(db.images, typeAdded.images).then((n) => n === typeAdded.images.length),
      countPresent(chapterDb.images, chapterAdded.images).then((n) => n === chapterAdded!.images.length),
      countPresent(db.papers, paperRows.map((p) => p.id)).then((n) => n === paperRows.length),
      countPresent(db.categories, newCategoryRows.map((c) => c.id)).then((n) => n === newCategoryRows.length),
    ]);

    // the new rows go into the storage folders now (a failure here does not undo the import - auto sync retries)
    onProgress?.({ stage: 'ফোল্ডারে লেখা হচ্ছে', done: total, total: Math.max(total, 1) });
    try {
      await flushAfterBulkChange();
    } catch (flushErr) {
      console.warn('Folder write after import failed, auto sync will retry:', flushErr);
    }

    return {
      categoriesAdded: newCategoryRows.length,
      categoriesMerged: plan.categories.length - newCategoryRows.length,
      papersAdded: paperRows.length,
      papersSkipped: plan.totals.duplicatePapers + plan.totals.brokenPapers,
      questionsAdded: typeAdded.questions.length + chapterAdded.questions.length,
      imagesAdded: typeAdded.images.length + chapterAdded.images.length,
      verified: okParts.every(Boolean),
    };
  } finally {
    resumeSync();
  }
}

