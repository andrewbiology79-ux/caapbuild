import { db, getDb, type CopyImage, type CqScope, type QbDatabase, type QuestionCopy } from '../db/db';
import { buildBankLookup } from './bankLookup';
import { getImageBlob } from './imageStore';
import type { CopiedQuestion, CopiedStimulus } from './categoryLayout';
import {
  bankMissingCountsByPaper,
  bankMissingIdsOfPaper,
  copyRecordFromCopied,
  makeCopyRecord,
  orphanedCopyImageIds,
  planPrune,
  questionsNeedingCopy,
  restoreCopyToBank,
  usedQuestionIds,
  type BankPort,
  type RestoreResult,
} from './bankMissing';

/**
 * অংশ ১ঘ-ক - ব্যাংকে-নেই প্রশ্ন: ডেটাবেস IO (Dexie)। লজিক bankMissing.ts-এ (খাঁটি, টেস্ট করা)।
 * এখনো অ্যাপের কোথাও জোড়া নেই (মোছার পথ, getQuestionsByIds, লেখক, UI - দ্বিতীয় রাউন্ডে), তাই APK-র আচরণ বদলায়নি।
 *
 * কপি থাকে db.questionCopies / db.copyImages-এ (Type CQ ডেটাবেসে - প্রশ্নপত্র সেখানেই)।
 */

const SCOPES: CqScope[] = ['type', 'chapter'];

/* ------------------------------------------------------------------
 * পড়া
 * ---------------------------------------------------------------- */

export async function loadCopies(ids?: string[]): Promise<Map<string, QuestionCopy>> {
  const out = new Map<string, QuestionCopy>();
  const list = ids ? (await db.questionCopies.bulkGet(ids)).filter((c): c is QuestionCopy => !!c) : await db.questionCopies.toArray();
  for (const c of list) out.set(c.id, c);
  return out;
}

export async function getCopyImage(id: string): Promise<CopyImage | null> {
  return (await db.copyImages.get(id)) ?? null;
}

export async function getCopyImageBlob(id: string): Promise<Blob | null> {
  const rec = await db.copyImages.get(id);
  return rec?.blob ?? null;
}

/** ids-এর মধ্যে যেগুলো (Type বা Chapter) ব্যাংকে আছে */
export async function bankIdsAmong(ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (ids.length === 0) return out;
  for (const scope of SCOPES) {
    const keys = await getDb(scope).questions.where('id').anyOf(ids).primaryKeys();
    for (const k of keys) out.add(String(k));
  }
  return out;
}

/** প্রশ্নপত্র-id -> ব্যাংকে-নেই প্রশ্নের সংখ্যা (Create কার্ডের চিহ্ন)। কপি না থাকলে খালি ম্যাপ (সস্তা) */
export async function getBankMissingCounts(): Promise<Map<string, number>> {
  const copyIds = await db.questionCopies.toCollection().primaryKeys();
  if (copyIds.length === 0) return new Map();
  const copySet = new Set(copyIds.map(String));
  const bankIds = await bankIdsAmong(Array.from(copySet));
  const papers = await db.papers.toArray();
  return bankMissingCountsByPaper(papers, bankIds, copySet);
}

/** একটা প্রশ্নপত্রের ব্যাংকে-নেই প্রশ্নের id (প্রশ্নপত্রের ক্রমে) - সম্পাদনা উইন্ডোর "ব্যাংকে নেই" ট্যাগের জন্য */
export async function getBankMissingIdsForPaper(paperId: string): Promise<string[]> {
  const paper = await db.papers.get(paperId);
  if (!paper) return [];
  const ids = Array.isArray(paper.questionIds) ? paper.questionIds.filter((x) => typeof x === 'string') : [];
  if (ids.length === 0) return [];
  const have = (await db.questionCopies.bulkGet(ids)).filter((c): c is QuestionCopy => !!c).map((c) => c.id);
  if (have.length === 0) return [];
  const bankIds = await bankIdsAmong(have);
  return bankMissingIdsOfPaper(paper, bankIds, new Set(have));
}

