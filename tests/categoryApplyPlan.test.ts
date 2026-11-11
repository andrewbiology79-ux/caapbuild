import { describe, it, expect } from 'vitest';
import type { Category, Paper } from '../src/db/db';
import { buildCategoryNodes, compareFolderToApp, expandCategoryNode, type CategoryCompareInput, type CategoryFolderNode } from '../src/storage/categoryCompare';
import {
  buildCategoryDataFile,
  categoryDataToText,
  emptyCategorySyncState,
  parseCategoryData,
  type CategorySyncState,
  type CopiedQuestion,
  type ParsedPaper,
} from '../src/storage/categoryLayout';
import { paperLabelNumber, planCategoryApply, previewSignature, stampIdMaker } from '../src/storage/categoryApplyPlan';

/* ---------- নমুনা তথ্য ---------- */

const cat = (id: string, name: string, order: number): Category => ({ id, name, order, createdAt: order });
const paper = (id: string, categoryId: string, shortName: string, over: Partial<Paper> = {}): Paper => ({
  id,
  shortName,
  category: '',
  categoryId,
  createdAt: 1000,
  title: 'শিরোনাম',
  questionIds: ['q1'],
  ...over,
});
const parsedOf = (p: Paper, over: Partial<ParsedPaper> = {}): ParsedPaper => {
  const { category, categoryId, ...rest } = p;
  return { ...rest, ...over };
};

const E = (p: string, d: boolean, extra: any = {}) => ({ p, d, s: 10, m: 5, ...extra });
const metaText = (id: string, name: string, order = 1) => JSON.stringify({ id, kind: 'category', name, order });

/** data.json-এর লেখা বানানো (বৈধ) */
function dataText(catId: string, name: string, papers: ParsedPaper[], questions: CopiedQuestion[] = []): string {
  return categoryDataToText(buildCategoryDataFile({ category: { id: catId, name, order: 1 }, papers, questions, stimuli: [] }));
}

interface FolderSpec {
  dir: string;
  /** null = .folder.json নেই */
  id: string | null;
  text?: string;
}

/** ফোল্ডারের তালিকা -> নোড (data.json পড়ে expand করা) */
function nodesOf(specs: FolderSpec[], state: CategorySyncState): CategoryFolderNode[] {
  const entries: any[] = [];
  for (const s of specs) {
    entries.push(E(s.dir, true));
    if (s.id) entries.push(E(`${s.dir}/.folder.json`, false, { t: metaText(s.id, s.dir) }));
    if (s.text !== undefined) entries.push(E(`${s.dir}/data.json`, false, { m: 7, s: 99 }));
  }
  const { nodes } = buildCategoryNodes(entries);
  for (const n of nodes) {
    const spec = specs.find((x) => x.dir === n.dirName)!;
    expandCategoryNode(n, state, spec.text !== undefined ? parseCategoryData(spec.text, 7) : undefined);
  }
  return nodes;
}

function run(specs: FolderSpec[], categories: Category[], papers: Paper[], state: CategorySyncState, over: Partial<CategoryCompareInput> = {}) {
  const nodes = nodesOf(specs, state);
  const result = compareFolderToApp({
    folder: { rootExists: true, nodes, rootExtras: [] },
    app: { categories, papers },
    state,
    makeId: stampIdMaker('T'),
    ...over,
  });
  const plan = planCategoryApply({
    result,
    folderNodes: nodes,
    state,
    appCategories: categories,
    appPapers: papers,
    pending: over.pending,
    now: 5000,
  });
  return { nodes, result, plan };
}

const UNC = cat('u', 'অশ্রেণিবদ্ধ', 0);

describe('paperLabelNumber', () => {
  it('"<ক্যাটেগরি>-<সংখ্যা>" থেকে সংখ্যা (বাংলা/ইংরেজি অঙ্ক), অন্যথায় null', () => {
    expect(paperLabelNumber('উইকলি-৩', 'উইকলি')).toBe(3);
    expect(paperLabelNumber('উইকলি-12', 'উইকলি')).toBe(12);
    expect(paperLabelNumber('অন্য-১', 'উইকলি')).toBeNull();
    expect(paperLabelNumber('উইকলি-ক', 'উইকলি')).toBeNull();
    expect(paperLabelNumber(undefined, 'উইকলি')).toBeNull();
  });
});

describe('stampIdMaker', () => {
  it('একই stamp থেকে একই ক্রমে একই id (প্রিভিউ ও আসল কাজ মেলার জন্য)', () => {
    const a = stampIdMaker('S');
    const b = stampIdMaker('S');
    expect([a(), a()]).toEqual([b(), b()]);
    expect(stampIdMaker('S')()).not.toBe(stampIdMaker('X')());
  });
});

