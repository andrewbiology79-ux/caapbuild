import { describe, it, expect, vi, afterEach } from 'vitest';
import { createAutoSyncStore, autoSyncText, autoSyncStripClass, AUTO_SYNC_RUNNING_CLASS, AUTO_SYNC_DONE_CLASS, AUTO_SYNC_ERROR_CLASS, AUTO_SYNC_RUNNING_TEXT, AUTO_SYNC_DONE_TEXT, AUTO_SYNC_DONE_NOTHING_TEXT, AUTO_SYNC_ERROR_TEXT } from '../src/storage/autoSyncStatus';

afterEach(() => vi.useRealTimers());

describe('অটো সিঙ্কের ছোট অবস্থা (রিবনের নিচের লেখা)', () => {
  it('শুরুতে idle, লেখা খালি', () => {
    const s = createAutoSyncStore();
    expect(s.get().phase).toBe('idle');
    expect(autoSyncText(s.get())).toBe('');
    expect(s.isRunning()).toBe(false);
  });

  it('start -> \"অটো সিঙ্ক হচ্ছে…\"', () => {
    const s = createAutoSyncStore();
    s.start();
    expect(s.isRunning()).toBe(true);
    expect(autoSyncText(s.get())).toBe(AUTO_SYNC_RUNNING_TEXT);
  });

  it('finish: বদল থাকলে/না থাকলে আলাদা লেখা, কিছুক্ষণ পর idle', () => {
    vi.useFakeTimers();
    const s = createAutoSyncStore(1000);
    s.start();
    s.finish(true);
    expect(autoSyncText(s.get())).toBe(AUTO_SYNC_DONE_TEXT);
    vi.advanceTimersByTime(1000);
    expect(s.get().phase).toBe('idle');
    s.start();
    s.finish(false);
    expect(autoSyncText(s.get())).toBe(AUTO_SYNC_DONE_NOTHING_TEXT);
  });

  it('fail: ত্রুটির লেখা, কিছুক্ষণ পর idle', () => {
    vi.useFakeTimers();
    const s = createAutoSyncStore(500);
    s.start();
    s.fail();
    expect(autoSyncText(s.get())).toBe(AUTO_SYNC_ERROR_TEXT);
    vi.advanceTimersByTime(500);
    expect(s.get().phase).toBe('idle');
  });

  it('নতুন start আগের শেষের টাইমার বাতিল করে (চলার মাঝে হঠাৎ মুছে যায় না)', () => {
    vi.useFakeTimers();
    const s = createAutoSyncStore(1000);
    s.start();
    s.finish(true);
    vi.advanceTimersByTime(500);
    s.start();
    vi.advanceTimersByTime(2000);
    expect(s.get().phase).toBe('running');
  });

  it('শ্রোতাকে জানায়, unsubscribe করলে আর নয়', () => {
    const s = createAutoSyncStore();
    const fn = vi.fn();
    const off = s.subscribe(fn);
    s.start();
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    s.fail();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('ধাপ ২খ - রিবনের নিচের লেখার রঙ', () => {
  it('চলছে = হলুদ পটভূমি, গাঢ় লেখা', () => {
    const c = autoSyncStripClass({ phase: 'running' });
    expect(c).toBe(AUTO_SYNC_RUNNING_CLASS);
    expect(c).toContain('bg-yellow-400');
    expect(c).toContain('text-slate-900');
  });

  it('শেষ = সবুজ (কিছু বদলাক বা না বদলাক), সাদা লেখা', () => {
    for (const st of [{ phase: 'done', changed: true }, { phase: 'done', changed: false }] as const) {
      expect(autoSyncStripClass(st)).toBe(AUTO_SYNC_DONE_CLASS);
    }
    expect(AUTO_SYNC_DONE_CLASS).toContain('bg-green-600');
    expect(AUTO_SYNC_DONE_CLASS).toContain('text-white');
  });

  it('ত্রুটি = লাল, সাদা লেখা', () => {
    expect(autoSyncStripClass({ phase: 'error' })).toBe(AUTO_SYNC_ERROR_CLASS);
    expect(AUTO_SYNC_ERROR_CLASS).toContain('bg-red-600');
    expect(AUTO_SYNC_ERROR_CLASS).toContain('text-white');
  });

  it('তিন রঙ আলাদা', () => {
    expect(new Set([AUTO_SYNC_RUNNING_CLASS, AUTO_SYNC_DONE_CLASS, AUTO_SYNC_ERROR_CLASS]).size).toBe(3);
  });
});
