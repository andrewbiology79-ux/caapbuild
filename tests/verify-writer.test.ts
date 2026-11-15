// যাচাই-পরিকল্পনা ধাপ ৩: ডেটাবেস -> ফোল্ডার (writer.ts), Type CQ ও Chapter CQ দুই স্কোপে।
// আসল writer.ts / api.ts চলে; ফোল্ডার = মেমরির নকল ফাইল-সিস্টেম (tests/stubs/memoryStore.ts); ডেটাবেস = fake-indexeddb।
import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('../src/storage/nativeStore', async () => await import('./stubs/memoryStore'));
import './stubs/fileReaderPolyfill';
import * as fs from './stubs/memoryStore';
import { getDb, type CqScope } from '../src/db/db';
import { getApi } from '../src/db/api';
import { scopeRoot, sanitizeFolderName, mediaDirOf, imageFileName, DATA_FILE, FOLDER_META, NOMEDIA_FILE } from '../src/storage/folderLayout';
import {
  setWritesEnabled,
  installWriteHooks,
  flushAllWrites,
  markEverythingDirty,
  resetWriterCaches,
  hasPendingWrites,
  peekPending,
  setWriteErrorHandler,
} from '../src/storage/writer';
import { buildSampleBank, seedFixture, clearBank, TINY_PNG_B64, type SampleBank } from './fixtures/sampleBank';

const SCOPES: CqScope[] = ['type', 'chapter'];

/** ফিক্সচারের কোন টপিকের ফোল্ডার কোথায় (Chapter CQ-তে ডিফল্ট টপিকের নিজের ফোল্ডার নেই - অধ্যায়-ফোল্ডারই) */
function dirOf(scope: CqScope, bank: SampleBank, topicId: string): string {
  const t = bank.topics.find((x) => x.id === topicId)!;
  const ch = bank.chapters.find((c) => c.id === t.chapterId)!;
  const sub = bank.subjects.find((s) => s.id === ch.subjectId)!;
  const base = `${scopeRoot(scope)}/${sanitizeFolderName(sub.name)}/${sanitizeFolderName(ch.name)}`;
  return scope === 'type' ? `${base}/${sanitizeFolderName(t.name)}` : base;
}
const subjectDir = (scope: CqScope, name: string) => `${scopeRoot(scope)}/${sanitizeFolderName(name)}`;

/** JSON-এ যাওয়ার পর যেমন দেখায় (undefined ঘর বাদ) */
const jsonOf = <T>(v: T): T => JSON.parse(JSON.stringify(v));

async function boot() {
  setWritesEnabled(false);
  setWriteErrorHandler(null);
  for (const s of SCOPES) await clearBank(getDb(s));
  await flushAllWrites(); // আগের টেস্টের জমা কাজ থাকলে ঝেড়ে ফেলা (ডেটাবেস খালি, তাই কিছু লেখে না)
  fs.resetFs();
  resetWriterCaches();
}

/** পুরো নমুনা বসিয়ে প্রথমবার সব ফোল্ডারে লেখা (ফোল্ডার সিঙ্ক চালুর মতো) */
async function seedAndWrite(scope: CqScope) {
  await boot();
  installWriteHooks();
  const bank = buildSampleBank(scope);
  const d = getDb(scope);
  await seedFixture(d, bank); // এখনো লেখা বন্ধ - hook কিছু জমায় না
  setWritesEnabled(true);
  await markEverythingDirty(scope);
  await flushAllWrites(true);
  return { d, bank, api: getApi(scope) };
}

beforeEach(async () => {
  await boot();
});

