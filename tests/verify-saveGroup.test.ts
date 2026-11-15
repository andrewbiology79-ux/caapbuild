// যাচাই-পরিকল্পনা ধাপ ২: প্রশ্ন কার্ড -> ডেটাবেস (saveQuestionGroup / getQuestionGroupForEdit), Type CQ ও Chapter CQ দুই স্কোপে।
// আর ডবল-সেভ গার্ড (সমস্যা ৪)।
import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('../src/storage/nativeStore', async () => await import('./stubs/memoryStore'));
import * as fs from './stubs/memoryStore';
import { getDb, type CqScope } from '../src/db/db';
import { getApi, type SaveQuestionGroupPayload, type QuestionBlockInput } from '../src/db/api';
import { buildSampleBank, seedFixture, clearBank } from './fixtures/sampleBank';
import { createSaveGuard } from '../src/utils/saveGuard';

const SCOPES: CqScope[] = ['type', 'chapter'];

/** শুধু বিষয়-অধ্যায়-টপিক (প্রশ্ন, উদ্দীপক ও ছবি ছাড়া) আর দুটো ছবির সারি বসানো */
async function setup(scope: CqScope) {
  const d = getDb(scope);
  await clearBank(getDb('type'));
  await clearBank(getDb('chapter'));
  const bank = buildSampleBank(scope);
  const empty = { ...bank, stimuli: [], questions: [] };
  await seedFixture(d, empty);
  return { d, api: getApi(scope), bank };
}

const topicOf = (bank: ReturnType<typeof buildSampleBank>, i = 0) => bank.topics[i].id;

function fullPayload(bank: ReturnType<typeof buildSampleBank>, over: Partial<SaveQuestionGroupPayload> = {}): SaveQuestionGroupPayload {
  const blocks: QuestionBlockInput[] = [
    { type: 'ক', marks: 1, questionText: 'ক-প্রশ্ন', solutionText: 'ক-সমাধান', solutionImageIds: [], answerText: 'ক-উত্তর', rating: 2, usedInBoards: [] },
    { type: 'খ', marks: 2, questionText: 'খ-প্রশ্ন', solutionText: 'খ-সমাধান', solutionImageIds: [], answerText: '', rating: 3, usedInBoards: [{ board: 'রাজশাহী', years: [2022] }] },
    { type: 'গ', marks: 3, questionText: 'গ-প্রশ্ন $x^2$', solutionText: 'গ-সমাধান', solutionImageIds: [], rating: 4, usedInBoards: [] },
    {
      type: 'ঘ', marks: 4, questionText: 'ঘ-প্রশ্ন', solutionText: 'ঘ-সমাধান', solutionImageIds: [bank.images[2].id], answerText: 'ঘ-উত্তর', rating: 5,
      usedInBoards: [{ board: 'ঢাকা', years: [2023] }, { board: 'কুমিল্লা', years: [2020, 2019] }],
    },
  ];
  return {
    topicId: topicOf(bank),
    stimulusText: 'উদ্দীপকের লেখা',
    stimulusImageIds: [bank.images[0].id, bank.images[1].id],
    stimulusImageTopCount: 1,
    boardTag: 'ঢাকা বোর্ড ২০২৩',
    stimulusUsedInBoards: [{ board: 'ঢাকা', years: [2023] }],
    stimulusRating: 4,
    reference: 'মেরি জি',
    questions: blocks,
    ...over,
  };
}

/** ছবির সারি আগে থেকে বসানো (ফর্মে ছবি বাছামাত্র db.images-এ যায়) */
async function seedImages(d: any, bank: ReturnType<typeof buildSampleBank>) {
  await d.images.bulkPut(bank.images.map(({ base64, ...r }) => ({ ...r, blob: new Blob([base64]) })));
}

