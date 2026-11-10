import { describe, it, expect } from 'vitest';
import type { Question, Stimulus, SyncRow } from '../src/db/db';
import {
  buildNodes,
  compareFolderToApp,
  compareAppToFolder,
  conflictDestination,
  unnecessaryDestination,
  makeStamp,
  stableStringify,
  diffContent,
  summarize,
  hasAnyChange,
  type AppSnapshot,
  type FileDataMap,
  type PendingInfo,
} from '../src/storage/syncCompare';

const STAMP = '2026-11-10_14-30-05';
const NO_PENDING: PendingInfo = { entities: new Set(), deletes: new Set(), topics: new Set() };

const q = (id: string, text: string, extra: Partial<Question> = {}): Question => ({
  id,
  topicId: 't1',
  type: 'ক',
  marks: 1,
  questionText: text,
  solutionText: '',
  solutionImageIds: [],
  rating: 3,
  order: 1,
  usedInBoards: [],
  ...extra,
});

function baseApp(questions: Question[] = [q('q1', 'প্রথম'), q('q2', 'দ্বিতীয়')]): AppSnapshot {
  const rows: SyncRow[] = [
    { id: 's1', kind: 'subject', dirName: 'পদার্থ' },
    { id: 'c1', kind: 'chapter', parentId: 's1', dirName: 'অধ্যায় ১' },
    { id: 't1', kind: 'topic', parentId: 'c1', dirName: 'ক' },
    { id: 'data:t1', kind: 'data', mtime: 10, size: 100 },
  ];
  return {
    subjects: [{ id: 's1', name: 'পদার্থ', order: 1 }],
    chapters: [{ id: 'c1', subjectId: 's1', name: 'অধ্যায় ১', order: 1 }],
    topics: [{ id: 't1', chapterId: 'c1', name: 'ক', order: 1 }],
    rows,
    questionsByTopic: new Map([['t1', questions]]),
    stimuliByTopic: new Map<string, Stimulus[]>(),
    imageById: new Map(),
  };
}

const meta = (id: string, kind: string, name: string) => JSON.stringify({ id, kind, name, order: 1 });

/** the folder tree that matches baseApp() */
function baseEntries(extra: Array<{ p: string; d: boolean; s: number; m: number; t?: string }> = []) {
  return [
    { p: 'পদার্থ', d: true, s: 0, m: 0 },
    { p: 'পদার্থ/.folder.json', d: false, s: 10, m: 1, t: meta('s1', 'subject', 'পদার্থ') },
    { p: 'পদার্থ/অধ্যায় ১', d: true, s: 0, m: 0 },
    { p: 'পদার্থ/অধ্যায় ১/.folder.json', d: false, s: 10, m: 1, t: meta('c1', 'chapter', 'অধ্যায় ১') },
    { p: 'পদার্থ/অধ্যায় ১/ক', d: true, s: 0, m: 0 },
    { p: 'পদার্থ/অধ্যায় ১/ক/.folder.json', d: false, s: 10, m: 1, t: meta('t1', 'topic', 'ক') },
    { p: 'পদার্থ/অধ্যায় ১/ক/data.json', d: false, s: 100, m: 10 },
    ...extra,
  ];
}

const payloadOf = (questions: Question[]) => ({ stimuli: [], questions, images: [] });
const files = (questions: Question[] | null): FileDataMap =>
  new Map([['পদার্থ/অধ্যায় ১/ক', { payload: questions ? payloadOf(questions) : null }]]);