describe.each(SCOPES)('প্রথম লেখা: ফোল্ডার ও data.json (%s)', (scope) => {
  it('বিষয়/অধ্যায়(/টপিক) ফোল্ডার তৈরি, প্রতিটিতে .folder.json (id, kind, name, order)', async () => {
    const { bank } = await seedAndWrite(scope);
    for (const s of bank.subjects) {
      const meta = fs.fileJson(`${subjectDir(scope, s.name)}/${FOLDER_META}`);
      expect(meta).toEqual({ id: s.id, kind: 'subject', name: s.name, order: s.order });
    }
    for (const c of bank.chapters) {
      const sub = bank.subjects.find((s) => s.id === c.subjectId)!;
      const meta = fs.fileJson(`${subjectDir(scope, sub.name)}/${sanitizeFolderName(c.name)}/${FOLDER_META}`);
      expect(meta).toEqual({ id: c.id, kind: 'chapter', name: c.name, order: c.order });
    }
    if (scope === 'type') {
      for (const t of bank.topics) {
        const meta = fs.fileJson(`${dirOf(scope, bank, t.id)}/${FOLDER_META}`);
        expect(meta).toEqual({ id: t.id, kind: 'topic', name: t.name, order: t.order });
      }
    } else {
      // Chapter CQ: লুকানো ডিফল্ট টপিকের কোনো ফোল্ডার নেই
      expect(fs.listDirs(scopeRoot(scope)).some((d) => d.endsWith('/ডিফল্ট'))).toBe(false);
    }
  });

  it('প্রতিটি টপিকের data.json: গঠন + উদ্দীপক/প্রশ্নের প্রতিটি ঘর ডেটাবেসের সাথে হুবহু', async () => {
    const { d, bank } = await seedAndWrite(scope);
    for (const t of bank.topics) {
      const file = fs.fileJson(`${dirOf(scope, bank, t.id)}/${DATA_FILE}`);
      expect(file).toBeTruthy();
      expect(file.version).toBe('2.0');
      expect(file.type).toBe('qb-topic-data');
      expect(file.scope).toBe(scope);
      expect(file.topic).toEqual({ id: t.id, chapterId: t.chapterId, name: t.name, order: t.order });

      const dbStim = jsonOf(await d.stimuli.where('topicId').equals(t.id).toArray()).sort((a: any, b: any) => a.id.localeCompare(b.id));
      const fileStim = [...file.stimuli].sort((a: any, b: any) => a.id.localeCompare(b.id));
      expect(fileStim).toEqual(dbStim);

      const dbQ = jsonOf(await d.questions.where('topicId').equals(t.id).toArray()).sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
      expect(file.questions).toEqual(dbQ);
    }
  });

  it('প্রশ্নগুলো order অনুযায়ী সাজানো যায়', async () => {
    const { bank } = await seedAndWrite(scope);
    const file = fs.fileJson(`${dirOf(scope, bank, bank.topics[0].id)}/${DATA_FILE}`);
    const orders = file.questions.map((q: any) => q.order);
    expect(orders).toEqual([...orders].sort((a: number, b: number) => a - b));
    expect(file.questions.map((q: any) => q.type)).toEqual(['ক', 'খ', 'গ', 'ঘ']);
  });
});

describe.each(SCOPES)('media/ ছবি ও .nomedia (%s)', (scope) => {
  it('ব্যবহৃত প্রতিটি ছবি media/<id>.webp-তে, বিষয়বস্তু হুবহু; data.json-এর images তালিকা মেলে', async () => {
    const { bank } = await seedAndWrite(scope);
    const topicA = bank.topics[0].id;
    const media = mediaDirOf(dirOf(scope, bank, topicA));
    // topicA-র ছবি: উদ্দীপক ১-এর দুটো + ঘ-প্রশ্নের সমাধান-ছবি
    for (const img of bank.images.filter((i) => i.topicId === topicA)) {
      expect(fs.fileBase64(`${media}/${imageFileName(img.id)}`)).toBe(img.base64);
    }
    const file = fs.fileJson(`${dirOf(scope, bank, topicA)}/${DATA_FILE}`);
    const ids = file.images.map((i: any) => i.id).sort();
    expect(ids).toEqual(bank.images.filter((i) => i.topicId === topicA).map((i) => i.id).sort());
    for (const m of file.images) expect(m.fileName).toMatch(/\.png$/); // মূল ফাইলের নাম রেকর্ডে থাকে
  });

  it('প্রতিটি টপিকের media/-তে .nomedia (ছবি না থাকলেও)', async () => {
    const { bank } = await seedAndWrite(scope);
    for (const t of bank.topics) {
      expect(fs.fileText(`${mediaDirOf(dirOf(scope, bank, t.id))}/${NOMEDIA_FILE}`)).toBe('');
    }
  });

  it('লেখার পর ডেটাবেসের ছবির সারি blob ছাড়া, topicId বসা', async () => {
    const { d, bank } = await seedAndWrite(scope);
    for (const img of bank.images) {
      const rec = await d.images.get(img.id);
      expect(rec).toBeTruthy();
      expect(rec.blob).toBeUndefined();
      expect(rec.topicId).toBe(img.topicId);
    }
  });
});

