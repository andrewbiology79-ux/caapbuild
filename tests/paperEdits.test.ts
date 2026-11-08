import { describe, it, expect } from 'vitest';
import {
  applyQuestionEdit,
  applyStimulusEdit,
  applyEditsToGroups,
  pruneEdits,
  sumGroupMarks,
  hasAnyEdit,
} from '../src/utils/paperEdits';

const q = (id: string, marks: number, text = 'মূল প্রশ্ন') =>
  ({ id, topicId: 't', type: 'গ', marks, questionText: text, solutionText: 'মূল সমাধান', solutionImageIds: [], rating: 3, order: 0, usedInBoards: [] }) as any;

describe('paperEdits', () => {
  it('প্রশ্নপত্র-ভিত্তিক সম্পাদনা লেখা ও নম্বর বদলায়, সমাধান না দিলে আগেরটা থাকে', () => {
    const out = applyQuestionEdit(q('q1', 3), { questions: { q1: { questionText: 'নতুন', marks: 4 } } });
    expect(out.questionText).toBe('নতুন');
    expect(out.marks).toBe(4);
    expect(out.solutionText).toBe('মূল সমাধান');
  });

  it('সম্পাদনা না থাকলে একই অবজেক্ট ফেরে', () => {
    const base = q('q1', 3);
    expect(applyQuestionEdit(base, undefined)).toBe(base);
  });

  it('উদ্দীপকের সম্পাদনা', () => {
    const s = { id: 's1', text: 'পুরনো' } as any;
    expect(applyStimulusEdit(s, { stimuli: { s1: { text: 'নতুন' } } })?.text).toBe('নতুন');
  });

  it('applyEditsToGroups মূল তালিকা বদলায় না', () => {
    const groups = [{ questions: [q('q1', 3)] }];
    const out = applyEditsToGroups(groups, { questions: { q1: { questionText: 'x', marks: 9 } } });
    expect(out[0].questions[0].marks).toBe(9);
    expect(groups[0].questions[0].marks).toBe(3);
  });

  it('sumGroupMarks সম্পাদিত নম্বরসহ যোগ করে', () => {
    const groups = [{ questions: [q('a', 3), q('b', 4)] }];
    expect(sumGroupMarks(groups)).toBe(7);
    expect(sumGroupMarks(groups, { questions: { b: { questionText: 'x', marks: 6 } } })).toBe(9);
  });

  it('pruneEdits প্রশ্নপত্রে নেই এমন সম্পাদনা ফেলে দেয়', () => {
    const edits = { questions: { a: { questionText: 'x', marks: 1 }, z: { questionText: 'y', marks: 1 } } };
    expect(pruneEdits(edits, ['a'], [])).toEqual({ questions: { a: edits.questions.a } });
    expect(pruneEdits(edits, [], [])).toBeUndefined();
    expect(hasAnyEdit(undefined)).toBe(false);
  });
});