describe('syncCompare - ফোল্ডার -> অ্যাপ', () => {
  it('সব মিললে কিছুই বদলায় না', () => {
    const nodes = buildNodes('type', baseEntries());
    const r = compareFolderToApp({ scope: 'type', stamp: STAMP, nodes, app: baseApp(), fileData: new Map(), pending: NO_PENDING });
    expect(r.entries).toEqual([]);
    expect(r.conflicts).toEqual([]);
    expect(hasAnyChange(summarize(r.entries, r.conflicts))).toBe(false);
  });

  it('নতুন বিষয়/টাইপ ফোল্ডার যোগ হিসেবে দেখায়', () => {
    const nodes = buildNodes(
      'type',
      baseEntries([
        { p: 'রসায়ন', d: true, s: 0, m: 0 },
        { p: 'রসায়ন/অধ্যায় ১', d: true, s: 0, m: 0 },
      ])
    );
    const r = compareFolderToApp({ scope: 'type', stamp: STAMP, nodes, app: baseApp(), fileData: new Map(), pending: NO_PENDING });
    const adds = r.entries.filter((e) => e.action === 'add');
    expect(adds).toHaveLength(2);
    expect(adds[0].path).toEqual(['রসায়ন']);
    expect(adds[1].path).toEqual(['রসায়ন', 'অধ্যায় ১']);
  });

  it('ফোল্ডারের নাম বদলালে rename দেখায় (id দিয়ে চেনা)', () => {
    const entries = baseEntries().map((e) => (e.p.startsWith('পদার্থ/অধ্যায় ১') ? { ...e, p: e.p.replace('অধ্যায় ১', 'অধ্যায় এক') } : e));
    const nodes = buildNodes('type', entries);
    const r = compareFolderToApp({ scope: 'type', stamp: STAMP, nodes, app: baseApp(), fileData: new Map(), pending: NO_PENDING });
    const ren = r.entries.filter((e) => e.action === 'rename');
    expect(ren).toHaveLength(1);
    expect(ren[0].from).toBe('অধ্যায় ১');
    expect(ren[0].to).toBe('অধ্যায় এক');
  });

  it('ফোল্ডার মুছলে delete দেখায়, ভেতরের প্রশ্ন গুনে', () => {
    const nodes = buildNodes('type', [{ p: 'পদার্থ', d: true, s: 0, m: 0 }, { p: 'পদার্থ/.folder.json', d: false, s: 1, m: 1, t: meta('s1', 'subject', 'পদার্থ') }]);
    const r = compareFolderToApp({ scope: 'type', stamp: STAMP, nodes, app: baseApp(), fileData: new Map(), pending: NO_PENDING });
    const del = r.entries.filter((e) => e.action === 'delete');
    expect(del).toHaveLength(1); // অধ্যায় আর টাইপ আলাদা করে নয়, বিষয়ের ভেতরেই ধরা
    expect(del[0].path).toEqual(['পদার্থ', 'অধ্যায় ১']);
    expect(del[0].destructive).toBe(true);
    expect(del[0].note).toContain('2টি প্রশ্ন');
  });

  it('অর্ধেকের বেশি ফোল্ডার হারালে massDelete চিহ্ন দেয়', () => {
    const nodes = buildNodes('type', []);
    const r = compareFolderToApp({ scope: 'type', stamp: STAMP, nodes, app: baseApp(), fileData: new Map(), pending: NO_PENDING });
    expect(r.massDelete).toEqual({ count: 3, total: 3 });
  });

  it('data.json বদলালে প্রশ্ন যোগ/বাদ/বদল আলাদা গোনে', () => {
    const entries = baseEntries().map((e) => (e.p.endsWith('data.json') ? { ...e, s: 200, m: 20 } : e));
    const nodes = buildNodes('type', entries);
    const fileQs = [q('q1', 'প্রথম (সম্পাদিত)'), q('q3', 'তৃতীয়')]; // q2 বাদ, q1 বদল, q3 নতুন
    const r = compareFolderToApp({ scope: 'type', stamp: STAMP, nodes, app: baseApp(), fileData: files(fileQs), pending: NO_PENDING });
    const upd = r.entries.find((e) => e.action === 'update');
    expect(upd?.topic?.questionsAdded.map((x) => x.id)).toEqual(['q3']);
    expect(upd?.topic?.questionsRemoved.map((x) => x.id)).toEqual(['q2']);
    expect(upd?.topic?.questionsChanged.map((x) => x.id)).toEqual(['q1']);
    expect(upd?.destructive).toBe(true);
    const t = summarize(r.entries, r.conflicts);
    expect([t.questionsAdded, t.questionsRemoved, t.questionsChanged]).toEqual([1, 1, 1]);
  });

  it('ভুল data.json হলে সতর্কতা, কোনো বদল নয়', () => {
    const entries = baseEntries().map((e) => (e.p.endsWith('data.json') ? { ...e, s: 5, m: 99 } : e));
    const nodes = buildNodes('type', entries);
    const r = compareFolderToApp({ scope: 'type', stamp: STAMP, nodes, app: baseApp(), fileData: files(null), pending: NO_PENDING });
    expect(r.warnings).toHaveLength(1);
    expect(r.entries.filter((e) => e.action === 'update')).toEqual([]);
  });

  it('কপি করা ফোল্ডার (একই id) কনফ্লিক্ট নয় - বাড়তি হিসেবে বাবার unnecessary/Sync_Conflicts/-এ যায়, মোছা হয় না', () => {
    const copy = [
      { p: 'পদার্থ - Copy', d: true, s: 0, m: 0 },
      { p: 'পদার্থ - Copy/.folder.json', d: false, s: 10, m: 1, t: meta('s1', 'subject', 'পদার্থ') },
    ];
    const nodes = buildNodes('type', baseEntries(copy));
    const r = compareFolderToApp({ scope: 'type', stamp: STAMP, nodes, app: baseApp(), fileData: new Map(), pending: NO_PENDING });
    expect(r.conflicts).toEqual([]);
    expect(r.extras).toHaveLength(1);
    expect(r.extras[0].kind).toBe('extra-folder');
    expect(r.extras[0].sourcePath).toBe('পদার্থ - Copy');
    expect(r.extras[0].moveTo).toBe('Download/QB Collection/Question_Bank/Type_CQ/unnecessary/Sync_Conflicts/পদার্থ - Copy');
    expect(r.entries.filter((e) => e.action === 'delete')).toEqual([]);
    const t = summarize(r.entries, r.conflicts, r.extras);
    expect(t.conflicts).toBe(0);
    expect(t.extras).toBe(1);
    expect(t.add).toBe(0);
  });

  it('অ্যাপের জমে থাকা বদল + ফোল্ডারে বাইরের বদল = কোনো কনফ্লিক্ট নেই (অ্যাপ নিজেই ফোল্ডারে লেখে)', () => {
    const entries = baseEntries().map((e) => (e.p.endsWith('data.json') ? { ...e, s: 200, m: 20 } : e));
    const nodes = buildNodes('type', entries);
    const pending: PendingInfo = { entities: new Set(), deletes: new Set(), topics: new Set(['t1']) };
    const r = compareFolderToApp({ scope: 'type', stamp: STAMP, nodes, app: baseApp(), fileData: files([q('q9', 'বাইরে')]), pending });
    expect(r.conflicts).toEqual([]);
    expect(r.entries.filter((e) => e.action === 'update')).toEqual([]);
  });

  it('জমে থাকা বদল কিন্তু ফোল্ডার অক্ষত = কনফ্লিক্ট নয়', () => {
    const nodes = buildNodes('type', baseEntries());
    const pending: PendingInfo = { entities: new Set(), deletes: new Set(), topics: new Set(['t1']) };
    const r = compareFolderToApp({ scope: 'type', stamp: STAMP, nodes, app: baseApp(), fileData: new Map(), pending });
    expect(r.conflicts).toEqual([]);
  });

  it('media/ থেকে ছবি ফাইল হারালে "info" দেখায় (অ্যাপে রেকর্ড থেকে যাবে)', () => {
    const nodes = buildNodes('type', baseEntries());
    const app = baseApp([q('q1', 'প্রথম', { solutionImageIds: ['img1'] }), q('q2', 'দ্বিতীয়')]);
    app.imageById.set('img1', { id: 'img1', hasBlob: false, topicId: 't1' });
    const r = compareFolderToApp({ scope: 'type', stamp: STAMP, nodes, app, fileData: new Map(), pending: NO_PENDING });
    const info = r.entries.filter((e) => e.action === 'info');
    expect(info).toHaveLength(1);
    expect(info[0].topic?.imagesMissing).toEqual(['img1']);
    expect(summarize(r.entries, r.conflicts).update).toBe(0);
  });

  it('Chapter CQ: অধ্যায় ফোল্ডারেই data.json, লুকানো ডিফল্ট টাইপে মেলে', () => {
    const app = baseApp();
    app.rows = [
      { id: 's1', kind: 'subject', dirName: 'পদার্থ' },
      { id: 'c1', kind: 'chapter', parentId: 's1', dirName: 'অধ্যায় ১' },
      { id: 't1', kind: 'topic', parentId: 'c1', dirName: '' },
      { id: 'data:t1', kind: 'data', mtime: 10, size: 100 },
    ];
    const entries = [
      { p: 'পদার্থ', d: true, s: 0, m: 0 },
      { p: 'পদার্থ/.folder.json', d: false, s: 1, m: 1, t: meta('s1', 'subject', 'পদার্থ') },
      { p: 'পদার্থ/অধ্যায় ১', d: true, s: 0, m: 0 },
      { p: 'পদার্থ/অধ্যায় ১/.folder.json', d: false, s: 1, m: 1, t: meta('c1', 'chapter', 'অধ্যায় ১') },
      { p: 'পদার্থ/অধ্যায় ১/data.json', d: false, s: 150, m: 15 },
    ];
    const nodes = buildNodes('chapter', entries);
    const fd: FileDataMap = new Map([['পদার্থ/অধ্যায় ১', { payload: payloadOf([q('q1', 'প্রথম'), q('q2', 'দ্বিতীয়'), q('q7', 'নতুন')]) }]]);
    const r = compareFolderToApp({ scope: 'chapter', stamp: STAMP, nodes, app, fileData: fd, pending: NO_PENDING });
    const upd = r.entries.find((e) => e.action === 'update');
    expect(upd?.kind).toBe('chapter');
    expect(upd?.topic?.questionsAdded.map((x) => x.id)).toEqual(['q7']);
  });
});

