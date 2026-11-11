import { describe, it, expect } from 'vitest';
import type { Category, Paper } from '../src/db/db';
import {
  buildCategoryNodes,
  compareAppToFolder,
  compareFolderToApp,
  expandCategoryNode,
  hasAnyCategoryChange,
  needsDataRead,
  summarizeCategory,
  type CategoryCompareInput,
  type CategoryFolderNode,
  type PaperFileNode,
} from '../src/storage/categoryCompare';
import {
  CATEGORY_ROOT,
  buildCategoryDataFile,
  categoryDataToText,
  emptyCategorySyncState,
  parseCategoryData,
  type CategorySyncState,
  type CopiedQuestion,
  type ParsedPaper,
} from '../src/storage/categoryLayout';

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
/** data.json-এর ভেতরের একটি প্রশ্নপত্র। paperId না দিলে parsed-এর id, তাও না থাকলে নামটাই id ('p1' ইত্যাদি) */
const file = (paperId: string, over: Partial<PaperFileNode> = {}): PaperFileNode => ({
  fileName: 'data.json',
  mtime: 1,
  size: 10,
  paperId: over.parsed?.id ?? paperId,
  ...over,
});
const node = (dirName: string, id: string | null, files: PaperFileNode[] = [], extraItems: CategoryFolderNode['extraItems'] = []): CategoryFolderNode => ({
  dirName,
  meta: id ? { id, kind: 'category', name: dirName, order: 1 } : null,
  data: { mtime: 1, size: 10 },
  files,
  mediaFiles: [],
  extraItems,
});

let counter = 0;
const makeId = () => `new-${++counter}`;

/** একটি ক্যাটেগরি + একটি প্রশ্নপত্র, ফোল্ডার ও স্মৃতি দুটোই মেলানো */
function synced(): CategoryCompareInput {
  const state: CategorySyncState = {
    version: 1,
    categories: { c1: { dirName: 'উইকলি', dataMtime: 1, dataSize: 10 } },
    papers: { p1: { categoryId: 'c1' } },
  };
  return {
    folder: { rootExists: true, nodes: [node('উইকলি', 'c1', [file('p1')])], rootExtras: [] },
    app: { categories: [cat('c1', 'উইকলি', 1)], papers: [paper('p1', 'c1', 'উইকলি-১')] },
    state,
    makeId,
  };
}

const find = (r: { entries: any[] }, kind: string, action: string) => r.entries.filter((e) => e.kind === kind && e.action === action);

describe('buildCategoryNodes / needsDataRead / expandCategoryNode', () => {
  const E = (p: string, d: boolean, extra: any = {}) => ({ p, d, s: 10, m: 1, ...extra });

  it('ক্যাটেগরি ফোল্ডার, data.json, media ও বাড়তি জিনিস আলাদা করে; unnecessary ও সিস্টেম ফাইল বাদ', () => {
    const meta = JSON.stringify({ id: 'c1', kind: 'category', name: 'উইকলি', order: 1 });
    const { nodes, rootExtras } = buildCategoryNodes([
      E('উইকলি', true),
      E('উইকলি/.folder.json', false, { t: meta }),
      E('উইকলি/data.json', false, { m: 7, s: 99 }),
      E('উইকলি/data.json.bak', false),
      E('উইকলি/data.json.tmp', false),
      E('উইকলি/media', true),
      E('উইকলি/media/.nomedia', false),
      E('উইকলি/media/a.webp', false),
      E('উইকলি/media/b.webp', false),
      E('উইকলি/নোট.txt', false),
      E('উইকলি/পুরনো.json', false),
      E('উইকলি/ছবি', true),
      E('উইকলি/unnecessary', true),
      E('unnecessary', true),
      E('unnecessary/x', false),
      E('.nomedia', false),
      E('readme.txt', false),
    ]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].meta?.id).toBe('c1');
    expect(nodes[0].data).toEqual({ mtime: 7, size: 99 });
    expect(nodes[0].mediaFiles).toEqual(['a.webp', 'b.webp']);
    expect(nodes[0].extraItems.map((x) => `${x.name}:${x.dir}`).sort()).toEqual(['নোট.txt:false', 'পুরনো.json:false', 'ছবি:true'].sort());
    expect(rootExtras).toEqual([{ name: 'readme.txt', dir: false }]);
  });

  it('data.json ছাড়া ক্যাটেগরি ফোল্ডারেও নোড হয় (data = null)', () => {
    const { nodes } = buildCategoryNodes([E('খালি', true)]);
    expect(nodes[0].data).toBeNull();
  });

  it('শেষবারের মতোই থাকা data.json পড়তে হয় না; বদলালে বা নতুন হলে হয়', () => {
    const { state, folder } = synced();
    const n = folder.nodes[0];
    expect(needsDataRead(n, state)).toBe(false);
    expect(needsDataRead({ ...n, data: { mtime: 1, size: 11 } }, state)).toBe(true);
    expect(needsDataRead({ ...n, data: { mtime: 2, size: 10 } }, state)).toBe(true);
    expect(needsDataRead(n, emptyCategorySyncState())).toBe(true);
    expect(needsDataRead({ ...n, data: null }, state)).toBe(false);
  });

  it('expandCategoryNode: না পড়লে স্মৃতির সারি থেকে, পড়লে data.json থেকে, ভাঙলে dataError', () => {
    const { state, folder } = synced();
    const n = { ...folder.nodes[0], files: [] as PaperFileNode[] };
    expandCategoryNode(n, state);
    expect(n.files.map((f) => f.paperId)).toEqual(['p1']);
    expect(n.files[0].parsed).toBeUndefined();

    const text = JSON.stringify({
      type: 'qb-category',
      version: 1,
      category: { id: 'c1', name: 'উইকলি', order: 1 },
      counts: { papers: 2, questions: 0, stimuli: 0, images: 0 },
      papers: [
        { id: 'p5', title: 'ক', questionIds: [] },
        { id: 'p6', title: 'খ', questionIds: [] },
      ],
      questions: [],
      stimuli: [],
      images: [],
    });
    expandCategoryNode(n, state, parseCategoryData(text));
    expect(n.files.map((f) => f.paperId)).toEqual(['p5', 'p6']);
    expect(n.files[0].parsed?.title).toBe('ক');
    expect(n.dataUnsafe).toBeUndefined();
    expect(n.skippedPaperIds).toBeUndefined();

    expandCategoryNode(n, state, parseCategoryData('{ভাঙা'));
    expect(n.files).toEqual([]);
    expect(n.dataError).toContain('JSON');

    expandCategoryNode({ ...n, data: null } as any, state);
  });

  it('data.json না থাকলে প্রশ্নপত্রের তালিকা খালি', () => {
    const { state, folder } = synced();
    const n = { ...folder.nodes[0], data: null };
    expandCategoryNode(n, state);
    expect(n.files).toEqual([]);
    expect(n.dataError).toBeUndefined();
  });
});

