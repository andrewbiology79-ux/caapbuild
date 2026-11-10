import { describe, it, expect } from 'vitest';
import {
  buildBackupText,
  parseBackupText,
  planImport,
  planHierarchy,
  labelNumber,
  emptyScope,
  hashText,
  BackupError,
  type BackupBody,
  type LocalSnapshot,
  type LocalScopeSnapshot,
} from '../src/utils/categoryBackupCore';

const subj = (id: string, name: string, order = 1) => ({ id, name, order }) as any;
const chap = (id: string, subjectId: string, name: string, order = 1) => ({ id, subjectId, name, order }) as any;
const top = (id: string, chapterId: string, name: string, order = 1) => ({ id, chapterId, name, order }) as any;
const stim = (id: string, topicId: string, imageIds: string[] = []) => ({ id, topicId, text: 'উদ্দীপক', imageIds }) as any;
const ques = (id: string, topicId: string, stimulusId?: string, solutionImageIds: string[] = []) =>
  ({ id, topicId, stimulusId, type: 'গ', marks: 3, questionText: 'প্রশ্ন', solutionText: '', solutionImageIds, rating: 3, order: 0, usedInBoards: [] }) as any;
const paper = (id: string, shortName: string, questionIds: string[], title = 'পরীক্ষা') =>
  ({ id, shortName, title, category: 'x', createdAt: 1, questionIds }) as any;

const emptyLocalScope = (): LocalScopeSnapshot => ({
  subjects: [],
  chapters: [],
  topics: [],
  questionIds: new Set(),
  stimulusIds: new Set(),
  imageIds: new Set(),
});
const emptyLocal = (): LocalSnapshot => ({ type: emptyLocalScope(), chapter: emptyLocalScope(), categories: [], papers: [] });

function sampleBody(): BackupBody {
  const type = emptyScope();
  type.subjects = [subj('s1', 'পদার্থবিজ্ঞান')];
  type.chapters = [chap('c1', 's1', 'গতি')];
  type.topics = [top('t1', 'c1', 'বেগ')];
  type.stimuli = [stim('st1', 't1', ['img1'])];
  type.questions = [ques('q1', 't1', 'st1'), ques('q2', 't1')];
  type.images = [{ id: 'img1', fileName: 'img1.webp', data: 'data:image/webp;base64,AAAA' }];
  const chapter = emptyScope();
  chapter.subjects = [subj('s2', 'রসায়ন')];
  chapter.chapters = [chap('c2', 's2', 'মোল')];
  chapter.topics = [top('t2', 'c2', 'সূত্র')];
  chapter.questions = [ques('q3', 't2')];
  return {
    categories: [
      { id: 'cat1', name: 'উইকলি টেস্ট', order: 1, createdAt: 5, papers: [paper('p1', 'উইকলি টেস্ট-১', ['q1', 'q2', 'q3'])] },
      { id: 'cat2', name: 'মডেল টেস্ট', order: 2, createdAt: 6, papers: [] },
    ],
    scopes: { type, chapter },
  };
}

