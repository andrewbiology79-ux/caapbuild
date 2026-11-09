import { describe, it, expect } from 'vitest';
import { describeDeleteRequest, askDeleteConfirm, setDeleteConfirmHandler } from '../src/storage/deleteConfirm';

describe('deleteConfirm (নিজস্ব নিশ্চিতকরণ)', () => {
  it('folders: names, question count, and the default button is "keep"', () => {
    const t = describeDeleteRequest({
      kind: 'folders',
      scope: 'type',
      total: 4,
      items: [
        { name: 'পদার্থ', kind: 'subject' },
        { name: 'গতি', kind: 'chapter' },
      ],
      questionCount: 12,
    });
    expect(t.message).toContain('• পদার্থ (বিষয়)');
    expect(t.message).toContain('• গতি (অধ্যায়)');
    expect(t.message).toContain('12টি প্রশ্ন');
    expect(t.cancelText).toBe('রেখে দাও');
    expect(t.confirmText).not.toBe(t.cancelText);
  });

  it('folders: only five names are listed, the rest is counted', () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ name: `ফোল্ডার${i}`, kind: 'topic' as const }));
    const t = describeDeleteRequest({ kind: 'folders', scope: 'type', total: 8, items, questionCount: 0 });
    expect(t.message).toContain('ফোল্ডার4');
    expect(t.message).not.toContain('ফোল্ডার5');
    expect(t.message).toContain('আরও 3টি');
    expect(t.message).not.toContain('প্রশ্নও মুছে যাবে'); // no questions inside
  });

  it('questions: counts of questions and stimuli', () => {
    const t = describeDeleteRequest({ kind: 'questions', scope: 'type', name: 'টাইপ ক', questionCount: 3, stimulusCount: 1 });
    expect(t.message).toContain('"টাইপ ক"');
    expect(t.message).toContain('3টি প্রশ্ন ও 1টি উদ্দীপক');
    const t2 = describeDeleteRequest({ kind: 'questions', scope: 'chapter', name: 'x', questionCount: 2, stimulusCount: 0 });
    expect(t2.message).not.toContain('উদ্দীপক ফাইলে');
  });

  it('no handler -> keep (false)', async () => {
    setDeleteConfirmHandler(null);
    expect(await askDeleteConfirm({ kind: 'questions', scope: 'type', name: 'x', questionCount: 1, stimulusCount: 0 })).toBe(false);
  });

  it('handler answer is passed through; error or odd answer -> keep', async () => {
    const req = { kind: 'questions' as const, scope: 'type' as const, name: 'x', questionCount: 1, stimulusCount: 0 };
    setDeleteConfirmHandler(async () => true);
    expect(await askDeleteConfirm(req)).toBe(true);
    setDeleteConfirmHandler(async () => false);
    expect(await askDeleteConfirm(req)).toBe(false);
    setDeleteConfirmHandler(async () => {
      throw new Error('boom');
    });
    expect(await askDeleteConfirm(req)).toBe(false);
    setDeleteConfirmHandler((async () => 'yes') as any);
    expect(await askDeleteConfirm(req)).toBe(false);
    setDeleteConfirmHandler(null);
  });
});
