import { describe, it, expect } from 'vitest';
import {
  firstErrorTargetId,
  FORM_ERR_CHAPTER_ID,
  FORM_ERR_TOPIC_ID,
  FORM_ERR_STIMULUS_ID,
  formErrBlockTextId,
} from '../src/utils/formErrorTarget';

describe('firstErrorTargetId', () => {
  const blocks = ['b1', 'b2', 'b3'];

  it('ত্রুটি না থাকলে null', () => {
    expect(firstErrorTargetId({}, blocks)).toBeNull();
    expect(firstErrorTargetId({ questions: {} }, blocks)).toBeNull();
  });

  it('অধ্যায়/টপিক সবার আগে (ওপরে আছে)', () => {
    const all = { chapter: 'x', stimulus: 'y', questions: { b1: 'z' } };
    expect(firstErrorTargetId(all, blocks)).toBe(FORM_ERR_CHAPTER_ID);
    expect(firstErrorTargetId({ topic: 'x', stimulus: 'y', questions: { b1: 'z' } }, blocks)).toBe(FORM_ERR_TOPIC_ID);
  });

  it('তারপর উদ্দীপক', () => {
    expect(firstErrorTargetId({ stimulus: 'y', questions: { b1: 'z' } }, blocks)).toBe(FORM_ERR_STIMULUS_ID);
  });

  it('প্রশ্ন ব্লকে ব্লকের ক্রম ধরে প্রথমটা; object-এর key ক্রম নয়', () => {
    // key বসানো হয়েছে উল্টো ক্রমে, তবু b2 আগে (ব্লক তালিকায় b2 আগে)
    expect(firstErrorTargetId({ questions: { b3: 'e', b2: 'e' } }, blocks)).toBe(formErrBlockTextId('b2'));
  });

  it("খালি স্ট্রিং ('') মুছে-ফেলা ত্রুটি, তাই বাদ", () => {
    expect(firstErrorTargetId({ questions: { b1: '', b3: 'e' } }, blocks)).toBe(formErrBlockTextId('b3'));
    expect(firstErrorTargetId({ questions: { b1: '' } }, blocks)).toBeNull();
  });

  it('তালিকায় নেই এমন ব্লকের ত্রুটি উপেক্ষা', () => {
    expect(firstErrorTargetId({ questions: { gone: 'e' } }, blocks)).toBeNull();
  });
});