describe.each(SCOPES)('একই কিছু আবার লিখলে ফাইল আবার লেখা হয় না (%s)', (scope) => {
  it('দ্বিতীয় সম্পূর্ণ লেখায় data.json / ছবি / .folder.json কিছুই আবার লেখা হয় না', async () => {
    const { bank } = await seedAndWrite(scope);
    fs.clearOpLog();
    await markEverythingDirty(scope);
    await flushAllWrites(true);
    expect(fs.countOps('writeTextSafe')).toBe(0);
    expect(fs.countOps('writeBase64')).toBe(0);
    expect(fs.countOps('writeText')).toBe(0);
    expect(fs.countOps('renamePath')).toBe(0);
    expect(fs.countOps('removeDir')).toBe(0);
    expect(fs.listFiles(scopeRoot(scope)).length).toBeGreaterThan(bank.topics.length);
  });
});

describe.each(SCOPES)('বদল -> হুক -> ফোল্ডার (%s)', (scope) => {
  it('বিষয়ের নাম বদলালে ফোল্ডারের নাম বদলায়, ভেতরের ফাইল সাথে যায়, .folder.json-এ নতুন নাম', async () => {
    const { bank, api } = await seedAndWrite(scope);
    const sub = bank.subjects[0];
    await api.updateSubject(sub.id, 'পদার্থ ১ম');
    expect(hasPendingWrites()).toBe(true);
    await flushAllWrites(true);
    expect(await fs.statPath(subjectDir(scope, sub.name))).toBeNull();
    expect(fs.fileJson(`${subjectDir(scope, 'পদার্থ ১ম')}/${FOLDER_META}`)).toEqual({ id: sub.id, kind: 'subject', name: 'পদার্থ ১ম', order: sub.order });
    // ভেতরের অধ্যায়ের data.json নতুন পথে আছে
    const ch = bank.chapters[0];
    const topicA = bank.topics[0];
    const newDir = scope === 'type'
      ? `${subjectDir(scope, 'পদার্থ ১ম')}/${sanitizeFolderName(ch.name)}/${sanitizeFolderName(topicA.name)}`
      : `${subjectDir(scope, 'পদার্থ ১ম')}/${sanitizeFolderName(ch.name)}`;
    expect(fs.fileJson(`${newDir}/${DATA_FILE}`)?.topic.id).toBe(topicA.id);
  });

  it('অধ্যায় অন্য বিষয়ে সরালে ফোল্ডারও সরে (ছবিসহ), পুরনো জায়গায় কিছু থাকে না', async () => {
    const { d, bank } = await seedAndWrite(scope);
    const ch = bank.chapters[0]; // ভৌতজগৎ ও পরিমাপ (ছবিসহ)
    const newSub = bank.subjects[1];
    await d.chapters.update(ch.id, { subjectId: newSub.id });
    await flushAllWrites(true);
    const oldBase = `${subjectDir(scope, bank.subjects[0].name)}/${sanitizeFolderName(ch.name)}`;
    expect(await fs.statPath(oldBase)).toBeNull();
    const topicA = bank.topics[0];
    const newDir = scope === 'type'
      ? `${subjectDir(scope, newSub.name)}/${sanitizeFolderName(ch.name)}/${sanitizeFolderName(topicA.name)}`
      : `${subjectDir(scope, newSub.name)}/${sanitizeFolderName(ch.name)}`;
    expect(fs.fileJson(`${newDir}/${DATA_FILE}`)?.topic.id).toBe(topicA.id);
    const img = bank.images.find((i) => i.topicId === topicA.id)!;
    expect(fs.fileBase64(`${mediaDirOf(newDir)}/${imageFileName(img.id)}`)).toBe(img.base64);
  });

  it('একই নামের ভাই-ফোল্ডার: দ্বিতীয়টা "নাম (2)" হয়', async () => {
    const { bank, api } = await seedAndWrite(scope);
    const s2 = await api.addSubject(bank.subjects[0].name);
    await flushAllWrites(true);
    const meta = fs.fileJson(`${subjectDir(scope, `${bank.subjects[0].name} (2)`)}/${FOLDER_META}`);
    expect(meta?.id).toBe(s2.id);
  });

  it('প্রশ্ন বদলালে শুধু ওই টপিকের data.json আবার লেখা হয়', async () => {
    const { d, bank } = await seedAndWrite(scope);
    fs.clearOpLog();
    await d.questions.update(bank.questions[0].id, { questionText: 'বদলানো প্রশ্ন' });
    expect(peekPending(scope).topics.has(bank.questions[0].topicId)).toBe(true);
    await flushAllWrites(true);
    const writes = fs.opLog.filter((o) => o.op === 'writeTextSafe').map((o) => o.path);
    expect(writes).toEqual([`${dirOf(scope, bank, bank.questions[0].topicId)}/${DATA_FILE}`]);
    const file = fs.fileJson(`${dirOf(scope, bank, bank.questions[0].topicId)}/${DATA_FILE}`);
    expect(file.questions.find((q: any) => q.id === bank.questions[0].id).questionText).toBe('বদলানো প্রশ্ন');
    expect(hasPendingWrites()).toBe(false);
  });

  it('নতুন গ্রুপ সেভ (saveQuestionGroup) ফোল্ডারে যায়', async () => {
    const { bank, api } = await seedAndWrite(scope);
    const topicA = bank.topics[0].id;
    await api.saveQuestionGroup({
      topicId: topicA,
      stimulusText: 'নতুন উদ্দীপক',
      stimulusImageIds: [],
      questions: [{ type: 'ক', marks: 1, questionText: 'নতুন ক', solutionText: '', solutionImageIds: [], rating: 1, usedInBoards: [] }],
    });
    await flushAllWrites(true);
    const file = fs.fileJson(`${dirOf(scope, bank, topicA)}/${DATA_FILE}`);
    expect(file.stimuli.some((s: any) => s.text === 'নতুন উদ্দীপক')).toBe(true);
    expect(file.questions.some((q: any) => q.questionText === 'নতুন ক')).toBe(true);
  });
});

