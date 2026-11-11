import { describe, it, expect } from 'vitest';
import type { Question, Stimulus } from '../src/db/db';
import {
  CATEGORY_ROOT,
  buildCategoryDataFile,
  categoryDataPath,
  categoryDataToText,
  categoryDirNameFor,
  categoryMediaPath,
  categoryMetaToText,
  emptyCategorySyncState,
  isUncategorizedName,
  normalizeCategorySyncState,
  parseCategoryData,
  parseCategoryMeta,
  parsePaperEntry,
  samePaperContent,
  usedQuestionIds,
  type CopiedQuestion,
  type CopiedStimulus,
  type ParsedPaper,
} from '../src/storage/categoryLayout';

const paper = (over: Partial<ParsedPaper> = {}): ParsedPaper => ({
  id: 'p1',
  shortName: 'উইকলি মডেল টেস্ট-১',
  createdAt: 1000,
  title: 'পদার্থবিজ্ঞান',
  questionIds: ['q1', 'q2'],
  ...over,
});

describe('categoryLayout - পথ ও নাম', () => {
  it('Category ফোল্ডার QB Collection-এর সরাসরি ভেতরে', () => {
    expect(CATEGORY_ROOT).toBe('Download/QB Collection/Category');
  });

  it('ক্যাটেগরির data.json ও media-র পথ', () => {
    expect(categoryDataPath('উইকলি')).toBe('Download/QB Collection/Category/উইকলি/data.json');
    expect(categoryMediaPath('উইকলি', 'img1')).toBe('Download/QB Collection/Category/উইকলি/media/img1.webp');
  });

  it('categoryDirNameFor "unnecessary" নাম নেয় না, ব্যবহৃত নাম এড়ায়', () => {
    expect(categoryDirNameFor('উইকলি', new Set())).toBe('উইকলি');
    expect(categoryDirNameFor('উইকলি', new Set(['উইকলি']))).toBe('উইকলি (2)');
    expect(categoryDirNameFor('unnecessary', new Set())).toBe('unnecessary (2)');
  });

  it('অশ্রেণিবদ্ধ নাম চেনে', () => {
    expect(isUncategorizedName('অশ্রেণিবদ্ধ')).toBe(true);
    expect(isUncategorizedName(' অশ্রেণিবদ্ধ ')).toBe(true);
    expect(isUncategorizedName('অন্য')).toBe(false);
  });
});

describe('categoryLayout - .folder.json', () => {
  it('লেখা ও পড়া মেলে', () => {
    const text = categoryMetaToText({ id: 'c1', name: 'উইকলি', order: 2 });
    expect(parseCategoryMeta(text)).toEqual({ id: 'c1', kind: 'category', name: 'উইকলি', order: 2 });
  });

  it('ভুল/অন্য ধরনের মেটা null', () => {
    expect(parseCategoryMeta(undefined)).toBeNull();
    expect(parseCategoryMeta('না-JSON')).toBeNull();
    expect(parseCategoryMeta(JSON.stringify({ id: 'x', kind: 'subject' }))).toBeNull();
    expect(parseCategoryMeta(JSON.stringify({ kind: 'category' }))).toBeNull();
  });
});

const bankPath = { scope: 'type' as const, subject: 'পদার্থ', chapter: 'ভেক্টর', topic: 'টাইপ-১' };
const q = (id: string, over: Partial<Question> = {}): Question => ({
  id,
  topicId: 't1',
  type: 'গ',
  marks: 3,
  questionText: 'প্রশ্ন ' + id,
  solutionText: '',
  solutionImageIds: [],
  rating: 3,
  order: 1,
  usedInBoards: [],
  ...over,
});
const st = (id: string, over: Partial<Stimulus> = {}): Stimulus => ({ id, topicId: 't1', text: 'উদ্দীপক ' + id, imageIds: [], ...over });
const cq = (id: string, over: Partial<Question> = {}): CopiedQuestion => ({ question: q(id, over), path: bankPath });
const cs = (id: string, over: Partial<Stimulus> = {}): CopiedStimulus => ({ stimulus: st(id, over), path: bankPath });
const cat = { id: 'c1', name: 'উইকলি', order: 1 };

