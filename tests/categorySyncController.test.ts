import { describe, it, expect } from 'vitest';
import { createCategorySyncController, CategoryRunError, type CategoryRunOutcome, type CategorySyncControllerDeps } from '../src/storage/categorySyncController';
import { emptyApplyCounts } from '../src/storage/categorySyncView';
import type { CategoryPreview } from '../src/storage/categoryScanner';
import type { CategoryDeleteMode, CategoryEntry, CategoryExtra } from '../src/storage/categoryCompare';

const defer = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: any) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

const entries: CategoryEntry[] = [
  { kind: 'category', action: 'add', id: 'c1', path: ['পদার্থ'] },
  { kind: 'paper', action: 'add', id: 'p1', path: ['পদার্থ', 'P1'] },
];
const extras: CategoryExtra[] = [
  { kind: 'extra-file', owner: ['পদার্থ'], name: 'a.webp', path: ['পদার্থ', 'a.webp'], folderSide: 'x', sourcePath: 'পদার্থ/a.webp', moveTo: 'R/পদার্থ/unnecessary/a.webp' },
  { kind: 'extra-folder', owner: [], name: 'old', path: ['old'], folderSide: 'y', sourcePath: 'old', moveTo: 'R/unnecessary/old' },
];

const mkPreview = (over: Partial<CategoryPreview> = {}, resultOver: Record<string, unknown> = {}): CategoryPreview =>
  ({
    stamp: 's',
    createdAt: 0,
    deleteMode: 'delete-papers',
    result: { entries, extras, warnings: ['w1'], dirNames: {}, ...resultOver },
    totals: {},
    empty: false,
    signature: 'sig',
    rootExists: true,
    pendingCount: 0,
    ...over,
  }) as unknown as CategoryPreview;

const outcome = (over: Partial<CategoryRunOutcome> = {}): CategoryRunOutcome => ({
  counts: { ...emptyApplyCounts(), categoriesAdded: 1, papersAdded: 1 },
  warnings: ['w1', 'w2'],
  bankMissing: [],
  queuedWrites: [],
  extrasMoved: [true, false],
  ...over,
});

function setup(over: Partial<CategorySyncControllerDeps> = {}) {
  const calls: string[] = [];
  const deps: CategorySyncControllerDeps = {
    preview: async (mode) => {
      calls.push(`preview:${mode}`);
      return mkPreview({ deleteMode: mode });
    },
    run: async (_p, opts) => {
      calls.push(`run:${opts.massDeleteConfirmed}`);
      return outcome();
    },
    onClosedResult: (c) => calls.push(`closed:${c}`),
    ...over,
  };
  return { c: createCategorySyncController(deps), calls };
}

describe('শুরু', () => {
  it('start -> calculating -> preview (প্রথমে delete-papers)', async () => {
    const { c, calls } = setup();
    expect(c.start()).toEqual({ started: true });
    expect(c.getState()?.kind).toBe('calculating');
    await tick();
    expect(c.getState()?.kind).toBe('preview');
    expect(calls).toEqual(['preview:delete-papers']);
  });
  it('উইন্ডো খোলা থাকলে দ্বিতীয় start হয় না', async () => {
    const { c } = setup();
    c.start();
    const r = c.start();
    expect(r.started).toBe(false);
    await tick();
  });
  it('busyReason থাকলে কারণসহ শুরু হয় না, উইন্ডো খোলে না', () => {
    const { c, calls } = setup({ busyReason: () => 'অটো সিঙ্ক চলছে' });
    const r = c.start();
    expect(r).toEqual({ started: false, reason: 'অটো সিঙ্ক চলছে' });
    expect(c.getState()).toBeNull();
    expect(calls).toHaveLength(0);
  });
  it('প্রিভিউ ব্যর্থ হলে error (ডেটা নিরাপদ)', async () => {
    const { c } = setup({ preview: async () => { throw new Error('পড়া যায়নি'); } });
    c.start();
    await tick();
    const s = c.getState();
    expect(s?.kind).toBe('error');
    if (s?.kind === 'error') {
      expect(s.dataSafe).toBe(true);
      expect(s.message).toBe('পড়া যায়নি');
    }
  });
  it('প্রগ্রেস calculating-এ আসে', async () => {
    const d = defer<CategoryPreview>();
    let report: any;
    const { c } = setup({ preview: (_m, onProgress) => ((report = onProgress), d.promise) });
    c.start();
    report({ phase: 'list', done: 1, total: 3, percent: 33, finished: false });
    const s = c.getState();
    expect(s?.kind === 'calculating' && s.progress?.percent).toBe(33);
    d.resolve(mkPreview());
    await tick();
  });
});

