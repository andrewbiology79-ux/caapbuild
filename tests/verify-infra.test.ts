// যাচাই-পরিকল্পনা ধাপ ১: পরিকাঠামো নিজে ঠিক কি না — নকল ফাইল-সিস্টেম ও নমুনা ডেটা।
import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('../src/storage/nativeStore', async () => await import('./stubs/memoryStore'));
import * as native from '../src/storage/nativeStore';
import * as fs from './stubs/memoryStore';
import { getDb } from '../src/db/db';
import { buildSampleBank, seedFixture, clearBank, questionsOfStimulus, TINY_PNG_B64 } from './fixtures/sampleBank';

beforeEach(() => fs.resetFs());

describe('নকল ফাইল-সিস্টেম (nativeStore-এর বদলি)', () => {
  it('vi.mock কাজ করছে: nativeStore এখন নকলটাই', async () => {
    expect(native.isNativeApp()).toBe(true);
    await native.writeText('A/b.txt', 'হ্যালো');
    expect(fs.fileText('A/b.txt')).toBe('হ্যালো');
  });

  it('writeText/readText/pathExists/statPath', async () => {
    await native.writeText('R/x/y.txt', 'abc');
    expect(await native.readText('R/x/y.txt')).toBe('abc');
    expect(await native.readText('R/nai.txt')).toBeNull();
    expect(await native.pathExists('R/x')).toBe(true); // মাঝের ফোল্ডার নিজে তৈরি
    expect((await native.statPath('R/x'))?.isDir).toBe(true);
    expect((await native.statPath('R/x/y.txt'))?.size).toBe(3);
    expect(await native.statPath('R/nai')).toBeNull();
  });

  it('base64 লেখা-পড়া', async () => {
    await native.writeBase64('R/m/a.png', TINY_PNG_B64);
    expect(await native.readBase64('R/m/a.png')).toBe(TINY_PNG_B64);
  });

  it('writeTextSafe: প্রথমবার ফাইল, দ্বিতীয়বার আগেরটা .bak-এ, .tmp থাকে না', async () => {
    await native.writeTextSafe('R/data.json', 'এক');
    expect(fs.fileText('R/data.json')).toBe('এক');
    expect(fs.fileText('R/data.json.bak')).toBeUndefined();
    await native.writeTextSafe('R/data.json', 'দুই');
    expect(fs.fileText('R/data.json')).toBe('দুই');
    expect(fs.fileText('R/data.json.bak')).toBe('এক');
    expect(fs.fileText('R/data.json.tmp')).toBeUndefined();
  });

  it('writeTextSafe ব্যর্থ হলে আগের ফাইল অক্ষত', async () => {
    await native.writeTextSafe('R/data.json', 'পুরনো');
    fs.setFailRule((op, p) => op === 'renamePath' && p.endsWith('.tmp'));
    await expect(native.writeTextSafe('R/data.json', 'নতুন')).rejects.toThrow();
    fs.setFailRule(null);
    expect(fs.fileText('R/data.json')).toBe('পুরনো');
  });

  it('renamePath: ফাইল ও ফোল্ডার (ভেতরের সবসহ)', async () => {
    await native.writeText('R/old/a.txt', '1');
    await native.writeText('R/old/sub/b.txt', '2');
    await native.renamePath('R/old', 'R/new');
    expect(fs.listFiles('R')).toEqual(['R/new/a.txt', 'R/new/sub/b.txt']);
    expect(await native.pathExists('R/old')).toBe(false);
  });

  it('removeDir / removeFile / copyFile', async () => {
    await native.writeText('R/d/a.txt', '1');
    await native.writeText('R/d/b.txt', '2');
    await native.copyFile('R/d/a.txt', 'R/c.txt');
    expect(fs.fileText('R/c.txt')).toBe('1');
    await native.removeFile('R/d/a.txt');
    expect(fs.listFiles('R/d')).toEqual(['R/d/b.txt']);
    await native.removeDir('R/d');
    expect(await native.pathExists('R/d')).toBe(false);
    await native.removeDir('R/nai'); // নেই — ত্রুটি নয়
  });

  it('scanTree: নেই হলে exists=false; আছে হলে মূলের ভেতরের আপেক্ষিক পথ; .folder.json-এর লেখা t-তে; ডট-ফোল্ডারে ঢোকে না', async () => {
    expect((await native.scanTree('Root')).exists).toBe(false);
    await native.writeText('Root/পদার্থ/.folder.json', '{"id":"s1"}');
    await native.writeText('Root/পদার্থ/অধ্যায়/data.json', '{}');
    await native.writeText('Root/.hidden/secret.txt', 'x');
    const r = await native.scanTree('Root');
    expect(r.exists).toBe(true);
    const byP = new Map(r.entries.map((e) => [e.p, e]));
    expect(byP.get('পদার্থ')?.d).toBe(true);
    expect(byP.get('পদার্থ/.folder.json')?.t).toBe('{"id":"s1"}');
    expect(byP.get('পদার্থ/অধ্যায়/data.json')?.d).toBe(false);
    expect(byP.has('.hidden')).toBe(true);
    expect(byP.has('.hidden/secret.txt')).toBe(false);
  });

  it('ব্যর্থতা ঢোকানো ও অপারেশন-লগ', async () => {
    fs.setFailRule((op, p) => op === 'writeText' && p.includes('bad'));
    await expect(native.writeText('R/bad.txt', 'x')).rejects.toThrow();
    await native.writeText('R/good.txt', 'x');
    expect(fs.countOps('writeText', 'R')).toBe(2);
    expect(fs.listFiles('R')).toEqual(['R/good.txt']);
  });

  it('externalDelete / externalRename লগে ঢোকে না (ফাইল-ম্যানেজারের কাজ নকল)', async () => {
    await native.writeText('R/a/x.txt', '1');
    fs.clearOpLog();
    fs.externalRename('R/a', 'R/b');
    fs.externalDelete('R/b/x.txt');
    expect(fs.opLog.length).toBe(0);
    expect(fs.listFiles('R')).toEqual([]);
  });
});