describe('planCategoryApply - নতুন ক্যাটেগরি ও প্রশ্নপত্র', () => {
  it('.folder.json ছাড়া নতুন ফোল্ডার: ক্যাটেগরি + প্রশ্নপত্র যোগ, স্মৃতিতে ফোল্ডার ও data.json-এর অবস্থা, লেখা সারিতে', () => {
    const p1 = parsedOf(paper('p1', 'x', 'নতুন-১'));
    const { plan, result } = run([{ dir: 'নতুন', id: null, text: dataText('zz', 'নতুন', [p1]) }], [UNC], [], emptyCategorySyncState());
    // .folder.json না থাকায় data.json-এর category.id ধরা হয় না; আসল id নতুন বানানো
    const add = plan.ops.find((o) => o.op === 'cat-add');
    expect(add && add.op === 'cat-add' && add.category.name).toBe('নতুন');
    const id = (add as any).category.id as string;
    expect(id).toBe('cat_T_1');
    const put = plan.ops.find((o) => o.op === 'paper-put') as any;
    expect(put.paper).toMatchObject({ id: 'p1', category: 'নতুন', categoryId: id, shortName: 'নতুন-১' });
    expect(plan.counts).toMatchObject({ categoriesAdded: 1, papersAdded: 1 });
    expect(plan.state.categories[id]).toEqual({ dirName: 'নতুন', dataMtime: 7, dataSize: 99 });
    expect(plan.state.papers.p1).toEqual({ categoryId: id });
    expect(plan.needsWrite).toEqual([id]); // .folder.json বসাতে লেখক চালাতে হবে
    expect(result.dirNames[id]).toBe('নতুন');
  });

  it('.folder.json আছে এমন নতুন ফোল্ডারে লেখা সারিতে যায় না', () => {
    const p1 = parsedOf(paper('p1', 'c9', 'আনা-১'));
    const { plan } = run([{ dir: 'আনা', id: 'c9', text: dataText('c9', 'আনা', [p1]) }], [UNC], [], emptyCategorySyncState());
    expect(plan.ops.map((o) => o.op)).toEqual(['cat-add', 'paper-put']);
    expect(plan.needsWrite).toEqual([]);
    expect(plan.state.categories.c9.dataMtime).toBe(7);
  });

  it('ব্যাংকে-নেই প্রশ্নের তালিকা bankMissing-এ আসে', () => {
    const copy: CopiedQuestion = {
      question: { id: 'zzz', topicId: 't', type: 'ক', marks: 1, questionText: 'প', solutionText: '', solutionImageIds: [], rating: 1, order: 1, usedInBoards: [] },
      path: { scope: 'chapter', subject: 'পদার্থ', chapter: 'ভেক্টর', topic: '' },
    };
    const p1 = parsedOf(paper('p1', 'c9', 'আনা-১', { questionIds: ['q1', 'zzz'] }));
    const { plan } = run([{ dir: 'আনা', id: 'c9', text: dataText('c9', 'আনা', [p1], [copy]) }], [UNC], [], emptyCategorySyncState(), { knownQuestionIds: new Set(['q1']) });
    expect(plan.bankMissing).toEqual([{ paperId: 'p1', categoryId: 'c9', questionIds: ['zzz'] }]);
  });
});

