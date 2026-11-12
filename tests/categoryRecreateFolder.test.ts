import { describe, it, expect } from 'vitest';
import type { Category, Paper } from '../src/db/db';
import { compareFolderToApp, hasAnyCategoryChange, summarizeCategory, type CategoryDeleteMode } from '../src/storage/categoryCompare';
import type { CategorySyncState } from '../src/storage/categoryLayout';
import { planCategoryApply, previewSignature, stampIdMaker } from '../src/storage/categoryApplyPlan';
import {
  DELETE_CHOICES,
  canConfirmCategoryPreview,
  categoryEntryText,
  categoryRecreateChip,
  deletedCategoryPapers,
  makeCategoryResultView,
  emptyApplyCounts,
  categoryResultCells,
  needsDeleteChoice,
  RECREATE_ACTION_LABEL,
} from '../src/storage/categorySyncView';
import type { CategoryPreview } from '../src/storage/categoryScanner';

const cat = (id: string, name: string, order: number): Category => ({ id, name, order, createdAt: order });
const paper = (id: string, categoryId: string, shortName: string): Paper => ({
  id,
  shortName,
  category: '',
  categoryId,
  createdAt: 1000,
  title: 'শিরোনাম',
  questionIds: ['q1'],
});

const UNC = cat('u', 'অশ্রেণিবদ্ধ', 0);

/** অ্যাপে ক্যাটেগরি c1 (দুটি প্রশ্নপত্র) আছে, স্মৃতিতেও আছে, কিন্তু Category/-তে ফোল্ডার নেই */
function missingFolder(mode?: CategoryDeleteMode) {
  const state: CategorySyncState = {
    version: 1,
    categories: { c1: { dirName: 'উইকলি', dataMtime: 1, dataSize: 10 }, c2: { dirName: 'মডেল', dataMtime: 1, dataSize: 10 } },
    papers: { p1: { categoryId: 'c1' }, p2: { categoryId: 'c1' }, p3: { categoryId: 'c2' } },
  };
  const categories = [UNC, cat('c1', 'উইকলি', 1), cat('c2', 'মডেল', 2)];
  const papers = [paper('p1', 'c1', 'উইকলি-১'), paper('p2', 'c1', 'উইকলি-২'), paper('p3', 'c2', 'মডেল-১')];
  const result = compareFolderToApp({
    folder: { rootExists: true, nodes: [], rootExtras: [] },
    app: { categories, papers },
    state,
    onCategoryDelete: mode,
    makeId: stampIdMaker('T'),
  });
  return { state, categories, papers, result };
}

describe('recreate-folder: compare', () => {
  it('ডিফল্টে ফোল্ডার-নেই ক্যাটেগরি মোছা পড়ে (আগের আচরণ অপরিবর্তিত)', () => {
    const { result } = missingFolder();
    expect(result.entries.filter((e) => e.kind === 'category' && e.action === 'delete')).toHaveLength(2);
    expect(result.entries.some((e) => e.recreateFolder)).toBe(false);
  });

  it('recreate-folder: কিছু মোছা নয়, শুধু info + recreateFolder; প্রশ্নপত্র থাকে', () => {
    const { result } = missingFolder('recreate-folder');
    expect(result.entries.filter((e) => e.action === 'delete')).toHaveLength(0);
    const rec = result.entries.filter((e) => e.recreateFolder);
    expect(rec.map((e) => e.id).sort()).toEqual(['c1', 'c2']);
    expect(rec.find((e) => e.id === 'c1')).toMatchObject({ kind: 'category', action: 'info', papers: 2 });
    expect(rec.find((e) => e.id === 'c1')?.destructive).toBeFalsy();
    expect(result.massDelete).toBeUndefined();
  });

  it('recreate-folder: totals-এ মোছা শূন্য, তবু "বদল আছে" ধরা হয়', () => {
    const { result } = missingFolder('recreate-folder');
    const t = summarizeCategory(result);
    expect(t.categoriesDeleted).toBe(0);
    expect(t.papersDeleted).toBe(0);
    expect(hasAnyCategoryChange(result)).toBe(true);
  });

  it('অশ্রেণিবদ্ধ: recreate বাছলেও আগের মতো সাধারণ info (recreateFolder নয়)', () => {
    const state: CategorySyncState = { version: 1, categories: { u: { dirName: 'অশ্রেণিবদ্ধ' } }, papers: {} };
    const r = compareFolderToApp({
      folder: { rootExists: true, nodes: [], rootExtras: [] },
      app: { categories: [UNC], papers: [] },
      state,
      onCategoryDelete: 'recreate-folder',
      makeId: stampIdMaker('T'),
    });
    expect(r.entries.filter((e) => e.action === 'info')).toHaveLength(1);
    expect(r.entries.some((e) => e.recreateFolder)).toBe(false);
  });

  it('অ্যাপের জমে থাকা বদল থাকলে সেই ক্যাটেগরি ছোঁয়া হয় না (recreate-এও)', () => {
    const { state, categories, papers } = missingFolder();
    const r = compareFolderToApp({
      folder: { rootExists: true, nodes: [], rootExtras: [] },
      app: { categories, papers },
      state,
      pending: { categories: new Set(['c1']), papers: new Set(), deletes: new Set() },
      onCategoryDelete: 'recreate-folder',
      makeId: stampIdMaker('T'),
    });
    expect(r.entries.filter((e) => e.recreateFolder).map((e) => e.id)).toEqual(['c2']);
  });
});