describe('বাতিল', () => {
  it('হিসাবের মাঝে cancel করলে দেরিতে আসা ফল ঢোকে না', async () => {
    const d = defer<CategoryPreview>();
    const { c } = setup({ preview: () => d.promise });
    c.start();
    c.cancel();
    expect(c.getState()).toBeNull();
    d.resolve(mkPreview());
    await tick();
    expect(c.getState()).toBeNull();
  });
  it('preview-তে cancel -> বন্ধ', async () => {
    const { c } = setup();
    c.start();
    await tick();
    c.cancel();
    expect(c.getState()).toBeNull();
  });
  it('running-এ cancel কাজ করে না', async () => {
    const d = defer<CategoryRunOutcome>();
    const { c } = setup({ run: () => d.promise });
    c.start();
    await tick();
    expect(c.confirm()).toBe(true);
    c.cancel();
    expect(c.getState()?.kind).toBe('running');
    d.resolve(outcome());
    await tick();
  });
});

describe('মোছা ক্যাটেগরির বাছাই', () => {
  it('setDeleteMode আবার হিসাব করে, নতুন mode-এ প্রিভিউ আসে', async () => {
    const { c, calls } = setup();
    c.start();
    await tick();
    expect(c.setDeleteMode('move-to-uncategorized')).toBe(true);
    const s1 = c.getState();
    expect(s1?.kind === 'calculating' && s1.deleteMode).toBe('move-to-uncategorized');
    await tick();
    const s2 = c.getState();
    expect(s2?.kind === 'preview' && s2.preview.deleteMode).toBe('move-to-uncategorized');
    expect(calls).toEqual(['preview:delete-papers', 'preview:move-to-uncategorized']);
  });
  it('একই mode বা preview ছাড়া অবস্থায় কিছু হয় না', async () => {
    const { c } = setup();
    expect(c.setDeleteMode('delete-papers')).toBe(false);
    c.start();
    await tick();
    expect(c.setDeleteMode('delete-papers' as CategoryDeleteMode)).toBe(false);
  });
  it('পুরনো হিসাবের দেরিতে আসা ফল নতুনকে ঢাকে না', async () => {
    const first = defer<CategoryPreview>();
    const second = defer<CategoryPreview>();
    let n = 0;
    const { c } = setup({ preview: () => (++n === 1 ? first.promise : second.promise) });
    c.start();
    first.resolve(mkPreview());
    await tick();
    c.setDeleteMode('move-to-uncategorized');
    second.resolve(mkPreview({ deleteMode: 'move-to-uncategorized' }));
    await tick();
    const s = c.getState();
    expect(s?.kind === 'preview' && s.preview.deleteMode).toBe('move-to-uncategorized');
  });
});