describe('categoryBackupCore: ফাইল তৈরি ও পড়া', () => {
  it('তৈরি করা ফাইল আবার পড়লে সব মেলে, দুই scope-ই থাকে', async () => {
    const { text, counts } = await buildBackupText(sampleBody(), '1.0.0');
    expect(counts).toEqual({ categories: 2, papers: 1, questions: 3, stimuli: 1, images: 1 });
    const parsed = await parseBackupText(text);
    expect(parsed.format).toBe('v2');
    expect(parsed.verified).toBe(true);
    expect(parsed.counts).toEqual(counts);
    expect(parsed.scopes.chapter.questions).toHaveLength(1);
    expect(parsed.scopes.type.images).toHaveLength(1);
  });

  it('ফাইলের লেখা সামান্য বদলালে চেকসাম ধরে ফেলে', async () => {
    const { text } = await buildBackupText(sampleBody(), '1.0.0');
    const tampered = text.replace('প্রশ্ন', 'প্রশ্নx');
    await expect(parseBackupText(tampered)).rejects.toThrow(/চেকসাম/);
  });

  it('অর্ধেক কাটা ফাইল ধরা পড়ে', async () => {
    const { text } = await buildBackupText(sampleBody(), '1.0.0');
    await expect(parseBackupText(text.slice(0, Math.floor(text.length / 2)))).rejects.toThrow(BackupError);
  });

  it('অন্য ধরনের ফাইল ও খালি লেখা বাদ', async () => {
    await expect(parseBackupText('{"type":"other"}')).rejects.toThrow(/ক্যাটেগরি ব্যাকআপ ফাইল নয়/);
    await expect(parseBackupText('[]')).rejects.toThrow(BackupError);
    await expect(parseBackupText('')).rejects.toThrow(BackupError);
  });

  it('নতুন ভার্সনের ফাইল ইম্পোর্ট হয় না', async () => {
    const { text } = await buildBackupText(sampleBody(), '1.0.0');
    const newer = text.replace('"version":2', '"version":9');
    await expect(parseBackupText(newer)).rejects.toThrow(/আপডেট/);
  });

  it('চেকসাম ঠিক কিন্তু ঘোষিত সংখ্যা ভুল হলে বাদ', async () => {
    const { text } = await buildBackupText(sampleBody(), '1.0.0');
    const wrong = text.replace('"questions":3', '"questions":4');
    await expect(parseBackupText(wrong)).rejects.toThrow(/সংখ্যা/);
  });

  it('চেকসাম ছাড়া নতুন ফরম্যাট ফাইল বাদ', async () => {
    const { text } = await buildBackupText(sampleBody(), '1.0.0');
    const obj = JSON.parse(text);
    delete obj.checksum;
    await expect(parseBackupText(JSON.stringify(obj))).rejects.toThrow(/চেকসাম নেই/);
  });

  it('পুরনো শেয়ার ফাইল পড়া যায় (যাচাই-না-হওয়া চিহ্নসহ)', async () => {
    const legacy = {
      type: 'qb-category-share',
      version: '1.0',
      exportedAt: 'x',
      category: { name: 'পুরনো' },
      papers: [paper('p1', 'পুরনো-১', ['q1'])],
      subjects: [subj('s1', 'বিষয়')],
      chapters: [chap('c1', 's1', 'অধ্যায়')],
      topics: [top('t1', 'c1', 'টপিক')],
      stimuli: [],
      questions: [ques('q1', 't1')],
      images: [],
    };
    const parsed = await parseBackupText(JSON.stringify(legacy));
    expect(parsed.format).toBe('legacy');
    expect(parsed.verified).toBe(false);
    expect(parsed.categories[0].name).toBe('পুরনো');
    expect(parsed.scopes.type.questions).toHaveLength(1);
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });

  it('একই id দুবার থাকলে একটাই রাখে, নষ্ট প্রশ্নপত্র বাদ দেয়', async () => {
    const body = sampleBody();
    body.scopes.type.questions.push(ques('q1', 't1'));
    (body.categories[0].papers as any[]).push({ id: 'bad', title: 'নষ্ট' });
    const { text } = await buildBackupText(body, '1.0.0');
    const parsed = await parseBackupText(text).catch((e) => e);
    // কাঁচা সংখ্যা (৪টি প্রশ্ন) ঘোষিত সংখ্যার সাথে মেলে, তাই পড়া যায়; সাফ হওয়ার পর একটি কমে
    expect(parsed.scopes.type.questions).toHaveLength(2);
    expect(parsed.categories[0].papers).toHaveLength(1);
    expect(parsed.warnings.length).toBeGreaterThan(1);
  });

  it('hashText একই লেখায় একই, আলাদা লেখায় আলাদা', async () => {
    expect(await hashText('ক')).toBe(await hashText('ক'));
    expect(await hashText('ক')).not.toBe(await hashText('খ'));
  });
});

