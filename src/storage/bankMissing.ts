import type { Chapter, CopyImage, Paper, Question, QuestionCopy, Stimulus, Subject, Topic } from '../db/db';
import { questionProblem, stimulusProblem, bankPathProblem, type BankPath, type CopiedQuestion, type CopiedStimulus } from './categoryLayout';
import {
  completeQuestionForCopy,
  completeStimulusForCopy,
  emptyPreviousCopies,
  type BankQuestionRef,
  type PreviousCopies,
} from './categoryCopies';

/**
 * অংশ ১ঘ-ক - ব্যাংকে-নেই প্রশ্ন: খাঁটি লজিক (ডেটাবেস/ফাইল IO নেই; IO আছে bankMissingStore.ts-এ)।
 *
 * নিয়ম (খণ্ড খ §৩.৬): প্রশ্নপত্রের কোনো প্রশ্ন ব্যাংকে না থাকলেও প্রশ্নপত্রে থাকবে - প্রশ্নপত্র কপি থেকে দেখাবে।
 * কপিতে থাকে: প্রশ্ন, উদ্দীপক, ছবির id (ছবির ডেটা copyImages-এ), আর আগের বিষয় > অধ্যায় > টপিকের পথ।
 *
 * এখানে আছে:
 *   - কপি বানানো (ব্যাংকের রেফ থেকে, বা ক্যাটেগরির data.json-এর কপি থেকে)
 *   - কোন কোন প্রশ্নের কপি লাগবে (মোছার আগে), কোন কপি আর লাগে না (ছাঁটাই)
 *   - প্রশ্নপত্রের প্রশ্ন আনার পথে কপি থেকে পূরণ
 *   - data.json লেখকের জন্য PreviousCopies-এ রূপান্তর/মেশানো
 *   - ব্যাংকে ফেরানো (পথ খুঁজে/বানিয়ে, একই id-তে, উদ্দীপক দ্বিতীয়বার নয়) - একটা BankPort-এর ওপর, তাই ডেটাবেস ছাড়াই টেস্ট হয়
 */

/* ------------------------------------------------------------------
 * ছোট সহায়ক
 * ---------------------------------------------------------------- */

const uniq = <T,>(list: T[]): T[] => Array.from(new Set(list));
const idsOf = (v: any): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []);

/** কপির ছবির id: আগে উদ্দীপকের ছবি, তারপর সমাধানের ছবি (দুইবার একই id থাকলে একবার) */
export function copyImageIdsOf(question: Pick<Question, 'solutionImageIds'>, stimulus?: Pick<Stimulus, 'imageIds'> | null): string[] {
  return uniq([...idsOf(stimulus?.imageIds), ...idsOf(question.solutionImageIds)]);
}

/** প্রশ্নপত্রগুলোতে ব্যবহৃত সব প্রশ্ন-id */
export function usedQuestionIds(papers: Array<Pick<Paper, 'questionIds'>>): Set<string> {
  const out = new Set<string>();
  for (const p of papers) for (const id of idsOf((p as any).questionIds)) out.add(id);
  return out;
}

/* ------------------------------------------------------------------
 * কপির রেকর্ড বানানো
 * ---------------------------------------------------------------- */

export type MakeCopyResult = { ok: true; record: QuestionCopy; filled: string[] } | { ok: false; reason: string };

/**
 * ব্যাংকের প্রশ্ন (উদ্দীপক, পথসহ) থেকে কপির রেকর্ড। অনুপস্থিত ঘরে শুধু কপিতে ডিফল্ট বসে (অ্যাপের ডেটা বদলায় না - categoryCopies-এর নিয়ম)।
 * id/topicId/type বা পথ ভুল থাকলে কপি বানানো যায় না (অনুমান করা হয় না) - কারণ ফেরে।
 */
