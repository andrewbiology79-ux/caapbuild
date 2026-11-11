import { describe, it, expect } from 'vitest';
import {
  createCategoryQueue,
  categoriesUsingQuestions,
  resolveCategoryWork,
  selectAutoTidyExtras,
  questionIdsUsingImages,
  type PaperRef,
} from '../src/storage/categoryQueue';
import type { CategoryExtra } from '../src/storage/categoryCompare';

const paper = (id: string, categoryId: string | undefined, questionIds: unknown): PaperRef => ({ id, categoryId, questionIds });

const extra = (owner: string[], name: string, moveTo: string): CategoryExtra => ({
  kind: 'extra-file',
  owner,
  name,
  path: [...owner, name],
  folderSide: name,
  sourcePath: [...owner, name].join('/'),
  moveTo,
});

describe('createCategoryQueue', () => {
  it('খালি সারিতে কিছু জমা নেই', () => {
    const q = createCategoryQueue();
    expect(q.hasPending()).toBe(false);
    const w = q.take();
    expect(w.categories.size + w.deletes.size + w.papers.size).toBe(0);
  });

  it('ফাঁকা/অনুপস্থিত id উপেক্ষা হয়', () => {
    const q = createCategoryQueue();
    q.markCategory('');
    q.markCategory(undefined);
    q.markDelete(null);
    q.markPaper('', undefined, null);
    q.markContent('', undefined);
    q.markImage(undefined);
    expect(q.hasPending()).toBe(false);
  });

  it('প্রশ্নপত্র সরালে আগের ও নতুন দুই ক্যাটেগরিই জমে', () => {
    const q = createCategoryQueue();
    q.markPaper('p1', 'catA', 'catB');
    const w = q.take();
    expect(Array.from(w.categories).sort()).toEqual(['catA', 'catB']);
    expect(Array.from(w.papers)).toEqual(['p1']);
  });

  it('take() সারি খালি করে', () => {
    const q = createCategoryQueue();
    q.markCategory('c1');
    q.take();
    expect(q.hasPending()).toBe(false);
  });

  it('মোছা ক্যাটেগরি লেখার তালিকা থেকে বাদ যায়, পরে markPaper-এও ঢোকে না', () => {
    const q = createCategoryQueue();
    q.markCategory('c1');
    q.markDelete('c1');
    q.markPaper('p1', 'c1');
    const w = q.take();
    expect(w.categories.has('c1')).toBe(false);
    expect(w.deletes.has('c1')).toBe(true);
  });

  it('মোছার পর একই id আবার তৈরি হলে লেখার তালিকায় ফেরে, মোছা থেকে বাদ', () => {
    const q = createCategoryQueue();
    q.markDelete('c1');
    q.markCategory('c1');
    const w = q.take();
    expect(w.categories.has('c1')).toBe(true);
    expect(w.deletes.has('c1')).toBe(false);
  });

  it('restore() ব্যর্থ কাজ ফিরিয়ে দেয় এবং নতুন জমা কাজের সাথে মিশে যায়', () => {
    const q = createCategoryQueue();
    q.markCategory('c1');
    q.markDelete('c2');
    q.markContent('q1');
    q.markImage('i1');
    const w = q.take();
    q.markCategory('c3'); // লেখার সময় নতুন বদল এল
    q.restore(w);
    const again = q.take();
    expect(Array.from(again.categories).sort()).toEqual(['c1', 'c3']);
    expect(Array.from(again.deletes)).toEqual(['c2']);
    expect(Array.from(again.contentIds)).toEqual(['q1']);
    expect(Array.from(again.imageIds)).toEqual(['i1']);
  });

  it('restore() মোছা হয়ে যাওয়া ক্যাটেগরিকে লেখার তালিকায় ঢোকায় না', () => {
    const q = createCategoryQueue();
    q.markCategory('c1');
    const w = q.take();
    q.markDelete('c1'); // লেখার সময়ই মোছা হলো
    q.restore(w);
    const again = q.take();
    expect(again.categories.has('c1')).toBe(false);
    expect(again.deletes.has('c1')).toBe(true);
  });

  it('peek() সারি বদলায় না এবং কপি দেয়', () => {
    const q = createCategoryQueue();
    q.markCategory('c1');
    q.markDelete('c2');
    q.markPaper('p1');
    const pk = q.peek();
    pk.categories.add('zzz');
    expect(Array.from(pk.deletes)).toEqual(['c2']);
    expect(Array.from(pk.papers)).toEqual(['p1']);
    expect(q.peek().categories.has('zzz')).toBe(false);
    expect(q.hasPending()).toBe(true);
  });

  it('clear() সব মুছে দেয়', () => {
    const q = createCategoryQueue();
    q.markCategory('c1');
    q.clear();
    expect(q.hasPending()).toBe(false);
  });
});

describe('categoriesUsingQuestions', () => {
  const papers = [paper('p1', 'A', ['q1', 'q2']), paper('p2', 'B', ['q3']), paper('p3', undefined, ['q1']), paper('p4', 'C', 'ভাঙা')];

  it('প্রশ্নটা যে ক্যাটেগরির প্রশ্নপত্রে আছে সেগুলো ফেরত দেয়', () => {
    expect(categoriesUsingQuestions(papers, new Set(['q1']))).toEqual(['A']);
    expect(categoriesUsingQuestions(papers, new Set(['q1', 'q3']))).toEqual(['A', 'B']);
  });

  it('ক্যাটেগরি-ছাড়া প্রশ্নপত্র ও ভাঙা questionIds এড়িয়ে যায়', () => {
    expect(categoriesUsingQuestions(papers, new Set(['ভাঙা']))).toEqual([]);
  });

  it('খালি সেটে খালি ফল', () => {
    expect(categoriesUsingQuestions(papers, new Set())).toEqual([]);
  });
});