describe('categoryBackupCore: ইম্পোর্ট পরিকল্পনা', () => {
  let n = 0;
  const newId = () => `new-${++n}`;

  it('খালি ফোনে সবই নতুন', async () => {
    const { text } = await buildBackupText(sampleBody(), '1.0.0');
    const plan = planImport(await parseBackupText(text), emptyLocal(), newId);
    expect(plan.totals.newCategories).toBe(2);
    expect(plan.totals.newPapers).toBe(1);
    expect(plan.totals.newQuestions).toBe(3);
    expect(plan.totals.newImages).toBe(1);
    expect(plan.scopes.chapter.questions.map((q) => q.id)).toEqual(['q3']);
    expect(plan.papersToAdd[0].paper.id).not.toBe('p1');
    expect(plan.nothingToDo).toBe(false);
  });

  it('দ্বিতীয়বার ইম্পোর্টে কিছুই নতুন নয় (ফোনে সব আছে)', async () => {
    const { text } = await buildBackupText(sampleBody(), '1.0.0');
    const parsed = await parseBackupText(text);
    const body = sampleBody();
    const local = emptyLocal();
    local.type = {
      subjects: body.scopes.type.subjects,
      chapters: body.scopes.type.chapters,
      topics: body.scopes.type.topics,
      questionIds: new Set(['q1', 'q2']),
      stimulusIds: new Set(['st1']),
      imageIds: new Set(['img1']),
    };
    local.chapter = {
      subjects: body.scopes.chapter.subjects,
      chapters: body.scopes.chapter.chapters,
      topics: body.scopes.chapter.topics,
      questionIds: new Set(['q3']),
      stimulusIds: new Set(),
      imageIds: new Set(),
    };
    local.categories = [
      { id: 'a', name: 'উইকলি টেস্ট', order: 1 },
      { id: 'b', name: 'মডেল টেস্ট', order: 2 },
    ];
    local.papers = [{ ...paper('lp', 'উইকলি টেস্ট-১', ['q1', 'q2', 'q3']), categoryId: 'a' }];
    const plan = planImport(parsed, local, newId);
    expect(plan.totals.newQuestions).toBe(0);
    expect(plan.totals.newPapers).toBe(0);
    expect(plan.totals.duplicatePapers).toBe(1);
    expect(plan.alreadyHave.questions).toBe(3);
    expect(plan.nothingToDo).toBe(true);
  });

  it('একই নামের ক্যাটেগরিতে মিশে যায় এবং প্রশ্নপত্রের নম্বর আগের পরে চলে', async () => {
    const { text } = await buildBackupText(sampleBody(), '1.0.0');
    const local = emptyLocal();
    local.categories = [{ id: 'a', name: 'উইকলি টেস্ট', order: 1 }];
    local.papers = [{ ...paper('lp', 'উইকলি টেস্ট-১', ['zzz']), categoryId: 'a' }];
    const plan = planImport(await parseBackupText(text), local, newId);
    const row = plan.categories.find((c) => c.name === 'উইকলি টেস্ট')!;
    expect(row.isNew).toBe(false);
    expect(row.existingId).toBe('a');
    expect(plan.totals.newCategories).toBe(1); // শুধু "মডেল টেস্ট"
    expect(plan.papersToAdd[0].paper.shortName).toBe('উইকলি টেস্ট-২');
  });

  it('প্রশ্ন ফাইলে/ফোনে না থাকলে প্রশ্নপত্র ইম্পোর্ট হয় না', async () => {
    const body = sampleBody();
    body.scopes.chapter.questions = []; // q3 নেই
    const { text } = await buildBackupText(body, '1.0.0');
    const plan = planImport(await parseBackupText(text), emptyLocal(), newId);
    expect(plan.totals.brokenPapers).toBe(1);
    expect(plan.totals.newPapers).toBe(0);
    expect(plan.warnings.some((w) => w.includes('ইম্পোর্ট হবে না'))).toBe(true);
  });

  it('টপিক ফাইলে না থাকলে সেই প্রশ্ন বাদ যায়, প্রশ্নপত্রও ভাঙা ধরা হয়', async () => {
    const body = sampleBody();
    body.scopes.type.topics = [];
    const { text } = await buildBackupText(body, '1.0.0');
    const plan = planImport(await parseBackupText(text), emptyLocal(), newId);
    expect(plan.totals.newQuestions).toBe(1); // শুধু chapter-এর q3
    expect(plan.totals.brokenPapers).toBe(1);
  });

  it('ছবি না পেলে সতর্কতা আসে', async () => {
    const body = sampleBody();
    body.scopes.type.images = [];
    const { text } = await buildBackupText(body, '1.0.0');
    const plan = planImport(await parseBackupText(text), emptyLocal(), newId);
    expect(plan.missingImages).toBe(1);
  });
});