export function makeCopyRecord(ref: BankQuestionRef, now: number): MakeCopyResult {
  const { copy: question, filled: qf } = completeQuestionForCopy(ref.question);
  const filled = qf.map((k) => `প্রশ্ন.${k}`);
  let stimulus: Stimulus | undefined;
  if (ref.stimulus) {
    const r = completeStimulusForCopy(ref.stimulus);
    stimulus = r.copy;
    filled.push(...r.filled.map((k) => `উদ্দীপক.${k}`));
  }
  const qp = questionProblem(question);
  if (qp) return { ok: false, reason: `প্রশ্ন ${(ref.question as any)?.id ?? '?'}: ${qp}` };
  if (stimulus) {
    const sp = stimulusProblem(stimulus);
    if (sp) return { ok: false, reason: `উদ্দীপক ${(stimulus as any)?.id ?? '?'}: ${sp}` };
  }
  const pp = bankPathProblem(ref.path);
  if (pp) return { ok: false, reason: `প্রশ্ন ${question.id}: ${pp}` };
  return {
    ok: true,
    filled,
    record: {
      id: question.id,
      question,
      ...(stimulus ? { stimulus } : {}),
      path: { ...ref.path },
      imageIds: copyImageIdsOf(question, stimulus),
      savedAt: now,
    },
  };
}

/**
 * ফোল্ডার সিঙ্কে প্রশ্ন ব্যাংকে না পেলে ক্যাটেগরির data.json-এর কপি থেকে রেকর্ড (খণ্ড খ §৩.৬ (খ))।
 * data.json-এর কপি parseCategoryData-তে আগেই যাচাই হয়েছে, তবু একই যাচাই আবার চলে।
 */
export function copyRecordFromCopied(cq: CopiedQuestion, cs: CopiedStimulus | undefined, now: number): MakeCopyResult {
  const stimulusId = cq.question?.stimulusId;
  const stim = cs && stimulusId && cs.stimulus?.id === stimulusId ? cs : undefined;
  return makeCopyRecord({ question: cq.question, stimulus: stim?.stimulus, path: cq.path }, now);
}

/** কপির রেকর্ড -> data.json লেখকের "আগের কপি" (ব্যাংকে নেই এমন প্রশ্নের কপি data.json থেকে হারানো ঠেকাতে) */
export function copiesToPrevious(records: QuestionCopy[]): PreviousCopies {
  const out = emptyPreviousCopies();
  for (const r of records) {
    out.questions.set(r.id, { question: r.question, path: r.path });
    if (r.stimulus) {
      if (!out.stimuli.has(r.stimulus.id)) out.stimuli.set(r.stimulus.id, { stimulus: r.stimulus, path: r.path });
    }
  }
  return out;
}

/** দুই "আগের কপি" মেশানো: primary আগে (যেমন আগের data.json), না থাকলে secondary (ডেটাবেসের কপি) */
export function mergePreviousCopies(primary: PreviousCopies, secondary: PreviousCopies): PreviousCopies {
  const out = emptyPreviousCopies();
  for (const [k, v] of secondary.questions) out.questions.set(k, v);
  for (const [k, v] of secondary.stimuli) out.stimuli.set(k, v);
  for (const [k, v] of primary.questions) out.questions.set(k, v);
  for (const [k, v] of primary.stimuli) out.stimuli.set(k, v);
  return out;
}

/* ------------------------------------------------------------------
 * কপি লাগবে কি না (ব্যাংক থেকে মোছার ঠিক আগে)
 * ---------------------------------------------------------------- */

/**
 * মুছতে যাওয়া প্রশ্নগুলোর মধ্যে কোনগুলোর কপি এখন বানাতে হবে: যেগুলো কোনো প্রশ্নপত্রে ব্যবহৃত।
 * refreshExisting=true (ডিফল্ট) হলে আগে কপি থাকলেও আবার বানানো হয়, যাতে কপিতে মোছার মুহূর্তের সর্বশেষ রূপ থাকে;
 * false হলে আগে কপি থাকা প্রশ্ন বাদ যায়।
 */
