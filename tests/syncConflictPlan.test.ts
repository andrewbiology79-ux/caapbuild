import { describe, it, expect } from 'vitest';
import { planConflictMoves } from '../src/storage/syncConflictPlan';

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