/** getQuestionGroupForEdit-এর ডেটা থেকে আবার সেভের payload (ফর্ম খুলে কিছু না বদলে সেভ) */
function payloadFromEdit(edit: any): SaveQuestionGroupPayload {
  return {
    stimulusId: edit.stimulus.id,
    topicId: edit.topicId,
    stimulusText: edit.stimulus.text,
    stimulusImageIds: edit.stimulus.imageIds,
    stimulusImageTopCount: edit.stimulus.imageTopCount,
    boardTag: edit.stimulus.boardTag,
    stimulusUsedInBoards: edit.stimulus.usedInBoards,
    stimulusRating: edit.stimulus.rating,
    reference: edit.stimulus.reference,
    questions: edit.questions.map((q: any) => ({
      id: q.id, type: q.type, marks: q.marks, questionText: q.questionText, solutionText: q.solutionText,
      solutionImageIds: q.solutionImageIds, answerText: q.answerText, rating: q.rating, usedInBoards: q.usedInBoards,
    })),
  };
}

beforeEach(() => fs.resetFs());

describe.each(SCOPES)('নতুন গ্রুপ সেভ (%s)', (scope) => {
  it('উদ্দীপকের প্রতিটি ঘর ডেটাবেসে হুবহু যায়', async () => {
    const { d, api, bank } = await setup(scope);
    await seedImages(d, bank);
    const res = await api.saveQuestionGroup(fullPayload(bank));
    const st = await d.stimuli.get(res.stimulusId);
    expect(st).toEqual({
      id: res.stimulusId,
      topicId: topicOf(bank),
      text: 'উদ্দীপকের লেখা',
      imageIds: [bank.images[0].id, bank.images[1].id],
      imageTopCount: 1,
      boardTag: 'ঢাকা বোর্ড ২০২৩',
      usedInBoards: [{ board: 'ঢাকা', years: [2023] }],
      rating: 4,
      reference: 'মেরি জি',
    });
  });

  it('প্রশ্নের প্রতিটি ঘর (ধরন, মান, লেখা, সমাধান, সমাধান-ছবি, উত্তর, রেটিং, বোর্ড, ক্রম) হুবহু যায়', async () => {
    const { d, api, bank } = await setup(scope);
    await seedImages(d, bank);
    const res = await api.saveQuestionGroup(fullPayload(bank));
    expect(res.questionIds.length).toBe(4);
    const saved = await Promise.all(res.questionIds.map((id) => d.questions.get(id)));
    expect(saved.map((q) => q!.type)).toEqual(['ক', 'খ', 'গ', 'ঘ']);
    expect(saved.map((q) => q!.marks)).toEqual([1, 2, 3, 4]);
    expect(saved.map((q) => q!.questionText)).toEqual(['ক-প্রশ্ন', 'খ-প্রশ্ন', 'গ-প্রশ্ন $x^2$', 'ঘ-প্রশ্ন']);
    expect(saved.map((q) => q!.solutionText)).toEqual(['ক-সমাধান', 'খ-সমাধান', 'গ-সমাধান', 'ঘ-সমাধান']);
    expect(saved.map((q) => q!.solutionImageIds)).toEqual([[], [], [], [bank.images[2].id]]);
    expect(saved.map((q) => q!.answerText)).toEqual(['ক-উত্তর', '', undefined, 'ঘ-উত্তর']);
    expect(saved.map((q) => q!.rating)).toEqual([2, 3, 4, 5]);
    expect(saved[1]!.usedInBoards).toEqual([{ board: 'রাজশাহী', years: [2022] }]);
    expect(saved[3]!.usedInBoards).toEqual([{ board: 'ঢাকা', years: [2023] }, { board: 'কুমিল্লা', years: [2020, 2019] }]);
    expect(saved.map((q) => q!.order)).toEqual([1, 2, 3, 4]);
    for (const q of saved) {
      expect(q!.topicId).toBe(topicOf(bank));
      expect(q!.stimulusId).toBe(res.stimulusId);
    }
  });

  it('না-দেওয়া ঐচ্ছিক ঘরের ডিফল্ট: imageTopCount ০, reference ফাঁকা, usedInBoards খালি', async () => {
    const { d, api, bank } = await setup(scope);
    const res = await api.saveQuestionGroup({
      topicId: topicOf(bank), stimulusText: 'শুধু লেখা', stimulusImageIds: [],
      questions: [{ type: 'ক', marks: 1, questionText: 'প্রশ্ন', solutionText: '', solutionImageIds: [], rating: 3, usedInBoards: [] }],
    });
    const st = await d.stimuli.get(res.stimulusId);
    expect(st!.imageTopCount).toBe(0);
    expect(st!.reference).toBe('');
    expect(st!.usedInBoards).toEqual([]);
    expect(st!.rating).toBeUndefined();
  });

  it('একই টপিকে দ্বিতীয় গ্রুপ আগের ক্রমের পরে বসে', async () => {
    const { api, d, bank } = await setup(scope);
    await api.saveQuestionGroup(fullPayload(bank));
    const r2 = await api.saveQuestionGroup(fullPayload(bank, { stimulusText: 'দ্বিতীয়', stimulusImageIds: [] }));
    const orders = (await Promise.all(r2.questionIds.map((id) => d.questions.get(id)))).map((q) => q!.order);
    expect(orders).toEqual([5, 6, 7, 8]);
  });

  it('অন্য স্কোপের ডেটাবেসে কিছু যায় না', async () => {
    const { api, bank } = await setup(scope);
    await api.saveQuestionGroup(fullPayload(bank));
    const other = getDb(scope === 'type' ? 'chapter' : 'type');
    expect(await other.questions.count()).toBe(0);
    expect(await other.stimuli.count()).toBe(0);
  });
});

