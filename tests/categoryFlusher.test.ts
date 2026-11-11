import { describe, it, expect } from 'vitest';
import { createCategoryFlusher, createMessageThrottle, type FlusherDeps, type FlushOutcome } from '../src/storage/categoryFlusher';
import { createCategoryQueue } from '../src/storage/categoryQueue';

function setup(over: Partial<FlusherDeps> = {}) {
  const queue = createCategoryQueue();
  const log: string[] = [];
  const timers: Array<{ fn: () => void; ms: number; live: boolean }> = [];
  let running = false;
  const deps: FlusherDeps = {
    queue,
    waitEditorsClosed: async () => true,
    expandContent: async () => [],
    flush: async (work) => {
      log.push(`flush:${Array.from(work.categories).sort().join(',')}`);
      return { changed: true, messages: [] } as FlushOutcome;
    },
    banner: {
      isRunning: () => running,
      start: () => {
        running = true;
        log.push('start');
      },
      finish: (c) => {
        running = false;
        log.push(`finish:${c}`);
      },
      fail: () => {
        running = false;
        log.push('fail');
      },
    },
    onMessages: (m) => log.push(`msg:${m.join('|')}`),
    onError: (m) => log.push(`err:${m}`),
    setTimer: (fn, ms) => {
      const t = { fn, ms, live: true };
      timers.push(t);
      return t;
    },
    clearTimer: (h) => {
      (h as any).live = false;
    },
    ...over,
  };
  return { queue, log, timers, flusher: createCategoryFlusher(deps), setRunning: (v: boolean) => (running = v) };
}

describe('createCategoryFlusher', () => {
  it('schedule() debounce: টাইমার ০.৮ সেকেন্ডের, আবার ডাকলে আগেরটা বাতিল', () => {
    const s = setup();
    s.flusher.schedule();
    s.flusher.schedule();
    expect(s.timers.length).toBe(2);
    expect(s.timers[0].live).toBe(false);
    expect(s.timers[1].live).toBe(true);
    expect(s.timers[1].ms).toBe(800);
  });

  it('জমা কাজ না থাকলে কিছু চলে না, ব্যানারও আসে না', async () => {
    const s = setup();
    await s.flusher.flushNow();
    expect(s.log).toEqual([]);
  });

  it('স্বাভাবিক পথ: ব্যানার শুরু -> লেখা -> শেষ; সারি খালি', async () => {
    const s = setup();
    s.queue.markCategory('c1');
    await s.flusher.flushNow();
    expect(s.log).toEqual(['start', 'flush:c1', 'finish:true']);
    expect(s.queue.hasPending()).toBe(false);
  });

  it('সতর্কতা থাকলে onMessages ডাকে', async () => {
    const s = setup({ flush: async () => ({ changed: false, messages: ['ক', 'খ'] }) });
    s.queue.markCategory('c1');
    await s.flusher.flushNow();
    expect(s.log).toEqual(['start', 'msg:ক|খ', 'finish:false']);
  });

  it('ফর্ম খোলা থাকলে (অপেক্ষা থামলে) কাজ সারিতেই থাকে, ব্যানার আসে না', async () => {
    const s = setup({ waitEditorsClosed: async () => false });
    s.queue.markCategory('c1');
    await s.flusher.flushNow();
    expect(s.log).toEqual([]);
    expect(s.queue.hasPending()).toBe(true);
  });

  it('লেখা ব্যর্থ হলে কাজ ফেরে, ত্রুটি জানায়, ব্যানার fail', async () => {
    const s = setup({
      flush: async () => {
        throw new Error('ডিস্ক ভরা');
      },
    });
    s.queue.markCategory('c1');
    s.queue.markDelete('c2');
    await s.flusher.flushNow();
    expect(s.log).toEqual(['start', 'err:ডিস্ক ভরা', 'fail']);
    const back = s.queue.take();
    expect(Array.from(back.categories)).toEqual(['c1']);
    expect(Array.from(back.deletes)).toEqual(['c2']);
  });

  it('expandContent ব্যর্থ হলেও কাজ ফেরে', async () => {
    const s = setup({
      expandContent: async () => {
        throw new Error('পড়া যায়নি');
      },
    });
    s.queue.markContent('q1');
    await s.flusher.flushNow();
    expect(s.queue.hasPending()).toBe(true);
    expect(s.log.includes('err:পড়া যায়নি')).toBe(true);
  });

  it('অন্য অটো সিঙ্ক চলছে (ব্যানার running) হলে ব্যানার দ্বিতীয়বার শুরু/শেষ করে না', async () => {
    const s = setup();
    s.setRunning(true);
    s.queue.markCategory('c1');
    await s.flusher.flushNow();
    expect(s.log).toEqual(['flush:c1']);
  });

  it('লেখার সময় নতুন বদল এলে শেষে আরেকবার চলে', async () => {
    let calls = 0;
    const s = setup();
    const flusher = createCategoryFlusher({
      queue: s.queue,
      waitEditorsClosed: async () => true,
      expandContent: async () => [],
      flush: async (work) => {
        calls++;
        if (calls === 1) s.queue.markCategory('c2'); // লেখার মাঝখানে নতুন বদল
        return { changed: true, messages: [] };
      },
      banner: { isRunning: () => false, start() {}, finish() {}, fail() {} },
      onMessages() {},
      onError() {},
    });
    s.queue.markCategory('c1');
    const p1 = flusher.flushNow();
    const p2 = flusher.flushNow(); // চলার সময় আবার ডাকা
    await Promise.all([p1, p2]);
    expect(calls).toBe(2);
    expect(s.queue.hasPending()).toBe(false);
  });

  it('stop() টাইমার বাতিল করে ও অপেক্ষা থামায়; কাজ সারিতে থাকে', async () => {
    let sawStopped = false;
    const s = setup({
      waitEditorsClosed: async (isStopped) => {
        sawStopped = isStopped();
        return !isStopped();
      },
    });
    s.queue.markCategory('c1');
    s.flusher.schedule();
    s.flusher.stop();
    expect(s.timers[0].live).toBe(false);
    await s.flusher.flushNow();
    expect(sawStopped).toBe(true);
    expect(s.queue.hasPending()).toBe(true);
  });
});

describe('createMessageThrottle', () => {
  it('নতুন বার্তা যায়, একই বার্তা সময়ের মধ্যে আবার এলে বাদ', () => {
    let t = 0;
    const f = createMessageThrottle(1000, () => t);
    expect(f(['ক', 'খ'])).toEqual(['ক', 'খ']);
    t = 500;
    expect(f(['ক', 'গ'])).toEqual(['গ']);
  });

  it('সময় পেরোলে একই বার্তা আবার যায়', () => {
    let t = 0;
    const f = createMessageThrottle(1000, () => t);
    f(['ক']);
    t = 1000;
    expect(f(['ক'])).toEqual(['ক']);
  });

  it('খালি তালিকায় খালি', () => {
    expect(createMessageThrottle()([])).toEqual([]);
  });
});
