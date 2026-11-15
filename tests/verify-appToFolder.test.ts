// যাচাই-পরিকল্পনা ধাপ ৩: মেনুর "অ্যাপ থেকে ফোল্ডারে সিঙ্ক করুন" (প্রিভিউ + জোর করে সব লেখা), দুই স্কোপে।
// আলাদা ফাইল: syncRun.ts -> syncEngine.ts -> অনেক মডিউল টানে; কোনো ইমপোর্ট ভাঙলে যেন verify-writer ফেল না হয়।
import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('../src/storage/nativeStore', async () => await import('./stubs/memoryStore'));
import './stubs/fileReaderPolyfill';
import * as fs from './stubs/memoryStore';
import { getDb, type CqScope } from '../src/db/db';
import { scopeRoot, sanitizeFolderName, DATA_FILE } from '../src/storage/folderLayout';
import { flushAllWrites, resetWriterCaches, setWritesEnabled } from '../src/storage/writer';
import { previewAppToFolder } from '../src/storage/syncPreview';
import { defaultSyncDeps } from '../src/storage/syncRun';
import { isSyncPaused } from '../src/storage/syncEngine';
import { buildSampleBank, seedFixture, clearBank, type SampleBank } from './fixtures/sampleBank';

const SCOPES: CqScope[] = ['type', 'chapter'];

function topicDir(scope: CqScope, bank: SampleBank, topicId: string): string {
  const t = bank.topics.find((x) => x.id === topicId)!;
  const ch = bank.chapters.find((c) => c.id === t.chapterId)!;
  const sub = bank.subjects.find((s) => s.id === ch.subjectId)!;
  const base = `${scopeRoot(scope)}/${sanitizeFolderName(sub.name)}/${sanitizeFolderName(ch.name)}`;
  return scope === 'type' ? `${base}/${sanitizeFolderName(t.name)}` : base;
}

const jsonOf = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** দুই স্কোপেই নমুনা বসানো, ফোল্ডার একদম খালি */
async function setup() {
  setWritesEnabled(false);
  for (const s of SCOPES) await clearBank(getDb(s));
  await flushAllWrites();
  fs.resetFs();
  resetWriterCaches();
  const banks = {} as Record<CqScope, SampleBank>;
  for (const s of SCOPES) {
    banks[s] = buildSampleBank(s);
    await seedFixture(getDb(s), banks[s]);
  }
  return banks;
}

beforeEach(() => {
  fs.resetFs();
});

describe.each(SCOPES)('অ্যাপ থেকে ফোল্ডারে সিঙ্ক (%s উইন্ডো)', (scope) => {
  const other: CqScope = scope === 'type' ? 'chapter' : 'type';

  it('খালি ফোল্ডারে: প্রিভিউয়ে বদল দেখায় -> সিঙ্কে সব লেখা হয় (data.json হুবহু) -> আবার প্রিভিউ খালি', async () => {
    const banks = await setup();
    const bank = banks[scope];
    const pre = await previewAppToFolder(undefined, scope);
    expect(pre.errors).toEqual([]);
    expect(pre.empty).toBe(false);
    expect(fs.listFiles(scopeRoot(scope))).toEqual([]); // প্রিভিউ কিছু লেখে না

    await defaultSyncDeps.run('app-to-folder', pre, () => {}, () => {});

    const d = getDb(scope);
    for (const t of bank.topics) {
      const file = fs.fileJson(`${topicDir(scope, bank, t.id)}/${DATA_FILE}`);
      expect(file?.topic.id).toBe(t.id);
      const dbQ = jsonOf(await d.questions.where('topicId').equals(t.id).toArray()).sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
      expect(file.questions).toEqual(dbQ);
    }
    const after = await previewAppToFolder(undefined, scope);
    expect(after.errors).toEqual([]);
    expect(after.conflicts).toEqual([]);
    expect(after.empty).toBe(true);
  });

  it('শুধু এই উইন্ডোর স্কোপ লেখা হয়: অন্য স্কোপের ফোল্ডার ছোঁয়া হয় না', async () => {
    await setup();
    const pre = await previewAppToFolder(undefined, scope);
    await defaultSyncDeps.run('app-to-folder', pre, () => {}, () => {});
    expect(fs.listFiles(scopeRoot(scope)).length).toBeGreaterThan(0);
    expect(fs.listFiles(scopeRoot(other))).toEqual([]);
  });

  it('ফোল্ডারের data.json হাতে মুছে ফেললে প্রিভিউ বদল দেখায়, সিঙ্কে ফিরে আসে', async () => {
    const banks = await setup();
    const bank = banks[scope];
    await defaultSyncDeps.run('app-to-folder', await previewAppToFolder(undefined, scope), () => {}, () => {});
    const file = `${topicDir(scope, bank, bank.topics[0].id)}/${DATA_FILE}`;
    expect(fs.fileText(file)).toBeTruthy();
    fs.externalDelete(file);

    const pre = await previewAppToFolder(undefined, scope);
    expect(pre.empty).toBe(false);
    await defaultSyncDeps.run('app-to-folder', pre, () => {}, () => {});
    expect(fs.fileJson(file)?.topic.id).toBe(bank.topics[0].id);
  });

  it('লেখা ব্যর্থ হলে ত্রুটি ছোঁড়ে, আর অটো স্ক্যান আটকে থাকে না (pause ঠিকমতো খোলে)', async () => {
    await setup();
    const pre = await previewAppToFolder(undefined, scope);
    fs.setFailRule((op, p) => op === 'writeTextSafe' && p.endsWith(`/${DATA_FILE}`));
    await expect(defaultSyncDeps.run('app-to-folder', pre, () => {}, () => {})).rejects.toThrow();
    expect(isSyncPaused()).toBe(false);
    fs.setFailRule(null);
    // ব্যর্থতার পর আবার চালালে ঠিক হয়
    await defaultSyncDeps.run('app-to-folder', await previewAppToFolder(undefined, scope), () => {}, () => {});
    expect(fs.listFiles(scopeRoot(scope)).some((f) => f.endsWith(`/${DATA_FILE}`))).toBe(true);
  });
});