describe.each(SCOPES)('ফেরত পড়া ও আবার সেভ (%s)', (scope) => {
  it('getQuestionGroupForEdit সব ফেরত দেয়; এক প্রশ্ন থেকে খুললেও পুরো গ্রুপ ক-ঘ ক্রমে', async () => {
    const { api, bank } = await setup(scope);
    const res = await api.saveQuestionGroup(fullPayload(bank));
    const edit = await api.getQuestionGroupForEdit(res.questionIds[2]); // গ থেকে খোলা
    expect(edit!.stimulus!.id).toBe(res.stimulusId);
    expect(edit!.questions.map((q) => q.type)).toEqual(['ক', 'খ', 'গ', 'ঘ']);
    expect(edit!.topicId).toBe(topicOf(bank));
    expect(edit!.chapterId).toBe(bank.topics[0].chapterId);
    expect(edit!.subjectId).toBe(bank.chapters.find((c) => c.id === bank.topics[0].chapterId)!.subjectId);
  });

  it('কিছু না বদলে আবার সেভ করলে ডেটাবেসের কিছুই বদলায় না', async () => {
    const { api, d, bank } = await setup(scope);
    await seedImages(d, bank);
    const res = await api.saveQuestionGroup(fullPayload(bank));
    const before = { st: await d.stimuli.toArray(), qs: (await d.questions.toArray()).sort((a, b) => a.order - b.order) };
    const edit = await api.getQuestionGroupForEdit(res.questionIds[0]);
    await api.saveQuestionGroup(payloadFromEdit(edit));
    const after = { st: await d.stimuli.toArray(), qs: (await d.questions.toArray()).sort((a, b) => a.order - b.order) };
    expect(after).toEqual(before);
    expect(await d.images.count()).toBe(bank.images.length); // ছবি মোছেনি
  });

  it('একক প্রশ্ন (এক ব্লক) ফেরত পড়া', async () => {
    const { api, bank } = await setup(scope);
    const p = fullPayload(bank);
    const res = await api.saveQuestionGroup({ ...p, questions: [p.questions[2]] });
    const edit = await api.getQuestionGroupForEdit(res.questionIds[0]);
    expect(edit!.questions.length).toBe(1);
    expect(edit!.questions[0].type).toBe('গ');
  });

  it('নেই এমন প্রশ্ন id হলে null', async () => {
    const { api } = await setup(scope);
    expect(await api.getQuestionGroupForEdit('nai')).toBeNull();
  });
});