describe('নিশ্চিত করা', () => {
  it('খালি প্রিভিউয়ে confirm চলে না', async () => {
    const { c, calls } = setup({ preview: async () => mkPreview({ empty: true }, { entries: [], extras: [] }) });
    c.start();
    await tick();
    expect(c.confirm()).toBe(false);
    expect(calls).toHaveLength(0);
  });
  it('confirm -> running -> result; extras-এর moved সূচক অনুযায়ী; সতর্কতা ডুপ্লিকেট ছাড়া', async () => {
    const { c, calls } = setup();
    c.start();
    await tick();
    expect(c.confirm()).toBe(true);
    expect(c.getState()?.kind).toBe('running');
    await tick();
    const s = c.getState();
    expect(s?.kind).toBe('result');
    if (s?.kind === 'result') {
      expect(s.result.extras.map((x) => x.moved)).toEqual([true, false]);
      expect(s.result.extrasMoved).toBe(1);
      expect(s.result.warnings).toEqual(['w1', 'w2']);
      expect(s.result.nothingChanged).toBe(false);
    }
    expect(calls).toContain('run:false');
  });
  it('massDelete থাকলে সম্মতি ছাড়া confirm চলে না; সম্মতি দিলে চলে ও run-এ যায়', async () => {
    const { c, calls } = setup({ preview: async () => mkPreview({}, { massDelete: { count: 4, total: 6 } }) });
    c.start();
    await tick();
    expect(c.confirm()).toBe(false);
    expect(c.confirm({ massDeleteConfirmed: false })).toBe(false);
    expect(c.getState()?.kind).toBe('preview');
    expect(calls).toEqual([]);
    expect(c.confirm({ massDeleteConfirmed: true })).toBe(true);
    await tick();
    expect(calls).toEqual(['run:true']);
  });
  it('প্রগ্রেস running-এ আসে', async () => {
    const d = defer<CategoryRunOutcome>();
    let report: any;
    const { c } = setup({ run: (_p, _o, onProgress) => ((report = onProgress), d.promise) });
    c.start();
    await tick();
    c.confirm();
    report({ phase: 'folders', done: 2, total: 4, percent: 50, finished: false });
    const s = c.getState();
    expect(s?.kind === 'running' && s.progress?.percent).toBe(50);
    d.resolve(outcome());
    await tick();
  });
  it('CategoryRunError(dataSafe:true) -> error, "অক্ষত"; সাধারণ ত্রুটি -> dataSafe:false', async () => {
    const a = setup({ run: async () => { throw new CategoryRunError('ছাপ মেলেনি', true, 'অ্যাপে প্রয়োগ'); } });
    a.c.start();
    await tick();
    a.c.confirm();
    await tick();
    const s1 = a.c.getState();
    expect(s1?.kind === 'error' && s1.dataSafe).toBe(true);
    expect(s1?.kind === 'error' && s1.stage).toBe('অ্যাপে প্রয়োগ');

    const b = setup({ run: async () => { throw new Error('হঠাৎ'); } });
    b.c.start();
    await tick();
    b.c.confirm();
    await tick();
    const s2 = b.c.getState();
    expect(s2?.kind === 'error' && s2.dataSafe).toBe(false);
  });
});

describe('বন্ধ', () => {
  it('result বন্ধে কিছু বদলালে onClosedResult(true)', async () => {
    const { c, calls } = setup();
    c.start();
    await tick();
    c.confirm();
    await tick();
    c.close();
    expect(c.getState()).toBeNull();
    expect(calls).toContain('closed:true');
  });
  it('কিছু না বদলালে onClosedResult ডাকে না', async () => {
    const { c, calls } = setup({
      preview: async () => mkPreview({}, { extras: [] }),
      run: async () => outcome({ counts: emptyApplyCounts(), extrasMoved: [], warnings: [] }),
    });
    c.start();
    await tick();
    c.confirm();
    await tick();
    c.close();
    expect(calls.some((x) => x.startsWith('closed'))).toBe(false);
  });
  it('error বন্ধে onClosedResult ডাকে না; preview/running-এ close কাজ করে না', async () => {
    const { c, calls } = setup({ run: async () => { throw new Error('x'); } });
    c.start();
    await tick();
    c.close();
    expect(c.getState()?.kind).toBe('preview');
    c.confirm();
    c.close();
    expect(c.getState()?.kind).toBe('running');
    await tick();
    c.close();
    expect(c.getState()).toBeNull();
    expect(calls.some((x) => x.startsWith('closed'))).toBe(false);
  });
  it('বন্ধের পর আবার start করা যায়; শ্রোতা বাদ দেওয়া যায়', async () => {
    const { c } = setup();
    let n = 0;
    const off = c.subscribe(() => n++);
    c.start();
    await tick();
    c.cancel();
    const before = n;
    off();
    expect(c.start()).toEqual({ started: true });
    await tick();
    expect(n).toBe(before);
  });
  it('শ্রোতার ভুলে সিঙ্ক থামে না', async () => {
    const { c } = setup();
    c.subscribe(() => { throw new Error('boom'); });
    c.start();
    await tick();
    expect(c.getState()?.kind).toBe('preview');
  });
});