describe('syncCompare - অ্যাপ -> ফোল্ডার', () => {
  it('সব মিললে কিছুই বদলায় না', () => {
    const nodes = buildNodes('type', baseEntries());
    const r = compareAppToFolder({ scope: 'type', stamp: STAMP, nodes, app: baseApp(), fileData: files([q('q1', 'প্রথম'), q('q2', 'দ্বিতীয়')]) });
    expect(r.entries).toEqual([]);
    expect(r.conflicts).toEqual([]);
  });

  it('ফোল্ডার একদম না থাকলে সব "তৈরি হবে"', () => {
    const r = compareAppToFolder({ scope: 'type', stamp: STAMP, nodes: [], app: baseApp(), fileData: new Map() });
    const creates = r.entries.filter((e) => e.action === 'create');
    expect(creates).toHaveLength(4); // বিষয়, অধ্যায়, টাইপ + টাইপের data.json
    expect(summarize(r.entries, r.conflicts).questionsAdded).toBe(2);
  });

  it('অ্যাপে নাম বদলালে ফোল্ডারও rename হবে', () => {
    const app = baseApp();
    app.chapters[0].name = 'নতুন অধ্যায়';
    const nodes = buildNodes('type', baseEntries());
    const r = compareAppToFolder({ scope: 'type', stamp: STAMP, nodes, app, fileData: files([q('q1', 'প্রথম'), q('q2', 'দ্বিতীয়')]) });
    const ren = r.entries.filter((e) => e.action === 'rename');
    expect(ren).toHaveLength(1);
    expect(ren[0].from).toBe('অধ্যায় ১');
    expect(ren[0].to).toBe('নতুন অধ্যায়');
  });

  it('ফোল্ডারে বাড়তি/ভিন্ন প্রশ্ন থাকলে লাল আপডেট (অ্যাপের কপি জেতে), কনফ্লিক্ট নয়', () => {
    const nodes = buildNodes('type', baseEntries());
    const r = compareAppToFolder({
      scope: 'type',
      stamp: STAMP,
      nodes,
      app: baseApp(),
      fileData: files([q('q1', 'ভিন্ন লেখা'), q('q2', 'দ্বিতীয়'), q('q5', 'বাড়তি')]),
    });
    const upd = r.entries.find((e) => e.action === 'update');
    expect(upd?.topic?.questionsRemoved.map((x) => x.id)).toEqual(['q5']);
    expect(upd?.topic?.questionsChanged.map((x) => x.id)).toEqual(['q1']);
    expect(upd?.destructive).toBe(true);
    expect(r.conflicts).toEqual([]);
  });

  it('শুধু অ্যাপে বাড়তি প্রশ্ন থাকলে সাধারণ আপডেট, কনফ্লিক্ট নয়', () => {
    const nodes = buildNodes('type', baseEntries());
    const r = compareAppToFolder({ scope: 'type', stamp: STAMP, nodes, app: baseApp(), fileData: files([q('q1', 'প্রথম')]) });
    expect(r.entries.find((e) => e.action === 'update')?.topic?.questionsAdded.map((x) => x.id)).toEqual(['q2']);
    expect(r.conflicts).toEqual([]);
  });

  it('অ্যাপে নেই এমন ফোল্ডার = বাড়তি (কনফ্লিক্ট নয়), শুধু সবচেয়ে ওপরেরটা, scope root-এর unnecessary/-তে', () => {
    const nodes = buildNodes(
      'type',
      baseEntries([
        { p: 'গণিত', d: true, s: 0, m: 0 },
        { p: 'গণিত/অধ্যায় ১', d: true, s: 0, m: 0 },
        { p: 'গণিত/অধ্যায় ১/ক', d: true, s: 0, m: 0 },
      ])
    );
    const r = compareAppToFolder({ scope: 'type', stamp: STAMP, nodes, app: baseApp(), fileData: files([q('q1', 'প্রথম'), q('q2', 'দ্বিতীয়')]) });
    expect(r.conflicts).toEqual([]);
    expect(r.extras).toHaveLength(1);
    expect(r.extras[0].kind).toBe('extra-folder');
    expect(r.extras[0].sourcePath).toBe('গণিত');
    expect(r.extras[0].moveTo).toBe('Download/QB Collection/Question_Bank/Type_CQ/unnecessary/গণিত');
  });

  it('media/-তে অ্যাপের অজানা ছবি = বাড়তি, ওই টাইপের unnecessary/media/-তে (মোটেও কনফ্লিক্ট নয়)', () => {
    const nodes = buildNodes('type', baseEntries([{ p: 'পদার্থ/অধ্যায় ১/ক/media/zzz.webp', d: false, s: 5, m: 1 }]));
    const r = compareAppToFolder({ scope: 'type', stamp: STAMP, nodes, app: baseApp(), fileData: files([q('q1', 'প্রথম'), q('q2', 'দ্বিতীয়')]) });
    expect(r.conflicts).toEqual([]);
    expect(r.extras).toHaveLength(1);
    expect(r.extras[0].kind).toBe('extra-media');
    expect(r.extras[0].sourcePath).toBe('পদার্থ/অধ্যায় ১/ক/media/zzz.webp');
    expect(r.extras[0].moveTo).toBe('Download/QB Collection/Question_Bank/Type_CQ/পদার্থ/অধ্যায় ১/ক/unnecessary/media/zzz.webp');
    expect(r.extras[0].owner).toEqual(['পদার্থ', 'অধ্যায় ১', 'ক']);
  });

  it('এই টাইপের প্রশ্ন যে ছবি ব্যবহার করে সেটা media/-তে থাকলে বাড়তি নয়', () => {
    const app = baseApp([q('q1', 'প্রথম', { solutionImageIds: ['keep1'] }), q('q2', 'দ্বিতীয়')]);
    app.imageById.set('keep1', { id: 'keep1', hasBlob: false, topicId: 't1' });
    const nodes = buildNodes('type', baseEntries([{ p: 'পদার্থ/অধ্যায় ১/ক/media/keep1.webp', d: false, s: 5, m: 1 }]));
    const r = compareAppToFolder({ scope: 'type', stamp: STAMP, nodes, app, fileData: files([q('q1', 'প্রথম'), q('q2', 'দ্বিতীয়')]) });
    expect(r.extras).toEqual([]);
  });

  it('অ্যাপের ছবির টেবিলে রেকর্ড আছে কিন্তু কোনো প্রশ্ন ব্যবহার করে না (পুরোনো/বদলানো ছবি) = বাড়তি', () => {
    const app = baseApp();
    app.imageById.set('old1', { id: 'old1', hasBlob: false, topicId: 't1' });
    const nodes = buildNodes('type', baseEntries([{ p: 'পদার্থ/অধ্যায় ১/ক/media/old1.webp', d: false, s: 5, m: 1 }]));
    const r = compareAppToFolder({ scope: 'type', stamp: STAMP, nodes, app, fileData: files([q('q1', 'প্রথম'), q('q2', 'দ্বিতীয়')]) });
    expect(r.extras.map((x) => x.name)).toEqual(['media/old1.webp']);
  });

  it('ফোল্ডার -> অ্যাপেও একই: অব্যবহৃত ছবি (রেকর্ড থাকলেও) বাড়তি; মোট ২৭টির মধ্যে ২১টি ব্যবহৃত হলে ৬টি বাড়তি', () => {
    const used = Array.from({ length: 21 }, (_, i) => `u${i}`);
    const app = baseApp([q('q1', 'প্রথম', { solutionImageIds: used }), q('q2', 'দ্বিতীয়')]);
    const media = [...used, ...Array.from({ length: 6 }, (_, i) => `x${i}`)];
    for (const id of media) app.imageById.set(id, { id, hasBlob: false, topicId: 't1' });
    const nodes = buildNodes('type', baseEntries(media.map((id) => ({ p: `পদার্থ/অধ্যায় ১/ক/media/${id}.webp`, d: false, s: 5, m: 1 }))));
    const r = compareFolderToApp({ scope: 'type', stamp: STAMP, nodes, app, fileData: new Map(), pending: NO_PENDING });
    expect(r.extras.map((x) => x.name).sort()).toEqual(Array.from({ length: 6 }, (_, i) => `media/x${i}.webp`).sort());
  });

  it('টাইপ ফোল্ডারের ভেতরের অচেনা ফাইল/ফোল্ডার ও media/-র অচেনা ফাইল বাড়তি; .nomedia, .tmp, .bak, unnecessary/ নয়', () => {
    const nodes = buildNodes(
      'type',
      baseEntries([
        { p: 'পদার্থ/অধ্যায় ১/ক/notes.txt', d: false, s: 5, m: 1 },
        { p: 'পদার্থ/অধ্যায় ১/ক/পুরোনো', d: true, s: 0, m: 0 },
        { p: 'পদার্থ/অধ্যায় ১/ক/media/info.pdf', d: false, s: 5, m: 1 },
        { p: 'পদার্থ/অধ্যায় ১/ক/media/.nomedia', d: false, s: 0, m: 1 },
        { p: 'পদার্থ/অধ্যায় ১/ক/data.json.bak', d: false, s: 5, m: 1 },
        { p: 'পদার্থ/অধ্যায় ১/ক/data.json.tmp', d: false, s: 5, m: 1 },
        { p: 'পদার্থ/অধ্যায় ১/ক/unnecessary', d: true, s: 0, m: 0 },
        { p: 'পদার্থ/অধ্যায় ১/ক/unnecessary/media/old.webp', d: false, s: 5, m: 1 },
      ])
    );
    const r = compareAppToFolder({ scope: 'type', stamp: STAMP, nodes, app: baseApp(), fileData: files([q('q1', 'প্রথম'), q('q2', 'দ্বিতীয়')]) });
    expect(r.conflicts).toEqual([]);
    const got = r.extras.map((x) => `${x.kind}:${x.name}`).sort();
    expect(got).toEqual(['extra-file:notes.txt', 'extra-folder:পুরোনো', 'extra-media:media/info.pdf'].sort());
    // unnecessary/ নিজে আর স্ক্যানে ঢোকে না
    expect(nodes.every((n) => !n.path.includes('unnecessary'))).toBe(true);
  });

  it('ফোল্ডার -> অ্যাপ: অ্যাপ বা data.json যে ছবি চেনে না সেটা বাড়তি, নতুন ছবি হিসেবে গোনা হয় না', () => {
    const nodes = buildNodes('type', baseEntries([{ p: 'পদার্থ/অধ্যায় ১/ক/media/zzz.webp', d: false, s: 5, m: 1 }]));
    const r = compareFolderToApp({ scope: 'type', stamp: STAMP, nodes, app: baseApp(), fileData: new Map(), pending: NO_PENDING });
    expect(r.conflicts).toEqual([]);
    expect(r.extras.map((x) => x.name)).toEqual(['media/zzz.webp']);
    expect(r.entries.some((e) => (e.topic?.imagesNew ?? 0) > 0)).toBe(false);
    const t = summarize(r.entries, r.conflicts, r.extras);
    expect(t.extras).toBe(1);
    expect(t.conflicts).toBe(0);
    expect(hasAnyChange(t)).toBe(true); // শুধু বাড়তি জিনিস থাকলেও সিঙ্ক চালানো যায়
  });

  it('ফোল্ডার -> অ্যাপ: data.json যে ছবির কথা বলে সেটা বাড়তি নয়', () => {
    const nodes = buildNodes('type', baseEntries([{ p: 'পদার্থ/অধ্যায় ১/ক/media/new1.webp', d: false, s: 5, m: 1 }]));
    const fileQs = [q('q1', 'প্রথম'), q('q2', 'দ্বিতীয় [[img:new1]]')];
    const r = compareFolderToApp({ scope: 'type', stamp: STAMP, nodes, app: baseApp(), fileData: files(fileQs), pending: NO_PENDING });
    expect(r.extras).toEqual([]);
  });

  it('Chapter CQ: অধ্যায় ফোল্ডারের অচেনা ফাইল অধ্যায়ের unnecessary/-তে যায়', () => {
    const app = baseApp();
    app.rows = [
      { id: 's1', kind: 'subject', dirName: 'পদার্থ' },
      { id: 'c1', kind: 'chapter', parentId: 's1', dirName: 'অধ্যায় ১' },
      { id: 'data:t1', kind: 'data', mtime: 10, size: 100 },
    ];
    const nodes = buildNodes('chapter', [
      { p: 'পদার্থ', d: true, s: 0, m: 0 },
      { p: 'পদার্থ/.folder.json', d: false, s: 10, m: 1, t: meta('s1', 'subject', 'পদার্থ') },
      { p: 'পদার্থ/অধ্যায় ১', d: true, s: 0, m: 0 },
      { p: 'পদার্থ/অধ্যায় ১/.folder.json', d: false, s: 10, m: 1, t: meta('c1', 'chapter', 'অধ্যায় ১') },
      { p: 'পদার্থ/অধ্যায় ১/data.json', d: false, s: 100, m: 10 },
      { p: 'পদার্থ/অধ্যায় ১/scan.pdf', d: false, s: 100, m: 10 },
    ]);
    const r = compareFolderToApp({ scope: 'chapter', stamp: STAMP, nodes, app, fileData: new Map(), pending: NO_PENDING });
    expect(r.extras).toHaveLength(1);
    expect(r.extras[0].moveTo).toBe('Download/QB Collection/Question_Bank/Chapter_CQ/পদার্থ/অধ্যায় ১/unnecessary/scan.pdf');
  });

  it('অ্যাপের ছবি ফোল্ডারে নেই: blob থাকলে লেখা হবে, কোথাও না থাকলে সতর্কতা', () => {
    const app = baseApp([q('q1', 'দেখো [[img:a1]] আর [[img:a2]]', { order: 1 })]);
    app.imageById.set('a1', { id: 'a1', hasBlob: true, topicId: undefined });
    app.imageById.set('a2', { id: 'a2', hasBlob: false, topicId: 't1' });
    const nodes = buildNodes('type', baseEntries());
    const r = compareAppToFolder({ scope: 'type', stamp: STAMP, nodes, app, fileData: files([q('q1', 'দেখো [[img:a1]] আর [[img:a2]]')]) });
    const upd = r.entries.find((e) => e.action === 'update');
    expect(upd?.topic?.imagesToWrite).toBe(1);
    expect(r.warnings).toHaveLength(1);
  });
});

