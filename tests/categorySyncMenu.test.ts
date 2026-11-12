import { describe, it, expect } from 'vitest';
import { CATEGORY_MENU_LABEL, categoryMenuTap, withOtherWindowCheck } from '../src/storage/categorySyncMenu';
import { CATEGORY_BUSY_REASON } from '../src/storage/categorySyncView';
import { syncUnavailableReason } from '../src/storage/syncView';
import type { CategorySyncControllerDeps } from '../src/storage/categorySyncController';

describe('categoryMenuTap', () => {
  it('মেনুর লেখা', () => expect(CATEGORY_MENU_LABEL).toBe('ফোল্ডার থেকে ক্যাটাগরি সিঙ্ক করুন'));

  it('ব্রাউজারে / সিঙ্ক চালু না থাকলে বিদ্যমান কারণ ফেরত, উইন্ডো শুরু হয় না', () => {
    let started = 0;
    const start = () => (started++, { started: true as const });
    expect(categoryMenuTap({ native: false, enabled: true, start })).toBe(syncUnavailableReason(false, true));
    expect(categoryMenuTap({ native: true, enabled: false, start })).toBe(syncUnavailableReason(true, false));
    expect(started).toBe(0);
  });

  it('শুরু হলে null; না হলে নিয়ন্ত্রকের কারণ', () => {
    expect(categoryMenuTap({ native: true, enabled: true, start: () => ({ started: true }) })).toBeNull();
    expect(categoryMenuTap({ native: true, enabled: true, start: () => ({ started: false, reason: 'কারণ' }) })).toBe('কারণ');
  });
});

describe('withOtherWindowCheck', () => {
  const base = (busy: string | null): CategorySyncControllerDeps => ({
    preview: async () => {
      throw new Error('unused');
    },
    run: async () => {
      throw new Error('unused');
    },
    busyReason: () => busy,
  });

  it('পুরনো সিঙ্ক উইন্ডো খোলা থাকলে বার্তা; আগে সেটা দেখা হয়', () => {
    expect(withOtherWindowCheck(base('অটো'), () => true).busyReason?.()).toBe(CATEGORY_BUSY_REASON);
  });
  it('খোলা না থাকলে মূল busyReason (অটো সিঙ্ক) ফেরে, সেটাও না থাকলে null', () => {
    expect(withOtherWindowCheck(base('অটো সিঙ্ক চলছে'), () => false).busyReason?.()).toBe('অটো সিঙ্ক চলছে');
    expect(withOtherWindowCheck(base(null), () => false).busyReason?.()).toBeNull();
  });
  it('মূল deps-এর বাকি ফাংশন অক্ষত', () => {
    const b = base(null);
    const w = withOtherWindowCheck(b, () => false);
    expect(w.preview).toBe(b.preview);
    expect(w.run).toBe(b.run);
  });
});
