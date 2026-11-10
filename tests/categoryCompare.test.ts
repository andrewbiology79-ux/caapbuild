import { describe, it, expect } from 'vitest';
import type { Category, Paper } from '../src/db/db';
import {
  buildCategoryNodes,
  compareAppToFolder,
  compareFolderToApp,
  hasAnyCategoryChange,
  needsPaperRead,
  summarizeCategory,
  type CategoryCompareInput,
  type CategoryFolderNode,
  type PaperFileNode,
} from '../src/storage/categoryCompare';
import { CATEGORY_ROOT, emptyCategorySyncState, type CategorySyncState, type ParsedPaper } from '../src/storage/categoryLayout';

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
const file = (fileName: string, over: Partial<PaperFileNode> = {}): PaperFileNode => ({ fileName, mtime: 1, size: 10, ...over });
const node = (dirName: string, id: string | null, files: PaperFileNode[] = [], extraItems: CategoryFolderNode['extraItems'] = []): CategoryFolderNode => ({
  dirName,
  meta: id ? { id, kind: 'category', name: dirName, order: 1 } : null,
  files,
  extraItems,
});

let counter = 0;
const makeId = () => `new-${++counter}`;

/** একটি ক্যাটেগরি + একটি প্রশ্নপত্র, ফোল্ডার ও স্মৃতি দুটোই মেলানো */
function synced(): CategoryCompareInput {
  const state: CategorySyncState = {
    version: 1,
    categories: { c1: { dirName: 'উইকলি' } },
    papers: { p1: { categoryId: 'c1', fileName: 'উইকলি-১.json', mtime: 1, size: 10 } },
  };
  return {
    folder: { rootExists: true, nodes: [node('উইকলি', 'c1', [file('উইকলি-১.json')])], rootExtras: [] },
    app: { categories: [cat('c1', 'উইকলি', 1)], papers: [paper('p1', 'c1', 'উইকলি-১')] },
    state,
    makeId,
  };
}

const find = (r: { entries: any[] }, kind: string, action: string) => r.entries.filter((e) => e.kind === kind && e.action === action);