describe('recreate-folder: apply plan', () => {
  const plan = (mode?: CategoryDeleteMode) => {
    const { state, categories, papers, result } = missingFolder(mode);
    return { result, plan: planCategoryApply({ result, folderNodes: [], state, appCategories: categories, appPapers: papers, now: 5000 }) };
  };

  it('ডেটাবেসে কিছু বদলায় না, ফোল্ডার আবার লেখার জন্য needsWrite-এ আসে, স্মৃতি যেমন ছিল তেমন', () => {
    const { plan: p } = plan('recreate-folder');
    expect(p.ops).toEqual([]);
    expect(p.needsWrite.sort()).toEqual(['c1', 'c2']);
    expect(p.counts).toEqual(emptyApplyCounts());
    expect(Object.keys(p.state.categories).sort()).toEqual(['c1', 'c2']);
    expect(Object.keys(p.state.papers).sort()).toEqual(['p1', 'p2', 'p3']);
  });

  it('delete-papers-এ আগের মতো মোছা ops, needsWrite খালি', () => {
    const { plan: p } = plan();
    expect(p.ops.filter((o) => o.op === 'cat-delete')).toHaveLength(2);
    expect(p.ops.filter((o) => o.op === 'paper-delete')).toHaveLength(3);
    expect(p.needsWrite).toEqual([]);
  });

  it('ছাপে recreate এন্ট্রি ধরা হয় (মোড বদলালে ছাপ বদলায়), সাধারণ info ধরা হয় না', () => {
    const a = plan('recreate-folder').result;
    const b = plan('delete-papers').result;
    expect(previewSignature(a)).not.toBe(previewSignature(b));
    const withInfo = { ...a, entries: [...a.entries, { kind: 'category' as const, action: 'info' as const, id: 'z', path: ['x'] }] };
    expect(previewSignature(withInfo)).toBe(previewSignature(a));
  });
});

describe('recreate-folder: উইন্ডোর ভিউ', () => {
  const preview = (mode?: CategoryDeleteMode, extras: any[] = []): CategoryPreview => {
    const { result } = missingFolder(mode);
    return { result: { ...result, extras }, totals: summarizeCategory(result), empty: !hasAnyCategoryChange(result) && extras.length === 0, deleteMode: mode ?? 'delete-papers' } as unknown as CategoryPreview;
  };

  it('বাছাইয়ে তিনটি অপশন, তৃতীয়টা recreate-folder', () => {
    expect(DELETE_CHOICES.map((c) => c.mode)).toEqual(['delete-papers', 'move-to-uncategorized', 'recreate-folder']);
  });

  it('recreate বেছে নিলেও বাছাইয়ের অংশ থাকে (ফেরার পথ), ক্যাটেগরি ও প্রশ্নপত্র গোনা হয়', () => {
    const p = preview('recreate-folder');
    expect(needsDeleteChoice(p.result)).toBe(true);
    expect(deletedCategoryPapers(p.result)).toEqual({ categories: 2, papers: 3 });
    expect(deletedCategoryPapers(preview().result)).toEqual({ categories: 2, papers: 3 });
  });

  it('শুধু recreate থাকলেও [নিশ্চিত করুন] চলে; শুধু সাধারণ info হলে না', () => {
    expect(canConfirmCategoryPreview(preview('recreate-folder'))).toBe(true);
    const info = { empty: false, result: { entries: [{ kind: 'category', action: 'info', id: 'u', path: ['x'] }], extras: [] } } as unknown as CategoryPreview;
    expect(canConfirmCategoryPreview(info)).toBe(false);
  });

  it('এন্ট্রির লেখা: "ফোল্ডার আবার তৈরি", লাল নয়', () => {
    const e = missingFolder('recreate-folder').result.entries.find((x) => x.recreateFolder)!;
    const t = categoryEntryText(e);
    expect(t.actionLabel).toBe(RECREATE_ACTION_LABEL);
    expect(t.destructive).toBe(false);
    expect(t.detail).toContain('ফোল্ডার আবার তৈরি হবে');
  });

  it('চিপ: কয়টির ফোল্ডার আবার তৈরি; না থাকলে null', () => {
    expect(categoryRecreateChip(preview('recreate-folder').result)?.text).toBe('২টি ক্যাটেগরির ফোল্ডার আবার তৈরি হবে');
    expect(categoryRecreateChip(preview().result)).toBeNull();
  });

  it('ফল: শুধু ফোল্ডার আবার লেখা বাকি থাকলে "কিছু বদলায়নি" নয়', () => {
    const r = makeCategoryResultView(emptyApplyCounts(), [], [], [], 2);
    expect(r.nothingChanged).toBe(false);
    expect(categoryResultCells(r)).toEqual([]);
    expect(makeCategoryResultView(emptyApplyCounts(), [], [], [], 0).nothingChanged).toBe(true);
  });
});