/* ------------------------------------------------------------------
 * কপি বানানো - ব্যাংক থেকে মোছার ঠিক আগে
 * ---------------------------------------------------------------- */

export interface SaveCopiesResult {
  /** কপি রাখা হয়েছে */
  saved: string[];
  /** কপি রাখা যায়নি (প্রশ্ন তবু মুছবে - আগের আচরণ) */
  skipped: Array<{ id: string; reason: string }>;
  /** ছবির ডেটা পড়া যায়নি (কপি তবু রাখা হয়েছে) */
  missingImages: string[];
  warnings: string[];
}

const emptySave = (): SaveCopiesResult => ({ saved: [], skipped: [], missingImages: [], warnings: [] });

/** একটা ছবির ডেটা: আগের কপির ছবি আগে (নতুন করে না পড়া), না থাকলে ব্যাংকের ফাইল/ব্লব থেকে */
async function readImageForCopy(id: string, scope: CqScope): Promise<CopyImage | null> {
  const existing = await db.copyImages.get(id);
  if (existing?.blob) return existing;
  const sdb = getDb(scope);
  const blob = await getImageBlob(id, sdb);
  if (!blob) return null;
  const rec = (await sdb.images.get(id)) ?? (await getDb(scope === 'type' ? 'chapter' : 'type').images.get(id));
  return { id, fileName: rec?.fileName ?? `${id}.webp`, blob, w: rec?.w, h: rec?.h };
}

/**
 * এই প্রশ্নগুলো ব্যাংক থেকে মুছতে যাওয়ার ঠিক আগে ডাকতে হবে: যেগুলো কোনো প্রশ্নপত্রে আছে তাদের কপি (ছবিসহ) রাখে।
 * কখনো throw করে না - কপি না হলে সতর্কতা ফেরে, মোছা আটকায় না (আগের আচরণ অক্ষুণ্ণ)।
 */
export async function saveCopiesBeforeDelete(questionIds: string[], now: number = Date.now()): Promise<SaveCopiesResult> {
  const result = emptySave();
  try {
    if (questionIds.length === 0) return result;
    const papers = await db.papers.toArray();
    const haveIds = new Set((await db.questionCopies.bulkGet(questionIds)).filter((c): c is QuestionCopy => !!c).map((c) => c.id));
    const need = questionsNeedingCopy(questionIds, papers, haveIds);
    if (need.length === 0) return result;

    const lookup = await buildBankLookup(need);
    const records: QuestionCopy[] = [];
    const images = new Map<string, CopyImage>();
    const missing = new Set<string>();

    for (const id of need) {
      const ref = lookup(id);
      if (!ref) {
        // ব্যাংকে পথ পাওয়া যায়নি (এতিম প্রশ্ন) - আগের কপি থাকলে সেটাই থাকে
        if (!haveIds.has(id)) result.skipped.push({ id, reason: 'ব্যাংকে প্রশ্নের জায়গা (বিষয়/অধ্যায়/টপিক) পাওয়া যায়নি' });
        continue;
      }
      const made = makeCopyRecord(ref, now);
      if (!made.ok) {
        result.skipped.push({ id, reason: made.reason });
        continue;
      }
      for (const imgId of made.record.imageIds) {
        if (images.has(imgId) || missing.has(imgId)) continue;
        const img = await readImageForCopy(imgId, ref.path.scope);
        if (img) images.set(imgId, img);
        else missing.add(imgId);
      }
      records.push(made.record);
    }

    if (records.length) {
      await db.transaction('rw', [db.questionCopies, db.copyImages], async () => {
        await db.questionCopies.bulkPut(records);
        if (images.size) await db.copyImages.bulkPut(Array.from(images.values()));
      });
      result.saved = records.map((r) => r.id);
    }
    result.missingImages = Array.from(missing);
    if (result.skipped.length) result.warnings.push(`${result.skipped.length}টি প্রশ্নের কপি রাখা যায়নি: ${result.skipped.slice(0, 2).map((s) => s.reason).join('; ')}`);
    if (missing.size) result.warnings.push(`${missing.size}টি ছবির ডেটা পড়া যায়নি - কপিতে ছবি ছাড়া থাকবে`);
  } catch (e: any) {
    result.warnings.push(`কপি রাখতে গিয়ে সমস্যা: ${e?.message ?? e}`);
  }
  return result;
}

