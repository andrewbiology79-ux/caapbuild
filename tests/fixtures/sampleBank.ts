/**
 * যাচাই-পরিকল্পনা ধাপ ১ — নমুনা ডেটা (বিষয় > অধ্যায় > টপিক > উদ্দীপক গ্রুপ + একক প্রশ্ন + ছবি + বোর্ড + রেটিং + সমাধান-ছবি)।
 * Type CQ ও Chapter CQ দুই স্কোপেই একই গঠন; Chapter CQ-তে প্রতি অধ্যায়ে একটা লুকানো ডিফল্ট টপিক।
 * সব id স্কোপ অনুযায়ী আলাদা (প্রিফিক্স t_ / c_), যাতে দুই ডেটাবেসের ডেটা মেশে না।
 * খাঁটি ডেটা — Dexie/ব্রাউজার লাগে না; seedFixture() দিয়ে ডেটাবেসে বসে।
 */
import type { CqScope, Subject, Chapter, Topic, Stimulus, Question, DbImage } from '../../src/db/db';

export interface FixtureImage extends Omit<DbImage, 'blob'> {
  /** ছবির বিষয়বস্তু (base64, ছোট্ট ১x১ PNG) */
  base64: string;
}

export interface SampleBank {
  scope: CqScope;
  subjects: Subject[];
  chapters: Chapter[];
  topics: Topic[];
  stimuli: Stimulus[];
  questions: Question[];
  images: FixtureImage[];
}

/** ১x১ স্বচ্ছ PNG */
export const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
/** আরেকটা আলাদা বিষয়বস্তুর ছবি (বদল/Replace যাচাইয়ের জন্য) */
export const TINY_PNG_B64_ALT =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export function buildSampleBank(scope: CqScope): SampleBank {
  const p = scope === 'chapter' ? 'c' : 't';
  const id = (s: string) => `${p}_${s}`;

  const subjects: Subject[] = [
    { id: id('sub_phy'), name: 'পদার্থবিজ্ঞান ১ম পত্র', order: 1 },
    { id: id('sub_chem'), name: 'রসায়ন ২য় পত্র', order: 2 },
  ];
  const chapters: Chapter[] = [
    { id: id('ch_phy1'), subjectId: id('sub_phy'), name: 'ভৌতজগৎ ও পরিমাপ', order: 1 },
    { id: id('ch_phy2'), subjectId: id('sub_phy'), name: 'ভেক্টর', order: 2 },
    { id: id('ch_chem1'), subjectId: id('sub_chem'), name: 'রসায়ন ও জীবন', order: 1 },
  ];

  let topics: Topic[];
  if (scope === 'type') {
    topics = [
      { id: id('tp_phy1_a'), chapterId: id('ch_phy1'), name: 'গাণিতিক', order: 1 },
      { id: id('tp_phy1_b'), chapterId: id('ch_phy1'), name: 'ব্যাখ্যামূলক', order: 2 },
      { id: id('tp_phy2_a'), chapterId: id('ch_phy2'), name: 'গাণিতিক', order: 1 },
      { id: id('tp_chem1_a'), chapterId: id('ch_chem1'), name: 'জ্ঞানমূলক', order: 1 },
    ];
  } else {
    // Chapter CQ: প্রতি অধ্যায়ের একটা লুকানো ডিফল্ট টপিক (ফোল্ডার নেই, প্রশ্ন অধ্যায়-ফোল্ডারে)
    topics = chapters.map((c, i) => ({ id: id(`tp_${c.id.slice(2)}_default`), chapterId: c.id, name: 'ডিফল্ট', order: i + 1 }));
  }
  const topicA = topics[0].id; // ভৌতজগৎ ও পরিমাপ-এর প্রথম টপিক
  const topicB = topics[1].id; // type: ভৌতজগতের দ্বিতীয় টপিক; chapter: ভেক্টরের ডিফল্ট
  const topicC = topics[topics.length - 1].id;

  const images: FixtureImage[] = [
    { id: id('img_stim1_top'), fileName: 'stim1_top.png', topicId: topicA, w: 1, h: 1, base64: TINY_PNG_B64 },
    { id: id('img_stim1_bot'), fileName: 'stim1_bot.png', topicId: topicA, w: 1, h: 1, base64: TINY_PNG_B64_ALT },
    { id: id('img_sol_gha'), fileName: 'sol_gha.png', topicId: topicA, w: 1, h: 1, base64: TINY_PNG_B64 },
    { id: id('img_single_sol'), fileName: 'single_sol.png', topicId: topicB, w: 1, h: 1, base64: TINY_PNG_B64_ALT },
    { id: id('img_stim2'), fileName: 'stim2.png', topicId: topicC, w: 1, h: 1, base64: TINY_PNG_B64 },
  ];

  const stimuli: Stimulus[] = [
    {
      id: id('stim_1'),
      topicId: topicA,
      text: 'একটি বস্তুর ভর $m = 2\\,kg$ ও বেগ $v = 3\\,m/s$।',
      imageIds: [id('img_stim1_top'), id('img_stim1_bot')],
      imageTopCount: 1,
      boardTag: 'ঢাকা বোর্ড ২০২৩',
      usedInBoards: [{ board: 'ঢাকা', years: [2023, 2021] }],
      rating: 4,
      reference: 'মেরি জি প্রশ্ন ব্যাংক',
    },
    {
      id: id('stim_2'),
      topicId: topicC,
      text: 'সরল উদ্দীপক — ছবি ও বোর্ড ছাড়া নয়, রেটিং ছাড়া।',
      imageIds: [id('img_stim2')],
      usedInBoards: [],
    },
  ];

  const q = (s: string, over: Partial<Question>): Question => ({
    id: id(s),
    topicId: topicA,
    type: 'ক',
    marks: 1,
    questionText: '',
    solutionText: '',
    solutionImageIds: [],
    rating: 3,
    order: 1,
    usedInBoards: [],
    ...over,
  });

  const questions: Question[] = [
    // উদ্দীপক ১-এর চার প্রশ্ন (ক-ঘ)
    q('q1_ka', { stimulusId: id('stim_1'), type: 'ক', marks: 1, questionText: 'ভর কাকে বলে?', solutionText: 'বস্তুতে পদার্থের পরিমাণ।', answerText: 'পদার্থের পরিমাণ', rating: 2, order: 1 }),
    q('q1_kha', { stimulusId: id('stim_1'), type: 'খ', marks: 2, questionText: 'বেগ ও দ্রুতির পার্থক্য কী?', solutionText: 'বেগ ভেক্টর, দ্রুতি স্কেলার।', rating: 3, order: 2, usedInBoards: [{ board: 'রাজশাহী', years: [2022] }] }),
    q('q1_ga', { stimulusId: id('stim_1'), type: 'গ', marks: 3, questionText: 'গতিশক্তি নির্ণয় করো।', solutionText: '$K = \\frac{1}{2}mv^2 = 9\\,J$', rating: 3, order: 3 }),
    q('q1_gha', { stimulusId: id('stim_1'), type: 'ঘ', marks: 4, questionText: 'বেগ দ্বিগুণ হলে কী ঘটবে? বিশ্লেষণ করো।', solutionText: 'গতিশক্তি চার গুণ হবে।', solutionImageIds: [id('img_sol_gha')], rating: 5, order: 4, usedInBoards: [{ board: 'ঢাকা', years: [2023] }, { board: 'কুমিল্লা', years: [2020, 2019] }] }),
    // একক প্রশ্ন (উদ্দীপক ছাড়া), অন্য টপিকে
    q('single_ga', { topicId: topicB, type: 'গ', marks: 3, questionText: 'একটি ভেক্টরকে উপাংশে ভাঙো।', solutionText: 'উপাংশ = $A\\cos\\theta$', solutionImageIds: [id('img_single_sol')], rating: 1, order: 1 }),
    // উদ্দীপক ২-এর দুই প্রশ্ন (শুধু ক ও ঘ — অসম্পূর্ণ গ্রুপ)
    q('q2_ka', { topicId: topicC, stimulusId: id('stim_2'), type: 'ক', marks: 1, questionText: 'অ্যাসিড কী?', solutionText: 'H⁺ দাতা।', rating: 1, order: 1 }),
    q('q2_gha', { topicId: topicC, stimulusId: id('stim_2'), type: 'ঘ', marks: 4, questionText: 'pH ব্যাখ্যা করো।', solutionText: '', rating: 2, order: 2 }),
  ];

  return { scope, subjects, chapters, topics, stimuli, questions, images };
}