export function questionsNeedingCopy(
  deletingIds: string[],
  papers: Array<Pick<Paper, 'questionIds'>>,
  haveCopyIds: Set<string>,
  refreshExisting = true
): string[] {
  const used = usedQuestionIds(papers);
  return uniq(deletingIds).filter((id) => used.has(id) && (refreshExisting || !haveCopyIds.has(id)));
}

/* ------------------------------------------------------------------
 * ছাঁটাই: কোন কপি আর লাগে না
 * ---------------------------------------------------------------- */

export interface PrunePlan {
  /** প্রশ্ন আবার ব্যাংকে আছে (ফোল্ডার সিঙ্ক/অন্য পথে ফিরেছে) - কপি বাসি */
  inBank: string[];
  /** কোনো প্রশ্নপত্র আর ব্যবহার করে না */
  unused: string[];
  /** এই কপিগুলো মুছবে */
  removeIds: string[];
  /** মুছলে যে ছবির ডেটা আর কেউ চায় না (বাকি কপিগুলো যেসব ছবি চায় তা বাদে) */
  removeImageIds: string[];
}

export function planPrune(copies: QuestionCopy[], bankIds: Set<string>, usedIds: Set<string>): PrunePlan {
  const inBank: string[] = [];
  const unused: string[] = [];
  const removeIds: string[] = [];
  const keep: QuestionCopy[] = [];
  for (const c of copies) {
    if (bankIds.has(c.id)) {
      inBank.push(c.id);
      removeIds.push(c.id);
    } else if (!usedIds.has(c.id)) {
      unused.push(c.id);
      removeIds.push(c.id);
    } else keep.push(c);
  }
  const removed = new Set(removeIds);
  const removedCopies = copies.filter((c) => removed.has(c.id));
  return { inBank, unused, removeIds, removeImageIds: orphanedCopyImageIds(removedCopies, keep) };
}

/** removed কপিগুলোর ছবি, যা keep কপিগুলোর কোনোটাও চায় না */
export function orphanedCopyImageIds(removed: QuestionCopy[], keep: QuestionCopy[]): string[] {
  const wanted = new Set<string>();
  for (const c of keep) for (const id of idsOf(c.imageIds)) wanted.add(id);
  return uniq(removed.flatMap((c) => idsOf(c.imageIds))).filter((id) => !wanted.has(id));
}

/* ------------------------------------------------------------------
 * প্রশ্নপত্রের প্রশ্ন আনার পথে কপি থেকে পূরণ
 * ---------------------------------------------------------------- */

/** ব্যাংকে পাওয়া প্রশ্নের সাথে, না-পাওয়া id-গুলোর কপি-প্রশ্ন যোগ করে (ক্রম নির্ভর কোডে প্রশ্নপত্রের questionIds দিয়ে সাজানো হয়) */
export function fillMissingQuestions(ids: string[], found: Question[], copies: Map<string, QuestionCopy>): Question[] {
  const have = new Set(found.map((q) => q.id));
  const out = [...found];
  for (const id of uniq(ids)) {
    if (have.has(id)) continue;
    const c = copies.get(id);
    if (c) out.push(c.question);
  }
  return out;
}

/** ব্যাংকে পাওয়া উদ্দীপকের সাথে, না-পাওয়া id-গুলোর উদ্দীপক কপি থেকে যোগ করে */
export function fillMissingStimuli(ids: string[], found: Stimulus[], copies: QuestionCopy[]): Stimulus[] {
  const have = new Set(found.map((s) => s.id));
  const out = [...found];
  const want = new Set(ids);
  for (const c of copies) {
    const s = c.stimulus;
    if (!s || !want.has(s.id) || have.has(s.id)) continue;
    have.add(s.id);
    out.push(s);
  }
  return out;
}