describe.each(SCOPES)('মোছা (%s)', (scope) => {
  it('প্রশ্ন মুছলে data.json থেকে যায়, আর কেউ না ধরা ছবির ফাইলও মোছে; অন্য ছবি থাকে', async () => {
    const { d, bank, api } = await seedAndWrite(scope);
    const topicA = bank.topics[0].id;
    await api.deleteQuestion(bank.questions.find((q) => q.id.endsWith('q1_gha'))!.id);
    await flushAllWrites(true);
    const file = fs.fileJson(`${dirOf(scope, bank, topicA)}/${DATA_FILE}`);
    expect(file.questions.some((q: any) => q.id.endsWith('q1_gha'))).toBe(false);
    const media = mediaDirOf(dirOf(scope, bank, topicA));
    const solImg = bank.images.find((i) => i.id.endsWith('img_sol_gha'))!;
    expect(await d.images.get(solImg.id)).toBeUndefined();
    expect(fs.fileBase64(`${media}/${imageFileName(solImg.id)}`)).toBeUndefined();
    for (const keep of bank.images.filter((i) => i.topicId === topicA && i.id !== solImg.id)) {
      expect(fs.fileBase64(`${media}/${imageFileName(keep.id)}`)).toBe(keep.base64);
    }
  });

  it('বিষয় মুছলে ফোল্ডার ও ভেতরের সব মোছে, সিঙ্ক-অবস্থার সারিও; অন্য বিষয় অক্ষত', async () => {
    const { d, bank, api } = await seedAndWrite(scope);
    const sub = bank.subjects[1]; // রসায়ন
    const keepDir = dirOf(scope, bank, bank.topics[0].id);
    const before = fs.listFiles(keepDir);
    await api.deleteSubject(sub.id);
    await flushAllWrites(true);
    expect(await fs.statPath(subjectDir(scope, sub.name))).toBeNull();
    expect(fs.listFiles(subjectDir(scope, sub.name))).toEqual([]);
    expect(await d.syncState.get(sub.id)).toBeUndefined();
    expect(await d.syncState.get(bank.chapters[2].id)).toBeUndefined();
    expect(fs.listFiles(keepDir)).toEqual(before);
  });
});

