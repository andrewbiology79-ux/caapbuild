// যাচাই-পরিকল্পনা ধাপ ৪: ফোল্ডার -> অ্যাপ (scanner.ts + মেনুর "ফোল্ডার থেকে সিঙ্ক করুন"), Type CQ ও Chapter CQ দুই স্কোপে।
// আসল scanner / syncPreview / syncRun চলে; ফোল্ডার = নকল ফাইল-সিস্টেম, ডেটাবেস = fake-indexeddb।
import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('../src/storage/nativeStore', async () => await import('./stubs/memoryStore'));
// মেনুর সিঙ্ক চালাতে "ফোনের অ্যাপ" আর "ফোল্ডার সিঙ্ক চালু" দরকার
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
  registerPlugin: () => ({}),
}));
import './stubs/fileReaderPolyfill';
import * as fs from './stubs/memoryStore';
import { getDb, type CqScope } from '../src/db/db';
import { scopeRoot, sanitizeFolderName, DATA_FILE, FOLDER_META } from '../src/storage/folderLayout';
import { flushAllWrites, markEverythingDirty, resetWriterCaches, setWritesEnabled } from '../src/storage/writer';
import { scanScope } from '../src/storage/scanner';
import { previewFolderToApp } from '../src/storage/syncPreview';
import { defaultSyncDeps } from '../src/storage/syncRun';
import { buildSampleBank, seedFixture, clearBank, type SampleBank } from './fixtures/sampleBank';

const SCOPES: CqScope[] = ['type', 'chapter'];

// নকল localStorage (Node-এ নেই): isFolderSyncEnabled এটা পড়ে
const store: Record<string, string> = { qb_folder_sync_enabled: '1' };
(globalThis as any).localStorage = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => {
    store[k] = String(v);
  },
  removeItem: (k: string) => {
    delete store[k];
  },
};

function topicDir(scope: CqScope, bank: SampleBank, topicId: string): string {
  const t = bank.topics.find((x) => x.id === topicId)!;
  const ch = bank.chapters.find((c) => c.id === t.chapterId)!;
  const sub = bank.subjects.find((s) => s.id === ch.subjectId)!;
  const base = `${scopeRoot(scope)}/${sanitizeFolderName(sub.name)}/${sanitizeFolderName(ch.name)}`;
  return scope === 'type' ? `${base}/${sanitizeFolderName(t.name)}` : base;
}
const subjectDir = (scope: CqScope, name: string) => `${scopeRoot(scope)}/${sanitizeFolderName(name)}`;
const jsonOf = <T>(v: T): T => JSON.parse(JSON.stringify(v));

async function boot() {
  setWritesEnabled(false);
  for (const s of SCOPES) await clearBank(getDb(s));
  await flushAllWrites();
  fs.resetFs();
  resetWriterCaches();
}

/** নমুনা বসিয়ে ফোল্ডারে লেখা (অ্যাপ -> ফোল্ডার), তারপর ডেটাবেস ও ফোল্ডার মিলানো অবস্থা */
async function seedAndWrite(scope: CqScope) {
  await boot();
  const bank = buildSampleBank(scope);
  const d = getDb(scope);
  await seedFixture(d, bank);
  await markEverythingDirty(scope);
  await flushAllWrites(true);
  return { d, bank };
}

function editData(path: string, fn: (j: any) => void) {
  const j = fs.fileJson(path)!;
  fn(j);
  fs.seedText(path, JSON.stringify(j, null, 2)); // নতুন mtime পায়
}

function copyTree(from: string, to: string) {
  for (const d of fs.listDirs(from)) fs.seedDir(to + d.slice(from.length));
  fs.seedDir(to);
  for (const f of fs.listFiles(from)) {
    const rel = f.slice(from.length);
    const t = fs.fileText(f);
    if (t !== undefined) fs.seedText(to + rel, t);
    else fs.seedBase64(to + rel, fs.fileBase64(f) as string);
  }
}

const runFolderToApp = async (scope: CqScope | undefined, onProgress: (p: any) => void = () => {}) => {
  const pre = await previewFolderToApp(undefined, scope);
  return { pre, out: await defaultSyncDeps.run('folder-to-app', pre, onProgress, () => {}) };
};

