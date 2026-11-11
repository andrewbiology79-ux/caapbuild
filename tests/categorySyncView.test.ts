import { describe, it, expect } from 'vitest';
import {
  canConfirmCategoryPreview,
  categoryEntryText,
  categoryErrorSafety,
  categoryExtraGroupSummary,
  categoryExtraMoveText,
  categoryResultCells,
  categoryResultHeadline,
  categoryResultNotes,
  categoryTotalsChips,
  deletedCategoryPapers,
  emptyApplyCounts,
  emptyPreviewText,
  groupCategoryEntries,
  groupCategoryExtras,
  isCategoryBlocking,
  makeCategoryResultView,
  massDeleteText,
  needsDeleteChoice,
  pendingNotice,
  protectedLines,
  DELETE_CHOICES,
  type CategoryDialogState,
  type CategoryResultExtra,
} from '../src/storage/categorySyncView';
import type { CategoryEntry, CategoryExtra, CategoryTotals } from '../src/storage/categoryCompare';

const entry = (over: Partial<CategoryEntry>): CategoryEntry => ({ kind: 'category', action: 'add', id: 'c1', path: ['পদার্থ'], ...over });
const extra = (over: Partial<CategoryExtra> = {}): CategoryExtra => ({
  kind: 'extra-file',
  owner: ['পদার্থ'],
  name: 'x.webp',
  path: ['পদার্থ', 'x.webp'],
  folderSide: 'বাড়তি ফাইল: x.webp',
  sourcePath: 'পদার্থ/x.webp',
  moveTo: 'Download/QB Collection/Category/পদার্থ/unnecessary/x.webp',
  ...over,
});
const totals = (over: Partial<CategoryTotals> = {}): CategoryTotals => ({
  categoriesAdded: 0,
  categoriesRenamed: 0,
  categoriesDeleted: 0,
  papersAdded: 0,
  papersUpdated: 0,
  papersMoved: 0,
  papersDeleted: 0,
  extras: 0,
  warnings: 0,
  ...over,
});

describe('categoryEntryText', () => {
  it('নাম বদলে আগে → পরে', () => {
    const t = categoryEntryText(entry({ action: 'rename', from: 'পুরনো', to: 'নতুন' }));
    expect(t.actionLabel).toBe('নাম বদল');
    expect(t.kindLabel).toBe('ক্যাটেগরি');
    expect(t.change).toBe('পুরনো → নতুন');
    expect(t.destructive).toBe(false);
  });
  it('প্রশ্নপত্রের পথ ও ব্যাংকে-নেই সংখ্যা', () => {
    const t = categoryEntryText(entry({ kind: 'paper', path: ['পদার্থ', 'প্রশ্নপত্র ১'], bankMissingIds: ['q1', 'q2'], note: 'টীকা' }));
    expect(t.pathText).toBe('পদার্থ › প্রশ্নপত্র ১');
    expect(t.kindLabel).toBe('প্রশ্নপত্র');
    expect(t.detail).toContain('২টি প্রশ্ন ব্যাংকে নেই');
    expect(t.detail).toContain('টীকা');
  });
  it('মোছা সারি লাল; "আগের জায়গা" দেখায় না', () => {
    const t = categoryEntryText(entry({ action: 'delete', from: 'পদার্থ', destructive: true, note: 'ফোল্ডার নেই' }));
    expect(t.destructive).toBe(true);
    expect(t.change).toBeUndefined();
  });
  it('সরানোয় আগের জায়গা', () => {
    expect(categoryEntryText(entry({ kind: 'paper', action: 'move', from: 'রসায়ন' })).change).toBe('আগের জায়গা: রসায়ন');
  });
});

describe('groupCategoryEntries', () => {
  it('ক্যাটেগরি অনুযায়ী গোষ্ঠী; মোছা ক্যাটেগরির গোষ্ঠী শেষে', () => {
    const g = groupCategoryEntries([
      entry({ action: 'delete', id: 'd', path: ['পুরনো'] }),
      entry({ kind: 'paper', id: 'p1', path: ['পদার্থ', 'P1'] }),
      entry({ kind: 'paper', id: 'p2', path: ['পদার্থ', 'P2'] }),
      entry({ id: 'c2', path: ['রসায়ন'] }),
    ]);
    expect(g.map((x) => x.title)).toEqual(['পদার্থ', 'রসায়ন', 'পুরনো']);
    expect(g[0].entries).toHaveLength(2);
  });
});