describe.each(SCOPES)('প্রশ্ন অন্য টপিকে সরানো / কপির ছবি (%s)', (scope) => {
  it('প্রশ্ন সরালে ছবি নতুন টপিকের media/-তে যায়, পুরনো ফাইল সরে, সারির topicId বদলায়', async () => {
    const { d, bank } = await seedAndWrite(scope);
    const topicA = bank.topics[0].id;
    const topicB = bank.topics[1].id;
    const q = bank.questions.find((x) => x.id.endsWith('q1_gha'))!;
    const img = bank.images.find((i) => i.id.endsWith('img_sol_gha'))!;
    await d.questions.update(q.id, { topicId: topicB });
    await flushAllWrites(true);
    const newFile = `${mediaDirOf(dirOf(scope, bank, topicB))}/${imageFileName(img.id)}`;
    const oldFile = `${mediaDirOf(dirOf(scope, bank, topicA))}/${imageFileName(img.id)}`;
    expect(fs.fileBase64(newFile)).toBe(img.base64);
    expect(fs.fileBase64(oldFile)).toBeUndefined();
    expect((await d.images.get(img.id)).topicId).toBe(topicB);
    expect(fs.fileJson(`${dirOf(scope, bank, topicB)}/${DATA_FILE}`).questions.some((x: any) => x.id === q.id)).toBe(true);
    expect(fs.fileJson(`${dirOf(scope, bank, topicA)}/${DATA_FILE}`).questions.some((x: any) => x.id === q.id)).toBe(false);
  });

  it('কপি (একই ছবির id, মূল প্রশ্ন থেকে যায়): দুই টপিকেই ছবির ফাইল থাকে', async () => {
    const { d, bank } = await seedAndWrite(scope);
    const topicA = bank.topics[0].id;
    const topicB = bank.topics[1].id;
    const q = bank.questions.find((x) => x.id.endsWith('q1_gha'))!;
    const img = bank.images.find((i) => i.id.endsWith('img_sol_gha'))!;
    await d.questions.add({ ...q, id: `${q.id}_copy`, topicId: topicB, stimulusId: undefined, order: 99 });
    await flushAllWrites(true);
    expect(fs.fileBase64(`${mediaDirOf(dirOf(scope, bank, topicA))}/${imageFileName(img.id)}`)).toBe(img.base64);
    expect(fs.fileBase64(`${mediaDirOf(dirOf(scope, bank, topicB))}/${imageFileName(img.id)}`)).toBe(img.base64);
    expect((await d.images.get(img.id)).topicId).toBe(topicA); // মালিক বদলায়নি
  });
});

describe.each(SCOPES)('লেখা ব্যর্থ হলে (%s)', (scope) => {
  it('strict লেখায় ত্রুটি ছোঁড়ে, কাজ সারিতে ফেরে; ব্যর্থতা সরলে পরের লেখায় ঠিক হয়', async () => {
    const { d, bank } = await seedAndWrite(scope);
    const q = bank.questions[0];
    await d.questions.update(q.id, { questionText: 'ব্যর্থতার পরের লেখা' });
    fs.setFailRule((op, p) => op === 'writeTextSafe' && p.endsWith(`/${DATA_FILE}`));
    await expect(flushAllWrites(true)).rejects.toThrow();
    expect(hasPendingWrites()).toBe(true); // কাজ হারায়নি
    // আগের data.json অক্ষত (পুরনো লেখাই)
    const file = fs.fileJson(`${dirOf(scope, bank, q.topicId)}/${DATA_FILE}`);
    expect(file.questions.find((x: any) => x.id === q.id).questionText).toBe(q.questionText);
    fs.setFailRule(null);
    await flushAllWrites(true);
    expect(hasPendingWrites()).toBe(false);
    const after = fs.fileJson(`${dirOf(scope, bank, q.topicId)}/${DATA_FILE}`);
    expect(after.questions.find((x: any) => x.id === q.id).questionText).toBe('ব্যর্থতার পরের লেখা');
  });

  it('[বৈশিষ্ট্য-নথি, সমস্যা ১] strict ছাড়া লেখা ব্যর্থ হলে flushAllWrites নিজে ত্রুটি ছোঁড়ে না - শুধু ত্রুটি-হ্যান্ডলারে জানায়', async () => {
    const { d, bank } = await seedAndWrite(scope);
    const q = bank.questions[0];
    const errors: string[] = [];
    setWriteErrorHandler((m) => errors.push(m));
    await d.questions.update(q.id, { questionText: 'x' });
    fs.setFailRule((op, p) => op === 'writeTextSafe' && p.endsWith(`/${DATA_FILE}`));
    await expect(flushAllWrites()).resolves.toBeUndefined(); // তাই অটো সিঙ্ক রিবনে সবুজ আসতে পারে (সমস্যা ১)
    expect(errors.length).toBeGreaterThan(0);
    expect(hasPendingWrites()).toBe(true);
    fs.setFailRule(null);
    setWriteErrorHandler(null);
    await flushAllWrites(true);
  });
});