/** একটা প্রশ্নপত্রের কোন কোন প্রশ্ন ব্যাংকে নেই (কিন্তু কপি আছে) - প্রশ্নপত্রের ক্রমে, একবার করে */
export function bankMissingIdsOfPaper(paper: Pick<Paper, 'questionIds'>, bankIds: Set<string>, copyIds: Set<string>): string[] {
  return uniq(idsOf((paper as any).questionIds)).filter((id) => !bankIds.has(id) && copyIds.has(id));
}

/** প্রশ্নপত্র-id -> ব্যাংকে-নেই প্রশ্নের সংখ্যা (শুধু সংখ্যা > 0 যেগুলোর) - Create কার্ডের চিহ্নের জন্য */
export function bankMissingCountsByPaper(papers: Array<Pick<Paper, 'id' | 'questionIds'>>, bankIds: Set<string>, copyIds: Set<string>): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of papers) {
    const n = bankMissingIdsOfPaper(p, bankIds, copyIds).length;
    if (n > 0) out.set(p.id, n);
  }
  return out;
}

/* ------------------------------------------------------------------
 * ব্যাংকে ফেরানো
 * ---------------------------------------------------------------- */

/** ব্যাংকের একটা ডেটাবেসের (Type বা Chapter CQ) ওপর ফেরানোর কাজের দরকারি অংশ - আসলটা bankMissingStore.ts-এ, টেস্টে নকল */
export interface BankPort {
  listSubjects(): Promise<Subject[]>;
  listChapters(subjectId: string): Promise<Chapter[]>;
  listTopics(chapterId: string): Promise<Topic[]>;
  hasQuestion(id: string): Promise<boolean>;
  getStimulus(id: string): Promise<Stimulus | undefined>;
  hasImage(id: string): Promise<boolean>;
  /** topic-এ বর্তমান সর্বোচ্চ প্রশ্ন-ক্রম (প্রশ্ন না থাকলে 0) */
  maxQuestionOrder(topicId: string): Promise<number>;
  addSubject(s: Subject): Promise<void>;
  addChapter(c: Chapter): Promise<void>;
  addTopic(t: Topic): Promise<void>;
  putStimulus(s: Stimulus): Promise<void>;
  putQuestion(q: Question): Promise<void>;
  putImage(img: CopyImage): Promise<void>;
  /** সব লেখা একটাই transaction-এ (মাঝপথে ভাঙলে কিছুই থাকে না); fn-এর ভেতরে শুধু port-এর ফাংশন ডাকা যাবে */
  run<T>(fn: () => Promise<T>): Promise<T>;
}

/** Chapter CQ-র লুকানো ডিফল্ট টপিকের নাম (CollectionScreen যে নামে বানায়) */
export const CHAPTER_DEFAULT_TOPIC_NAME = 'সকল প্রশ্ন';

const sameName = (a: string | undefined, b: string | undefined): boolean => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

/** একই নামের প্রথমটা (ক্রম অনুযায়ী) */
export function findByName<T extends { name: string; order: number }>(list: T[], name: string): T | undefined {
  return list.filter((x) => sameName(x.name, name)).sort((a, b) => (a.order || 0) - (b.order || 0))[0];
}

export type RestoreStatus = 'restored' | 'already' | 'failed';

export interface RestoreResult {
  status: RestoreStatus;
  questionId: string;
  /** কারণ (failed হলে) */
  reason?: string;
  topicId?: string;
  created: { subject: boolean; chapter: boolean; topic: boolean; stimulus: boolean };
  /** উৎস পাওয়া যায়নি এমন ছবির id (প্রশ্ন তবু ফেরে) */
  missingImages: string[];
  warnings: string[];
}

const emptyCreated = () => ({ subject: false, chapter: false, topic: false, stimulus: false });

