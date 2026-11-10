import { describe, it, expect } from 'vitest';
import { planConflictMoves, withNumberSuffix } from '../src/storage/syncConflictPlan';

const c = (sourcePath: string, scope: 'type' | 'chapter' = 'type') => ({ scope, sourcePath }) as any;

describe('planConflictMoves', () => {
  it('ওপরের ফোল্ডার আগে; ভেতরেরটা সঙ্গে যায় (আলাদা সরানো নয়)', () => {
    const p = planConflictMoves([c('বিষয়/অধ্যায়/টাইপ/data.json'), c('বিষয়/অধ্যায়'), c('অন্য')]);
    expect(p.order).toEqual([2, 1]);
    expect(p.covered.get(0)).toBe(1);
  });
  it('একই নামের অংশ ভুল করে ভেতরে ধরা হয় না (ab বনাম a)', () => {
    const p = planConflictMoves([c('a'), c('ab')]);
    expect(p.order).toEqual([0, 1]);
    expect(p.covered.size).toBe(0);
  });
  it('আলাদা স্কোপের একই পথ আলাদা', () => {
    const p = planConflictMoves([c('x', 'type'), c('x/y', 'chapter')]);
    expect(p.order).toEqual([0, 1]);
  });
  it('খালি তালিকা', () => {
    expect(planConflictMoves([]).order).toEqual([]);
  });
});

describe('withNumberSuffix (unnecessary/-তে একই নাম থাকলে)', () => {
  it('ফাইলের এক্সটেনশন ঠিক থাকে, ফোল্ডারের শেষে সংখ্যা বসে', () => {
    expect(withNumberSuffix('a/media/x.webp', 2)).toBe('a/media/x (2).webp');
    expect(withNumberSuffix('a/ফোল্ডার', 3)).toBe('a/ফোল্ডার (3)');
    expect(withNumberSuffix('a.b/ফোল্ডার', 2)).toBe('a.b/ফোল্ডার (2)');
  });
});
