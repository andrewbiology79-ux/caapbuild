import { describe, it, expect } from 'vitest';
import { createSyncController, countsFromPreview, canConfirmPreview, type SyncControllerDeps } from '../src/storage/syncController';
import { emptyCounts } from '../src/storage/syncView';
import type { SyncPreview } from '../src/storage/syncPreview';

const mkPreview = (over: Partial<SyncPreview> = {}): SyncPreview =>
  ({
    direction: 'folder-to-app',
    stamp: '2026-11-10_10-00-00',
    createdAt: 0,
    entries: [
      { action: 'add', scope: 'type', kind: 'topic', path: ['পদার্থ', 'ch1', 'T1'] },
      { action: 'update', scope: 'type', kind: 'topic', path: ['পদার্থ', 'ch1', 'T2'] },
      { action: 'info', scope: 'type', kind: 'topic', path: ['পদার্থ', 'ch1', 'T3'] },
    ],
    conflicts: [{ kind: 'extra-folder', path: ['x'] }],
    warnings: ['w1'],
    errors: [],
    totals: {},
    empty: false,
    ...over,
  }) as unknown as SyncPreview;

const defer = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: any) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

function setup(over: Partial<SyncControllerDeps> = {}) {
  const closed: boolean[] = [];
  const deps: SyncControllerDeps = {
    preview: async () => mkPreview(),
    run: async (_d, p) => ({ counts: countsFromPreview(p) }),
    onClosedResult: (c) => closed.push(c),
    ...over,
  };
  return { c: createSyncController(deps), closed };
}

describe('countsFromPreview / canConfirmPreview', () => {
  it("'info' গোনা হয় না", () => {
    const c = countsFromPreview(mkPreview());
    expect(c.add).toBe(1);
    expect(c.update).toBe(1);
    expect(Object.values(c).reduce((a, b) => a + b, 0)).toBe(2);
  });
  it('ত্রুটি বা খালি প্রিভিউয়ে নিশ্চিত করা যায় না', () => {
    expect(canConfirmPreview(mkPreview())).toBe(true);
    expect(canConfirmPreview(mkPreview({ errors: ['e'] }))).toBe(false);
    expect(canConfirmPreview(mkPreview({ empty: true }))).toBe(false);
  });
});

describe('সরানো কনফ্লিক্ট সূচক অনুযায়ী', () => {
  it('moved শুধু যেগুলো সত্যিই সরেছে; সংখ্যা সেই অনুযায়ী', async () => {
    const two = mkPreview({
      conflicts: [
        { kind: 'extra-folder', path: ['a'] },
        { kind: 'extra-media', path: ['b'] },
      ] as any,
    });
    const { c } = setup({
      preview: async () => two,
      run: async () => ({ counts: emptyCounts(), conflictsMoved: [true, false] }),
    });
    c.start('app-to-folder');
    await tick();
    c.confirm();
    await tick();
    const s = c.getState();
    if (s?.kind !== 'result') throw new Error('result হওয়ার কথা');
    expect(s.result.conflicts.map((x) => x.moved)).toEqual([true, false]);
    expect(s.result.counts.conflictsMoved).toBe(1);
  });
});

describe('অটো সিঙ্ক উইন্ডো (৫খ)', () => {
  it('কিছু না বদলালেও নিজে বন্ধ হয় না: result + nothingChanged, [ঠিক আছে]-তে বন্ধ, রিফ্রেশ নয়', async () => {
    const { c, closed } = setup();
    expect(c.startAuto(async () => ({ counts: emptyCounts() }))).toBe(true);
    expect(c.getState()?.kind).toBe('running');
    await tick();
    await tick();
    const s = c.getState();
    if (s?.kind !== 'result') throw new Error('result হওয়ার কথা');
    expect(s.auto).toBe(true);
    expect(s.result.nothingChanged).toBe(true);
    c.close();
    expect(c.getState()).toBeNull();
    expect(closed).toEqual([]);
  });
  it('উইন্ডো খোলা থাকলে অটো শুরু হয় না; ব্যর্থতায় error (auto)', async () => {
    const { c } = setup({ preview: () => new Promise(() => {}) });
    c.start('app-to-folder');
    expect(c.startAuto(async () => ({ counts: emptyCounts() }))).toBe(false);
    c.cancel();
    expect(c.startAuto(async () => Promise.reject(new Error('x')))).toBe(true);
    await tick();
    await tick();
    const s = c.getState();
    expect(s?.kind === 'error' && s.auto === true).toBe(true);
  });
});