/**
 * কপি থেকে প্রশ্নটা একই id-তে ব্যাংকে ফেরানো:
 *  - পথের (বিষয়/অধ্যায়/টপিক) যে অংশ নেই তা বানায়; একই নামের থাকলে সেটাই ব্যবহার করে (Chapter CQ-তে টপিক = অধ্যায়ের প্রথম টপিক, না থাকলে "সকল প্রশ্ন")
 *  - উদ্দীপক একই id-তে আগে থেকে ব্যাংকে থাকলে সেটাই ব্যবহার হয়, দ্বিতীয়বার তৈরি হয় না
 *  - ছবি ব্যাংকের images-এ blob সহ বসে (টপিকের media/ ফোল্ডারে লেখা পরে চালক করে - নতুন ছবির মতোই)
 *  - একই id-র প্রশ্ন আগে থেকে ব্যাংকে থাকলে কিছুই বদলায় না ('already')
 * imageSource: ছবির ডেটা (copyImages থেকে)। সব ছবি transaction-এর আগে পড়া হয়, ভেতরে শুধু ডেটাবেসের কাজ।
 */
export async function restoreCopyToBank(
  record: QuestionCopy,
  port: BankPort,
  imageSource: (imageId: string) => Promise<CopyImage | null>
): Promise<RestoreResult> {
  const base: RestoreResult = { status: 'failed', questionId: record.id, created: emptyCreated(), missingImages: [], warnings: [] };

  const qp = questionProblem(record.question) ?? bankPathProblem(record.path);
  if (qp) return { ...base, reason: `কপি ঠিক নেই: ${qp}` };
  if (record.stimulus) {
    const sp = stimulusProblem(record.stimulus);
    if (sp) return { ...base, reason: `উদ্দীপকের কপি ঠিক নেই: ${sp}` };
  }

  if (await port.hasQuestion(record.id)) return { ...base, status: 'already' };

  // ছবির ডেটা আগেই পড়া (transaction-এর ভেতরে অন্য async কাজ চলে না)
  const images: CopyImage[] = [];
  const missingImages: string[] = [];
  for (const id of record.imageIds) {
    if (await port.hasImage(id)) continue; // ব্যাংকে আগে থেকেই আছে
    const img = await imageSource(id);
    if (img && img.blob) images.push(img);
    else missingImages.push(id);
  }

  return port.run(async () => {
    // transaction-এ ঢোকার পর আবার দেখা (মাঝে অন্য কিছু ঢুকে থাকলে)
    if (await port.hasQuestion(record.id)) return { ...base, status: 'already' as const };

    const created = emptyCreated();
    const path = record.path;

    // বিষয়
    const subjects = await port.listSubjects();
    let subject = findByName(subjects, path.subject);
    if (!subject) {
      subject = { id: newId('sub'), name: path.subject.trim(), order: subjects.reduce((m, s) => Math.max(m, s.order || 0), 0) + 1 };
      await port.addSubject(subject);
      created.subject = true;
    }

    // অধ্যায়
    const chapters = await port.listChapters(subject.id);
    let chapter = findByName(chapters, path.chapter);
    if (!chapter) {
      chapter = { id: newId('chp'), subjectId: subject.id, name: path.chapter.trim(), order: chapters.reduce((m, c) => Math.max(m, c.order || 0), 0) + 1 };
      await port.addChapter(chapter);
      created.chapter = true;
    }

    // টপিক
    const topics = await port.listTopics(chapter.id);
    let topic: Topic | undefined;
    if (path.scope === 'chapter') {
      topic = [...topics].sort((a, b) => (a.order || 0) - (b.order || 0))[0];
    } else {
      topic = findByName(topics, path.topic);
    }
    if (!topic) {
      const name = path.scope === 'chapter' ? CHAPTER_DEFAULT_TOPIC_NAME : path.topic.trim();
      topic = { id: newId('top'), chapterId: chapter.id, name, order: topics.reduce((m, t) => Math.max(m, t.order || 0), 0) + 1 };
      await port.addTopic(topic);
      created.topic = true;
    }

    // ছবি
    for (const img of images) await port.putImage(img);

    // উদ্দীপক (একই id আগে থেকে থাকলে সেটাই)
    let stimulusId: string | undefined;
    if (record.stimulus) {
      const existing = await port.getStimulus(record.stimulus.id);
      if (!existing) {
        await port.putStimulus({ ...record.stimulus, topicId: topic.id });
        created.stimulus = true;
      }
      stimulusId = record.stimulus.id;
    }

    // প্রশ্ন (একই id; ক্রম = টপিকের শেষে)
    const order = (await port.maxQuestionOrder(topic.id)) + 1;
    const q: Question = { ...record.question, topicId: topic.id, order };
    if (stimulusId) q.stimulusId = stimulusId;
    else delete (q as any).stimulusId; // কপিতে উদ্দীপক পাওয়া যায়নি - ঝুলন্ত stimulusId রাখা হয় না
    await port.putQuestion(q);

    const warnings: string[] = [];
    if (missingImages.length) warnings.push(`${missingImages.length}টি ছবির ডেটা পাওয়া যায়নি (প্রশ্ন তবু ফিরেছে): ${missingImages.slice(0, 3).join(', ')}`);
    if (record.question.stimulusId && !record.stimulus) warnings.push('প্রশ্নের উদ্দীপক কপিতে ছিল না - প্রশ্ন উদ্দীপক ছাড়া ফিরেছে');
    return { status: 'restored' as const, questionId: record.id, topicId: topic.id, created, missingImages, warnings };
  });
}

