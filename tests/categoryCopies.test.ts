import { describe, it, expect } from 'vitest';
import type { Question, Stimulus } from '../src/db/db';
import {
  bankPathOf,
  buildCategoryCopies,
  buildVerifiedCategoryData,
  completeQuestionForCopy,
  completeStimulusForCopy,
  previousCopiesOf,
  wantedImageIds,
  type BankLookup,
  type BankQuestionRef,
} from '../src/storage/categoryCopies';
import { parseCategoryData, type ParsedPaper } from '../src/storage/categoryLayout';

const q = (id: string, over: Partial<Question> = {}): Question => ({
  id,
  topicId: 't1',
  type: 'গ',
  marks: 3,
  questionText: `প্রশ্ন ${id}`,
  solutionText: '',
  solutionImageIds: [],
  rating: 3,
  order: 1,
  usedInBoards: [],
  ...over,
});

const stim = (id: string, over: Partial<Stimulus> = {}): Stimulus => ({ id, topicId: 't1', text: `উদ্দীপক ${id}`, imageIds: [], ...over });

const cat = { id: 'c1', name: 'উইকলি', order: 1 };
const paper = (over: Partial<ParsedPaper> = {}): ParsedPaper => ({ id: 'p1', shortName: 'পত্র-১', createdAt: 1, title: 'পদার্থ', questionIds: ['q1'], ...over });

const ref = (question: Question, stimulus?: Stimulus, path = bankPathOf('type', 'পদার্থ', 'গতি', 'বেগ')): BankQuestionRef => ({ question, stimulus, path });
const lookupOf = (refs: BankQuestionRef[]): BankLookup => {
  const m = new Map(refs.map((r) => [r.question.id, r]));
  return (id) => m.get(id);
};

describe('categoryCopies - bankPathOf', () => {
  it('Chapter CQ-তে topic সবসময় খালি', () => {
    expect(bankPathOf('chapter', 'পদার্থ', 'গতি', 'যাই হোক').topic).toBe('');
  });
  it('Type CQ-তে topic থাকে', () => {
    expect(bankPathOf('type', 'পদার্থ', 'গতি', 'বেগ').topic).toBe('বেগ');
  });
});

describe('categoryCopies - অনুপস্থিত ঘর ভরা', () => {
  it('সব ঘর ঠিক থাকলে কিছু বদলায় না', () => {
    const r = completeQuestionForCopy(q('q1'));
    expect(r.filled).toEqual([]);
    expect(r.copy).toEqual(q('q1'));
  });

  it('পুরনো প্রশ্নের অনুপস্থিত ঘরে ডিফল্ট বসে, মূল প্রশ্ন বদলায় না', () => {
    const old: any = { id: 'q1', topicId: 't1', type: 'ক', questionText: 'x' };
    const r = completeQuestionForCopy(old);
    expect(r.copy.marks).toBe(0);
    expect(r.copy.solutionText).toBe('');
    expect(r.copy.solutionImageIds).toEqual([]);
    expect(r.copy.rating).toBe(0);
    expect(r.copy.order).toBe(0);
    expect(r.copy.usedInBoards).toEqual([]);
    expect(r.filled.length).toBeGreaterThan(0);
    expect(old.marks).toBeUndefined();
  });

  it('ভুল ঐচ্ছিক ঘর (stimulusId ফাঁকা, answerText সংখ্যা) বাদ যায়', () => {
    const r = completeQuestionForCopy(q('q1', { stimulusId: '' as any, answerText: 5 as any }));
    expect('stimulusId' in r.copy).toBe(false);
    expect('answerText' in r.copy).toBe(false);
  });

  it('id/topicId/type অনুমান করা হয় না', () => {
    const r = completeQuestionForCopy({ id: 'q1' } as any);
    expect((r.copy as any).topicId).toBeUndefined();
    expect((r.copy as any).type).toBeUndefined();
  });

  it('উদ্দীপকের imageIds-এ ভুল মান ছাঁটা হয়', () => {
    const r = completeStimulusForCopy(stim('s1', { imageIds: ['a', 5 as any, ''] }));
    expect(r.copy.imageIds).toEqual(['a']);
    expect(r.filled).toContain('imageIds');
  });
});

