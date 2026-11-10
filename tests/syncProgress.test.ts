import { describe, it, expect } from 'vitest';
import { ProgressTracker, PHASE_LABEL, type SyncProgress } from '../src/storage/syncProgress';

function collect(total = 0) {
  const seen: SyncProgress[] = [];
  const t = new ProgressTracker((p) => seen.push(p), total, 'list');
  return { t, seen };
}

describe('ProgressTracker (ধাপ ২.১)', () => {
  it('done ও শতকরা কখনো পিছোয় না, মোট বাড়লেও', () => {
    const { t, seen } = collect(6);
    t.step(2);
    t.step(1);
    t.addTotal(100); // ফাইল পড়ার সংখ্যা জানা গেল
    for (let i = 0; i < 100; i++) t.step(1);
    t.step(3);
    t.finish();
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i].done).toBeGreaterThanOrEqual(seen[i - 1].done);
      expect(seen[i].percent).toBeGreaterThanOrEqual(seen[i - 1].percent);
    }
  });

  it('মোট বাড়লে বার লাফায় না: আগের শতকরা থেকে বাকি কাজের ওপর এগোয়', () => {
    const { t, seen } = collect(6);
    t.step(3); // ৫০%
    const before = seen[seen.length - 1].percent;
    expect(before).toBe(50);
    t.addTotal(94); // মোট ১০০, করা ৩
    const after = seen[seen.length - 1];
    expect(after.percent).toBe(before); // লাফ নেই, পিছোনোও নেই
    expect(after.total).toBe(100);
    t.step(47); // বাকি ৯৭-এর ওপর সমানভাবে: ৫০ + ৫০*(৪৭/৯৭) ≈ ৭৪
    const mid = seen[seen.length - 1].percent;
    expect(mid).toBeGreaterThan(before);
    expect(mid).toBeLessThan(100);
  });

  it('১০০% দেখায় শুধু finish()-এর পর', () => {
    const { t, seen } = collect(4);
    t.step(4); // সব একক শেষ, কিন্তু finish হয়নি
    expect(seen[seen.length - 1].percent).toBeLessThan(100);
    expect(seen[seen.length - 1].finished).toBe(false);
    t.finish();
    const last = seen[seen.length - 1];
    expect(last.percent).toBe(100);
    expect(last.finished).toBe(true);
    expect(last.done).toBe(last.total);
  });

  it('ব্যর্থতায়ও finish() শেষ অবস্থা দেয় (কম একক হলেও)', () => {
    const { t, seen } = collect(10);
    t.step(2);
    t.finish();
    const last = seen[seen.length - 1];
    expect(last.percent).toBe(100);
    expect(last.done).toBe(10);
  });

  it('total কখনো done-এর নিচে নামে না; অতিরিক্ত step মোট বাড়ায়', () => {
    const { t, seen } = collect(2);
    t.step(5);
    const last = seen[seen.length - 1];
    expect(last.total).toBeGreaterThanOrEqual(last.done);
    expect(last.total).toBe(5);
  });

  it('ঋণাত্মক/শূন্য addTotal ও step কিছু বদলায় না', () => {
    const { t, seen } = collect(5);
    t.step(2);
    const count = seen.length;
    t.addTotal(-3);
    t.addTotal(0);
    expect(seen.length).toBe(count); // কোনো নতুন খবর নেই
    t.step(-1);
    const last = seen[seen.length - 1];
    expect(last.done).toBe(2);
    expect(last.total).toBe(5);
  });

  it('phase ও label বহন করে; finish-এর পর আর বদলায় না', () => {
    const { t, seen } = collect(3);
    t.setPhase('read', 'Type_CQ');
    t.step(1, 'Type_CQ › পদার্থ');
    let last = seen[seen.length - 1];
    expect(last.phase).toBe('read');
    expect(last.label).toBe('Type_CQ › পদার্থ');
    t.finish();
    const n = seen.length;
    t.step(1);
    t.addTotal(5);
    t.setPhase('data');
    expect(seen.length).toBe(n);
    last = seen[seen.length - 1];
    expect(last.phase).toBe('finish');
    expect(PHASE_LABEL[last.phase]).toBeTruthy();
  });

  it('কলব্যাক না দিলে বা কলব্যাক ভুল করলে আসল কাজ থামে না', () => {
    const quiet = new ProgressTracker(undefined, 3);
    quiet.step(1);
    quiet.finish();
    expect(quiet.snapshot().percent).toBe(100);

    const noisy = new ProgressTracker(() => {
      throw new Error('UI ভুল');
    }, 3);
    noisy.step(1);
    noisy.finish();
    expect(noisy.snapshot().finished).toBe(true);
  });

  it('মোট শূন্য থাকলেও (কিছু পড়ার নেই) ফাটে না', () => {
    const { t, seen } = collect(0);
    t.setPhase('compare');
    expect(seen[seen.length - 1].percent).toBe(0);
    t.finish();
    expect(seen[seen.length - 1].percent).toBe(100);
  });
});