let idCounter = 0;
/** নতুন subject/chapter/topic-এর id (db/api.ts-এর generateId-র মতোই এলোমেলো; ডেটাবেস-মুক্ত রাখতে এখানে আলাদা) */
function newId(prefix: string): string {
  const g: any = typeof globalThis !== 'undefined' ? globalThis : {};
  if (g.crypto && typeof g.crypto.randomUUID === 'function') return g.crypto.randomUUID();
  idCounter++;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ------------------------------------------------------------------
 * বার্তা (UI-তে দেখানোর খসড়া; চূড়ান্ত UI দ্বিতীয় রাউন্ডে)
 * ---------------------------------------------------------------- */

const BN = '০১২৩৪৫৬৭৮৯';
const bn = (n: number): string => String(n).replace(/\d/g, (d) => BN[+d]);

/** ব্যাংক থেকে প্রশ্ন মোছার নিশ্চিতকরণের বাড়তি লাইন (প্রস্তাব, খণ্ড খ §৩.৬) - কোনো প্রশ্নপত্রে না থাকলে null */
export function deleteConfirmNote(paperCount: number): string | null {
  if (paperCount <= 0) return null;
  return `প্রশ্নটা ${bn(paperCount)}টি প্রশ্নপত্রে আছে। ব্যাংক থেকে মুছলেও সেখানে থেকে যাবে।`;
}

/** Create কার্ডের চিহ্ন: "কিছু প্রশ্ন ব্যাংকে নেই (n)" - n = 0 হলে null (চিহ্ন থাকে না) */
export function bankMissingBadgeText(n: number): string | null {
  return n > 0 ? `কিছু প্রশ্ন ব্যাংকে নেই (${bn(n)})` : null;
}

/** ফেরানোর ফল থেকে ব্যবহারকারীকে দেখানোর এক লাইন */
export function restoreResultMessage(r: RestoreResult): string {
  if (r.status === 'failed') return `ব্যাংকে ফেরানো যায়নি: ${r.reason ?? 'অজানা কারণ'}`;
  if (r.status === 'already') return 'প্রশ্নটা ব্যাংকে আগে থেকেই আছে';
  const made = [r.created.subject && 'বিষয়', r.created.chapter && 'অধ্যায়', r.created.topic && 'টপিক'].filter(Boolean) as string[];
  const tail = made.length ? ` (নতুন ${made.join(', ')} তৈরি হয়েছে)` : '';
  const warn = r.warnings.length ? ` - ${r.warnings[0]}` : '';
  return `প্রশ্নটা ব্যাংকে ফিরেছে${tail}${warn}`;
}