/**
 * ফোল্ডার সিঙ্কে প্রশ্নপত্রের প্রশ্ন ব্যাংকে না পেলে, ক্যাটেগরির data.json-এর কপি থেকে ডেটাবেসে কপি রাখা (খণ্ড খ §৩.৬ (খ))।
 * imageSource: ক্যাটেগরির media/ ফোল্ডার থেকে ছবির ডেটা (ফাইল-পড়া ডাকা কোডের দায়িত্ব)। কখনো throw করে না।
 * যে প্রশ্ন আসলে ব্যাংকে আছে তার কপি রাখা হয় না; আগে থেকে কপি থাকলে বদলানো হয় না (ডেটাবেসের কপি ফোল্ডারের চেয়ে নতুন হতে পারে)।
 */
export async function saveCopiesFromCategoryData(
  items: Array<{ question: CopiedQuestion; stimulus?: CopiedStimulus }>,
  imageSource: (imageId: string) => Promise<CopyImage | null>,
  now: number = Date.now()
): Promise<SaveCopiesResult> {
  const result = emptySave();
  try {
    if (items.length === 0) return result;
    const ids = items.map((i) => i.question.question.id);
    const inBank = await bankIdsAmong(ids);
    const have = new Set((await db.questionCopies.bulkGet(ids)).filter((c): c is QuestionCopy => !!c).map((c) => c.id));
    const records: QuestionCopy[] = [];
    const images = new Map<string, CopyImage>();
    const missing = new Set<string>();

    for (const it of items) {
      const id = it.question.question.id;
      if (inBank.has(id) || have.has(id)) continue;
      const made = copyRecordFromCopied(it.question, it.stimulus, now);
      if (!made.ok) {
        result.skipped.push({ id, reason: made.reason });
        continue;
      }
      for (const imgId of made.record.imageIds) {
        if (images.has(imgId) || missing.has(imgId)) continue;
        const existing = await db.copyImages.get(imgId);
        const img = existing?.blob ? existing : await imageSource(imgId);
        if (img && img.blob) images.set(imgId, img);
        else missing.add(imgId);
      }
      records.push(made.record);
    }

    if (records.length) {
      await db.transaction('rw', [db.questionCopies, db.copyImages], async () => {
        await db.questionCopies.bulkPut(records);
        if (images.size) await db.copyImages.bulkPut(Array.from(images.values()));
      });
      result.saved = records.map((r) => r.id);
    }
    result.missingImages = Array.from(missing);
    if (result.skipped.length) result.warnings.push(`${result.skipped.length}টি প্রশ্নের কপি রাখা যায়নি: ${result.skipped.slice(0, 2).map((s) => s.reason).join('; ')}`);
    if (missing.size) result.warnings.push(`${missing.size}টি ছবির ডেটা পাওয়া যায়নি - কপিতে ছবি ছাড়া থাকবে`);
  } catch (e: any) {
    result.warnings.push(`ফোল্ডারের কপি রাখতে গিয়ে সমস্যা: ${e?.message ?? e}`);
  }
  return result;
}

/* ------------------------------------------------------------------
 * ব্যাংকে ফেরানো (Dexie-র ওপর BankPort)
 * ---------------------------------------------------------------- */