beforeEach(async () => {
  await boot();
});

describe.each(SCOPES)('round trip: ডেটাবেস খালি করে ফোল্ডার থেকে ফেরত (%s)', (scope) => {
  it('বিষয়/অধ্যায়/টপিক/উদ্দীপক/প্রশ্ন/ছবি আগের সাথে হুবহু মেলে', async () => {
    const { d, bank } = await seedAndWrite(scope);
    await clearBank(d); // অ্যাপের ডেটাবেস (syncState সহ) একদম খালি; ফোল্ডার যেমন ছিল
    const summary = await scanScope(scope);
    expect(summary.error).toBeUndefined();
    expect(summary.added).toBe(bank.subjects.length + bank.chapters.length + (scope === 'type' ? bank.topics.length : 0));
    expect(summary.topicsUpdated).toBe(bank.topics.length);

    expect(jsonOf(await d.subjects.toArray()).sort((a, b) => a.order - b.order)).toEqual(jsonOf(bank.subjects));
    expect(jsonOf(await d.chapters.toArray()).sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      jsonOf([...bank.chapters].sort((a, b) => a.id.localeCompare(b.id))),
    );
    const topics = await d.topics.toArray();
    if (scope === 'type') {
      expect(jsonOf(topics).sort((a, b) => a.id.localeCompare(b.id))).toEqual(jsonOf([...bank.topics].sort((a, b) => a.id.localeCompare(b.id))));
    } else {
      // Chapter CQ: লুকানো ডিফল্ট টপিক নতুন করে তৈরি হয় (নাম "সকল প্রশ্ন"); id আর অধ্যায় আগের মতোই
      expect(topics.map((t) => [t.id, t.chapterId]).sort()).toEqual(bank.topics.map((t) => [t.id, t.chapterId]).sort());
    }
    const stim = (await d.stimuli.toArray()).sort((a, b) => a.id.localeCompare(b.id));
    const wantStim = [...bank.stimuli].sort((a, b) => a.id.localeCompare(b.id));
    expect(stim.length).toBe(wantStim.length);
    stim.forEach((s, i) => expect(s).toMatchObject(jsonOf(wantStim[i])));
    const qs = (await d.questions.toArray()).sort((a, b) => a.id.localeCompare(b.id));
    const wantQs = [...bank.questions].sort((a, b) => a.id.localeCompare(b.id));
    expect(qs.length).toBe(wantQs.length);
    qs.forEach((q, i) => expect(q).toMatchObject(jsonOf(wantQs[i])));

    const imgs = (await d.images.toArray()).sort((a, b) => a.id.localeCompare(b.id));
    expect(imgs.map((i) => i.id)).toEqual(bank.images.map((i) => i.id).sort());
    for (const im of imgs) {
      const orig = bank.images.find((x) => x.id === im.id)!;
      expect(im.fileName).toBe(orig.fileName);
      expect(im.topicId).toBe(orig.topicId);
      expect(im.blob).toBeUndefined(); // ছবি ফোল্ডারেই থাকে
    }
  });

  it('সিঙ্কের পর অকারণে "বদল" দেখায় না: আবার স্ক্যানে কিছু বদলায় না, প্রিভিউ খালি', async () => {
    const { d } = await seedAndWrite(scope);
    await clearBank(d);
    await scanScope(scope);
    await flushAllWrites(true); // স্ক্যানের পরের জমা লেখা (অ্যাপ নিজে এটা করে)
    const again = await scanScope(scope);
    expect(again.changed).toBe(false);
    const pre = await previewFolderToApp(undefined, scope);
    expect(pre.errors).toEqual([]);
    expect(pre.empty).toBe(true);
  });
});

