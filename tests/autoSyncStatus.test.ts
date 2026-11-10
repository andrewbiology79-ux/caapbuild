import { describe, it, expect, vi, afterEach } from 'vitest';
import { createAutoSyncStore, autoSyncText, AUTO_SYNC_RUNNING_TEXT, AUTO_SYNC_DONE_TEXT, AUTO_SYNC_DONE_NOTHING_TEXT, AUTO_SYNC_ERROR_TEXT } from '../src/storage/autoSyncStatus';

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
