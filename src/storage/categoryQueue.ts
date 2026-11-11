import type { CategoryExtra, CategoryPending } from './categoryCompare';

/**
 * অংশ ১খ-২ক - অ্যাপে ক্যাটেগরি সংক্রান্ত বদল জমানোর সারি (খাঁটি কোড: ফাইল/ডেটাবেস/React IO নেই)।
 *
 * Dexie hook (দ্বিতীয় রাউন্ডে) শুধু এই সারিতে লিখবে; debounce-এর পর চালক সারি থেকে কাজ "তুলে" (take) নিয়ে
 * categoryWriter-এর ফাংশন ডাকবে। কোন ক্যাটেগরি লিখতে হবে তার নিয়ম (খণ্ড ঘ §৫):
 *   (ক) db.categories-এ বদল           -> সেই ক্যাটেগরি
 *   (খ) db.papers-এ বদল                -> আগের ও নতুন দুই categoryId (প্রশ্নপত্র সরালে দুটোই)
 *   (গ) প্রশ্ন/উদ্দীপক/ছবির বদল        -> যে ক্যাটেগরির প্রশ্নপত্রে ওই প্রশ্নের id আছে
 * মোছা ক্যাটেগরি লেখার তালিকা থেকে বাদ যায় (মোছাই জেতে)।
 */

/** সারিতে জমা কাজ */
export interface CategoryWork {
  /** সরাসরি লিখতে হবে এমন ক্যাটেগরির id */
  categories: Set<string>;
  /** অ্যাপে মোছা ক্যাটেগরির id (ফোল্ডার সরাতে হবে) */
  deletes: Set<string>;
  /** বদলানো প্রশ্নপত্রের id (প্রিভিউয়ের জন্য) */
  papers: Set<string>;
  /** বদলানো প্রশ্ন/উদ্দীপকের id - কোন ক্যাটেগরির প্রশ্নপত্রে ব্যবহৃত তা পরে খোঁজা হবে */
  contentIds: Set<string>;
  /** বদলানো/মোছা ছবির id - কোন প্রশ্ন/উদ্দীপক ব্যবহার করে তা পরে খোঁজা হবে (IO স্তরে) */
  imageIds: Set<string>;
}

export const emptyCategoryWork = (): CategoryWork => ({
  categories: new Set(),
  deletes: new Set(),
  papers: new Set(),
  contentIds: new Set(),
  imageIds: new Set(),
});

export interface CategoryQueue {
  markCategory(id: string | undefined | null): void;
  markDelete(id: string | undefined | null): void;
  /** প্রশ্নপত্র তৈরি/বদল/মোছা/সরানো: আগের ও নতুন ক্যাটেগরি দুটোই দিন (যেটা জানা নেই সেটা বাদ) */
  markPaper(paperId: string | undefined | null, ...categoryIds: Array<string | undefined | null>): void;
  markContent(...ids: Array<string | undefined | null>): void;
  markImage(...ids: Array<string | undefined | null>): void;
  hasPending(): boolean;
  /** সারি খালি করে জমা কাজ ফেরত দেয় */
  take(): CategoryWork;
  /** লেখা ব্যর্থ হলে কাজ ফিরিয়ে রাখা (মোছা ক্যাটেগরি আবার \"লেখার\" তালিকায় ঢোকে না) */
  restore(work: CategoryWork): void;
  /** প্রিভিউ/তুলনার জন্য: জমে থাকা বদলের কপি (সারি বদলায় না) */
  peek(): CategoryPending;
  clear(): void;
}

const ok = (id: string | undefined | null): id is string => typeof id === 'string' && id.length > 0;

export function createCategoryQueue(): CategoryQueue {
  let work = emptyCategoryWork();

  return {
    markCategory(id) {
      if (!ok(id)) return;
      work.categories.add(id);
      work.deletes.delete(id); // মোছার পর একই id আবার তৈরি হলে (যেমন undo) লিখতে হবে
    },
    markDelete(id) {
      if (!ok(id)) return;
      work.deletes.add(id);
      work.categories.delete(id);
    },
    markPaper(paperId, ...categoryIds) {
      if (ok(paperId)) work.papers.add(paperId);
      for (const c of categoryIds) if (ok(c) && !work.deletes.has(c)) work.categories.add(c);
    },
    markContent(...ids) {
      for (const id of ids) if (ok(id)) work.contentIds.add(id);
    },
    markImage(...ids) {
      for (const id of ids) if (ok(id)) work.imageIds.add(id);
    },
    hasPending() {
      return (
        work.categories.size + work.deletes.size + work.papers.size + work.contentIds.size + work.imageIds.size > 0
      );
    },
    take() {
      const out = work;
      work = emptyCategoryWork();
      return out;
    },
    restore(back) {
      for (const id of back.deletes) {
        work.deletes.add(id);
        work.categories.delete(id);
      }
      for (const id of back.categories) if (!work.deletes.has(id)) work.categories.add(id);
      back.papers.forEach((id) => work.papers.add(id));
      back.contentIds.forEach((id) => work.contentIds.add(id));
      back.imageIds.forEach((id) => work.imageIds.add(id));
    },
    peek() {
      return { categories: new Set(work.categories), papers: new Set(work.papers), deletes: new Set(work.deletes) };
    },
    clear() {
      work = emptyCategoryWork();
    },
  };
}