export function makeDexiePort(sdb: QbDatabase): BankPort {
  return {
    listSubjects: () => sdb.subjects.toArray(),
    listChapters: (subjectId) => sdb.chapters.where('subjectId').equals(subjectId).toArray(),
    listTopics: (chapterId) => sdb.topics.where('chapterId').equals(chapterId).toArray(),
    hasQuestion: async (id) => !!(await sdb.questions.get(id)),
    getStimulus: (id) => sdb.stimuli.get(id),
    hasImage: async (id) => !!(await sdb.images.get(id)),
    maxQuestionOrder: async (topicId) => (await sdb.questions.where('topicId').equals(topicId).toArray()).reduce((m, q) => Math.max(m, q.order || 0), 0),
    addSubject: async (s) => {
      await sdb.subjects.add(s);
    },
    addChapter: async (c) => {
      await sdb.chapters.add(c);
    },
    addTopic: async (t) => {
      await sdb.topics.add(t);
    },
    putStimulus: async (s) => {
      await sdb.stimuli.put(s);
    },
    putQuestion: async (q) => {
      await sdb.questions.put(q);
    },
    // topicId ছাড়া blob-সহ ছবি = "নতুন ছবি, এখনো ফোল্ডারে লেখা হয়নি" - টপিকের লেখক পরে media/-তে রাখে (pasteMultiClipboard-এর মতো)
    putImage: async (img) => {
      await sdb.images.put({ id: img.id, fileName: img.fileName, blob: img.blob, w: img.w, h: img.h });
    },
    run: (fn) => sdb.transaction('rw', [sdb.subjects, sdb.chapters, sdb.topics, sdb.stimuli, sdb.questions, sdb.images], fn),
  };
}

/** কপির রেকর্ড মুছে, আর কেউ চায় না এমন ছবির ডেটাও */
async function removeCopies(ids: string[], removeImageIds: string[]): Promise<void> {
  if (ids.length === 0 && removeImageIds.length === 0) return;
  await db.transaction('rw', [db.questionCopies, db.copyImages], async () => {
    if (ids.length) await db.questionCopies.bulkDelete(ids);
    if (removeImageIds.length) await db.copyImages.bulkDelete(removeImageIds);
  });
}

/**
 * প্রশ্নটা কপি থেকে ব্যাংকে ফেরানো। সফল (বা আগে থেকেই ব্যাংকে থাকলে) কপি মোছা হয়, প্রশ্নপত্রের লিংক একই id বলে নিজে জোড়া লাগে।
 * ব্যর্থ হলে কপি অক্ষত থাকে।
 */
export async function restoreQuestionToBank(questionId: string): Promise<RestoreResult> {
  const fail = (reason: string): RestoreResult => ({
    status: 'failed',
    questionId,
    reason,
    created: { subject: false, chapter: false, topic: false, stimulus: false },
    missingImages: [],
    warnings: [],
  });
  try {
    const record = await db.questionCopies.get(questionId);
    if (!record) return fail('এই প্রশ্নের কপি পাওয়া যায়নি');

    // অন্য ডেটাবেসে একই id-র প্রশ্ন আছে (যেমন কাট-পেস্টে সরেছে): ফেরানোর কিছু নেই
    const inBank = await bankIdsAmong([questionId]);
    let result: RestoreResult;
    if (inBank.size > 0) {
      result = { status: 'already', questionId, created: { subject: false, chapter: false, topic: false, stimulus: false }, missingImages: [], warnings: [] };
    } else {
      result = await restoreCopyToBank(record, makeDexiePort(getDb(record.path.scope)), getCopyImage);
    }
    if (result.status === 'failed') return result;

    const others = (await db.questionCopies.toArray()).filter((c) => c.id !== questionId);
    await removeCopies([questionId], orphanedCopyImageIds([record], others));
    return result;
  } catch (e: any) {
    return fail(e?.message ?? String(e));
  }
}

/* ------------------------------------------------------------------
 * ছাঁটাই - আর যে কপি লাগে না
 * ---------------------------------------------------------------- */

/** প্রশ্ন আবার ব্যাংকে আছে বা কোনো প্রশ্নপত্র আর ব্যবহার করে না - এমন কপি (ও তার ছবি) মোছে। ফেরত: মোছা কপির সংখ্যা */
export async function pruneStaleCopies(): Promise<number> {
  try {
    const copies = await db.questionCopies.toArray();
    if (copies.length === 0) return 0;
    const bankIds = await bankIdsAmong(copies.map((c) => c.id));
    const papers = await db.papers.toArray();
    const plan = planPrune(copies, bankIds, usedQuestionIds(papers));
    await removeCopies(plan.removeIds, plan.removeImageIds);
    return plan.removeIds.length;
  } catch (e) {
    console.warn('Bank-missing copies prune failed:', e);
    return 0;
  }
}