describe('ফোল্ডার -> অ্যাপ: ক্যাটেগরি', () => {
  it('সব মিলে থাকলে কিছু বদলায় না', () => {
    const r = compareFolderToApp(synced());
    expect(r.entries).toEqual([]);
    expect(r.extras).toEqual([]);
    expect(hasAnyCategoryChange(r)).toBe(false);
  });

  it('নতুন ফোল্ডার (.folder.json ছাড়া) -> নতুন ক্যাটেগরি, ক্রম সবার পরে', () => {
    const i = synced();
    i.folder.nodes.push(node('নতুন ক্যাটেগরি', null));
    const r = compareFolderToApp(i);
    const add = find(r, 'category', 'add');
    expect(add).toHaveLength(1);
    expect(add[0].name).toBe('নতুন ক্যাটেগরি');
    expect(add[0].order).toBe(2);
    expect(add[0].id).toMatch(/^new-/);
  });

  it('অন্য ফোনের ফোল্ডার (.folder.json-এ অচেনা id) -> সেই id-তেই নতুন ক্যাটেগরি', () => {
    const i = synced();
    i.folder.nodes.push(node('ভিন্ন', 'other-id'));
    const add = find(compareFolderToApp(i), 'category', 'add');
    expect(add[0].id).toBe('other-id');
  });

  it('একই নামের ক্যাটেগরি থাকলে নতুন ফোল্ডার "(2)" নাম পায়', () => {
    const i = synced();
    i.folder.nodes.push(node('উইকলি (2)', null));
    const add = find(compareFolderToApp(i), 'category', 'add');
    expect(add[0].name).toBe('উইকলি (2)');
  });

  it('একই নামের ফোল্ডার, অ্যাপের ফোল্ডার-হীন ক্যাটেগরির সঙ্গে মিলে যায় (নতুন হয় না)', () => {
    const i = synced();
    i.app.categories.push(cat('c2', 'চ্যাপ্টার টেস্ট', 2));
    i.folder.nodes.push(node('চ্যাপ্টার টেস্ট', null));
    const r = compareFolderToApp(i);
    expect(find(r, 'category', 'add')).toHaveLength(0);
    expect(r.dirNames.c2).toBe('চ্যাপ্টার টেস্ট');
  });

  it('ফাইল ম্যানেজারে ফোল্ডারের নাম বদল -> ক্যাটেগরির নাম বদল', () => {
    const i = synced();
    i.folder.nodes[0].dirName = 'সাপ্তাহিক';
    const rn = find(compareFolderToApp(i), 'category', 'rename');
    expect(rn).toHaveLength(1);
    expect(rn[0]).toMatchObject({ from: 'উইকলি', to: 'সাপ্তাহিক', id: 'c1' });
  });

  it('অশ্রেণিবদ্ধের ফোল্ডারের নাম বদলালে অ্যাপ নাম বদলায় না, সতর্কতা দেয়', () => {
    const i = synced();
    i.app.categories[0].name = 'অশ্রেণিবদ্ধ';
    i.state.categories.c1.dirName = 'অশ্রেণিবদ্ধ';
    i.folder.nodes[0].dirName = 'অন্য নাম';
    const r = compareFolderToApp(i);
    expect(find(r, 'category', 'rename')).toHaveLength(0);
    expect(r.warnings).toHaveLength(1);
  });

  it('ক্যাটেগরি ফোল্ডার মুছলে -> ক্যাটেগরি + তার প্রশ্নপত্র মোছা (লাল চিহ্ন, সংখ্যা সহ)', () => {
    const i = synced();
    i.folder.nodes = [];
    const r = compareFolderToApp(i);
    const del = find(r, 'category', 'delete');
    expect(del).toHaveLength(1);
    expect(del[0]).toMatchObject({ id: 'c1', destructive: true, papers: 1, paperIds: ['p1'] });
    expect(del[0].moveToCategoryId).toBeUndefined();
    expect(find(r, 'paper', 'delete')).toHaveLength(0); // আলাদা করে ফাইল-মোছা নয়, ক্যাটেগরির সঙ্গেই
  });

  it('বিকল্প নিয়ম: প্রশ্নপত্র অশ্রেণিবদ্ধে যাবে', () => {
    const i = synced();
    i.app.categories.push(cat('u', 'অশ্রেণিবদ্ধ', 0));
    i.folder.nodes = [];
    i.onCategoryDelete = 'move-to-uncategorized';
    const del = find(compareFolderToApp(i), 'category', 'delete');
    expect(del[0].moveToCategoryId).toBe('u');
    expect(del[0].papers).toBe(1);
  });

  it('অশ্রেণিবদ্ধের ফোল্ডার মুছলে মোছা হয় না, শুধু তথ্য', () => {
    const i = synced();
    i.app.categories[0].name = 'অশ্রেণিবদ্ধ';
    i.folder.nodes = [];
    const r = compareFolderToApp(i);
    expect(find(r, 'category', 'delete')).toHaveLength(0);
    expect(find(r, 'category', 'info')).toHaveLength(1);
  });

  it('Category ফোল্ডারই না থাকলে কিছু মোছা হয় না', () => {
    const i = synced();
    i.folder = { rootExists: false, nodes: [], rootExtras: [] };
    const r = compareFolderToApp(i);
    expect(r.entries).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.massDelete).toBeUndefined();
  });

  it('অ্যাপে জমে থাকা (অলিখিত) বদল ফোল্ডার -> অ্যাপ ছোঁয় না', () => {
    const i = synced();
    i.folder.nodes = [];
    i.pending = { categories: new Set(['c1']), papers: new Set(), deletes: new Set() };
    expect(compareFolderToApp(i).entries).toEqual([]);
  });

  it('কপি করা ক্যাটেগরি ফোল্ডার (একই id) -> আসলটা থাকে, কপি Sync_Conflicts-এ', () => {
    const i = synced();
    i.folder.nodes.push(node('উইকলি - Copy', 'c1', [file('p1')]));
    const r = compareFolderToApp(i);
    expect(r.entries).toEqual([]);
    expect(r.extras).toHaveLength(1);
    expect(r.extras[0].moveTo).toBe(`${CATEGORY_ROOT}/unnecessary/Sync_Conflicts/উইকলি - Copy`);
    expect(r.extras[0].kind).toBe('extra-folder');
  });

  it('অচেনা জিনিস extras (নিজের ফোল্ডারের unnecessary/-তে)', () => {
    const i = synced();
    i.folder.nodes[0].extraItems = [{ name: 'নোট.txt', dir: false }];
    i.folder.rootExtras = [{ name: 'readme.txt', dir: false }];
    const r = compareFolderToApp(i);
    expect(r.extras.map((x) => x.moveTo).sort()).toEqual(
      [`${CATEGORY_ROOT}/উইকলি/unnecessary/নোট.txt`, `${CATEGORY_ROOT}/unnecessary/readme.txt`].sort()
    );
  });

  it('অর্ধেকের বেশি উধাও -> massDelete', () => {
    const i = synced();
    i.app.categories.push(cat('c2', 'ক', 2), cat('c3', 'খ', 3), cat('c4', 'গ', 4));
    i.state.categories.c2 = { dirName: 'ক' };
    i.state.categories.c3 = { dirName: 'খ' };
    i.state.categories.c4 = { dirName: 'গ' };
    i.folder.nodes = [];
    const r = compareFolderToApp(i);
    expect(r.massDelete).toBeTruthy();
    expect(r.massDelete!.count).toBeGreaterThanOrEqual(3);
  });
});