describe.each(SCOPES)('ফোল্ডারে বাইরের বদল -> অ্যাপে (%s)', (scope) => {
  it('data.json সম্পাদনা: প্রশ্নের লেখা বদল, প্রশ্ন মোছা, নতুন প্রশ্ন যোগ', async () => {
    const { d, bank } = await seedAndWrite(scope);
    const topicA = bank.topics[0].id;
    const file = `${topicDir(scope, bank, topicA)}/${DATA_FILE}`;
    const [q1, q2] = bank.questions.filter((q) => q.topicId === topicA).sort((a, b) => a.order - b.order);
    editData(file, (j) => {
      j.questions.find((q: any) => q.id === q1.id).questionText = 'ফোল্ডারে বদলানো';
      j.questions = j.questions.filter((q: any) => q.id !== q2.id);
      j.questions.push({
        id: `${scope}_ext_q`, topicId: topicA, type: 'ক', marks: 1, questionText: 'ফোল্ডারে যোগ',
        solutionText: '', solutionImageIds: [], rating: 1, order: 9, usedInBoards: [],
      });
    });
    const s = await scanScope(scope);
    expect(s.topicsUpdated).toBe(1);
    expect((await d.questions.get(q1.id))!.questionText).toBe('ফোল্ডারে বদলানো');
    expect(await d.questions.get(q2.id)).toBeUndefined();
    expect((await d.questions.get(`${scope}_ext_q`))!.questionText).toBe('ফোল্ডারে যোগ');
  });

  it('নতুন ফোল্ডার (বিষয়/অধ্যায়/টপিক + data.json): অ্যাপে নতুন আইটেম, .folder.json লেখা হয়', async () => {
    const { d, bank } = await seedAndWrite(scope);
    const base = `${scopeRoot(scope)}/নতুন বিষয়/নতুন অধ্যায়`;
    const dir = scope === 'type' ? `${base}/নতুন টপিক` : base;
    fs.seedDir(dir);
    fs.seedText(`${dir}/${DATA_FILE}`, JSON.stringify({
      version: '2.0', type: 'qb-topic-data', scope, stimuli: [], images: [],
      questions: [{ id: `${scope}_new_q`, type: 'ক', marks: 1, questionText: 'নতুন ফোল্ডারের প্রশ্ন', solutionText: '', solutionImageIds: [], rating: 1, order: 1, usedInBoards: [] }],
    }));
    const s = await scanScope(scope);
    expect(s.error).toBeUndefined();
    const sub = (await d.subjects.toArray()).find((x) => x.name === 'নতুন বিষয়');
    expect(sub).toBeTruthy();
    const ch = (await d.chapters.toArray()).find((x) => x.name === 'নতুন অধ্যায়');
    expect(ch?.subjectId).toBe(sub!.id);
    const q = await d.questions.get(`${scope}_new_q`);
    expect(q?.questionText).toBe('নতুন ফোল্ডারের প্রশ্ন');
    const topic = await d.topics.get(q!.topicId);
    expect(topic?.chapterId).toBe(ch!.id);
    if (scope === 'type') expect(topic?.name).toBe('নতুন টপিক');
    expect(fs.fileJson(`${subjectDir(scope, 'নতুন বিষয়')}/${FOLDER_META}`)?.id).toBe(sub!.id);
    expect((await d.subjects.count())).toBe(bank.subjects.length + 1);
  });

  it('ফোল্ডারের নাম বদল: অ্যাপে নাম বদলায়, id ও ভেতরের প্রশ্ন একই থাকে', async () => {
    const { d, bank } = await seedAndWrite(scope);
    const sub = bank.subjects[0];
    fs.externalRename(subjectDir(scope, sub.name), subjectDir(scope, 'পদার্থ (নতুন নাম)'));
    const s = await scanScope(scope);
    expect(s.renamed).toBeGreaterThanOrEqual(1);
    expect((await d.subjects.get(sub.id))!.name).toBe('পদার্থ (নতুন নাম)');
    expect(await d.subjects.count()).toBe(bank.subjects.length);
    expect(await d.questions.count()).toBe(bank.questions.length);
  });
});

