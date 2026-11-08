import { describe, it, expect } from 'vitest';
import { normalizeForCompare } from '../src/utils/duplicateCheck';

describe('duplicateCheck.normalizeForCompare', () => {
  it('স্পেস, $ ও যতিচিহ্ন ছাড়া একই লেখা মেলে', () => {
    expect(normalizeForCompare('$x^2$ কত?')).toBe(normalizeForCompare('x^2   কত'));
  });

  it('ছবির মার্কার উপেক্ষা করে', () => {
    expect(normalizeForCompare('ক [[img:a1]] খ')).toBe(normalizeForCompare('কখ'));
  });

  it('ইংরেজি বড়-ছোট হাত সমান', () => {
    expect(normalizeForCompare('ABC')).toBe(normalizeForCompare('abc'));
  });

  it('ভিন্ন লেখা মেলে না, ফাঁকা ইনপুটে ফাঁকা', () => {
    expect(normalizeForCompare('এক')).not.toBe(normalizeForCompare('দুই'));
    expect(normalizeForCompare(undefined)).toBe('');
  });
});