describe('syncCompare - সাহায্যকারী', () => {
  it('unnecessaryDestination: মালিক ফোল্ডারের ভেতরে unnecessary/, রুট হলে scope root-এর নিচে', () => {
    expect(unnecessaryDestination('type', 'ক/খ/গ', 'media/a.webp')).toBe('Download/QB Collection/Question_Bank/Type_CQ/ক/খ/গ/unnecessary/media/a.webp');
    expect(unnecessaryDestination('chapter', '', 'ঘ')).toBe('Download/QB Collection/Question_Bank/Chapter_CQ/unnecessary/ঘ');
  });

  it('conflictDestination নিয়ম অনুযায়ী পথ বানায়', () => {
    expect(conflictDestination(STAMP, 'chapter', 'ক/খ')).toBe('Download/QB Collection/Sync_Conflicts/2026-11-10_14-30-05/Chapter_CQ/ক/খ');
  });

  it('makeStamp তারিখ-সময় বানায়', () => {
    expect(makeStamp(new Date(2026, 10, 10, 14, 30, 5))).toBe('2026-11-10_14-30-05');
  });

  it('stableStringify কী-ক্রম ও undefined নির্বিশেষে এক', () => {
    expect(stableStringify({ b: 1, a: [1, { y: 2, x: undefined }] })).toBe(stableStringify({ a: [1, { y: 2 }], b: 1 }));
  });

  it('diffContent প্রশ্ন গোনে', () => {
    const d = diffContent({ stimuli: [], questions: [q('a', 'x'), q('b', 'y')] }, { stimuli: [], questions: [q('b', 'z'), q('c', 'w')] });
    expect([d.questionsAdded.length, d.questionsChanged.length, d.questionsRemoved.length]).toEqual([1, 1, 1]);
  });
});