describe('buildCategoryNodes / needsPaperRead', () => {
  const E = (p: string, d: boolean, extra: any = {}) => ({ p, d, s: 10, m: 1, ...extra });

  it('ক্যাটেগরি ফোল্ডার, প্রশ্নপত্র ফাইল ও বাড়তি জিনিস আলাদা করে; unnecessary ও সিস্টেম ফাইল বাদ', () => {
    const meta = JSON.stringify({ id: 'c1', kind: 'category', name: 'উইকলি', order: 1 });
    const { nodes, rootExtras } = buildCategoryNodes([
      E('উইকলি', true),
      E('উইকলি/.folder.json', false, { t: meta }),
      E('উইকলি/উইকলি-১.json', false),
      E('উইকলি/উইকলি-১.json.bak', false),
      E('উইকলি/নোট.txt', false),
      E('উইকলি/ছবি', true),
      E('উইকলি/ছবি/a.png', false),
      E('উইকলি/unnecessary', true),
      E('unnecessary', true),
      E('unnecessary/x', false),
      E('.nomedia', false),
      E('readme.txt', false),
    ]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].meta?.id).toBe('c1');
    expect(nodes[0].files.map((f) => f.fileName)).toEqual(['উইকলি-১.json']);
    expect(nodes[0].extraItems.map((x) => `${x.name}:${x.dir}`).sort()).toEqual(['নোট.txt:false', 'ছবি:true'].sort());
    expect(rootExtras).toEqual([{ name: 'readme.txt', dir: false }]);
  });

  it('শেষবারের মতোই থাকা ফাইল পড়তে হয় না; বদলালে বা নতুন হলে হয়', () => {
    const { state, folder } = synced();
    const n = folder.nodes[0];
    expect(needsPaperRead(n, file('উইকলি-১.json'), state)).toBe(false);
    expect(needsPaperRead(n, file('উইকলি-১.json', { size: 11 }), state)).toBe(true);
    expect(needsPaperRead(n, file('নতুন.json'), state)).toBe(true);
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
    i.folder.nodes.push(node('উইকলি - Copy', 'c1', [file('উইকলি-১.json')]));
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
    i.folder.nodes[0].files.push(file('উইকলি-২.json', { parsed: np }));
    const add = find(compareFolderToApp(i), 'paper', 'add');
    expect(add).toHaveLength(1);
    expect(add[0]).toMatchObject({ id: 'p2', categoryId: 'c1', fileName: 'উইকলি-২.json' });
    expect(add[0].paper.shortName).toBe('উইকলি-২');
  });

  it('ফাইলের লেখা বদলালে -> আপডেট (কোন ঘর বদলেছে তা বলে)', () => {
    const i = synced();
    const changed = parsedOf(i.app.papers[0], { title: 'নতুন শিরোনাম', questionIds: ['q1', 'q2'] });
    i.folder.nodes[0].files[0] = file('উইকলি-১.json', { size: 20, parsed: changed });
    const up = find(compareFolderToApp(i), 'paper', 'update');
    expect(up).toHaveLength(1);
    expect(up[0].note).toContain('শিরোনাম');
    expect(up[0].note).toContain('প্রশ্নের তালিকা');
  });

  it('পড়া ফাইলের লেখা একই থাকলে কিছু বদলায় না', () => {
    const i = synced();
    i.folder.nodes[0].files[0] = file('উইকলি-১.json', { size: 20, parsed: parsedOf(i.app.papers[0]) });
    expect(compareFolderToApp(i).entries).toEqual([]);
  });

  it('ফাইল অন্য ক্যাটেগরির ফোল্ডারে সরালে -> প্রশ্নপত্র সরে', () => {
    const i = synced();
    i.app.categories.push(cat('c2', 'চ্যাপ্টার টেস্ট', 2));
    i.state.categories.c2 = { dirName: 'চ্যাপ্টার টেস্ট' };
    i.folder.nodes[0].files = [];
    i.folder.nodes.push(node('চ্যাপ্টার টেস্ট', 'c2', [file('উইকলি-১.json', { parsed: parsedOf(i.app.papers[0]) })]));
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

  it('ভাঙা ফাইল: সতর্কতা, প্রশ্নপত্র মোছা হয় না', () => {
    const i = synced();
    i.folder.nodes[0].files[0] = file('উইকলি-১.json', { size: 3, parsed: null, error: 'JSON ঠিক নেই' });
    const r = compareFolderToApp(i);
    expect(r.entries).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('JSON ঠিক নেই');
  });

  it('একই id-র দুই ফাইল: আসলটা থাকে, কপি extras', () => {
    const i = synced();
    i.folder.nodes[0].files.push(file('উইকলি-১ - Copy.json', { parsed: parsedOf(i.app.papers[0]) }));
    const r = compareFolderToApp(i);
    expect(r.entries).toEqual([]);
    expect(r.extras).toHaveLength(1);
    expect(r.extras[0].name).toBe('উইকলি-১ - Copy.json');
  });

  it('প্রশ্নব্যাংকে নেই এমন প্রশ্নের id-তে সতর্কতা', () => {
    const i = synced();
    i.knownQuestionIds = new Set(['q1']);
    i.folder.nodes[0].files.push(file('নতুন.json', { parsed: parsedOf(paper('p9', 'c1', 'নতুন', { questionIds: ['q1', 'zzz'] })) }));
    const r = compareFolderToApp(i);
    expect(r.warnings.some((w) => w.includes('1টি প্রশ্ন'))).toBe(true);
    expect(find(r, 'paper', 'add')).toHaveLength(1); // তবু যোগ হয়
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
    expect(pa[0]).toMatchObject({ dirName: 'উইকলি', fileName: 'উইকলি-১.json' });
  });

  it('অ্যাপে নতুন ক্যাটেগরি + নতুন প্রশ্নপত্র', () => {
    const i = synced();
    i.app.categories.push(cat('c2', 'চ্যাপ্টার টেস্ট', 2));
    i.app.papers.push(paper('p2', 'c2', 'চ্যাপ্টার টেস্ট-১'));
    const r = compareAppToFolder(i);
    expect(find(r, 'category', 'add')[0]).toMatchObject({ id: 'c2', dirName: 'চ্যাপ্টার টেস্ট' });
    expect(find(r, 'paper', 'add')[0]).toMatchObject({ id: 'p2', dirName: 'চ্যাপ্টার টেস্ট', fileName: 'চ্যাপ্টার টেস্ট-১.json' });
  });

  it('অ্যাপে ক্যাটেগরির নাম বদলালে ফোল্ডারের নাম বদল; ভেতরের ফাইলের নাম বদল প্রশ্নপত্রের নাম অনুযায়ী', () => {
    const i = synced();
    i.app.categories[0].name = 'সাপ্তাহিক';
    i.app.papers[0].shortName = 'সাপ্তাহিক-১';
    const r = compareAppToFolder(i);
    expect(find(r, 'category', 'rename')[0]).toMatchObject({ from: 'উইকলি', to: 'সাপ্তাহিক' });
    expect(find(r, 'paper', 'rename')[0]).toMatchObject({ from: 'উইকলি-১.json', to: 'সাপ্তাহিক-১.json', dirName: 'সাপ্তাহিক' });
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
    i.folder.nodes[0].files[0] = file('উইকলি-১.json', { size: 30, parsed: parsedOf(i.app.papers[0], { title: 'হাতে বদলানো' }) });
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

  it('অ্যাপ যা কখনো চেনেনি এমন ফাইল/ফোল্ডার বাড়তি, মোছা হয় না', () => {
    const i = synced();
    i.folder.nodes[0].files.push(file('অচেনা.json', { parsed: parsedOf(paper('zz', 'c1', 'অচেনা')) }));
    i.folder.nodes.push(node('অচেনা ফোল্ডার', 'x-id'));
    const r = compareAppToFolder(i);
    expect(find(r, 'paper', 'delete')).toHaveLength(0);
    expect(r.extras.map((e) => e.name).sort()).toEqual(['অচেনা ফোল্ডার', 'অচেনা.json'].sort());
  });

  it('একই নামের দুই প্রশ্নপত্র আলাদা ফাইলের নাম পায়', () => {
    const i = synced();
    i.app.papers.push(paper('p2', 'c1', 'উইকলি-১', { createdAt: 2000 }));
    const add = find(compareAppToFolder(i), 'paper', 'add');
    expect(add).toHaveLength(1);
    expect(add[0].fileName).toBe('উইকলি-১ (2).json');
  });
});