describe('resolveCategoryWork', () => {
  const papers = [paper('p1', 'A', ['q1']), paper('p2', 'B', ['q2'])];

  it('সরাসরি, প্রশ্নপত্র ও প্রশ্ন থেকে আসা ক্যাটেগরি মিলিয়ে লেখার তালিকা বানায়', () => {
    const q = createCategoryQueue();
    q.markCategory('X');
    q.markPaper('p2');
    q.markContent('q1');
    const r = resolveCategoryWork(q.take(), papers);
    expect(r.write).toEqual(['A', 'B', 'X']);
    expect(r.deletes).toEqual([]);
  });

  it('মোছা ক্যাটেগরি লেখার তালিকায় থাকে না, মোছার তালিকায় থাকে', () => {
    const q = createCategoryQueue();
    q.markDelete('A');
    q.markContent('q1'); // A-র প্রশ্নপত্রে আছে, কিন্তু A মোছা
    const r = resolveCategoryWork(q.take(), papers);
    expect(r.write).toEqual([]);
    expect(r.deletes).toEqual(['A']);
  });

  it('extraQuestionIds (ছবির বদল) যোগ হয়', () => {
    const q = createCategoryQueue();
    q.markImage('img1');
    const r = resolveCategoryWork(q.take(), papers, { extraQuestionIds: ['q2'] });
    expect(r.write).toEqual(['B']);
  });

  it('অ্যাপে আর নেই এমন ক্যাটেগরি লেখার তালিকা থেকে বাদ (existingCategoryIds)', () => {
    const q = createCategoryQueue();
    q.markCategory('A');
    q.markCategory('GONE');
    const r = resolveCategoryWork(q.take(), papers, { existingCategoryIds: new Set(['A', 'B']) });
    expect(r.write).toEqual(['A']);
  });

  it('খালি কাজে খালি ফল', () => {
    const r = resolveCategoryWork(createCategoryQueue().take(), papers);
    expect(r).toEqual({ write: [], deletes: [] });
  });
});

describe('selectAutoTidyExtras', () => {
  const U = 'Download/QB Collection/Category/পদার্থ/unnecessary';

  it('চেনা ক্যাটেগরি ফোল্ডারের ভেতরের অপ্রয়োজনীয় জিনিস বাছে', () => {
    const e = extra(['পদার্থ'], 'media/x.webp', `${U}/media/x.webp`);
    expect(selectAutoTidyExtras([e], new Set(['পদার্থ']))).toEqual([e]);
  });

  it('Category/-র সরাসরি ভেতরের অচেনা ফোল্ডার/ফাইল ছোঁয় না (হাতে-সিঙ্কের জন্য থাকতে পারে)', () => {
    const e = extra([], 'নতুন ফোল্ডার', 'Download/QB Collection/Category/unnecessary/নতুন ফোল্ডার');
    expect(selectAutoTidyExtras([e], new Set(['পদার্থ']))).toEqual([]);
  });

  it('যে ক্যাটেগরি এই রাউন্ডে লেখা হয়নি তার জিনিস ছোঁয় না', () => {
    const e = extra(['রসায়ন'], 'media/y.webp', 'Download/QB Collection/Category/রসায়ন/unnecessary/media/y.webp');
    expect(selectAutoTidyExtras([e], new Set(['পদার্থ']))).toEqual([]);
  });

  it('Sync_Conflicts-এ সরানো (unnecessary নয়) বাছে না', () => {
    const e = extra(['পদার্থ'], 'কপি', 'Download/QB Collection/Sync_Conflicts/2026/পদার্থ');
    expect(selectAutoTidyExtras([e], new Set(['পদার্থ']))).toEqual([]);
  });

  it('ফোল্ডারের নামের বড়-ছোট হাতের ভেদ গ্রাহ্য করে না', () => {
    const e = extra(['Physics'], 'a.txt', 'Download/QB Collection/Category/Physics/unnecessary/a.txt');
    expect(selectAutoTidyExtras([e], new Set(['physics']))).toEqual([e]);
  });
});

describe('questionIdsUsingImages', () => {
  const questions = [
    { id: 'q1', stimulusId: 's1', solutionImageIds: [] },
    { id: 'q2', stimulusId: 's2', solutionImageIds: ['imgB'] },
    { id: 'q3', solutionImageIds: 'ভাঙা' },
    { id: 'q4', stimulusId: 's1' },
  ];
  const stimuli = [
    { id: 's1', imageIds: ['imgA'] },
    { id: 's2', imageIds: [] },
  ];

  it('উদ্দীপকের ছবি বদলালে ওই উদ্দীপকের সব প্রশ্ন আসে', () => {
    expect(questionIdsUsingImages(questions, stimuli, new Set(['imgA']))).toEqual(['q1', 'q4']);
  });

  it('সমাধানের ছবি বদলালে ওই প্রশ্ন আসে', () => {
    expect(questionIdsUsingImages(questions, stimuli, new Set(['imgB']))).toEqual(['q2']);
  });

  it('অচেনা ছবি বা খালি সেটে খালি ফল', () => {
    expect(questionIdsUsingImages(questions, stimuli, new Set(['nope']))).toEqual([]);
    expect(questionIdsUsingImages(questions, stimuli, new Set())).toEqual([]);
  });
});