describe('ফোল্ডার -> অ্যাপ: প্রশ্নপত্র', () => {
  it('নতুন প্রশ্নপত্র ফাইল -> প্রশ্নপত্র যোগ', () => {
    const i = synced();
    const np = parsedOf(paper('p2', 'c1', 'উইকলি-২'));
    i.folder.nodes[0].files.push(file('p2', { parsed: np }));
    const add = find(compareFolderToApp(i), 'paper', 'add');
    expect(add).toHaveLength(1);
    expect(add[0]).toMatchObject({ id: 'p2', categoryId: 'c1', dirName: 'উইকলি' });
    expect(add[0].paper.shortName).toBe('উইকলি-২');
  });

  it('ফাইলের লেখা বদলালে -> আপডেট (কোন ঘর বদলেছে তা বলে)', () => {
    const i = synced();
    const changed = parsedOf(i.app.papers[0], { title: 'নতুন শিরোনাম', questionIds: ['q1', 'q2'] });
    i.folder.nodes[0].files[0] = file('p1', { size: 20, parsed: changed });
    const up = find(compareFolderToApp(i), 'paper', 'update');
    expect(up).toHaveLength(1);
    expect(up[0].note).toContain('শিরোনাম');
    expect(up[0].note).toContain('প্রশ্নের তালিকা');
  });

  it('পড়া ফাইলের লেখা একই থাকলে কিছু বদলায় না', () => {
    const i = synced();
    i.folder.nodes[0].files[0] = file('p1', { size: 20, parsed: parsedOf(i.app.papers[0]) });
    expect(compareFolderToApp(i).entries).toEqual([]);
  });

  it('ফাইল অন্য ক্যাটেগরির ফোল্ডারে সরালে -> প্রশ্নপত্র সরে', () => {
    const i = synced();
    i.app.categories.push(cat('c2', 'চ্যাপ্টার টেস্ট', 2));
    i.state.categories.c2 = { dirName: 'চ্যাপ্টার টেস্ট' };
    i.folder.nodes[0].files = [];
    i.folder.nodes.push(node('চ্যাপ্টার টেস্ট', 'c2', [file('p1', { parsed: parsedOf(i.app.papers[0]) })]));
    const r = compareFolderToApp(i);
    const mv = find(r, 'paper', 'move');
    expect(mv).toHaveLength(1);
    expect(mv[0]).toMatchObject({ from: 'উইকলি', to: 'চ্যাপ্টার টেস্ট', categoryId: 'c2' });
    expect(find(r, 'paper', 'delete')).toHaveLength(0);
  });

  it('ফাইল মুছলে -> প্রশ্নপত্র মোছা (লাল চিহ্ন)', () => {
    const i = synced();
    i.folder.nodes[0].files = [];
    const del = find(compareFolderToApp(i), 'paper', 'delete');
    expect(del).toHaveLength(1);
    expect(del[0].destructive).toBe(true);
  });

  it('ভাঙা data.json: সতর্কতা, প্রশ্নপত্র মোছা হয় না', () => {
    const i = synced();
    i.folder.nodes[0].files = [];
    i.folder.nodes[0].dataError = 'JSON ঠিক নেই';
    const r = compareFolderToApp(i);
    expect(r.entries).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('JSON ঠিক নেই');
  });

  it('একই প্রশ্নপত্র দুই ক্যাটেগরির data.json-এ: আসলটা (শেষবারের ক্যাটেগরি) থাকে, অন্যটায় সতর্কতা', () => {
    const i = synced();
    i.app.categories.push(cat('c2', 'অন্য', 2));
    i.state.categories.c2 = { dirName: 'অন্য', dataMtime: 1, dataSize: 10 };
    i.folder.nodes.push(node('অন্য', 'c2', [file('p1', { parsed: parsedOf(i.app.papers[0]) })]));
    const r = compareFolderToApp(i);
    expect(r.entries).toEqual([]);
    expect(r.warnings.some((w) => w.includes('দুই ক্যাটেগরিতে'))).toBe(true);
  });

  it('data.json-এর সতর্কতা (বাদ পড়া প্রশ্নপত্র, গণনা না মেলা) প্রিভিউয়ে আসে', () => {
    const i = synced();
    i.folder.nodes[0].dataWarnings = ['১ নম্বর প্রশ্নপত্র বাদ: id নেই'];
    const r = compareFolderToApp(i);
    expect(r.entries).toEqual([]);
    expect(r.warnings).toEqual(['উইকলি: ১ নম্বর প্রশ্নপত্র বাদ: id নেই']);
  });

  it('ব্যাংকে নেই, কপিও নেই: সতর্কতা, তবু প্রশ্নপত্র যোগ হয়', () => {
    const i = synced();
    i.knownQuestionIds = new Set(['q1']);
    i.folder.nodes[0].files.push(file('p9', { parsed: parsedOf(paper('p9', 'c1', 'নতুন', { questionIds: ['q1', 'zzz'] })) }));
    const r = compareFolderToApp(i);
    expect(r.warnings.some((w) => w.includes('1টি প্রশ্ন') && w.includes('কপি নেই'))).toBe(true);
    const add = find(r, 'paper', 'add');
    expect(add).toHaveLength(1);
    expect(add[0].bankMissingIds).toBeUndefined();
  });

  it('ব্যাংকে নেই কিন্তু data.json-এ কপি আছে: bankMissingIds, সতর্কতা নয়', () => {
    const i = synced();
    i.knownQuestionIds = new Set(['q1']);
    const copy = { question: { id: 'zzz' }, path: { scope: 'type', subject: 'ক', chapter: 'খ', topic: 'গ' } } as unknown as CopiedQuestion;
    i.folder.nodes[0].copies = { questions: [copy], stimuli: [], imageIds: [] };
    i.folder.nodes[0].files.push(file('p9', { parsed: parsedOf(paper('p9', 'c1', 'নতুন', { questionIds: ['q1', 'zzz'] })) }));
    const r = compareFolderToApp(i);
    expect(r.warnings).toEqual([]);
    expect(find(r, 'paper', 'add')[0].bankMissingIds).toEqual(['zzz']);
  });

  it('বদলানো প্রশ্নপত্রের আপডেটেও bankMissingIds আসে', () => {
    const i = synced();
    i.knownQuestionIds = new Set(['q1']);
    const copy = { question: { id: 'zzz' }, path: { scope: 'chapter', subject: 'ক', chapter: 'খ', topic: '' } } as unknown as CopiedQuestion;
    i.folder.nodes[0].copies = { questions: [copy], stimuli: [], imageIds: [] };
    i.folder.nodes[0].files[0] = file('p1', { parsed: parsedOf(i.app.papers[0], { questionIds: ['q1', 'zzz'] }) });
    const up = find(compareFolderToApp(i), 'paper', 'update');
    expect(up[0].bankMissingIds).toEqual(['zzz']);
  });

  it('অ্যাপে জমে থাকা প্রশ্নপত্রের বদল ফোল্ডার -> অ্যাপ ছোঁয় না', () => {
    const i = synced();
    i.folder.nodes[0].files = [];
    i.pending = { categories: new Set(), papers: new Set(['p1']), deletes: new Set() };
    expect(compareFolderToApp(i).entries).toEqual([]);
  });

  it('সারাংশ ও পরিবর্তন আছে কি', () => {
    const i = synced();
    i.folder.nodes[0].files = [];
    i.folder.nodes.push(node('নতুন', null));
    const r = compareFolderToApp(i);
    const t = summarizeCategory(r);
    expect(t.categoriesAdded).toBe(1);
    expect(t.papersDeleted).toBe(1);
    expect(hasAnyCategoryChange(r)).toBe(true);
  });
});