describe.each(SCOPES)('ফোল্ডার মোছা (%s)', (scope) => {
  it('একটা বিষয়ের ফোল্ডার মুছলে অ্যাপ থেকেও ভেতরের সব যায় (প্রশ্ন/উদ্দীপক/ছবি), অন্যটা অক্ষত', async () => {
    const { d, bank } = await seedAndWrite(scope);
    const chem = bank.subjects[1];
    fs.externalDelete(subjectDir(scope, chem.name));
    const s = await scanScope(scope);
    expect(s.deleted).toBeGreaterThanOrEqual(2);
    expect(await d.subjects.get(chem.id)).toBeUndefined();
    const chemTopics = bank.topics.filter((t) => bank.chapters.find((c) => c.id === t.chapterId)!.subjectId === chem.id).map((t) => t.id);
    for (const t of chemTopics) {
      expect(await d.questions.where('topicId').equals(t).count()).toBe(0);
      expect(await d.stimuli.where('topicId').equals(t).count()).toBe(0);
      expect(await d.images.where('topicId').equals(t).count()).toBe(0);
    }
    expect(await d.subjects.get(bank.subjects[0].id)).toBeTruthy();
    expect(await d.questions.count()).toBe(bank.questions.filter((q) => !chemTopics.includes(q.topicId)).length);
  });

  it('অনেকগুলো (>অর্ধেক) ফোল্ডার না পেলে জিজ্ঞাসা; "হ্যাঁ" (async উত্তর, নিজস্ব ডায়ালগের মতো) হলে মোছে', async () => {
    const { d, bank } = await seedAndWrite(scope);
    for (const s of bank.subjects) fs.externalDelete(subjectDir(scope, s.name));
    fs.seedDir(scopeRoot(scope)); // মূল ফোল্ডার থাকে, ভেতর খালি
    const confirm = vi.fn(async (_count: number, _total: number) => true);
    const s = await scanScope(scope, { confirmMassDelete: confirm });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(s.deleted).toBeGreaterThan(0);
    expect(await d.subjects.count()).toBe(0);
    expect(await d.questions.count()).toBe(0);
  });

  it('"না"/উত্তর ছাড়া: কিছু মোছা হয় না + সতর্কতা; একই অবস্থায় আবার জিজ্ঞাসা করে না [বৈশিষ্ট্য-নথি]', async () => {
    const { d, bank } = await seedAndWrite(scope);
    for (const s of bank.subjects) fs.externalDelete(subjectDir(scope, s.name));
    fs.seedDir(scopeRoot(scope));
    const no = vi.fn(async () => false);
    const s1 = await scanScope(scope, { confirmMassDelete: no });
    expect(no).toHaveBeenCalledTimes(1);
    expect(s1.deleted).toBe(0);
    expect(s1.warnings.length).toBeGreaterThan(0);
    expect(await d.subjects.count()).toBe(bank.subjects.length);
    // একই অনুপস্থিত-তালিকা: আবার জিজ্ঞাসা নয়, আবার মোছাও নয়
    const again = vi.fn(async () => true);
    const s2 = await scanScope(scope, { confirmMassDelete: again });
    expect(again).not.toHaveBeenCalled();
    expect(s2.deleted).toBe(0);
    expect(await d.subjects.count()).toBe(bank.subjects.length);
  });

  it('Question_Bank মূল ফোল্ডারটাই না থাকলে: ত্রুটি, অ্যাপের কিছু মোছা হয় না', async () => {
    const { d, bank } = await seedAndWrite(scope);
    fs.externalDelete(scopeRoot(scope));
    const s = await scanScope(scope);
    expect(s.error).toBeTruthy();
    expect(await d.subjects.count()).toBe(bank.subjects.length);
    expect(await d.questions.count()).toBe(bank.questions.length);
  });
});

