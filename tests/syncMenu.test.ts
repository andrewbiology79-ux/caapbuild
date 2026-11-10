import { describe, it, expect } from 'vitest';
import { syncUnavailableReason } from '../src/storage/syncView';

describe('syncUnavailableReason', () => {
  it('ব্রাউজারে ও সিঙ্ক বন্ধ থাকলে কারণ বলে, চালু থাকলে null', () => {
    expect(syncUnavailableReason(false, false)).toContain('অ্যান্ড্রয়েড');
    expect(syncUnavailableReason(true, false)).toContain('চালু হয়নি');
    expect(syncUnavailableReason(true, true)).toBeNull();
  });
});