/** ফিক্সচারের কোন প্রশ্ন কোন উদ্দীপকের — গ্রুপ-অনুযায়ী দেখার সহায়ক */
export function questionsOfStimulus(bank: SampleBank, stimulusId: string): Question[] {
  return bank.questions.filter((x) => x.stimulusId === stimulusId).sort((a, b) => a.order - b.order);
}

/** ডেটাবেসে (Dexie) ফিক্সচার বসায়: ছবির blob সহ। db = getDb(scope) */
export async function seedFixture(dexieDb: any, bank: SampleBank): Promise<void> {
  const toBlob = (b64: string) => new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/png' });
  await dexieDb.transaction(
    'rw',
    [dexieDb.subjects, dexieDb.chapters, dexieDb.topics, dexieDb.stimuli, dexieDb.questions, dexieDb.images],
    async () => {
      await dexieDb.subjects.bulkPut(bank.subjects);
      await dexieDb.chapters.bulkPut(bank.chapters);
      await dexieDb.topics.bulkPut(bank.topics);
      await dexieDb.stimuli.bulkPut(bank.stimuli);
      await dexieDb.questions.bulkPut(bank.questions);
      await dexieDb.images.bulkPut(
        bank.images.map(({ base64, ...rec }) => ({ ...rec, blob: toBlob(base64) })),
      );
    },
  );
}

/** ডেটাবেসের সব টেবিল খালি করে (প্রতি টেস্টের আগে) */
export async function clearBank(dexieDb: any): Promise<void> {
  await dexieDb.transaction(
    'rw',
    [dexieDb.subjects, dexieDb.chapters, dexieDb.topics, dexieDb.stimuli, dexieDb.questions, dexieDb.images, dexieDb.syncState],
    async () => {
      for (const t of ['subjects', 'chapters', 'topics', 'stimuli', 'questions', 'images', 'syncState']) await dexieDb[t].clear();
    },
  );
}