describe('syncController পথ', () => {
  it('calculating -> preview -> running -> result -> বন্ধ', async () => {
    const { c, closed } = setup();
    const kinds: string[] = [];
    c.subscribe(() => kinds.push(c.getState()?.kind ?? 'null'));
    expect(c.start('folder-to-app')).toBe(true);
    expect(c.getState()?.kind).toBe('calculating');
    await tick();
    expect(c.getState()?.kind).toBe('preview');
    c.confirm();
    expect(c.getState()?.kind).toBe('running');
    await tick();
    const s = c.getState();
    expect(s?.kind).toBe('result');
    if (s?.kind === 'result') {
      expect(s.result.conflicts).toHaveLength(1);
      expect(s.result.conflicts[0].moved).toBe(false);
      expect(s.result.counts.add).toBe(1);
      expect(s.result.stamp).toBe('2026-11-10_10-00-00');
      expect(s.result.nothingChanged).toBe(false);
    }
    c.close();
    expect(c.getState()).toBeNull();
    expect(closed).toEqual([true]);
    expect(kinds[kinds.length - 1]).toBe('null');
  });

  it('একটা উইন্ডো খোলা থাকলে দ্বিতীয় সিঙ্ক শুরু হয় না', () => {
    const { c } = setup({ preview: () => new Promise(() => {}) });
    expect(c.start('folder-to-app')).toBe(true);
    expect(c.start('app-to-folder')).toBe(false);
  });

  it('হিসাব চলার সময় বাতিল করলে ফল ঢোকে না (P3)', async () => {
    const d = defer<SyncPreview>();
    const { c } = setup({ preview: () => d.promise });
    c.start('app-to-folder');
    c.cancel();
    expect(c.getState()).toBeNull();
    d.resolve(mkPreview());
    await tick();
    expect(c.getState()).toBeNull();
    // বাতিলের পর নতুন সিঙ্ক শুরু করা যায়
    expect(c.start('app-to-folder')).toBe(true);
  });

  it('প্রিভিউয়ে ত্রুটি থাকলে [নিশ্চিত করুন] কিছু করে না (P1)', async () => {
    let ran = false;
    const { c } = setup({
      preview: async () => mkPreview({ errors: ['Type CQ: পড়া যায়নি'] }),
      run: async () => ((ran = true), { counts: emptyCounts() }),
    });
    c.start('folder-to-app');
    await tick();
    c.confirm();
    await tick();
    expect(ran).toBe(false);
    expect(c.getState()?.kind).toBe('preview');
  });

  it('প্রিভিউ ব্যর্থ হলে error (ডেটা অক্ষত), চলা ব্যর্থ হলে error (অক্ষত বলা হয় না); বন্ধ করলে আটকে থাকে না', async () => {
    const a = setup({ preview: async () => Promise.reject(new Error('boom')) });
    a.c.start('folder-to-app');
    await tick();
    const s1 = a.c.getState();
    expect(s1?.kind).toBe('error');
    if (s1?.kind === 'error') {
      expect(s1.dataSafe).toBe(true);
      expect(s1.message).toBe('boom');
    }
    a.c.close();
    expect(a.c.getState()).toBeNull();
    expect(a.closed).toEqual([]);

    const b = setup({ run: async () => Promise.reject(new Error('লেখা যায়নি')) });
    b.c.start('app-to-folder');
    await tick();
    b.c.confirm();
    await tick();
    const s2 = b.c.getState();
    expect(s2?.kind).toBe('error');
    if (s2?.kind === 'error') expect(s2.dataSafe).toBe(false);
    b.c.close();
    expect(b.c.getState()).toBeNull();
  });

  it('চলার সময় বাতিল/বন্ধ কিছু করে না (ব্লক), প্রগ্রেস ও সংখ্যা উইন্ডোতে আসে', async () => {
    const d = defer<{ counts: ReturnType<typeof emptyCounts> }>();
    let report!: (n: number) => void;
    const { c } = setup({
      run: (_d, _p, onProgress, onCounts) => {
        report = (n) => {
          onProgress({ phase: 'data', done: n, total: 4, percent: n * 25, finished: false, label: 'T1' });
          onCounts({ ...emptyCounts(), add: n });
        };
        return d.promise;
      },
    });
    c.start('folder-to-app');
    await tick();
    c.confirm();
    c.cancel();
    c.close();
    expect(c.getState()?.kind).toBe('running');
    report(2);
    const s = c.getState();
    if (s?.kind === 'running') {
      expect(s.progress?.done).toBe(2);
      expect(s.counts.add).toBe(2);
    } else throw new Error('running হওয়ার কথা');
    d.resolve({ counts: { ...emptyCounts(), add: 4 } });
    await tick();
    expect(c.getState()?.kind).toBe('result');
  });

  it('কিছু না বদলালে বন্ধ করার সময় রিফ্রেশ ডাকা হয় না, কনফ্লিক্ট থাকলে "কিছু বদলায়নি" নয়', async () => {
    const empty = setup({
      preview: async () => mkPreview({ entries: [{ action: 'update', scope: 'type', kind: 'topic', path: ['a'] } as any], conflicts: [] }),
      run: async () => ({ counts: emptyCounts() }),
    });
    empty.c.start('folder-to-app');
    await tick();
    empty.c.confirm();
    await tick();
    const s = empty.c.getState();
    expect(s?.kind === 'result' && s.result.nothingChanged).toBe(true);
    empty.c.close();
    expect(empty.closed).toEqual([]);

    const withConflict = setup({ run: async () => ({ counts: emptyCounts() }) });
    withConflict.c.start('folder-to-app');
    await tick();
    withConflict.c.confirm();
    await tick();
    const s2 = withConflict.c.getState();
    expect(s2?.kind === 'result' && s2.result.nothingChanged).toBe(false);
  });
});