describe.each(SCOPES)('বাড়তি জিনিস ও কপি করা ফোল্ডার (%s)', (scope) => {
  it('বাড়তি ফাইল: প্রিভিউয়ে আসে, সিঙ্কে unnecessary/-তে সরে; ডেটা অক্ষত', async () => {
    const { d, bank } = await seedAndWrite(scope);
    const dir = topicDir(scope, bank, bank.topics[0].id);
    fs.seedText(`${dir}/notes.txt`, 'আমার নোট');
    const pre = await previewFolderToApp(undefined, scope);
    expect(pre.extras.length).toBeGreaterThanOrEqual(1);
    await runFolderToApp(scope);
    expect(fs.fileText(`${dir}/notes.txt`)).toBeUndefined();
    const moved = fs.listFiles(scopeRoot(scope)).filter((f) => f.endsWith('/notes.txt'));
    expect(moved.length).toBe(1);
    expect(moved[0]).toContain('/unnecessary/');
    expect(fs.fileText(moved[0])).toBe('আমার নোট'); // মোছা হয়নি, সরেছে
    expect(await d.questions.count()).toBe(bank.questions.length);
  });

  it('কপি করা ফোল্ডার (একই id): নতুন আইটেম হয় না, unnecessary/Sync_Conflicts-এ সরে', async () => {
    const { d, bank } = await seedAndWrite(scope);
    const src = subjectDir(scope, bank.subjects[0].name);
    copyTree(src, `${scopeRoot(scope)}/কপি`);
    const s = await scanScope(scope);
    expect(s.warnings.length).toBeGreaterThan(0);
    expect(await d.subjects.count()).toBe(bank.subjects.length); // কপি অ্যাপে ঢোকেনি

    await runFolderToApp(scope);
    expect(await fs.statPath(`${scopeRoot(scope)}/কপি`)).toBeNull();
    expect(await fs.statPath(src)).toBeTruthy(); // মূলটা থাকে
    const moved = fs.listFiles(scopeRoot(scope)).filter((f) => f.includes('/unnecessary/') && f.endsWith(`/${FOLDER_META}`));
    expect(moved.length).toBeGreaterThan(0);
    expect(await d.subjects.count()).toBe(bank.subjects.length);
  });
});

describe.each(SCOPES)('মেনুর "ফোল্ডার থেকে সিঙ্ক করুন" (%s উইন্ডো)', (scope) => {
  const other: CqScope = scope === 'type' ? 'chapter' : 'type';

  it('শুধু এই উইন্ডোর স্কোপ সিঙ্ক হয়; ফল-সংখ্যা ঠিক; তারপর অন্য উইন্ডো থেকে অন্যটা', async () => {
    const a = await seedAndWrite(scope);
    // অন্য স্কোপও বসিয়ে লেখা (boot না ডেকে)
    const bankO = buildSampleBank(other);
    const dO = getDb(other);
    await seedFixture(dO, bankO);
    await markEverythingDirty(other);
    await flushAllWrites(true);

    const fileA = `${topicDir(scope, a.bank, a.bank.topics[0].id)}/${DATA_FILE}`;
    const fileO = `${topicDir(other, bankO, bankO.topics[0].id)}/${DATA_FILE}`;
    editData(fileA, (j) => { j.questions[0].questionText = 'এ-তে বদল'; });
    editData(fileO, (j) => { j.questions[0].questionText = 'ও-তে বদল'; });
    const idA = fs.fileJson(fileA).questions[0].id;
    const idO = fs.fileJson(fileO).questions[0].id;

    const r1 = await runFolderToApp(scope);
    expect(r1.out.counts.update).toBe(1);
    expect((await a.d.questions.get(idA))!.questionText).toBe('এ-তে বদল');
    expect((await dO.questions.get(idO))!.questionText).not.toBe('ও-তে বদল'); // অন্য স্কোপ ছোঁয়া হয়নি

    const r2 = await runFolderToApp(other);
    expect(r2.out.counts.update).toBe(1);
    expect((await dO.questions.get(idO))!.questionText).toBe('ও-তে বদল');
  });

  it('প্রগ্রেস: শতকরা পিছোয় না, ১০০% শুধু শেষে', async () => {
    const { bank } = await seedAndWrite(scope);
    fs.seedText(`${topicDir(scope, bank, bank.topics[0].id)}/notes.txt`, 'x');
    const events: any[] = [];
    await runFolderToApp(scope, (p) => events.push(p));
    expect(events.length).toBeGreaterThan(1);
    const pcts = events.map((e) => e.percent);
    for (let i = 1; i < pcts.length; i++) expect(pcts[i]).toBeGreaterThanOrEqual(pcts[i - 1]);
    expect(events[events.length - 1].percent).toBe(100);
    expect(events[events.length - 1].finished).toBe(true);
    for (const e of events.slice(0, -1)) {
      expect(e.percent).toBeLessThan(100);
      expect(e.finished).toBe(false);
    }
  });
});