describe('অ্যাপ -> ফোল্ডার', () => {
  it('সব মিলে থাকলে কিছু লেখার নেই', () => {
    const r = compareAppToFolder(synced());
    expect(r.entries).toEqual([]);
    expect(r.extras).toEqual([]);
  });

  it('Category ফোল্ডারই না থাকলে সব ক্যাটেগরি ও প্রশ্নপত্র লেখা হবে', () => {
    const i = synced();
    i.folder = { rootExists: false, nodes: [], rootExtras: [] };
    i.state = emptyCategorySyncState();
    const r = compareAppToFolder(i);
    expect(find(r, 'category', 'add')).toHaveLength(1);
    const pa = find(r, 'paper', 'add');
    expect(pa).toHaveLength(1);
    expect(pa[0]).toMatchObject({ dirName: 'উইকলি', id: 'p1' });
  });

  it('অ্যাপে নতুন ক্যাটেগরি + নতুন প্রশ্নপত্র', () => {
    const i = synced();
    i.app.categories.push(cat('c2', 'চ্যাপ্টার টেস্ট', 2));
    i.app.papers.push(paper('p2', 'c2', 'চ্যাপ্টার টেস্ট-১'));
    const r = compareAppToFolder(i);
    expect(find(r, 'category', 'add')[0]).toMatchObject({ id: 'c2', dirName: 'চ্যাপ্টার টেস্ট' });
    expect(find(r, 'paper', 'add')[0]).toMatchObject({ id: 'p2', dirName: 'চ্যাপ্টার টেস্ট' });
  });

  it('অ্যাপে ক্যাটেগরির নাম বদলালে ফোল্ডারের নাম বদল; প্রশ্নপত্রের ফাইল নেই, তাই প্রশ্নপত্রের নামে কিছু বদলায় না', () => {
    const i = synced();
    i.app.categories[0].name = 'সাপ্তাহিক';
    const r = compareAppToFolder(i);
    expect(find(r, 'category', 'rename')[0]).toMatchObject({ from: 'উইকলি', to: 'সাপ্তাহিক' });
    expect(find(r, 'paper', 'rename')).toHaveLength(0);
    expect(find(r, 'paper', 'update')).toHaveLength(0);
  });

  it('প্রশ্নপত্রের নাম বদল (জমে থাকা বদল) -> data.json আপডেট', () => {
    const i = synced();
    i.app.papers[0].shortName = 'সাপ্তাহিক-১';
    i.pending = { categories: new Set(), papers: new Set(['p1']), deletes: new Set() };
    expect(find(compareAppToFolder(i), 'paper', 'update')).toHaveLength(1);
  });

  it('প্রশ্নপত্র অন্য ক্যাটেগরিতে সরালে ফাইল সরে', () => {
    const i = synced();
    i.app.categories.push(cat('c2', 'চ্যাপ্টার টেস্ট', 2));
    i.state.categories.c2 = { dirName: 'চ্যাপ্টার টেস্ট' };
    i.folder.nodes.push(node('চ্যাপ্টার টেস্ট', 'c2'));
    i.app.papers[0].categoryId = 'c2';
    const mv = find(compareAppToFolder(i), 'paper', 'move');
    expect(mv).toHaveLength(1);
    expect(mv[0]).toMatchObject({ from: 'উইকলি', to: 'চ্যাপ্টার টেস্ট', dirName: 'চ্যাপ্টার টেস্ট' });
  });

  it('অ্যাপে জমে থাকা প্রশ্নপত্রের বদল -> ফাইল আপডেট', () => {
    const i = synced();
    i.pending = { categories: new Set(), papers: new Set(['p1']), deletes: new Set() };
    expect(find(compareAppToFolder(i), 'paper', 'update')).toHaveLength(1);
  });

  it('ফোল্ডারের ফাইলে অন্য লেখা থাকলে অ্যাপেরটা জেতে, প্রিভিউয়ে জানানো হয়', () => {
    const i = synced();
    i.folder.nodes[0].files[0] = file('p1', { size: 30, parsed: parsedOf(i.app.papers[0], { title: 'হাতে বদলানো' }) });
    const up = find(compareAppToFolder(i), 'paper', 'update');
    expect(up).toHaveLength(1);
    expect(up[0].note).toContain('অ্যাপেরটাই থাকবে');
  });

  it('অ্যাপে প্রশ্নপত্র মুছলে ফাইল মোছা', () => {
    const i = synced();
    i.app.papers = [];
    const del = find(compareAppToFolder(i), 'paper', 'delete');
    expect(del).toHaveLength(1);
    expect(del[0].destructive).toBe(true);
  });

  it('অ্যাপে ক্যাটেগরি মুছলে: প্রশ্নপত্র অশ্রেণিবদ্ধে সরে, তারপর ফোল্ডার মোছা', () => {
    const i = synced();
    i.app.categories = [cat('u', 'অশ্রেণিবদ্ধ', 0)];
    i.app.papers[0].categoryId = 'u';
    const r = compareAppToFolder(i);
    expect(find(r, 'category', 'add')[0]).toMatchObject({ id: 'u', dirName: 'অশ্রেণিবদ্ধ' });
    expect(find(r, 'paper', 'move')).toHaveLength(1);
    const del = find(r, 'category', 'delete');
    expect(del).toHaveLength(1);
    expect(del[0].from).toBe('উইকলি');
    expect(r.entries[r.entries.length - 1].action).toBe('delete'); // মোছা সবার শেষে
  });

  it('অ্যাপ যা কখনো চেনেনি এমন ফোল্ডার বাড়তি (মোছা হয় না); এমন প্রশ্নপত্র data.json-এ থাকলে সতর্কতা', () => {
    const i = synced();
    i.folder.nodes[0].files.push(file('zz', { parsed: parsedOf(paper('zz', 'c1', 'অচেনা')) }));
    i.folder.nodes.push(node('অচেনা ফোল্ডার', 'x-id'));
    const r = compareAppToFolder(i);
    expect(find(r, 'paper', 'delete')).toHaveLength(0);
    expect(r.extras.map((e) => e.name)).toEqual(['অচেনা ফোল্ডার']);
    expect(r.warnings.some((w) => w.includes('অচেনা') && w.includes('অ্যাপে নেই'))).toBe(true);
  });

  it('একই নামের দুই প্রশ্নপত্র আলাদা সারি (id আলাদা), ফাইলের নামের ঝামেলা নেই', () => {
    const i = synced();
    i.app.papers.push(paper('p2', 'c1', 'উইকলি-১', { createdAt: 2000 }));
    const add = find(compareAppToFolder(i), 'paper', 'add');
    expect(add).toHaveLength(1);
    expect(add[0]).toMatchObject({ id: 'p2', dirName: 'উইকলি' });
  });

  it('media/-তে কোনো প্রশ্ন ব্যবহার করে না এমন ছবি -> unnecessary/media/-তে সরার তালিকায়', () => {
    const i = synced();
    i.folder.nodes[0].mediaFiles = ['keep.webp', 'old.webp', 'নোট.txt'];
    i.wantedImages = { c1: new Set(['keep']) };
    const r = compareAppToFolder(i);
    expect(r.extras.map((e) => e.moveTo).sort()).toEqual([`${CATEGORY_ROOT}/উইকলি/unnecessary/media/old.webp`, `${CATEGORY_ROOT}/উইকলি/unnecessary/media/নোট.txt`].sort());
  });

  it('wantedImages না দিলে ছবি ছোঁয়া হয় না', () => {
    const i = synced();
    i.folder.nodes[0].mediaFiles = ['old.webp'];
    expect(compareAppToFolder(i).extras).toEqual([]);
  });

  it('data.json পড়া যায়নি: অ্যাপ -> ফোল্ডারেও কিছু মোছা/সরানো হয় না, সতর্কতা', () => {
    const i = synced();
    i.folder.nodes[0].files = [];
    i.folder.nodes[0].dataError = 'JSON ঠিক নেই';
    const r = compareAppToFolder(i);
    expect(find(r, 'paper', 'delete')).toHaveLength(0);
    expect(r.warnings.some((w) => w.includes('JSON ঠিক নেই'))).toBe(true);
  });
});