describe.each(SCOPES)('পুরনো গ্রুপ এডিট (%s)', (scope) => {
  it('লেখা বদল, নতুন ব্লক যোগ, ব্লক মোছা একসাথে', async () => {
    const { api, d, bank } = await setup(scope);
    await seedImages(d, bank);
    const res = await api.saveQuestionGroup(fullPayload(bank));
    const edit = await api.getQuestionGroupForEdit(res.questionIds[0]);
    const p = payloadFromEdit(edit);
    p.stimulusText = 'বদলানো উদ্দীপক';
    p.questions[0].questionText = 'বদলানো ক';
    const removed = p.questions.splice(1, 1)[0]; // খ মোছা
    p.deletedQuestionIds = [removed.id!];
    p.questions.push({ type: 'গ', marks: 3, questionText: 'অতিরিক্ত গ', solutionText: '', solutionImageIds: [], rating: 1, usedInBoards: [] });
    await api.saveQuestionGroup(p);

    expect((await d.stimuli.get(res.stimulusId))!.text).toBe('বদলানো উদ্দীপক');
    expect(await d.questions.get(removed.id!)).toBeUndefined();
    const group = (await d.questions.where('stimulusId').equals(res.stimulusId).toArray()).sort((a, b) => a.order - b.order);
    expect(group.map((q) => q.questionText)).toEqual(['বদলানো ক', 'গ-প্রশ্ন $x^2$', 'ঘ-প্রশ্ন', 'অতিরিক্ত গ']);
    expect(group.length).toBe(4);
  });

  it('ক-খ-গ-ঘ সাজালে ক্রম-স্লট একই থাকে (অন্য প্রশ্ন সরে না)', async () => {
    const { api, d, bank } = await setup(scope);
    const other = await api.saveQuestionGroup(fullPayload(bank, { stimulusText: 'অন্য গ্রুপ', stimulusImageIds: [] })); // ক্রম ১-৪
    const res = await api.saveQuestionGroup(fullPayload(bank, { stimulusImageIds: [] })); // ক্রম ৫-৮
    const edit = await api.getQuestionGroupForEdit(res.questionIds[0]);
    const p = payloadFromEdit(edit);
    p.questions.reverse(); // ঘ গ খ ক
    await api.saveQuestionGroup(p);
    const group = (await d.questions.where('stimulusId').equals(res.stimulusId).toArray()).sort((a, b) => a.order - b.order);
    expect(group.map((q) => q.type)).toEqual(['ঘ', 'গ', 'খ', 'ক']);
    expect(group.map((q) => q.order)).toEqual([5, 6, 7, 8]);
    const others = (await d.questions.where('stimulusId').equals(other.stimulusId).toArray()).sort((a, b) => a.order - b.order);
    expect(others.map((q) => q.order)).toEqual([1, 2, 3, 4]);
    expect(others.map((q) => q.type)).toEqual(['ক', 'খ', 'গ', 'ঘ']);
  });

  it('টপিক বদলালে উদ্দীপক ও সব প্রশ্ন নতুন টপিকে যায়', async () => {
    const { api, d, bank } = await setup(scope);
    const res = await api.saveQuestionGroup(fullPayload(bank));
    const edit = await api.getQuestionGroupForEdit(res.questionIds[0]);
    const p = payloadFromEdit(edit);
    const newTopic = topicOf(bank, 1);
    p.topicId = newTopic;
    await api.saveQuestionGroup(p);
    expect((await d.stimuli.get(res.stimulusId))!.topicId).toBe(newTopic);
    for (const id of res.questionIds) expect((await d.questions.get(id))!.topicId).toBe(newTopic);
  });

  it('মোছা ব্লকের সমাধান-ছবি আর কেউ না ধরলে মোছে; উদ্দীপকের ছবি ও অন্য ছবি থাকে', async () => {
    const { api, d, bank } = await setup(scope);
    await seedImages(d, bank);
    const res = await api.saveQuestionGroup(fullPayload(bank));
    const edit = await api.getQuestionGroupForEdit(res.questionIds[0]);
    const p = payloadFromEdit(edit);
    const gha = p.questions.pop()!; // ঘ (সমাধান-ছবি আছে) মোছা
    p.deletedQuestionIds = [gha.id!];
    await api.saveQuestionGroup(p);
    expect(await d.images.get(bank.images[2].id)).toBeUndefined(); // সমাধান-ছবি গেছে
    expect(await d.images.get(bank.images[0].id)).toBeDefined(); // উদ্দীপকের ছবি আছে
    expect(await d.images.get(bank.images[1].id)).toBeDefined();
  });
});