describe.each(['type', 'chapter'] as const)('নমুনা ডেটা (%s)', (scope) => {
  const bank = buildSampleBank(scope);

  it('সব id একক ও পারস্পরিক সংযোগ ঠিক', () => {
    const ids = [...bank.subjects, ...bank.chapters, ...bank.topics, ...bank.stimuli, ...bank.questions, ...bank.images].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    const has = (arr: { id: string }[], i: string) => arr.some((x) => x.id === i);
    for (const c of bank.chapters) expect(has(bank.subjects, c.subjectId)).toBe(true);
    for (const t of bank.topics) expect(has(bank.chapters, t.chapterId)).toBe(true);
    for (const s of bank.stimuli) {
      expect(has(bank.topics, s.topicId)).toBe(true);
      for (const im of s.imageIds) expect(has(bank.images, im)).toBe(true);
    }
    for (const q of bank.questions) {
      expect(has(bank.topics, q.topicId)).toBe(true);
      if (q.stimulusId) {
        const s = bank.stimuli.find((x) => x.id === q.stimulusId)!;
        expect(s.topicId).toBe(q.topicId);
      }
      for (const im of q.solutionImageIds) expect(has(bank.images, im)).toBe(true);
    }
    for (const im of bank.images) expect(has(bank.topics, im.topicId!)).toBe(true);
  });

  it('সব ক-ঘ ধরন, একক প্রশ্ন, অসম্পূর্ণ গ্রুপ, বোর্ড, রেটিং ১-৫, সমাধান-ছবি, imageTopCount আছে', () => {
    expect(new Set(bank.questions.map((q) => q.type))).toEqual(new Set(['ক', 'খ', 'গ', 'ঘ']));
    expect(bank.questions.some((q) => !q.stimulusId)).toBe(true);
    expect(questionsOfStimulus(bank, bank.stimuli[0].id).map((q) => q.type)).toEqual(['ক', 'খ', 'গ', 'ঘ']);
    expect(questionsOfStimulus(bank, bank.stimuli[1].id).map((q) => q.type)).toEqual(['ক', 'ঘ']);
    expect(new Set(bank.questions.map((q) => q.rating))).toEqual(new Set([1, 2, 3, 5]));
    expect(bank.questions.some((q) => q.usedInBoards.length > 1)).toBe(true);
    expect(bank.questions.some((q) => q.solutionImageIds.length > 0)).toBe(true);
    expect(bank.stimuli[0].imageTopCount).toBe(1);
  });

  it('Chapter CQ-তে প্রতি অধ্যায়ে একটাই লুকানো টপিক; Type CQ-তে একাধিক', () => {
    const per = bank.chapters.map((c) => bank.topics.filter((t) => t.chapterId === c.id).length);
    if (scope === 'chapter') expect(per).toEqual([1, 1, 1]);
    else expect(Math.max(...per)).toBeGreaterThan(1);
  });

  it('দুই স্কোপের id মেশে না', () => {
    const other = buildSampleBank(scope === 'type' ? 'chapter' : 'type');
    const mine = new Set(bank.questions.map((q) => q.id));
    expect(other.questions.some((q) => mine.has(q.id))).toBe(false);
  });
});

describe('ফিক্সচার -> ডেটাবেস (fake-indexeddb)', () => {
  it.each(['type', 'chapter'] as const)('%s: বসানো ও ফেরত পড়া, দুই ডেটাবেস আলাদা', async (scope) => {
    const d = getDb(scope);
    const other = getDb(scope === 'type' ? 'chapter' : 'type');
    await clearBank(d);
    await clearBank(other);
    const bank = buildSampleBank(scope);
    await seedFixture(d, bank);
    expect(await d.questions.count()).toBe(bank.questions.length);
    expect(await d.stimuli.count()).toBe(bank.stimuli.length);
    expect(await d.images.count()).toBe(bank.images.length);
    expect(await other.questions.count()).toBe(0); // অন্য স্কোপে কিছু যায়নি
    const q = await d.questions.get(bank.questions[3].id);
    expect(q).toEqual(bank.questions[3]);
    const im = await d.images.get(bank.images[0].id);
    expect(im?.blob).toBeInstanceOf(Blob);
    await clearBank(d);
    expect(await d.questions.count()).toBe(0);
  });
});