describe('categoryLayout - data.json এর প্রশ্নপত্র', () => {
  it('লিখে আবার পড়লে একই প্রশ্নপত্র', () => {
    const p = paper({ subjectLine: 'সৃজনশীল', note: '', duration: '২ ঘণ্টা', totalMarks: 70, order: 3 });
    const r = parsePaperEntry(JSON.parse(JSON.stringify(p)));
    expect('paper' in r).toBe(true);
    if ('paper' in r) expect(samePaperContent(r.paper, p)).toBe(true);
  });

  it('ভুল প্রশ্নপত্রে কারণ সহ error', () => {
    const bad = (t: any) => {
      const r = parsePaperEntry(t);
      return 'error' in r ? r.error : '';
    };
    expect(bad(null)).toContain('নয়');
    expect(bad([])).toContain('নয়');
    expect(bad({ id: '' })).toContain('id');
    expect(bad({ id: 'a', questionIds: 'q1' })).toContain('questionIds');
  });

  it('হাতে লেখা ছোট প্রশ্নপত্র: নাম না থাকলে শিরোনাম, createdAt না থাকলে ফাইলের সময়', () => {
    const r = parsePaperEntry({ id: 'a', title: 'মডেল টেস্ট', questionIds: [] }, 555);
    expect('paper' in r).toBe(true);
    if ('paper' in r) {
      expect(r.paper.shortName).toBe('মডেল টেস্ট');
      expect(r.paper.createdAt).toBe(555);
      expect(r.paper.questionIds).toEqual([]);
    }
  });

  it('questionIds অনুপস্থিত হলে নীরবে [] নয় - ভুল, তবে বৈধ id ফেরত আসে', () => {
    const r = parsePaperEntry({ id: ' a ', title: 'মডেল টেস্ট' });
    expect('error' in r && r.error).toContain('questionIds');
    expect('error' in r && r.id).toBe('a');
  });

  it('প্রশ্নপত্রের ভুল ধরনের ঘর নীরবে বাদ যায় না', () => {
    const base = { id: 'a', questionIds: ['q1'] };
    const err = (extra: any) => {
      const r = parsePaperEntry({ ...base, ...extra });
      return 'error' in r ? r.error : '';
    };
    expect(err({ questionIds: ['q1', 5] })).toContain('questionIds');
    expect(err({ questionIds: ['q1', ''] })).toContain('questionIds');
    expect(err({ title: 5 })).toContain('title');
    expect(err({ shortName: 5 })).toContain('shortName');
    expect(err({ createdAt: 'x' })).toContain('createdAt');
    expect(err({ subjectLine: 1 })).toContain('subjectLine');
    expect(err({ note: 1 })).toContain('note');
    expect(err({ duration: {} })).toContain('duration');
    expect(err({ totalMarks: '70' })).toContain('totalMarks');
    expect(err({ order: NaN })).toContain('order');
    expect(err({ edits: 'x' })).toContain('edits');
    expect(err({ edits: { questions: { q1: { questionText: 'ক' } } } })).toContain('edits.questions');
    expect(err({ edits: { stimuli: { s1: {} } } })).toContain('edits.stimuli');
    expect(err({ edits: { questions: { q1: { questionText: 'ক', marks: 3 } }, stimuli: { s1: { text: 'খ' } } } })).toBe('');
  });

  it('samePaperContent: ঘরের ক্রম গুরুত্বহীন, প্রশ্ন বদলালে আলাদা', () => {
    const a = paper();
    const b = JSON.parse(JSON.stringify({ questionIds: a.questionIds, title: a.title, createdAt: a.createdAt, shortName: a.shortName, id: a.id }));
    expect(samePaperContent(a, b)).toBe(true);
    expect(samePaperContent(a, paper({ questionIds: ['q2', 'q1'] }))).toBe(false);
  });

  it('usedQuestionIds সব প্রশ্নপত্রের প্রশ্ন একসাথে দেয়', () => {
    expect(Array.from(usedQuestionIds([paper({ questionIds: ['a', 'b'] }), paper({ id: 'p2', questionIds: ['b', 'c'] })])).sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('categoryLayout - ক্যাটেগরির data.json', () => {
  const build = () =>
    buildCategoryDataFile({
      category: cat,
      papers: [{ ...paper({ id: 'p2', order: 2 }), category: 'X', categoryId: 'c1' } as any, paper({ id: 'p1', order: 1, edits: { questions: {}, stimuli: {} } })],
      questions: [cq('q2', { solutionImageIds: ['i2'] }), cq('q1')],
      stimuli: [cs('s1', { imageIds: ['i1'] })],
    });

  it('গঠন: ধরন, ভার্সন, গণনা, ক্রম ও ছবির তালিকা', () => {
    const f = build();
    expect(f.type).toBe('qb-category');
    expect(f.version).toBe(1);
    expect(f.counts).toEqual({ papers: 2, questions: 2, stimuli: 1, images: 2 });
    expect(f.papers.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(f.questions.map((x) => x.question.id)).toEqual(['q1', 'q2']);
    expect(f.images).toEqual([
      { id: 'i1', fileName: 'i1.webp' },
      { id: 'i2', fileName: 'i2.webp' },
    ]);
  });

  it('প্রশ্নপত্রে ক্যাটেগরির তথ্য ও খালি edits থাকে না', () => {
    const f = build();
    expect((f.papers[0] as any).category).toBeUndefined();
    expect((f.papers[1] as any).categoryId).toBeUndefined();
    expect(f.papers[0].edits).toBeUndefined();
  });

  it('একই তথ্য থেকে হুবহু একই লেখা (ক্রম বদলালেও)', () => {
    const a = categoryDataToText(build());
    const f2 = buildCategoryDataFile({
      category: cat,
      papers: [paper({ id: 'p1', order: 1 }), paper({ id: 'p2', order: 2 })],
      questions: [cq('q1'), cq('q2', { solutionImageIds: ['i2'] })],
      stimuli: [cs('s1', { imageIds: ['i1'] })],
    });
    expect(categoryDataToText(f2)).toBe(a);
  });

  it('লিখে আবার পড়লে সব ফিরে আসে (প্রশ্ন, উদ্দীপক, পথ, ছবি)', () => {
    const r = parseCategoryData(categoryDataToText(build()));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.papers).toHaveLength(2);
      expect(r.data.questions.map((x) => x.question.id)).toEqual(['q1', 'q2']);
      expect(r.data.questions[0].path).toEqual(bankPath);
      expect(r.data.stimuli[0].stimulus.imageIds).toEqual(['i1']);
      expect(r.data.imageIds).toEqual(['i1', 'i2']);
      expect(r.data.warnings).toEqual([]);
    }
  });

  const fileOf = () => JSON.parse(categoryDataToText(build())) as any;
  const reason = (f: any) => {
    const r = parseCategoryData(typeof f === 'string' ? f : JSON.stringify(f));
    return r.ok ? '' : r.reason;
  };
  const okData = (f: any) => {
    const r = parseCategoryData(JSON.stringify(f));
    if (!r.ok) throw new Error('ok:true আশা করা হয়েছিল: ' + r.reason);
    return r.data;
  };

  it('সম্পূর্ণ খালি কিন্তু বৈধ ফাইল (চারটি [] ও সব count 0) গ্রহণযোগ্য, unsafe নয়', () => {
    const empty = categoryDataToText(buildCategoryDataFile({ category: cat, papers: [], questions: [], stimuli: [] }));
    const r = parseCategoryData(empty);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.papers).toEqual([]);
      expect(r.data.unsafe).toBe(false);
      expect(r.data.skippedPaperIds).toEqual([]);
      expect(r.data.warnings).toEqual([]);
      expect(r.data.category).toEqual({ id: 'c1', name: 'উইকলি', order: 1 });
    }
  });

  it('শুধু type+version থাকা ফাইল অগ্রহণযোগ্য (আগে এই ফাইল দিয়ে সব প্রশ্নপত্র মোছার প্রস্তাব আসত)', () => {
    expect(reason({ type: 'qb-category', version: 1 })).toContain('category');
    expect(reason({ type: 'qb-category' })).toContain('version');
  });

  it('A. type ও version: অনুপস্থিত/ভুল/অসমর্থিত সবই ok:false', () => {
    const f = fileOf();
    const without = (k: string) => {
      const c = { ...f };
      delete c[k];
      return c;
    };
    expect(reason(without('type'))).toContain('নয়');
    expect(reason({ ...f, type: 'other' })).toContain('নয়');
    expect(reason(without('version'))).toContain('version');
    for (const v of ['1', null, 1.5, 0, -1, true]) expect(reason({ ...f, version: v })).toContain('version');
    expect(reason({ ...f, version: 99 })).toContain('নতুন');
    expect(reason('')).toContain('খালি');
    expect(reason('{ভাঙা')).toContain('JSON');
    expect(reason('[]')).toContain('নয়');
  });

  it('B. papers/questions/stimuli/images: অনুপস্থিত বা তালিকা নয় হলে নাম ধরে ok:false', () => {
    for (const k of ['papers', 'questions', 'stimuli', 'images']) {
      const missing = fileOf();
      delete missing[k];
      expect(reason(missing)).toContain(k);
      for (const bad of ['x', {}, null, 5]) expect(reason({ ...fileOf(), [k]: bad })).toContain(`${k} তালিকা নয়`);
    }
  });

  it('C. counts: অনুপস্থিত/ভুল ধরন = ok:false; ঠিক ধরনের কিন্তু সংখ্যা অমিল = warning + unsafe', () => {
    const noCounts = fileOf();
    delete noCounts.counts;
    expect(reason(noCounts)).toContain('counts');
    expect(reason({ ...fileOf(), counts: [] })).toContain('counts');
    expect(reason({ ...fileOf(), counts: 'x' })).toContain('counts');
    for (const k of ['papers', 'questions', 'stimuli', 'images']) {
      for (const bad of [-1, 1.5, '2', null, undefined]) {
        const f = fileOf();
        f.counts[k] = bad;
        expect(reason(f)).toContain(`counts.${k}`);
      }
      const f = fileOf();
      f.counts[k] += 1;
      const d = okData(f);
      expect(d.unsafe).toBe(true);
      expect(d.warnings.some((w) => w.includes('গণনা মেলেনি'))).toBe(true);
    }
  });

  it('D. প্রশ্ন ও উদ্দীপকের কপি: প্রতিটি required ঘর অনুপস্থিত/ভুল ধরনের হলে বাদ + warning + unsafe', () => {
    const qFields = ['id', 'topicId', 'type', 'marks', 'questionText', 'solutionText', 'solutionImageIds', 'rating', 'order', 'usedInBoards'];
    for (const k of qFields) {
      const f = fileOf();
      delete f.questions[0].question[k];
      const d = okData(f);
      expect(d.unsafe).toBe(true);
      expect(d.questions.length).toBe(1);
      expect(d.warnings.some((w) => w.includes('প্রশ্নের কপি বাদ'))).toBe(true);
    }
    const wrongQ: Array<[string, any]> = [
      ['id', 5], ['topicId', 5], ['type', 'চ'], ['marks', '3'], ['questionText', 1], ['solutionText', null],
      ['solutionImageIds', 'i'], ['solutionImageIds', [1]], ['rating', 'x'], ['order', NaN],
      ['usedInBoards', {}], ['usedInBoards', [{ board: 'ঢাকা', years: ['২০২০'] }]],
      ['stimulusId', 5], ['answerText', 5],
    ];
    for (const [k, v] of wrongQ) {
      const f = fileOf();
      f.questions[0].question[k] = v;
      const d = okData(f);
      expect(d.unsafe).toBe(true);
      expect(d.questions.length).toBe(1);
    }
    const sFields = ['id', 'topicId', 'text', 'imageIds'];
    for (const k of sFields) {
      const f = fileOf();
      delete f.stimuli[0].stimulus[k];
      const d = okData(f);
      expect(d.unsafe).toBe(true);
      expect(d.stimuli.length).toBe(0);
      expect(d.warnings.some((w) => w.includes('উদ্দীপকের কপি বাদ'))).toBe(true);
    }
    const wrongS: Array<[string, any]> = [['text', 1], ['imageIds', 'x'], ['imageTopCount', 'x'], ['boardTag', 1], ['usedInBoards', 'x'], ['rating', 'x'], ['reference', 1]];
    for (const [k, v] of wrongS) {
      const f = fileOf();
      f.stimuli[0].stimulus[k] = v;
      const d = okData(f);
      expect(d.unsafe).toBe(true);
      expect(d.stimuli.length).toBe(0);
    }
  });

  it('D. সঠিক optional ঘর থাকলে গ্রহণযোগ্য (unsafe নয়)', () => {
    const f = fileOf();
    Object.assign(f.questions[0].question, { stimulusId: 's1', answerText: 'উত্তর' });
    Object.assign(f.stimuli[0].stimulus, { imageTopCount: 1, boardTag: 'ঢা. বো.', usedInBoards: [{ board: 'ঢাকা', years: [2020] }], rating: 4, reference: 'বই' });
    const d = okData(f);
    expect(d.unsafe).toBe(false);
    expect(d.warnings).toEqual([]);
  });

  it('D. path: scope/subject/chapter ভুল হলে বাদ; Type CQ-তে topic বাধ্যতামূলক; Chapter CQ-তে topic খালি/অনুপস্থিত বৈধ', () => {
    const tryPath = (path: any) => okData({ ...fileOf(), questions: [{ ...fileOf().questions[0], path }, fileOf().questions[1]], counts: { ...fileOf().counts } });
    for (const path of [
      { scope: 'bogus', subject: 'ক', chapter: 'খ', topic: 'গ' },
      { scope: 'type', subject: '', chapter: 'খ', topic: 'গ' },
      { scope: 'type', subject: 'ক', chapter: '  ', topic: 'গ' },
      { scope: 'type', subject: 'ক', chapter: 'খ' },
      { scope: 'type', subject: 'ক', chapter: 'খ', topic: '' },
      { scope: 'type', subject: 'ক', chapter: 'খ', topic: 5 },
      { scope: 'chapter', subject: 'ক', chapter: 'খ', topic: 5 },
      null,
    ]) {
      const d = tryPath(path);
      expect(d.unsafe).toBe(true);
      expect(d.questions).toHaveLength(1);
    }
    for (const path of [
      { scope: 'chapter', subject: 'ক', chapter: 'খ' },
      { scope: 'chapter', subject: 'ক', chapter: 'খ', topic: '' },
    ]) {
      const d = tryPath(path);
      expect(d.unsafe).toBe(false);
      expect(d.questions).toHaveLength(2);
      expect(d.questions.find((x) => x.question.id === 'q1')?.path.topic ?? d.questions[0].path.topic).toBe('');
    }
  });

  it('D. প্রশ্ন/উদ্দীপকের কপি দুবার থাকলে warning + unsafe', () => {
    const f = fileOf();
    f.questions.push(f.questions[0]);
    f.stimuli.push(f.stimuli[0]);
    f.counts.questions += 1;
    f.counts.stimuli += 1;
    const d = okData(f);
    expect(d.unsafe).toBe(true);
    expect(d.questions).toHaveLength(2);
    expect(d.warnings.filter((w) => w.includes('দুবার')).length).toBe(2);
  });

  it('E. ছবি: id/fileName ভুল, ডুপ্লিকেট, ভাঙা সারি - warning + unsafe', () => {
    const cases: any[] = [
      'x', null, 5, {}, { id: '' , fileName: '.webp' }, { id: 'i9' }, { id: 'i9', fileName: 'ভুল.webp' }, { id: 'i9', fileName: 'i9.png' },
    ];
    for (const bad of cases) {
      const f = fileOf();
      f.images.push(bad);
      f.counts.images += 1;
      const d = okData(f);
      expect(d.unsafe).toBe(true);
      expect(d.imageIds).toEqual(['i1', 'i2']);
    }
    const dupId = fileOf();
    dupId.images.push({ id: 'i1', fileName: 'i1.webp' });
    dupId.counts.images += 1;
    expect(okData(dupId).unsafe).toBe(true);
    expect(okData(dupId).warnings.some((w) => w.includes('দুবার'))).toBe(true);
  });

  it('F. category: অনুপস্থিত/বস্তু নয়/ফাঁকা id-name/ভুল order হলে ok:false; ঠিক হলে ফেরত আসে', () => {
    const noCat = fileOf();
    delete noCat.category;
    expect(reason(noCat)).toContain('category');
    expect(reason({ ...fileOf(), category: 'x' })).toContain('category');
    expect(reason({ ...fileOf(), category: [] })).toContain('category');
    expect(reason({ ...fileOf(), category: { id: '', name: 'ক', order: 1 } })).toContain('category.id');
    expect(reason({ ...fileOf(), category: { id: 'c1', name: ' ', order: 1 } })).toContain('category.name');
    expect(reason({ ...fileOf(), category: { id: 'c1', name: 'ক', order: NaN } })).toContain('category.order');
    expect(reason({ ...fileOf(), category: { id: 'c1', name: 'ক', order: '1' } })).toContain('category.order');
    expect(okData(fileOf()).category).toEqual(cat);
  });

  it('G. প্রশ্নপত্র: একটা ভুল প্রশ্নপত্র বাদ পড়ে, তার id skippedPaperIds-এ, ফাইল unsafe', () => {
    const f = fileOf();
    f.papers[0] = { ...f.papers[0], questionIds: 'q1' }; // বৈধ id, ভুল বাকি অংশ
    f.papers.push({ id: '' });
    f.counts.papers += 1;
    const d = okData(f);
    expect(d.unsafe).toBe(true);
    expect(d.papers.map((p) => p.id)).toEqual(['p2']);
    expect(d.skippedPaperIds).toEqual(['p1']);
    expect(d.warnings.some((w) => w.includes('id: p1'))).toBe(true);
    expect(d.warnings.some((w) => w.includes('id নেই'))).toBe(true);
  });

  it('G. questionIds ভুল মান (সংখ্যা/অবজেক্ট/ফাঁকা) - নীরবে filter নয়: প্রশ্নপত্র বাদ + skipped + unsafe', () => {
    for (const bad of [[5], [{}], [''], ['q1', null]]) {
      const f = fileOf();
      f.papers[1].questionIds = bad;
      const d = okData(f);
      expect(d.unsafe).toBe(true);
      expect(d.papers).toHaveLength(1);
      expect(d.skippedPaperIds).toEqual(['p2']);
    }
  });

  it('G. questionIds অনুপস্থিত - নীরবে [] নয়: প্রশ্নপত্র বাদ + skipped + unsafe', () => {
    const f = fileOf();
    delete f.papers[0].questionIds;
    const d = okData(f);
    expect(d.unsafe).toBe(true);
    expect(d.skippedPaperIds).toEqual(['p1']);
  });

  it('G. একই প্রশ্নের id একই প্রশ্নপত্রে দুবার: শুধু warning (প্রশ্নপত্র থাকে, unsafe নয়)', () => {
    const f = fileOf();
    f.papers[0].questionIds = ['q1', 'q1'];
    const d = okData(f);
    expect(d.unsafe).toBe(false);
    expect(d.papers).toHaveLength(2);
    expect(d.papers[0].questionIds).toEqual(['q1', 'q1']);
    expect(d.warnings.some((w) => w.includes('একাধিকবার'))).toBe(true);
  });

  it('G. ব্যাংকে নেই কিন্তু কপি আছে - বৈধ; প্রশ্নপত্রের প্রশ্নের কপি না থাকাও parser-এ ভুল নয় (compare স্তরে lostWarning)', () => {
    const f = fileOf();
    f.papers[0].questionIds = ['q1', 'q-কপি-নেই'];
    const d = okData(f);
    expect(d.unsafe).toBe(false);
    expect(d.papers[0].questionIds).toEqual(['q1', 'q-কপি-নেই']);
  });

  it('ভুল ফাইলে কারণ সহ ok:false (পুরনো তালিকা)', () => {
    expect(reason(JSON.stringify({ type: 'qb-category', version: 1, papers: 'x' }))).toContain('category');
    expect(reason({ ...fileOf(), papers: 'x' })).toContain('papers');
  });

  it('একটা ভুল প্রশ্নপত্র/কপি বাদ পড়ে, বাকি থাকে, সতর্কতা আসে, ফাইল unsafe', () => {
    const f = fileOf();
    f.papers.push({ id: '' });
    f.questions.push({ question: { id: 'qx' }, path: { scope: 'bogus' } });
    const d = okData(f);
    expect(d.papers).toHaveLength(2);
    expect(d.questions).toHaveLength(2);
    expect(d.unsafe).toBe(true);
    expect(d.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('একই id-র দুটি প্রশ্নপত্র: প্রথমটা থাকে, সতর্কতা, unsafe', () => {
    const f = fileOf();
    f.papers.push({ ...f.papers[0], shortName: 'অন্য' });
    const r = parseCategoryData(JSON.stringify(f));
    expect(r.ok && r.data.papers).toHaveLength(2);
    expect(r.ok && r.data.papers[0].shortName).toBe('উইকলি মডেল টেস্ট-১');
    expect(r.ok && r.data.warnings.some((w) => w.includes('একই id'))).toBe(true);
    expect(r.ok && r.data.unsafe).toBe(true);
  });

  it('গণনা না মিললে সতর্কতা + unsafe (হাতে বদলানো/অর্ধেক লেখা)', () => {
    const f = fileOf();
    f.papers.pop();
    const r = parseCategoryData(JSON.stringify(f));
    expect(r.ok && r.data.warnings.some((w) => w.includes('গণনা'))).toBe(true);
    expect(r.ok && r.data.unsafe).toBe(true);
  });

  it('হাতে লেখা কপির পথে topic না থাকলে খালি ধরা হয় (Chapter CQ)', () => {
    const f = fileOf();
    f.questions[0].path = { scope: 'chapter', subject: 'পদার্থ', chapter: 'ভেক্টর' };
    const r = parseCategoryData(JSON.stringify(f));
    expect(r.ok && r.data.questions[0].path.topic).toBe('');
    expect(r.ok && r.data.unsafe).toBe(false);
  });

  it('build() চারটি array ও counts ঠিক দেয়, আবার পড়লে unsafe নয়', () => {
    const f = build();
    expect(f.counts).toEqual({ papers: f.papers.length, questions: f.questions.length, stimuli: f.stimuli.length, images: f.images.length });
    expect(okData(JSON.parse(categoryDataToText(f))).unsafe).toBe(false);
  });
});

describe('categoryLayout - সিঙ্কের স্মৃতি', () => {
  it('ভাঙা মান খালি অবস্থা দেয়', () => {
    expect(normalizeCategorySyncState(null)).toEqual(emptyCategorySyncState());
    expect(normalizeCategorySyncState({ categories: { a: {} }, papers: { p: { categoryId: 1 } } })).toEqual(emptyCategorySyncState());
  });

  it('ঠিক সারি রাখে (ক্যাটেগরির data.json-এর অবস্থা সহ)', () => {
    const s = normalizeCategorySyncState({
      categories: { c1: { dirName: 'উইকলি', dataMtime: 5, dataSize: 9 }, c2: { dirName: 'অন্য', dataMtime: 'x' } },
      papers: { p1: { categoryId: 'c1', fileName: 'পুরনো', mtime: 1 } },
    });
    expect(s.categories.c1).toEqual({ dirName: 'উইকলি', dataMtime: 5, dataSize: 9 });
    expect(s.categories.c2).toEqual({ dirName: 'অন্য' });
    expect(s.papers.p1).toEqual({ categoryId: 'c1' });
  });
});