describe('categoryTotalsChips', () => {
  it('শূন্য বাদ; মোছা লাল; বাড়তি ও সতর্কতা আছে', () => {
    const c = categoryTotalsChips(totals({ categoriesAdded: 1, papersAdded: 3, papersDeleted: 2, extras: 4, warnings: 1 }));
    expect(c.map((x) => x.key)).toEqual(['cat-add', 'paper-add', 'paper-delete', 'extras', 'warnings']);
    expect(c.find((x) => x.key === 'paper-delete')!.tone).toBe('danger');
    expect(c.find((x) => x.key === 'paper-add')!.text).toBe('৩টি নতুন প্রশ্নপত্র');
  });
  it('সব শূন্য = খালি', () => {
    expect(categoryTotalsChips(totals())).toHaveLength(0);
  });
});

describe('protectedLines', () => {
  it('ভাঙা ও সন্দেহজনক আলাদা লেখা, কারণসহ', () => {
    const lines = protectedLines({
      protectedCategories: [
        { id: 'a', name: 'ক', reason: 'invalid', skippedPapers: 0, heldPapers: 2, why: ['JSON ভাঙা'] },
        { id: 'b', name: 'খ', reason: 'unsafe', skippedPapers: 1, heldPapers: 3, why: ['১', '২', '৩', '৪'] },
      ],
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('"ক"');
    expect(lines[0]).toContain('পড়া যায়নি');
    expect(lines[0]).toContain('JSON ভাঙা');
    expect(lines[1]).toContain('১টি প্রশ্নপত্র বাদ পড়েছে');
    expect(lines[1]).toContain('৩টি সুরক্ষিত');
    expect(lines[1]).toContain('আরও ১টি');
  });
  it('না থাকলে খালি', () => {
    expect(protectedLines({})).toEqual([]);
  });
});

describe('সতর্কতা ও বাছাই', () => {
  it('massDeleteText সংখ্যাসহ', () => {
    const t = massDeleteText({ count: 5, total: 8 });
    expect(t).toContain('৮টির মধ্যে ৫টি');
  });
  it('pendingNotice শূন্যে null', () => {
    expect(pendingNotice(0)).toBeNull();
    expect(pendingNotice(2)).toContain('২টি বদল');
  });
  it('needsDeleteChoice ও deletedCategoryPapers', () => {
    const r = { entries: [entry({ action: 'delete', papers: 3 }), entry({ action: 'delete', id: 'c9', papers: 2 }), entry({ id: 'c3' })] };
    expect(needsDeleteChoice(r)).toBe(true);
    expect(deletedCategoryPapers(r)).toEqual({ categories: 2, papers: 5 });
    expect(needsDeleteChoice({ entries: [entry({})] })).toBe(false);
  });
  it('DELETE_CHOICES দুটি অপশন', () => {
    expect(DELETE_CHOICES.map((c) => c.mode)).toEqual(['delete-papers', 'move-to-uncategorized']);
  });
  it('emptyPreviewText', () => {
    expect(emptyPreviewText({ rootExists: true })).toContain('মিলে আছে');
    expect(emptyPreviewText({ rootExists: false })).toContain('পাওয়া যায়নি');
  });
});

describe('canConfirmCategoryPreview', () => {
  const mk = (empty: boolean, entries: CategoryEntry[], extras: CategoryExtra[] = []) => ({ empty, result: { entries, extras, warnings: [], dirNames: {} } });
  it('খালি = না', () => expect(canConfirmCategoryPreview(mk(true, []))).toBe(false));
  it('শুধু info সারি = না', () => expect(canConfirmCategoryPreview(mk(false, [entry({ action: 'info' })]))).toBe(false));
  it('বদল থাকলে হ্যাঁ', () => expect(canConfirmCategoryPreview(mk(false, [entry({})]))).toBe(true));
  it('শুধু বাড়তি জিনিস থাকলেও হ্যাঁ', () => expect(canConfirmCategoryPreview(mk(false, [], [extra()]))).toBe(true));
});

describe('বাড়তি জিনিস', () => {
  it('একই ফোল্ডারের জিনিস একসাথে; সারাংশ', () => {
    const g = groupCategoryExtras([
      extra({ name: 'a.webp' }),
      extra({ name: 'b.png', moveTo: 'Download/QB Collection/Category/পদার্থ/unnecessary/b.png' }),
      extra({ kind: 'extra-folder', name: 'old' , moveTo: 'Download/QB Collection/Category/পদার্থ/unnecessary/old'}),
      extra({ name: 'n.txt', moveTo: 'Download/QB Collection/Category/পদার্থ/unnecessary/n.txt' }),
      extra({ owner: [], name: 'root.txt', path: ['root.txt'], moveTo: 'Download/QB Collection/Category/unnecessary/root.txt' }),
    ]);
    expect(g).toHaveLength(2);
    expect(g[0].ownerText).toBe('পদার্থ');
    expect(g[0].moveToText.endsWith('/পদার্থ/unnecessary')).toBe(true);
    expect(categoryExtraGroupSummary(g[0])).toBe('২টি ছবি, ১টি ফোল্ডার, ১টি ফাইল');
    expect(g[1].ownerText).toBe('Category');
  });
  it('categoryExtraMoveText', () => {
    expect(categoryExtraMoveText(false, 'X')).toBe('সরানো হবে: X');
    expect(categoryExtraMoveText(true, 'X')).toContain('সরানো হয়েছে');
  });
});

describe('ফল', () => {
  const extras = (moved: boolean[]): CategoryResultExtra[] => moved.map((m, i) => ({ ...extra({ name: `f${i}` }), moved: m }));
  it('কিছু বদলায়নি = nothingChanged; বাড়তি থাকলে নয়', () => {
    expect(makeCategoryResultView(emptyApplyCounts()).nothingChanged).toBe(true);
    expect(makeCategoryResultView(emptyApplyCounts(), extras([false])).nothingChanged).toBe(false);
    expect(makeCategoryResultView({ ...emptyApplyCounts(), papersAdded: 1 }).nothingChanged).toBe(false);
  });
  it('ব্যাংকে-নেই প্রশ্ন ও সারির সংখ্যা', () => {
    const r = makeCategoryResultView({ ...emptyApplyCounts(), papersAdded: 2 }, extras([true, false]), ['w'], [
      { paperId: 'p1', categoryId: 'c', questionIds: ['a', 'b'] },
      { paperId: 'p2', categoryId: 'c', questionIds: ['c'] },
    ], 1);
    expect(r.extrasMoved).toBe(1);
    expect(r.bankMissingPapers).toBe(2);
    expect(r.bankMissingQuestions).toBe(3);
    const notes = categoryResultNotes(r);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toContain('২টি প্রশ্নপত্রের ৩টি প্রশ্ন ব্যাংকে নেই');
    expect(notes[1]).toContain('১টি ক্যাটেগরির ফোল্ডার');
  });
  it('categoryResultCells শূন্য বাদ', () => {
    const r = makeCategoryResultView({ ...emptyApplyCounts(), categoriesDeleted: 1, papersAdded: 2 }, extras([true]));
    expect(categoryResultCells(r).map((c) => c.key)).toEqual(['paper-add', 'cat-delete', 'extras']);
    expect(categoryResultCells(r).find((c) => c.key === 'cat-delete')!.tone).toBe('danger');
  });
  it('শিরোনাম ও ত্রুটির নিরাপত্তা-লেখা', () => {
    expect(categoryResultHeadline(makeCategoryResultView(emptyApplyCounts()))).toContain('কিছু বদলায়নি');
    expect(categoryErrorSafety(true)).toContain('অক্ষত');
    expect(categoryErrorSafety(false)).toContain('আবার সিঙ্ক');
  });
});

describe('isCategoryBlocking', () => {
  it('শুধু running-এ Back ব্লক', () => {
    const s = (k: CategoryDialogState['kind']) => ({ kind: k }) as unknown as CategoryDialogState;
    expect(isCategoryBlocking(null)).toBe(false);
    expect(isCategoryBlocking(s('running'))).toBe(true);
    expect(isCategoryBlocking(s('preview'))).toBe(false);
    expect(isCategoryBlocking(s('result'))).toBe(false);
  });
});