/* ---------- খণ্ড গ: কঠোর data.json যাচাই ও অনিরাপদ ফাইলে মোছা বন্ধ ---------- */

describe('ফোল্ডার -> অ্যাপ: অনিরাপদ/অগ্রহণযোগ্য data.json থেকে কোনো মোছা নয়', () => {
  const CAT = { id: 'c1', name: 'উইকলি', order: 1 };
  /** ফোল্ডারে data.json-এর লেখা (বৈধ ফাইল থেকে শুরু করে over দিয়ে নষ্ট করা) */
  const dataText = (over: (f: any) => void = () => {}, papers?: ParsedPaper[]): string => {
    const f: any = JSON.parse(
      categoryDataToText(buildCategoryDataFile({ category: CAT, papers: papers ?? [parsedOf(paper('p1', 'c1', 'উইকলি-১'))], questions: [], stimuli: [] }))
    );
    over(f);
    return JSON.stringify(f);
  };
  /** দুটি প্রশ্নপত্র (p1, p2) সহ মেলানো অবস্থা */
  const twoPapers = (): CategoryCompareInput => {
    const i = synced();
    i.app.papers.push(paper('p2', 'c1', 'উইকলি-২'));
    i.state.papers.p2 = { categoryId: 'c1' };
    return i;
  };
  const expand = (i: CategoryCompareInput, text: string) => {
    expandCategoryNode(i.folder.nodes[0], i.state, parseCategoryData(text));
    return i.folder.nodes[0];
  };
  const noDeletes = (r: { entries: any[] }) => expect(r.entries.filter((e) => e.action === 'delete')).toEqual([]);

  it('রিগ্রেশন (Updated-1 সমতা): বৈধ id কিন্তু ভাঙা entry -> delete নেই, warning ও skipped সংখ্যা আছে', () => {
    const i = synced();
    const n = expand(i, dataText((f) => (f.papers[0] = { id: 'p1', questionIds: 'ভাঙা' })));
    expect(n.skippedPaperIds).toEqual(['p1']);
    expect(n.dataUnsafe).toBe(true);
    const r = compareFolderToApp(i);
    noDeletes(r);
    expect(r.warnings.some((w) => w.includes('id: p1'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('বাদ পড়া প্রশ্নপত্র ১টি') || w.includes('বাদ পড়া প্রশ্নপত্র 1টি'))).toBe(true);
    expect(r.protectedCategories).toEqual([expect.objectContaining({ id: 'c1', reason: 'unsafe', skippedPapers: 1, heldPapers: 1 })]);
  });

  it('ভাঙা entry-তে id-ই নেই ({id:\'\'}) -> ওই ক্যাটেগরির কোনো প্রশ্নপত্রের delete নেই', () => {
    const i = twoPapers();
    const n = expand(i, dataText((f) => {
      f.papers = [{ id: '' }];
      f.counts.papers = 1;
    }));
    expect(n.files).toEqual([]);
    expect(n.skippedPaperIds).toBeUndefined();
    const r = compareFolderToApp(i);
    noDeletes(r);
    expect(r.protectedCategories?.[0].heldPapers).toBe(2);
  });

  it('বাদ পড়া paper (বৈধ id, ভুল বাকি অংশ) অন্য ভালো paper-এর পাশে: ভালোটা বহাল, ভাঙাটা মোছা নয়', () => {
    const i = twoPapers();
    expand(i, dataText((f) => {
      f.papers.push({ id: 'p2', title: 5, questionIds: [] });
      f.counts.papers = 2;
    }));
    const r = compareFolderToApp(i);
    noDeletes(r);
    expect(find(r, 'paper', 'update')).toHaveLength(0);
  });

  it('unsafe (গণনা মেলেনি) ফাইলে destructive নেই, তবে নিরাপদ add/update বহাল', () => {
    const i = twoPapers();
    expand(i, dataText((f) => {
      f.papers[0].title = 'নতুন শিরোনাম';
      f.papers.push({ id: 'p9', shortName: 'নতুন', title: 'নতুন', createdAt: 5, questionIds: [] });
      f.counts.papers = 5; // অমিল
    }));
    const r = compareFolderToApp(i);
    noDeletes(r);
    expect(find(r, 'paper', 'update').map((e) => e.id)).toEqual(['p1']);
    expect(find(r, 'paper', 'add').map((e) => e.id)).toEqual(['p9']);
    expect(r.warnings.some((w) => w.includes('গণনা মেলেনি'))).toBe(true);
  });

  it('count mismatch / ভুল image / ভুল questionIds - প্রতিটিতে p2 (ফাইলে নেই) মোছার প্রস্তাব আসে না', () => {
    const breakers: Array<(f: any) => void> = [
      (f) => (f.counts.questions = 3),
      (f) => {
        f.images.push({ id: 'x', fileName: 'ভুল.webp' });
        f.counts.images = 1;
      },
      (f) => (f.papers[0].questionIds = [1]),
    ];
    for (const b of breakers) {
      const i = twoPapers();
      expand(i, dataText(b));
      noDeletes(compareFolderToApp(i));
    }
  });

  it('{type, version:1}-এর মতো অসম্পূর্ণ ফাইলে সব প্রশ্নপত্র মোছার প্রস্তাব আসে না (অগ্রহণযোগ্য = dataError)', () => {
    const i = twoPapers();
    const n = expand(i, JSON.stringify({ type: 'qb-category', version: 1 }));
    expect(n.dataError).toContain('category');
    const r = compareFolderToApp(i);
    noDeletes(r);
    expect(r.massDelete).toBeUndefined();
    expect(r.protectedCategories).toEqual([expect.objectContaining({ reason: 'invalid' })]);
  });

  it('সম্পূর্ণ খালি কিন্তু বৈধ data.json (চারটি [] ও সব count 0) = সত্যিই খালি: প্রশ্নপত্র মোছা যায় (ব্যবহারকারী নিশ্চিত করলে)', () => {
    const i = twoPapers();
    const n = expand(i, dataText(() => {}, []));
    expect(n.dataUnsafe).toBeUndefined();
    expect(find(compareFolderToApp(i), 'paper', 'delete')).toHaveLength(2);
  });

  it('বৈধ ফাইল থেকে ফাইলে-না-থাকা প্রশ্নপত্র আগের মতোই মোছা ধরা পড়ে (সুরক্ষা শুধু অনিরাপদ ফাইলে)', () => {
    const i = twoPapers();
    expand(i, dataText());
    const del = find(compareFolderToApp(i), 'paper', 'delete');
    expect(del.map((e) => e.id)).toEqual(['p2']);
    expect(compareFolderToApp(i).protectedCategories).toBeUndefined();
  });

  it('ব্যাংকে নেই কিন্তু কপি আছে (বৈধ) - bankMissingIds অক্ষুণ্ণ, সতর্কতা/unsafe নয়', () => {
    const i = synced();
    i.knownQuestionIds = new Set(['q1']);
    const copy: CopiedQuestion = {
      question: { id: 'zzz', topicId: 't1', type: 'গ', marks: 3, questionText: 'প্রশ্ন', solutionText: '', solutionImageIds: [], rating: 3, order: 1, usedInBoards: [] },
      path: { scope: 'chapter', subject: 'পদার্থ', chapter: 'ভেক্টর', topic: '' },
    };
    const text = categoryDataToText(
      buildCategoryDataFile({
        category: CAT,
        papers: [parsedOf(paper('p1', 'c1', 'উইকলি-১')), parsedOf(paper('p9', 'c1', 'নতুন', { questionIds: ['q1', 'zzz'] }))],
        questions: [copy],
        stimuli: [],
      })
    );
    const n = expand(i, text);
    expect(n.dataUnsafe).toBeUndefined();
    const r = compareFolderToApp(i);
    expect(r.warnings).toEqual([]);
    expect(find(r, 'paper', 'add')[0].bankMissingIds).toEqual(['zzz']);
  });

  it('data.json-এর category.id আর .folder.json-এর id না মিললে: সতর্কতা + মোছা বন্ধ', () => {
    const i = twoPapers();
    const n = expand(i, dataText((f) => (f.category.id = 'অন্য-id')));
    expect(n.dataUnsafe).toBe(true);
    const r = compareFolderToApp(i);
    noDeletes(r);
    expect(r.warnings.some((w) => w.includes('category.id') && w.includes('.folder.json'))).toBe(true);
  });

  it('নাম/ক্রম না মিললে শুধু সতর্কতা (.folder.json জেতে), মোছা বন্ধ হয় না', () => {
    const i = twoPapers();
    const n = expand(i, dataText((f) => {
      f.category.name = 'হাতে বদলানো নাম';
      f.category.order = 9;
    }));
    expect(n.dataUnsafe).toBeUndefined();
    const r = compareFolderToApp(i);
    expect(r.warnings.some((w) => w.includes('নাম'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('ক্রম'))).toBe(true);
    expect(find(r, 'category', 'rename')).toHaveLength(0);
  });

  it('কপি করা ছবির ফাইল media/-তে না থাকলে আলাদা সতর্কতা (মোছা/বদল নয়)', () => {
    const i = synced();
    const n = i.folder.nodes[0];
    n.mediaFiles = ['i1.webp'];
    expandCategoryNode(n, i.state);
    n.copies = { questions: [], stimuli: [], imageIds: ['i1', 'i2', 'i3'] };
    const r = compareFolderToApp(i);
    expect(r.entries).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('2টি ছবির ফাইল নেই');
    expect(r.warnings[0]).toContain('i2.webp');
  });

  it('অনিরাপদ ক্যাটেগরি ছাড়া অন্য ক্যাটেগরির মোছা আগের মতোই চলে', () => {
    const i = twoPapers();
    i.app.categories.push(cat('c2', 'অন্য', 2));
    i.app.papers.push(paper('p3', 'c2', 'অন্য-১'));
    i.state.categories.c2 = { dirName: 'অন্য', dataMtime: 1, dataSize: 10 };
    i.state.papers.p3 = { categoryId: 'c2' };
    i.folder.nodes.push(node('অন্য', 'c2', []));
    expand(i, dataText((f) => (f.counts.papers = 7)));
    const del = find(compareFolderToApp(i), 'paper', 'delete');
    expect(del.map((e) => e.id)).toEqual(['p3']);
  });
});