describe('planCategoryApply - নাম বদল, সরানো, হালনাগাদ, মোছা', () => {
  const base = (): { state: CategorySyncState; categories: Category[]; papers: Paper[] } => ({
    state: { version: 1, categories: { c1: { dirName: 'উইকলি', dataMtime: 1, dataSize: 10 } }, papers: { p1: { categoryId: 'c1' } } },
    categories: [UNC, cat('c1', 'উইকলি', 1)],
    papers: [paper('p1', 'c1', 'উইকলি-১', { category: 'উইকলি' })],
  });

  it('ফোল্ডারের নাম বদলালে ক্যাটেগরির নাম, প্রশ্নপত্রের category ও "<নাম>-<সংখ্যা>" ট্যাগ বদলায়', () => {
    const { state, categories, papers } = base();
    const p1 = parsedOf(papers[0]);
    const { plan } = run([{ dir: 'মডেল', id: 'c1', text: dataText('c1', 'মডেল', [p1]) }], categories, papers, state);
    expect(plan.ops).toContainEqual({ op: 'cat-update', id: 'c1', changes: { name: 'মডেল' } });
    expect(plan.ops).toContainEqual({ op: 'paper-patch', id: 'p1', changes: { category: 'মডেল', shortName: 'মডেল-১' } });
    expect(plan.counts.categoriesRenamed).toBe(1);
    expect(plan.state.categories.c1.dirName).toBe('মডেল');
  });

  it('data.json-এ প্রশ্নপত্রের লেখা বদলালে paper-put (ক্যাটেগরির নামসহ), না বদলালে কিছু নয়', () => {
    const { state, categories, papers } = base();
    const changed = parsedOf(papers[0], { title: 'নতুন শিরোনাম' });
    const a = run([{ dir: 'উইকলি', id: 'c1', text: dataText('c1', 'উইকলি', [changed]) }], categories, papers, state);
    const put = a.plan.ops.find((o) => o.op === 'paper-put') as any;
    expect(put.paper).toMatchObject({ id: 'p1', title: 'নতুন শিরোনাম', category: 'উইকলি', categoryId: 'c1' });
    expect(a.plan.counts.papersUpdated).toBe(1);

    const same = run([{ dir: 'উইকলি', id: 'c1', text: dataText('c1', 'উইকলি', [parsedOf(papers[0])]) }], categories, papers, state);
    expect(same.plan.ops).toEqual([]);
    expect(same.plan.state.papers.p1).toEqual({ categoryId: 'c1' });
  });

  it('প্রশ্নপত্র অন্য ক্যাটেগরির data.json-এ গেলে paper-patch (সরানো)', () => {
    const { state, categories, papers } = base();
    categories.push(cat('c2', 'চূড়ান্ত', 2));
    state.categories.c2 = { dirName: 'চূড়ান্ত', dataMtime: 1, dataSize: 10 };
    const p1 = parsedOf(papers[0]);
    const { plan } = run(
      [
        { dir: 'উইকলি', id: 'c1', text: dataText('c1', 'উইকলি', []) },
        { dir: 'চূড়ান্ত', id: 'c2', text: dataText('c2', 'চূড়ান্ত', [p1]) },
      ],
      categories,
      papers,
      state
    );
    expect(plan.ops).toContainEqual({ op: 'paper-patch', id: 'p1', changes: { categoryId: 'c2', category: 'চূড়ান্ত' } });
    expect(plan.state.papers.p1).toEqual({ categoryId: 'c2' });
  });

  it('data.json থেকে প্রশ্নপত্র উধাও (খালি-বৈধ ফাইল) হলে paper-delete ও স্মৃতি থেকে সরানো', () => {
    const { state, categories, papers } = base();
    const { plan, result } = run([{ dir: 'উইকলি', id: 'c1', text: dataText('c1', 'উইকলি', []) }], categories, papers, state);
    expect(plan.ops).toContainEqual({ op: 'paper-delete', id: 'p1' });
    expect(plan.state.papers.p1).toBeUndefined();
    expect(plan.counts.papersDeleted).toBe(1);
    expect(result.entries.find((e) => e.action === 'delete')?.destructive).toBe(true);
  });

  it('ফোল্ডার নেই: ক্যাটেগরি + প্রশ্নপত্র দুটোই মোছা (delete-papers) ও স্মৃতি পরিষ্কার', () => {
    const { state, categories, papers } = base();
    const other = cat('c2', 'বাকি', 2);
    categories.push(other);
    state.categories.c2 = { dirName: 'বাকি', dataMtime: 1, dataSize: 10 };
    const { plan } = run([{ dir: 'বাকি', id: 'c2', text: dataText('c2', 'বাকি', []) }], categories, papers, state);
    expect(plan.ops).toContainEqual({ op: 'paper-delete', id: 'p1' });
    expect(plan.ops).toContainEqual({ op: 'cat-delete', id: 'c1' });
    expect(plan.state.categories.c1).toBeUndefined();
    expect(plan.state.papers.p1).toBeUndefined();
    expect(plan.counts).toMatchObject({ categoriesDeleted: 1, papersDeleted: 1 });
  });

  it('ফোল্ডার নেই + move-to-uncategorized: প্রশ্নপত্র অশ্রেণিবদ্ধে যায়, ফোল্ডার নতুন করে লেখা সারিতে', () => {
    const { state, categories, papers } = base();
    state.categories.u = { dirName: 'অশ্রেণিবদ্ধ', dataMtime: 1, dataSize: 10 };
    const { plan } = run([{ dir: 'অশ্রেণিবদ্ধ', id: 'u', text: dataText('u', 'অশ্রেণিবদ্ধ', []) }], categories, papers, state, { onCategoryDelete: 'move-to-uncategorized' });
    expect(plan.ops).toContainEqual({ op: 'paper-patch', id: 'p1', changes: { categoryId: 'u', category: 'অশ্রেণিবদ্ধ' } });
    expect(plan.ops).toContainEqual({ op: 'cat-delete', id: 'c1' });
    expect(plan.ops.some((o) => o.op === 'paper-delete')).toBe(false);
    expect(plan.needsWrite).toEqual(['u']);
    // নতুন ক্যাটেগরির data.json-এ এখনো নেই -> স্মৃতিতে থাকলে পরের সিঙ্কে মোছা ধরা পড়ত
    expect(plan.state.papers.p1).toBeUndefined();
    expect(plan.counts).toMatchObject({ categoriesDeleted: 1, papersMoved: 1, papersDeleted: 0 });
  });
});