describe('categoryCopies - কপি জোগাড়', () => {
  it('ব্যাংকের প্রশ্ন ও উদ্দীপক কপি হয়, উদ্দীপক একবারই', () => {
    const s = stim('s1');
    const lookup = lookupOf([ref(q('q1', { stimulusId: 's1' }), s), ref(q('q2', { stimulusId: 's1', type: 'ঘ' }), s)]);
    const r = buildCategoryCopies([paper({ questionIds: ['q1', 'q2'] })], lookup);
    expect(r.questions.map((c) => c.question.id).sort()).toEqual(['q1', 'q2']);
    expect(r.stimuli.map((c) => c.stimulus.id)).toEqual(['s1']);
    expect(r.lostQuestionIds).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('একই প্রশ্ন দুই প্রশ্নপত্রে থাকলেও একবার কপি হয়', () => {
    const r = buildCategoryCopies([paper({ id: 'p1' }), paper({ id: 'p2' })], lookupOf([ref(q('q1'))]));
    expect(r.questions).toHaveLength(1);
  });

  it('ব্যাংকে নেই কিন্তু আগের data.json-এ কপি আছে -> কপি বাঁচে (মোছে না)', () => {
    const prevFile = buildCategoryCopies([paper()], lookupOf([ref(q('q1', { stimulusId: 's1' }), stim('s1'))]));
    const previous = previousCopiesOf({ questions: prevFile.questions, stimuli: prevFile.stimuli });
    const r = buildCategoryCopies([paper()], () => undefined, previous);
    expect(r.questions.map((c) => c.question.id)).toEqual(['q1']);
    expect(r.stimuli.map((c) => c.stimulus.id)).toEqual(['s1']);
    expect(r.keptFromPrevious).toEqual(['q1']);
    expect(r.lostQuestionIds).toEqual([]);
  });

  it('ব্যাংকেও নেই, আগের কপিও নেই -> lost + সতর্কতা', () => {
    const r = buildCategoryCopies([paper()], () => undefined);
    expect(r.lostQuestionIds).toEqual(['q1']);
    expect(r.questions).toEqual([]);
    expect(r.warnings.some((w) => w.includes('কপি নেই'))).toBe(true);
  });

  it('ব্যাংক ও আগের কপি দুটোই থাকলে ব্যাংকের সর্বশেষ রূপ জেতে', () => {
    const old = buildCategoryCopies([paper()], lookupOf([ref(q('q1', { questionText: 'পুরনো' }))]));
    const r = buildCategoryCopies([paper()], lookupOf([ref(q('q1', { questionText: 'নতুন' }))]), previousCopiesOf({ questions: old.questions, stimuli: old.stimuli }));
    expect(r.questions[0].question.questionText).toBe('নতুন');
    expect(r.keptFromPrevious).toEqual([]);
  });

  it('উদ্দীপক কোথাও না পেলে lostStimulusIds ও সতর্কতা', () => {
    const r = buildCategoryCopies([paper()], lookupOf([ref(q('q1', { stimulusId: 'sX' }))]));
    expect(r.lostStimulusIds).toEqual(['sX']);
    expect(r.warnings.some((w) => w.includes('উদ্দীপক'))).toBe(true);
  });

  it('পুরনো ডেটায় ঘর না থাকলে সতর্কতা আসে', () => {
    const old: any = { id: 'q1', topicId: 't1', type: 'ক', questionText: 'x' };
    const r = buildCategoryCopies([paper()], lookupOf([ref(old)]));
    expect(r.warnings.some((w) => w.includes('ডিফল্ট'))).toBe(true);
  });
});

describe('categoryCopies - যাচাইসহ data.json তৈরি', () => {
  it('ঠিক ডেটা থেকে ফাইল তৈরি হয় এবং আবার পড়লে unsafe নয়', () => {
    const s = stim('s1', { imageIds: ['img1'] });
    const copies = buildCategoryCopies([paper()], lookupOf([ref(q('q1', { stimulusId: 's1', solutionImageIds: ['img2'] }), s)]));
    const v = buildCategoryDataFileOf(copies);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const back = parseCategoryData(v.text);
    expect(back.ok && !back.data.unsafe).toBe(true);
    expect(Array.from(wantedImageIds(v.file)).sort()).toEqual(['img1', 'img2']);
    expect(v.file.counts).toEqual({ papers: 1, questions: 1, stimuli: 1, images: 2 });
  });

  it('একই ডেটা থেকে সবসময় হুবহু একই লেখা (বদল না থাকলে আবার লেখা লাগে না)', () => {
    const copies = buildCategoryCopies([paper()], lookupOf([ref(q('q1'))]));
    const a = buildCategoryDataFileOf(copies);
    const b = buildCategoryDataFileOf(copies);
    expect(a.ok && b.ok && a.text === b.text).toBe(true);
  });

  it('কপির ভুল ঘর থাকলে ফাইল তৈরি হয় না, কারণ সহ', () => {
    const bad: any = { id: 'q1', topicId: 't1', questionText: 'x' }; // type নেই
    const copies = buildCategoryCopies([paper()], lookupOf([ref(bad)]));
    const v = buildCategoryDataFileOf(copies);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.problems.some((p) => p.includes('type'))).toBe(true);
  });

  it('Type CQ-র কপিতে topic না থাকলে ফাইল তৈরি হয় না (চূড়ান্ত সিদ্ধান্ত)', () => {
    const noTopic = ref(q('q1'), undefined, { scope: 'type', subject: 'পদার্থ', chapter: 'গতি', topic: '' });
    const v = buildCategoryDataFileOf(buildCategoryCopies([paper()], lookupOf([noTopic])));
    expect(v.ok).toBe(false);
  });

  it('Chapter CQ-র কপিতে topic খালি বৈধ', () => {
    const chap = ref(q('q1'), undefined, bankPathOf('chapter', 'পদার্থ', 'গতি', ''));
    const v = buildCategoryDataFileOf(buildCategoryCopies([paper()], lookupOf([chap])));
    expect(v.ok).toBe(true);
  });

  it('কপি না থাকা প্রশ্ন (lost) থাকলেও ফাইল তৈরি হয় - প্রশ্নপত্রের id থাকে', () => {
    const withLost = [paper({ questionIds: ['q1', 'qLost'] })];
    const v = buildCategoryDataFileOf(buildCategoryCopies(withLost, lookupOf([ref(q('q1'))])), withLost);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.file.papers[0].questionIds).toEqual(['q1', 'qLost']);
  });

  it('প্রশ্নপত্রে ভুল প্রশ্ন-id থাকলে লেখার সময় বাদ যাওয়ার সতর্কতা আসে', () => {
    const bad = [paper({ questionIds: ['q1', 5 as any] })];
    const v = buildCategoryDataFileOf(buildCategoryCopies(bad, lookupOf([ref(q('q1'))])), bad);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.warnings.some((w) => w.includes('ভুল প্রশ্ন-id'))).toBe(true);
    expect(v.file.papers[0].questionIds).toEqual(['q1']);
  });

  it('প্রশ্নপত্রে ফাঁকা প্রশ্ন-id থাকলে ফাইল লেখা হয় না (নীরবে বাদ নয়)', () => {
    const bad = [paper({ questionIds: ['q1', ''] })];
    const v = buildCategoryDataFileOf(buildCategoryCopies(bad, lookupOf([ref(q('q1'))])), bad);
    expect(v.ok).toBe(false);
  });

  it('প্রশ্নপত্র ছাড়া ক্যাটেগরি: সম্পূর্ণ খালি কিন্তু বৈধ ফাইল', () => {
    const v = buildVerifiedCategoryData({ category: cat, papers: [], copies: { questions: [], stimuli: [] } });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.file.counts).toEqual({ papers: 0, questions: 0, stimuli: 0, images: 0 });
  });
});

function buildCategoryDataFileOf(copies: ReturnType<typeof buildCategoryCopies>, papers: ParsedPaper[] = [paper()]) {
  return buildVerifiedCategoryData({ category: cat, papers, copies });
}