describe('অন্য সিঙ্ক উইন্ডো (ক্যাটেগরি) খোলা থাকলে - busy', () => {
  it('busy() true হলে start ও startAuto শুরু হয় না, অবস্থা বদলায় না', () => {
    let busy = true;
    const { c } = setup({ busy: () => busy });
    expect(c.start('folder-to-app')).toBe(false);
    expect(c.startAuto(async () => ({ counts: {} as any }))).toBe(false);
    expect(c.getState()).toBeNull();
    busy = false;
    expect(c.start('folder-to-app')).toBe(true);
  });
});

describe('ধাপ ২ক - স্কোপ-সীমিত সিঙ্ক', () => {
  it('start(direction, scope): প্রিভিউ হিসাবে স্কোপ যায়; calculating অবস্থায় স্কোপ থাকে', () => {
    const seen: Array<string | undefined> = [];
    const { c } = setup({
      preview: (_d, _p, scope) => {
        seen.push(scope);
        return new Promise(() => {});
      },
    });
    expect(c.start('folder-to-app', 'type')).toBe(true);
    expect(seen).toEqual(['type']);
    const s = c.getState();
    expect(s?.kind === 'calculating' && s.scope === 'type').toBe(true);
  });

  it('স্কোপ না দিলে প্রিভিউয়ে undefined (দুটোই) - আগের আচরণ', () => {
    const seen: Array<string | undefined> = [];
    const { c } = setup({
      preview: async (_d, _p, scope) => {
        seen.push(scope);
        return mkPreview();
      },
    });
    c.start('app-to-folder');
    expect(seen).toEqual([undefined]);
  });

  it('পুরো পথে (running / result) স্কোপ বজায় থাকে এবং run প্রিভিউয়ের স্কোপ পায়', async () => {
    let runScope: string | undefined = 'unset';
    const { c } = setup({
      preview: async (_d, _p, scope) => mkPreview({ scope }),
      run: async (_d, p) => {
        runScope = p.scope;
        return { counts: countsFromPreview(p) };
      },
    });
    c.start('folder-to-app', 'chapter');
    await tick();
    const pv = c.getState();
    expect(pv?.kind === 'preview' && pv.preview.scope === 'chapter').toBe(true);
    c.confirm();
    const run = c.getState();
    expect(run?.kind === 'running' && run.scope === 'chapter').toBe(true);
    await tick();
    expect(runScope).toBe('chapter');
    const res = c.getState();
    expect(res?.kind === 'result' && res.scope === 'chapter').toBe(true);
  });

  it('প্রিভিউ ব্যর্থ হলে error অবস্থাতেও স্কোপ থাকে', async () => {
    const { c } = setup({ preview: async () => Promise.reject(new Error('boom')) });
    c.start('folder-to-app', 'type');
    await tick();
    await tick();
    const s = c.getState();
    expect(s?.kind === 'error' && s.scope === 'type').toBe(true);
  });

  it('চলার সময় ব্যর্থ হলে error অবস্থাতেও স্কোপ থাকে', async () => {
    const { c } = setup({
      preview: async (_d, _p, scope) => mkPreview({ scope }),
      run: async () => Promise.reject(new Error('লেখা যায়নি')),
    });
    c.start('app-to-folder', 'chapter');
    await tick();
    c.confirm();
    await tick();
    await tick();
    const s = c.getState();
    expect(s?.kind === 'error' && s.scope === 'chapter').toBe(true);
  });
});