describe('categoryBackupCore: বিষয়/অধ্যায়/টপিক মেলানো', () => {
  it('একই নামের বিষয়-অধ্যায়-টপিক ফোনে থাকলে নতুন করে বানায় না, id বদলে মেলায়', () => {
    const incoming = emptyScope();
    incoming.subjects = [subj('A', 'পদার্থ')];
    incoming.chapters = [chap('B', 'A', 'গতি')];
    incoming.topics = [top('C', 'B', 'বেগ')];
    const local = emptyLocalScope();
    local.subjects = [subj('s1', ' পদার্থ ')];
    local.chapters = [chap('c1', 's1', 'গতি')];
    local.topics = [top('t1', 'c1', 'বেগ')];
    const r = planHierarchy(incoming, local);
    expect(r.subjects).toHaveLength(0);
    expect(r.chapters).toHaveLength(0);
    expect(r.topics).toHaveLength(0);
    expect(r.topicMap.get('C')).toBe('t1');
  });

  it('নতুন বিষয়ের নিচে নতুন অধ্যায়/টপিক ঠিক বাবার সাথে যুক্ত হয়, order শেষে বসে', () => {
    const incoming = emptyScope();
    incoming.subjects = [subj('A', 'গণিত', 1)];
    incoming.chapters = [chap('B', 'A', 'বীজগণিত')];
    incoming.topics = [top('C', 'B', 'সূত্র')];
    const local = emptyLocalScope();
    local.subjects = [subj('s1', 'পদার্থ', 4)];
    const r = planHierarchy(incoming, local);
    expect(r.subjects[0].order).toBe(5);
    expect(r.chapters[0].subjectId).toBe('A');
    expect(r.topics[0].chapterId).toBe('B');
    expect(r.topicMap.get('C')).toBe('C');
  });

  it('নাম মিললে প্রশ্নের topicId ফোনের টপিকে বদলে যায়', async () => {
    const body = sampleBody();
    const { text } = await buildBackupText(body, '1.0.0');
    const local = emptyLocal();
    local.type.subjects = [subj('LS', 'পদার্থবিজ্ঞান')];
    local.type.chapters = [chap('LC', 'LS', 'গতি')];
    local.type.topics = [top('LT', 'LC', 'বেগ')];
    const plan = planImport(await parseBackupText(text), local, () => 'x');
    expect(plan.scopes.type.questions.every((q) => q.topicId === 'LT')).toBe(true);
    expect(plan.scopes.type.stimuli[0].topicId).toBe('LT');
    expect(plan.totals.newSubjects).toBe(1); // শুধু chapter scope-এর "রসায়ন"
  });
});

describe('categoryBackupCore: labelNumber', () => {
  it('বাংলা ও ইংরেজি সংখ্যা দুটোই বোঝে', () => {
    expect(labelNumber('টেস্ট-১২', 'টেস্ট')).toBe(12);
    expect(labelNumber('Test-3', 'Test')).toBe(3);
    expect(labelNumber('অন্য-১', 'টেস্ট')).toBeNull();
    expect(labelNumber('টেস্ট-ক', 'টেস্ট')).toBeNull();
  });
});