/* ------------------------------------------------------------------
 * কোন ক্যাটেগরি লিখতে হবে ঠিক করা
 * ---------------------------------------------------------------- */

export interface PaperRef {
  id: string;
  categoryId?: string;
  questionIds?: unknown;
}

/** যে ক্যাটেগরির কোনো প্রশ্নপত্রে ids-এর কোনো প্রশ্ন আছে (প্রশ্ন/উদ্দীপক বদলের জন্য) */
export function categoriesUsingQuestions(papers: PaperRef[], questionIds: Set<string>): string[] {
  const out = new Set<string>();
  if (questionIds.size === 0) return [];
  for (const p of papers) {
    if (!ok(p.categoryId) || !Array.isArray(p.questionIds)) continue;
    if (p.questionIds.some((q) => typeof q === 'string' && questionIds.has(q))) out.add(p.categoryId);
  }
  return Array.from(out).sort();
}

export interface ResolvedCategoryWork {
  /** লিখতে হবে (মোছা বাদ; ক্রম নির্দিষ্ট) */
  write: string[];
  /** ফোল্ডার সরাতে হবে */
  deletes: string[];
}

/**
 * তুলে নেওয়া কাজ থেকে চূড়ান্ত তালিকা। extraQuestionIds = ছবির বদল থেকে খুঁজে পাওয়া প্রশ্নের id (IO স্তর দেয়);
 * existingCategoryIds দিলে অ্যাপে আর নেই এমন ক্যাটেগরি লেখার তালিকা থেকে বাদ পড়ে (লিখতে গেলে ভুল ফোল্ডার জন্মাত)।
 */
export function resolveCategoryWork(
  work: CategoryWork,
  papers: PaperRef[],
  opts: { extraQuestionIds?: Iterable<string>; existingCategoryIds?: Set<string> } = {}
): ResolvedCategoryWork {
  const questionIds = new Set<string>(work.contentIds);
  for (const id of opts.extraQuestionIds ?? []) questionIds.add(id);

  const write = new Set<string>(work.categories);
  for (const c of categoriesUsingQuestions(papers, questionIds)) write.add(c);

  // প্রশ্নপত্র বদলের কারণে: প্রশ্নপত্রটা এখন যে ক্যাটেগরিতে আছে সেটাও লিখতে হবে
  const paperById = new Map(papers.map((p) => [p.id, p]));
  for (const pid of work.papers) {
    const cid = paperById.get(pid)?.categoryId;
    if (ok(cid)) write.add(cid);
  }

  for (const d of work.deletes) write.delete(d);
  if (opts.existingCategoryIds) for (const id of Array.from(write)) if (!opts.existingCategoryIds.has(id)) write.delete(id);

  return { write: Array.from(write).sort(), deletes: Array.from(work.deletes).sort() };
}

/**
 * অটো পরিষ্কারে কোন \"বাড়তি\" জিনিস unnecessary/-তে সরবে (খাঁটি ফাংশন)।
 * শুধু: অ্যাপের চেনা ক্যাটেগরি ফোল্ডারের ভেতরের জিনিস (অব্যবহৃত ছবি, অচেনা ফাইল/ফোল্ডার) এবং যার গন্তব্য unnecessary/।
 * সরে না: Category/-র সরাসরি ভেতরের অচেনা ফোল্ডার/ফাইল (ব্যবহারকারী হাতে সিঙ্কের জন্য রেখে থাকতে পারেন),
 * আর কপি-করা ফোল্ডারের Sync_Conflicts সরানো (ওটা হাতে-সিঙ্কের কাজ, অংশ ১গ)।
 */
export function selectAutoTidyExtras(extras: CategoryExtra[], ownerDirNames: Set<string>): CategoryExtra[] {
  const owners = new Set(Array.from(ownerDirNames, (n) => n.toLowerCase()));
  return extras.filter((e) => {
    if (!e.owner || e.owner.length === 0) return false;
    if (!owners.has(e.owner[0].toLowerCase())) return false;
    if (!e.moveTo.includes('/unnecessary/')) return false;
    return true;
  });
}

/** ছবি-বদলের জন্য: কোন প্রশ্ন/উদ্দীপক এই ছবিগুলো ব্যবহার করে (IO স্তর সারির imageIds থেকে প্রশ্নের id বের করতে এটা ডাকে) */
export function questionIdsUsingImages(
  questions: Array<{ id: string; stimulusId?: string; solutionImageIds?: unknown }>,
  stimuli: Array<{ id: string; imageIds?: unknown }>,
  imageIds: Set<string>
): string[] {
  if (imageIds.size === 0) return [];
  const hit = (v: unknown) => Array.isArray(v) && v.some((x) => typeof x === 'string' && imageIds.has(x));
  const stimHit = new Set(stimuli.filter((s) => hit(s.imageIds)).map((s) => s.id));
  const out = new Set<string>();
  for (const q of questions) {
    if (hit(q.solutionImageIds) || (q.stimulusId && stimHit.has(q.stimulusId))) out.add(q.id);
  }
  return Array.from(out).sort();
}