describe('planCategoryApply - নিরাপত্তা', () => {
  const state0 = (): CategorySyncState => ({ version: 1, categories: { c1: { dirName: 'উইকলি', dataMtime: 1, dataSize: 10 } }, papers: { p1: { categoryId: 'c1' } } });

  it('সন্দেহজনক (unsafe) data.json: মোছা নেই, data.json-এর mtime/size স্মৃতিতে বসে না (পরের বার আবার পড়া হবে)', () => {
    const categories = [UNC, cat('c1', 'উইকলি', 1)];
    const papers = [paper('p1', 'c1', 'উইকলি-১', { category: 'উইকলি' })];
    const f: any = JSON.parse(dataText('c1', 'উইকলি', [parsedOf(papers[0])]));
    f.counts.papers = 5; // গণনা অমিল -> unsafe
    const { plan, nodes } = run([{ dir: 'উইকলি', id: 'c1', text: JSON.stringify(f) }], categories, papers, state0());
    expect(nodes[0].dataUnsafe).toBe(true);
    expect(plan.ops.some((o) => o.op === 'paper-delete' || o.op === 'cat-delete')).toBe(false);
    expect(plan.state.categories.c1).toEqual({ dirName: 'উইকলি' });
  });

  it('ভাঙা data.json (invalid): কিছুই বদলায় না', () => {
    const categories = [UNC, cat('c1', 'উইকলি', 1)];
    const papers = [paper('p1', 'c1', 'উইকলি-১', { category: 'উইকলি' })];
    const { plan } = run([{ dir: 'উইকলি', id: 'c1', text: '{ ভাঙা' }], categories, papers, state0());
    expect(plan.ops).toEqual([]);
    expect(plan.state.papers.p1).toEqual({ categoryId: 'c1' });
    expect(plan.state.categories.c1.dataMtime).toBeUndefined();
  });

  it('অ্যাপে জমে থাকা (pending) ক্যাটেগরিতে data.json-এর অবস্থা বসে না ও জমে থাকা প্রশ্নপত্র ছোঁয়া হয় না', () => {
    const categories = [UNC, cat('c1', 'উইকলি', 1)];
    const papers = [paper('p1', 'c1', 'উইকলি-১', { category: 'উইকলি', title: 'অ্যাপে বদলানো' })];
    const folderPaper = parsedOf(paper('p1', 'c1', 'উইকলি-১', { title: 'ফোল্ডারের পুরনো' }));
    const pending = { categories: new Set<string>(), papers: new Set(['p1']), deletes: new Set<string>() };
    const { plan } = run([{ dir: 'উইকলি', id: 'c1', text: dataText('c1', 'উইকলি', [folderPaper]) }], categories, papers, state0(), { pending });
    expect(plan.ops).toEqual([]); // অ্যাপের কপি জেতে
    expect(plan.state.categories.c1.dataMtime).toBeUndefined();
  });

  it('plan ইনপুটের state বদলায় না', () => {
    const categories = [UNC, cat('c1', 'উইকলি', 1)];
    const papers = [paper('p1', 'c1', 'উইকলি-১', { category: 'উইকলি' })];
    const st = state0();
    const before = JSON.stringify(st);
    run([{ dir: 'উইকলি', id: 'c1', text: dataText('c1', 'উইকলি', []) }], categories, papers, st);
    expect(JSON.stringify(st)).toBe(before);
  });
});

describe('previewSignature', () => {
  const mk = (title: string) => {
    const categories = [UNC, cat('c1', 'উইকলি', 1)];
    const papers = [paper('p1', 'c1', 'উইকলি-১', { category: 'উইকলি' })];
    const st: CategorySyncState = { version: 1, categories: { c1: { dirName: 'উইকলি' } }, papers: { p1: { categoryId: 'c1' } } };
    return run([{ dir: 'উইকলি', id: 'c1', text: dataText('c1', 'উইকলি', [parsedOf(papers[0], { title })]) }], categories, papers, st).result;
  };

  it('একই অবস্থা থেকে একই ছাপ; বিষয়বস্তু বদলালে ছাপ বদলায়', () => {
    expect(previewSignature(mk('ক'))).toBe(previewSignature(mk('ক')));
    expect(previewSignature(mk('ক'))).not.toBe(previewSignature(mk('খ')));
  });

  it('শুধু info সারি ছাপে ধরা হয় না', () => {
    const r = mk('ক');
    const withInfo = { ...r, entries: [...r.entries, { kind: 'category' as const, action: 'info' as const, id: 'u', path: ['অশ্রেণিবদ্ধ'], note: 'x' }] };
    expect(previewSignature(withInfo)).toBe(previewSignature(r));
  });
});