describe.each(SCOPES)('ভুল id হলে পুরো সেভ বাতিল — আধা-সেভ নয় (%s)', (scope) => {
  it('ভুল উদ্দীপক id: ত্রুটি, কিছু বদলায় না', async () => {
    const { api, d, bank } = await setup(scope);
    const res = await api.saveQuestionGroup(fullPayload(bank));
    const before = { st: await d.stimuli.toArray(), qs: await d.questions.toArray() };
    const edit = await api.getQuestionGroupForEdit(res.questionIds[0]);
    const p = payloadFromEdit(edit);
    p.stimulusId = 'ভুল-id';
    p.stimulusText = 'এটা যেন না যায়';
    await expect(api.saveQuestionGroup(p)).rejects.toThrow('উদ্দীপক পাওয়া যায়নি');
    expect({ st: await d.stimuli.toArray(), qs: await d.questions.toArray() }).toEqual(before);
  });

  it('ভুল প্রশ্ন id: ত্রুটি, উদ্দীপকের বদলও রোলব্যাক, নতুন কিছু যোগ হয় না', async () => {
    const { api, d, bank } = await setup(scope);
    const res = await api.saveQuestionGroup(fullPayload(bank));
    const before = { st: await d.stimuli.toArray(), qs: await d.questions.toArray() };
    const edit = await api.getQuestionGroupForEdit(res.questionIds[0]);
    const p = payloadFromEdit(edit);
    p.stimulusText = 'এটা যেন না যায়';
    p.questions[1].id = 'ভুল-প্রশ্ন-id';
    p.questions.push({ type: 'গ', marks: 3, questionText: 'নতুন', solutionText: '', solutionImageIds: [], rating: 1, usedInBoards: [] });
    await expect(api.saveQuestionGroup(p)).rejects.toThrow('প্রশ্ন পাওয়া যায়নি');
    expect({ st: await d.stimuli.toArray(), qs: await d.questions.toArray() }).toEqual(before);
  });
});

describe('ডবল-সেভ (সমস্যা ৪)', () => {
  it('বৈশিষ্ট্য-নথি: গার্ড ছাড়া একই নতুন ফর্ম দুবার সেভ হলে দুই সেট উদ্দীপক + প্রশ্ন হয় (তাই ফর্মে গার্ড)', async () => {
    const { api, d, bank } = await setup('type');
    const p = fullPayload(bank, { stimulusImageIds: [] });
    await Promise.all([api.saveQuestionGroup(p), api.saveQuestionGroup(p)]);
    expect(await d.stimuli.count()).toBe(2);
    expect(await d.questions.count()).toBe(8);
  });

  it('সেভ-গার্ড: আগে থেকে তালা থাকলে tryEnter false; leave-এর পর আবার true', () => {
    const g = createSaveGuard();
    expect(g.isBusy()).toBe(false);
    expect(g.tryEnter()).toBe(true);
    expect(g.isBusy()).toBe(true);
    expect(g.tryEnter()).toBe(false);
    g.leave();
    expect(g.isBusy()).toBe(false);
    expect(g.tryEnter()).toBe(true);
  });

  it('গার্ড দিয়ে মোড়া সেভ: দ্রুত দুবার ডাকলে একবারই চলে, ব্যর্থ হলেও তালা খোলে', async () => {
    const { api, d, bank } = await setup('type');
    const g = createSaveGuard();
    const p = fullPayload(bank, { stimulusImageIds: [] });
    const guardedSave = async (payload: typeof p) => {
      if (!g.tryEnter()) return false;
      try {
        await new Promise((r) => setTimeout(r, 5)); // ডুপ্লিকেট-চেকের await-এর মতো ফাঁক
        await api.saveQuestionGroup(payload);
        return true;
      } finally {
        g.leave();
      }
    };
    const results = await Promise.all([guardedSave(p), guardedSave(p)]);
    expect(results.filter(Boolean).length).toBe(1);
    expect(await d.stimuli.count()).toBe(1);
    expect(await d.questions.count()).toBe(4);
    // ব্যর্থ সেভের পরেও তালা খোলে
    await expect(guardedSave({ ...p, stimulusId: 'ভুল' })).rejects.toThrow();
    expect(g.isBusy()).toBe(false);
  });
});
