import type { Category, Paper } from '../db/db';
import type { ScanEntry } from '../utils/storageAccess';
import { FOLDER_META, baseOfDirName, isReservedDirName, isSystemFileName, sanitizeFolderName, uniqueAppName } from './folderLayout';
import { CONFLICT_SUBDIR, newId } from './syncCompare';
import {
  CATEGORY_ROOT,
  categoryDirNameFor,
  categoryUnnecessaryPath,
  isPaperFileName,
  isUncategorizedName,
  paperFileBase,
  paperFileNameFor,
  paperFileStem,
  parseCategoryMeta,
  samePaperContent,
  normalizePaper,
  type CategoryFolderMeta,
  type CategorySyncState,
  type ParsedPaper,
} from './categoryLayout';

/**
 * ধাপ ২ - ক্যাটেগরি ফোল্ডারের "খাঁটি" তুলনা (কোনো ফাইল/ডেটাবেস IO নেই)।
 *
 * হাতে দেওয়া তথ্য নিয়ে শুধু হিসাব করে: "এখন সিঙ্ক করলে কী কী বদলাবে"। পরের ধাপে আসল লেখক (অ্যাপ -> ফোল্ডার),
 * স্ক্যানার (ফোল্ডার -> অ্যাপ) আর প্রিভিউ উইন্ডো সবাই এখানকার একই নিয়ম ব্যবহার করবে - তাই প্রিভিউ আর আসল কাজ
 * একই ফল দেয়। Question_Bank-এর syncCompare.ts-এর মতোই গঠন।
 *
 * মূল নিয়ম:
 *  - চেনা হয় id দিয়ে (ক্যাটেগরি ফোল্ডারের .folder.json, প্রশ্নপত্র ফাইলের ভেতরের id), নাম দিয়ে নয়।
 *  - ফোল্ডার -> অ্যাপ: ফোল্ডারে যা বদলেছে তা অ্যাপে আসে; অ্যাপে যে বদল এখনো ফোল্ডারে লেখা হয়নি (pending) তা ছোঁয়া হয় না।
 *  - অ্যাপ -> ফোল্ডার: অ্যাপের কপিই জেতে।
 *  - অচেনা জিনিস কখনো মোছা হয় না; নিজের ফোল্ডারের unnecessary/-তে সরে যায় (extras)।
 *  - ভাঙা প্রশ্নপত্র ফাইল: সতর্কতা, কিছু মোছা/বদলানো হয় না।
 *  - Category ফোল্ডারই না থাকলে ফোল্ডার -> অ্যাপে কিছু মোছা হয় না।
 */

/* ------------------------------------------------------------------
 * Types
 * ---------------------------------------------------------------- */

export interface PaperFileNode {
  fileName: string;
  mtime: number;
  size: number;
  /** ফাইল পড়ে পাওয়া প্রশ্নপত্র; null = পড়া/বোঝা যায়নি; undefined = পড়া হয়নি (শেষবারের মতোই আছে ধরা হয়) */
  parsed?: ParsedPaper | null;
  /** parsed null হলে কারণ */
  error?: string;
}

export interface CategoryFolderNode {
  dirName: string;
  meta: CategoryFolderMeta | null;
  files: PaperFileNode[];
  /** ক্যাটেগরি ফোল্ডারের ভেতরে অ্যাপ যা চেনে না (ফাইল/ফোল্ডার) */
  extraItems: Array<{ name: string; dir: boolean }>;
}

export interface CategoryFolderSide {
  /** Category/ ফোল্ডারটা আছে কি */
  rootExists: boolean;
  nodes: CategoryFolderNode[];
  /** Category/-র সরাসরি ভেতরে অচেনা জিনিস */
  rootExtras: Array<{ name: string; dir: boolean }>;
}

export interface CategoryAppSide {
  categories: Category[];
  papers: Paper[];
}

/** অ্যাপে যে বদল জমে আছে কিন্তু এখনো ফোল্ডারে লেখা হয়নি */
export interface CategoryPending {
  categories: Set<string>;
  papers: Set<string>;
  /** অ্যাপে মোছা হয়েছে, ফোল্ডার থেকে এখনো সরানো হয়নি */
  deletes: Set<string>;
}

export type CategoryDeleteMode = 'delete-papers' | 'move-to-uncategorized';

export interface CategoryCompareInput {
  folder: CategoryFolderSide;
  app: CategoryAppSide;
  state: CategorySyncState;
  pending?: CategoryPending;
  /** প্রশ্নব্যাংকে থাকা প্রশ্নের id (দিলে ঝুলে থাকা প্রশ্নের সতর্কতা আসে) */
  knownQuestionIds?: Set<string>;
  /** ফোল্ডারে ক্যাটেগরি মুছলে তার প্রশ্নপত্রের কী হবে (ডিফল্ট: মুছবে) */
  onCategoryDelete?: CategoryDeleteMode;
  makeId?: () => string;
}

export type CategoryAction = 'add' | 'rename' | 'move' | 'delete' | 'update' | 'info';

export interface CategoryEntry {
  kind: 'category' | 'paper';
  action: CategoryAction;
  /** ক্যাটেগরি বা প্রশ্নপত্রের id */
  id: string;
  /** দেখানোর নাম: [ক্যাটেগরি] অথবা [ক্যাটেগরি, প্রশ্নপত্র] */
  path: string[];
  from?: string;
  to?: string;
  note?: string;
  /** ডেটা মোছে / অ্যাপ থেকে আর ফেরানো যায় না */
  destructive?: boolean;
  /** ক্যাটেগরি মোছা: ভেতরের প্রশ্নপত্রের সংখ্যা */
  papers?: number;
  paperIds?: string[];
  /** ক্যাটেগরি মোছা + প্রশ্নপত্র বাঁচানো: প্রশ্নপত্র যে ক্যাটেগরিতে যাবে */
  moveToCategoryId?: string;
  /* ---- আসল কাজের জন্য তথ্য ---- */
  name?: string;
  order?: number;
  dirName?: string;
  fileName?: string;
  categoryId?: string;
  paper?: ParsedPaper;
}

export type CategoryExtraKind = 'extra-folder' | 'extra-file';

export interface CategoryExtra {
  kind: CategoryExtraKind;
  /** যে ফোল্ডারের ভেতরে আছে (খালি = Category/-র সরাসরি ভেতরে) */
  owner: string[];
  name: string;
  path: string[];
  folderSide: string;
  /** Category/-র সাপেক্ষে বর্তমান পথ */
  sourcePath: string;
  /** সরে যাবে যেখানে (পূর্ণ পথ) */
  moveTo: string;
}

export interface CategoryCompareResult {
  entries: CategoryEntry[];
  extras: CategoryExtra[];
  warnings: string[];
  /** ক্যাটেগরির id -> ডিস্কের ফোল্ডারের নাম (সিঙ্কের পরে যা হবে) */
  dirNames: Record<string, string>;
  /** ফোল্ডার -> অ্যাপ: অর্ধেকের বেশি জিনিস উধাও মনে হচ্ছে (আসল কাজ আগে জিজ্ঞেস করবে) */
  massDelete?: { count: number; total: number };
}

export interface CategoryTotals {
  categoriesAdded: number;
  categoriesRenamed: number;
  categoriesDeleted: number;
  papersAdded: number;
  papersUpdated: number;
  papersMoved: number;
  papersRenamed: number;
  papersDeleted: number;
  extras: number;
  warnings: number;
}

/* ------------------------------------------------------------------
 * Reading the folder listing into nodes
 * ---------------------------------------------------------------- */

/**
 * scanTree(Category/) -এর তালিকা -> ক্যাটেগরি ফোল্ডারের নোড। প্রশ্নপত্র ফাইলের লেখা এখানে পড়া হয় না
 * (দেখুন needsPaperRead); parsed পরে বসানো হয়। বাদ যায়: unnecessary/, সিস্টেম ফাইল (.folder.json ছাড়া).
 */
export function buildCategoryNodes(entries: ScanEntry[]): { nodes: CategoryFolderNode[]; rootExtras: Array<{ name: string; dir: boolean }> } {
  const dirs = new Map<string, CategoryFolderNode>();
  const rootExtras: Array<{ name: string; dir: boolean }> = [];

  for (const e of entries) {
    const parts = e.p.split('/').filter(Boolean);
    if (parts.length === 0) continue;
    if (parts.length === 1) {
      const name = parts[0];
      if (isSystemFileName(name) || isReservedDirName(name)) continue;
      if (e.d) dirs.set(name, { dirName: name, meta: null, files: [], extraItems: [] });
      else rootExtras.push({ name, dir: false });
    }
  }

  for (const e of entries) {
    const parts = e.p.split('/').filter(Boolean);
    if (parts.length !== 2) continue; // গভীরের জিনিস দেখার দরকার নেই
    const node = dirs.get(parts[0]);
    if (!node) continue;
    const name = parts[1];
    if (!e.d && name === FOLDER_META) {
      node.meta = parseCategoryMeta(e.t);
    } else if (isSystemFileName(name)) {
      // .nomedia, .tmp, .bak ... কখনো বাড়তি নয়
    } else if (e.d && isReservedDirName(name)) {
      // আগে সরানো অপ্রয়োজনীয় জিনিস
    } else if (!e.d && isPaperFileName(name)) {
      node.files.push({ fileName: name, mtime: e.m, size: e.s });
    } else {
      node.extraItems.push({ name, dir: e.d });
    }
  }

  const nodes = Array.from(dirs.values()).sort((a, b) => a.dirName.localeCompare(b.dirName));
  for (const n of nodes) {
    n.files.sort((a, b) => a.fileName.localeCompare(b.fileName));
    n.extraItems.sort((a, b) => a.name.localeCompare(b.name));
  }
  rootExtras.sort((a, b) => a.name.localeCompare(b.name));
  return { nodes, rootExtras };
}

/** ফোল্ডারটা কোন ক্যাটেগরি: .folder.json-এর id, না থাকলে একই নামের শেষবারের লেখা ফোল্ডার */
export function categoryIdForNode(node: CategoryFolderNode, state: CategorySyncState): string | null {
  if (node.meta) return node.meta.id;
  const low = node.dirName.toLowerCase();
  for (const [id, r] of Object.entries(state.categories)) {
    if (r.dirName.toLowerCase() === low) return id;
  }
  return null;
}

/** এই ফাইলটা শেষবার যে প্রশ্নপত্র হিসেবে লেখা/পড়া হয়েছিল তার id */
export function paperIdForFile(state: CategorySyncState, categoryId: string | null, fileName: string): string | null {
  if (!categoryId) return null;
  const low = fileName.toLowerCase();
  for (const [id, r] of Object.entries(state.papers)) {
    if (r.categoryId === categoryId && r.fileName.toLowerCase() === low) return id;
  }
  return null;
}

/** ফাইলের লেখা পড়তে হবে কি: নতুন ফাইল, অন্য জায়গা থেকে আসা ফাইল, বা mtime/size বদলেছে */
export function needsPaperRead(node: CategoryFolderNode, file: PaperFileNode, state: CategorySyncState): boolean {
  const catId = categoryIdForNode(node, state);
  const id = paperIdForFile(state, catId, file.fileName);
  if (!id) return true;
  const row = state.papers[id];
  return !row || row.mtime !== file.mtime || row.size !== file.size;
}

/* ------------------------------------------------------------------
 * Matching folders with app categories
 * ---------------------------------------------------------------- */

interface Resolved {
  /** ক্যাটেগরির id -> তার (আসল) ফোল্ডার */
  keepers: Map<string, CategoryFolderNode>;
  /** কোনো অ্যাপ-ক্যাটেগরির সঙ্গে মেলেনি, নতুন ক্যাটেগরি হবে (id থাকলে .folder.json-এর, না থাকলে null) */
  fresh: Array<{ node: CategoryFolderNode; id: string | null }>;
  /** কপি করা ফোল্ডার (একই id, আরেকটা আসল) */
  copies: CategoryFolderNode[];
  /** .folder.json না থাকায় নামে চেনা ফোল্ডার */
  adopted: Set<string>;
}

function resolveNodes(nodes: CategoryFolderNode[], state: CategorySyncState, app: CategoryAppSide): Resolved {
  const groups = new Map<string, CategoryFolderNode[]>();
  const noId: CategoryFolderNode[] = [];
  for (const n of nodes) {
    const id = categoryIdForNode(n, state);
    if (!id) noId.push(n);
    else (groups.get(id) ?? groups.set(id, []).get(id)!).push(n);
  }

  const keepers = new Map<string, CategoryFolderNode>();
  const copies: CategoryFolderNode[] = [];
  for (const [id, list] of groups) {
    const rowDir = state.categories[id]?.dirName.toLowerCase();
    const keeper = list.find((n) => n.dirName.toLowerCase() === rowDir) ?? list[0];
    keepers.set(id, keeper);
    for (const n of list) if (n !== keeper) copies.push(n);
  }

  // .folder.json নেই + শেষবারের লেখা নামেও মেলে না: একই নামের অ্যাপ-ক্যাটেগরি (যার ফোল্ডার মেলেনি) থাকলে সেটাই
  const adopted = new Set<string>();
  const fresh: Resolved['fresh'] = [];
  const freeApp = app.categories.filter((c) => !keepers.has(c.id));
  for (const n of noId) {
    const exact = n.dirName.toLowerCase();
    const base = baseOfDirName(n.dirName).toLowerCase();
    const hit = freeApp.find((c) => c.name.trim().toLowerCase() === exact) ?? freeApp.find((c) => c.name.trim().toLowerCase() === base);
    if (hit) {
      keepers.set(hit.id, n);
      adopted.add(hit.id);
      freeApp.splice(freeApp.indexOf(hit), 1);
    } else {
      fresh.push({ node: n, id: null });
    }
  }
  // .folder.json আছে কিন্তু অ্যাপ চেনে না: নতুন ক্যাটেগরি (অন্য ফোনের ফোল্ডার)
  const appIds = new Set(app.categories.map((c) => c.id));
  for (const [id, n] of Array.from(keepers)) {
    if (!appIds.has(id)) {
      keepers.delete(id);
      fresh.push({ node: n, id });
    }
  }
  fresh.sort((a, b) => a.node.dirName.localeCompare(b.node.dirName));
  return { keepers, fresh, copies, adopted };
}

/* ------------------------------------------------------------------
 * Extras (never deleted, moved into unnecessary/)
 * ---------------------------------------------------------------- */

function extra(kind: CategoryExtraKind, ownerDir: string, name: string, folderSide: string, moveName?: string): CategoryExtra {
  const owner = ownerDir ? [ownerDir] : [];
  return {
    kind,
    owner,
    name,
    path: [...owner, name],
    folderSide,
    sourcePath: ownerDir ? `${ownerDir}/${name}` : name,
    moveTo: categoryUnnecessaryPath(ownerDir, moveName ?? name),
  };
}

function nodeExtras(nodes: CategoryFolderNode[], rootExtras: Array<{ name: string; dir: boolean }>): CategoryExtra[] {
  const out: CategoryExtra[] = [];
  for (const it of rootExtras) {
    out.push(extra(it.dir ? 'extra-folder' : 'extra-file', '', it.name, `${it.dir ? 'বাড়তি ফোল্ডার' : 'বাড়তি ফাইল'}: ${it.name}`));
  }
  for (const n of nodes) {
    for (const it of n.extraItems) {
      out.push(extra(it.dir ? 'extra-folder' : 'extra-file', n.dirName, it.name, `${it.dir ? 'বাড়তি ফোল্ডার' : 'বাড়তি ফাইল'}: ${it.name}`));
    }
  }
  return out;
}

function copiedFolderExtra(n: CategoryFolderNode): CategoryExtra {
  const ex = extra('extra-folder', '', n.dirName, `কপি করা ক্যাটেগরি ফোল্ডার: ${n.dirName} (একই id-র আরেকটা আছে)`, `${CONFLICT_SUBDIR}/${n.dirName}`);
  return ex;
}

interface FoundFile {
  id: string;
  categoryId: string;
  node: CategoryFolderNode;
  file: PaperFileNode;
  parsed?: ParsedPaper;
  isRowFile: boolean;
}

/**
 * কেন্দ্রীয় ফোল্ডারের প্রশ্নপত্র ফাইলগুলো পড়ে id অনুযায়ী সাজায়।
 * একই id দুই ফাইলে থাকলে (ফাইল কপি করা) আসলটা (শেষবারের লেখা ফাইল) থাকে, বাকিগুলো extras।
 */
function collectFiles(
  keepers: Map<string, CategoryFolderNode>,
  state: CategorySyncState,
  warnings: string[],
  extras: CategoryExtra[],
  catName: (id: string) => string
): { byId: Map<string, FoundFile>; seenIds: Set<string> } {
  const seenIds = new Set<string>();
  const all: FoundFile[] = [];
  const ordered = Array.from(keepers.entries()).sort((a, b) => a[1].dirName.localeCompare(b[1].dirName));
  for (const [catId, node] of ordered) {
    for (const file of node.files) {
      const rowId = paperIdForFile(state, catId, file.fileName);
      if (file.parsed === null) {
        warnings.push(`প্রশ্নপত্র ফাইল পড়া যায়নি: ${catName(catId)} › ${file.fileName} (${file.error || 'বোঝা যায়নি'}) - কিছু বদলানো হয়নি`);
        if (rowId) seenIds.add(rowId);
        continue;
      }
      if (file.parsed) {
        all.push({ id: file.parsed.id, categoryId: catId, node, file, parsed: file.parsed, isRowFile: rowId === file.parsed.id });
      } else if (rowId) {
        all.push({ id: rowId, categoryId: catId, node, file, isRowFile: true });
      } else {
        warnings.push(`প্রশ্নপত্র ফাইল পড়া হয়নি: ${catName(catId)} › ${file.fileName}`);
      }
    }
  }

  const byId = new Map<string, FoundFile>();
  const groups = new Map<string, FoundFile[]>();
  for (const f of all) (groups.get(f.id) ?? groups.set(f.id, []).get(f.id)!).push(f);
  for (const [id, list] of groups) {
    const keeper = list.find((f) => f.isRowFile) ?? list[0];
    byId.set(id, keeper);
    seenIds.add(id);
    for (const f of list) {
      if (f === keeper) continue;
      extras.push(extra('extra-file', f.node.dirName, f.file.fileName, `কপি করা প্রশ্নপত্র ফাইল: ${f.node.dirName} › ${f.file.fileName} (একই id-র আরেকটা আছে)`));
    }
  }
  return { byId, seenIds };
}

/* ------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------- */

const noPending = (): CategoryPending => ({ categories: new Set(), papers: new Set(), deletes: new Set() });

const FIELD_LABELS: Array<[keyof ParsedPaper, string]> = [
  ['shortName', 'নাম'],
  ['title', 'শিরোনাম'],
  ['subjectLine', 'বিষয় লাইন'],
  ['note', 'দ্রষ্টব্য'],
  ['duration', 'সময়'],
  ['totalMarks', 'পূর্ণমান'],
  ['questionIds', 'প্রশ্নের তালিকা'],
  ['edits', 'প্রশ্নপত্র-ভিত্তিক সম্পাদনা'],
  ['order', 'ক্রম'],
];

/** দুই প্রশ্নপত্রের কোন কোন ঘর আলাদা (বাংলা নামে) */
export function changedPaperFields(a: ParsedPaper, b: ParsedPaper): string[] {
  const na = normalizePaper(a);
  const nb = normalizePaper(b);
  const out: string[] = [];
  for (const [key, label] of FIELD_LABELS) {
    if (JSON.stringify(na[key] ?? null) !== JSON.stringify(nb[key] ?? null)) out.push(label);
  }
  return out;
}

function missingQuestionWarning(paper: ParsedPaper, catName: string, known?: Set<string>): string | null {
  if (!known) return null;
  const missing = paper.questionIds.filter((q) => !known.has(q)).length;
  return missing > 0 ? `${catName} › ${paper.shortName}: ${missing}টি প্রশ্ন প্রশ্নব্যাংকে পাওয়া যায়নি (প্রশ্নপত্রে যেমন আছে তেমনই থাকবে)` : null;
}

const sortCats = (cats: Category[]): Category[] =>
  [...cats].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.name.localeCompare(b.name));

/* ------------------------------------------------------------------
 * Folder -> app
 * ---------------------------------------------------------------- */

export function compareFolderToApp(input: CategoryCompareInput): CategoryCompareResult {
  const { folder, app, state } = input;
  const pending = input.pending ?? noPending();
  const makeId = input.makeId ?? newId;
  const mode: CategoryDeleteMode = input.onCategoryDelete ?? 'delete-papers';

  const entries: CategoryEntry[] = [];
  const extras: CategoryExtra[] = [];
  const warnings: string[] = [];
  const dirNames: Record<string, string> = {};

  const appCatById = new Map(app.categories.map((c) => [c.id, c]));
  const appPaperById = new Map(app.papers.map((p) => [p.id, p]));
  const uncategorized = app.categories.find((c) => isUncategorizedName(c.name));

  const rootGone = !folder.rootExists;
  if (rootGone && (Object.keys(state.categories).length > 0 || Object.keys(state.papers).length > 0)) {
    warnings.push('Category ফোল্ডার পাওয়া যায়নি (কিছু মোছা হয়নি)');
  }

  const resolved = resolveNodes(folder.nodes, state, app);
  extras.push(...nodeExtras(folder.nodes.filter((n) => !resolved.copies.includes(n)), folder.rootExtras));
  for (const c of resolved.copies) extras.push(copiedFolderExtra(c));

  /* ---------- ক্যাটেগরি: নাম বদল / নতুন ---------- */
  const finalName = new Map<string, string>(); // সিঙ্কের পরে ক্যাটেগরির নাম
  const validCat = new Set<string>(); // যে ক্যাটেগরিতে প্রশ্নপত্র নামতে পারে
  const usedNames: string[] = app.categories.map((c) => c.name);
  const keeperNodes = new Map(resolved.keepers); // id -> ফোল্ডার (অ্যাপে আছে এমন)
  let nextOrder = app.categories.reduce((m, c) => Math.max(m, c.order || 0), 0);

  for (const [id, node] of Array.from(keeperNodes.entries()).sort((a, b) => a[1].dirName.localeCompare(b[1].dirName))) {
    const cat = appCatById.get(id)!;
    if (pending.deletes.has(id)) {
      keeperNodes.delete(id); // অ্যাপে মোছা, ফোল্ডার থেকে সরানো বাকি - ফোল্ডার -> অ্যাপে কিছু করার নেই
      continue;
    }
    validCat.add(id);
    finalName.set(id, cat.name);
    dirNames[id] = node.dirName;
    if (pending.categories.has(id)) continue; // অ্যাপের কপি জেতে

    const row = state.categories[id];
    const renamedOutside = !!row && row.dirName.toLowerCase() !== node.dirName.toLowerCase();
    const wanted = baseOfDirName(node.dirName);
    if (renamedOutside && wanted !== cat.name) {
      if (isUncategorizedName(cat.name)) {
        warnings.push(`"${UNCAT_LABEL}" ক্যাটেগরির ফোল্ডারের নাম বদলানো হয়েছে (${node.dirName}), কিন্তু এর নাম বদলানো যায় না - অ্যাপ আগের নামেই রাখবে`);
        continue;
      }
      const siblings = usedNames.filter((n) => n !== cat.name);
      const name = uniqueAppName(wanted, siblings);
      usedNames[usedNames.indexOf(cat.name)] = name;
      finalName.set(id, name);
      entries.push({
        kind: 'category',
        action: 'rename',
        id,
        path: [name],
        from: cat.name,
        to: name,
        name,
        dirName: node.dirName,
        note: name !== wanted ? `"${wanted}" নামে আরেকটা ক্যাটেগরি আছে, তাই "${name}" হয়েছে` : undefined,
      });
    }
  }

  for (const f of resolved.fresh) {
    const node = f.node;
    const id = f.id ?? makeId();
    if (pending.deletes.has(id)) continue;
    const wanted = baseOfDirName(node.dirName);
    const name = uniqueAppName(wanted, usedNames);
    usedNames.push(name);
    const metaOrder = node.meta && node.meta.order > 0 ? node.meta.order : 0;
    const order = metaOrder || ++nextOrder;
    nextOrder = Math.max(nextOrder, order);
    validCat.add(id);
    finalName.set(id, name);
    dirNames[id] = node.dirName;
    keeperNodes.set(id, node);
    entries.push({
      kind: 'category',
      action: 'add',
      id,
      path: [name],
      to: name,
      name,
      order,
      dirName: node.dirName,
      note: name !== wanted ? `"${wanted}" নামে আরেকটা ক্যাটেগরি আছে, তাই "${name}" হয়েছে` : undefined,
    });
  }

  const catLabel = (id: string): string => finalName.get(id) ?? appCatById.get(id)?.name ?? '?';

  /* ---------- প্রশ্নপত্র ---------- */
  const { byId, seenIds } = collectFiles(keeperNodes, state, warnings, extras, catLabel);
  const paperEntries: CategoryEntry[] = [];

  for (const [id, f] of Array.from(byId.entries()).sort((a, b) => a[1].node.dirName.localeCompare(b[1].node.dirName) || a[1].file.fileName.localeCompare(b[1].file.fileName))) {
    if (pending.deletes.has(id) || pending.papers.has(id)) continue;
    if (!validCat.has(f.categoryId)) continue;
    const appP = appPaperById.get(id);
    if (!appP) {
      if (!f.parsed) continue; // শেষবারের মতোই আছে অথচ অ্যাপে নেই: অ্যাপ -> ফোল্ডার সিঙ্ক ফাইলটা সরাবে
      paperEntries.push({
        kind: 'paper',
        action: 'add',
        id,
        path: [catLabel(f.categoryId), f.parsed.shortName],
        to: f.parsed.shortName,
        categoryId: f.categoryId,
        dirName: dirNames[f.categoryId],
        fileName: f.file.fileName,
        paper: f.parsed,
      });
      const w = missingQuestionWarning(f.parsed, catLabel(f.categoryId), input.knownQuestionIds);
      if (w) warnings.push(w);
      continue;
    }
    const shown = f.parsed?.shortName ?? appP.shortName;
    if (appP.categoryId !== f.categoryId) {
      paperEntries.push({
        kind: 'paper',
        action: 'move',
        id,
        path: [catLabel(f.categoryId), shown],
        from: catLabel(appP.categoryId ?? ''),
        to: catLabel(f.categoryId),
        categoryId: f.categoryId,
        dirName: dirNames[f.categoryId],
        fileName: f.file.fileName,
      });
    }
    if (f.parsed && !samePaperContent(f.parsed, appP)) {
      const fields = changedPaperFields(f.parsed, appP);
      paperEntries.push({
        kind: 'paper',
        action: 'update',
        id,
        path: [catLabel(f.categoryId), shown],
        note: fields.length ? `বদলেছে: ${fields.join(', ')}` : undefined,
        categoryId: f.categoryId,
        dirName: dirNames[f.categoryId],
        fileName: f.file.fileName,
        paper: f.parsed,
      });
      const w = missingQuestionWarning(f.parsed, catLabel(f.categoryId), input.knownQuestionIds);
      if (w) warnings.push(w);
    }
  }

  /* ---------- মোছা ---------- */
  let deletedPapers = 0;
  let deletedCats = 0;

  // ফাইল নেই -> প্রশ্নপত্র মোছা (ক্যাটেগরি ফোল্ডার আছে, তাই এটা শুধু ফাইল মোছা)
  if (!rootGone) {
    for (const [id, row] of Object.entries(state.papers).sort((a, b) => a[0].localeCompare(b[0]))) {
      if (seenIds.has(id) || pending.papers.has(id) || pending.deletes.has(id)) continue;
      const appP = appPaperById.get(id);
      if (!appP) continue;
      if (!validCat.has(row.categoryId)) continue; // ক্যাটেগরি মোছার হিসাব নিচে
      if (appP.categoryId !== row.categoryId) continue; // অ্যাপে সরানো হয়েছে, লেখা বাকি
      deletedPapers++;
      paperEntries.push({
        kind: 'paper',
        action: 'delete',
        id,
        path: [catLabel(row.categoryId), appP.shortName],
        from: appP.shortName,
        destructive: true,
        note: 'ফোল্ডারে ফাইলটা নেই',
      });
    }
  }

  // ক্যাটেগরি ফোল্ডার নেই -> ক্যাটেগরি মোছা
  const catEntries: CategoryEntry[] = [];
  if (!rootGone) {
    for (const [id] of Object.entries(state.categories).sort((a, b) => a[0].localeCompare(b[0]))) {
      if (keeperNodes.has(id) || pending.categories.has(id) || pending.deletes.has(id)) continue;
      const cat = appCatById.get(id);
      if (!cat) continue;
      if (isUncategorizedName(cat.name)) {
        catEntries.push({
          kind: 'category',
          action: 'info',
          id,
          path: [cat.name],
          note: `"${cat.name}" ক্যাটেগরির ফোল্ডার নেই - এটা মোছা যায় না, অ্যাপ আবার ফোল্ডার তৈরি করবে`,
        });
        continue;
      }
      const inside = app.papers.filter((p) => p.categoryId === id && !seenIds.has(p.id) && !pending.papers.has(p.id) && !pending.deletes.has(p.id));
      const keep = mode === 'move-to-uncategorized' && !!uncategorized;
      deletedCats++;
      deletedPapers += keep ? 0 : inside.length;
      catEntries.push({
        kind: 'category',
        action: 'delete',
        id,
        path: [cat.name],
        from: cat.name,
        destructive: true,
        papers: inside.length,
        paperIds: inside.map((p) => p.id),
        moveToCategoryId: keep ? uncategorized!.id : undefined,
        note: keep
          ? `ফোল্ডার নেই; ${inside.length}টি প্রশ্নপত্র "${uncategorized!.name}"-এ যাবে`
          : `ফোল্ডার নেই; ক্যাটেগরির ${inside.length}টি প্রশ্নপত্রও অ্যাপ থেকে মুছবে`,
      });
    }
  }

  let massDelete: CategoryCompareResult['massDelete'];
  if (!rootGone) {
    const catRows = Object.keys(state.categories).filter((id) => appCatById.has(id) && !isUncategorizedName(appCatById.get(id)!.name)).length;
    const paperRows = Object.keys(state.papers).filter((id) => appPaperById.has(id)).length;
    const total = catRows + paperRows;
    const count = deletedCats + deletedPapers;
    if (count >= 3 && count / Math.max(1, total) > 0.5) massDelete = { count, total };
  }

  const catOrder = (e: CategoryEntry) => (e.action === 'add' ? 0 : e.action === 'rename' ? 1 : e.action === 'info' ? 2 : 3);
  const out = [...entries.sort((a, b) => catOrder(a) - catOrder(b)), ...catEntries, ...paperEntries];
  return { entries: out, extras, warnings, dirNames, massDelete };
}

const UNCAT_LABEL = 'অশ্রেণিবদ্ধ';

/* ------------------------------------------------------------------
 * App -> folder
 * ---------------------------------------------------------------- */

export function compareAppToFolder(input: CategoryCompareInput): CategoryCompareResult {
  const { folder, app, state } = input;
  const pending = input.pending ?? noPending();

  const entries: CategoryEntry[] = [];
  const extras: CategoryExtra[] = [];
  const warnings: string[] = [];
  const dirNames: Record<string, string> = {};

  const appCatById = new Map(app.categories.map((c) => [c.id, c]));
  const appPaperById = new Map(app.papers.map((p) => [p.id, p]));

  const resolved = resolveNodes(folder.nodes, state, app);
  extras.push(...nodeExtras(folder.nodes.filter((n) => !resolved.copies.includes(n)), folder.rootExtras));
  for (const c of resolved.copies) extras.push(copiedFolderExtra(c));

  // অ্যাপ জানে না এমন ক্যাটেগরি ফোল্ডার: আগে অ্যাপে ছিল (মোছা হয়েছে) -> ফোল্ডারও যাবে; আগে ছিল না -> বাড়তি
  const orphanNodes = new Map<string, CategoryFolderNode>(); // মোছা ক্যাটেগরির id -> ফোল্ডার
  for (const f of resolved.fresh) {
    if (f.id && (state.categories[f.id] || pending.deletes.has(f.id))) orphanNodes.set(f.id, f.node);
    else extras.push(copiedAsOwnExtra(f.node));
  }

  const allKeepers = new Map(resolved.keepers);
  for (const [id, n] of orphanNodes) allKeepers.set(id, n);

  const takenDirs = new Set<string>(folder.nodes.map((n) => n.dirName.toLowerCase()));
  const cats = sortCats(app.categories);

  /* ---------- ক্যাটেগরি ---------- */
  for (const cat of cats) {
    const node = folder.rootExists ? resolved.keepers.get(cat.id) : undefined;
    if (node) {
      const want = sanitizeFolderName(cat.name);
      const same = node.dirName.toLowerCase() === want.toLowerCase() || baseOfDirName(node.dirName).toLowerCase() === want.toLowerCase();
      if (same) {
        dirNames[cat.id] = node.dirName;
      } else {
        takenDirs.delete(node.dirName.toLowerCase());
        const to = categoryDirNameFor(cat.name, takenDirs);
        takenDirs.add(to.toLowerCase());
        dirNames[cat.id] = to;
        entries.push({ kind: 'category', action: 'rename', id: cat.id, path: [cat.name], from: node.dirName, to, name: cat.name, dirName: to });
      }
    } else {
      const to = categoryDirNameFor(cat.name, takenDirs);
      takenDirs.add(to.toLowerCase());
      dirNames[cat.id] = to;
      const lost = !!state.categories[cat.id] && folder.rootExists;
      entries.push({
        kind: 'category',
        action: 'add',
        id: cat.id,
        path: [cat.name],
        to,
        name: cat.name,
        order: cat.order,
        dirName: to,
        note: lost ? 'ফোল্ডারে ছিল না - আবার তৈরি হবে' : undefined,
      });
    }
  }

  const nameOfCat = (id: string): string => appCatById.get(id)?.name ?? orphanNodes.get(id)?.dirName ?? '?';

  /* ---------- প্রশ্নপত্র ---------- */
  const { byId } = collectFiles(allKeepers, state, warnings, extras, nameOfCat);
  const takenFiles = new Map<string, Set<string>>(); // ক্যাটেগরির id -> ওই ফোল্ডারে থাকা ফাইলের নামগুলো (ছোট হাতের)
  const filesIn = (catId: string): Set<string> => {
    let s = takenFiles.get(catId);
    if (!s) {
      s = new Set(resolved.keepers.get(catId)?.files.map((f) => f.fileName.toLowerCase()) ?? []);
      takenFiles.set(catId, s);
    }
    return s;
  };

  const papers = [...app.papers].sort((a, b) => {
    const ca = appCatById.get(a.categoryId ?? '')?.order ?? 0;
    const cb = appCatById.get(b.categoryId ?? '')?.order ?? 0;
    return ca - cb || (a.order ?? 1e9) - (b.order ?? 1e9) || (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id);
  });

  for (const p of papers) {
    const cat = p.categoryId ? appCatById.get(p.categoryId) : undefined;
    if (!cat) {
      warnings.push(`প্রশ্নপত্র "${p.shortName}"-এর ক্যাটেগরি পাওয়া যায়নি - ফোল্ডারে লেখা হয়নি`);
      continue;
    }
    const targetDir = dirNames[cat.id];
    const found = byId.get(p.id);
    const taken = filesIn(cat.id);

    if (!found) {
      const fileName = paperFileNameFor(p.shortName, taken);
      taken.add(fileName.toLowerCase());
      entries.push({
        kind: 'paper',
        action: 'add',
        id: p.id,
        path: [cat.name, p.shortName],
        to: fileName,
        categoryId: cat.id,
        dirName: targetDir,
        fileName,
        paper: normalizePaper(p),
      });
      continue;
    }

    const moved = found.categoryId !== cat.id;
    const nameOk = paperFileBase(found.file.fileName).toLowerCase() === paperFileStem(p.shortName).toLowerCase();
    let fileName = found.file.fileName;
    if (moved || !nameOk) {
      if (!moved) taken.delete(found.file.fileName.toLowerCase());
      fileName = paperFileNameFor(p.shortName, taken);
      taken.add(fileName.toLowerCase());
    }
    if (moved) {
      entries.push({
        kind: 'paper',
        action: 'move',
        id: p.id,
        path: [cat.name, p.shortName],
        from: nameOfCat(found.categoryId),
        to: cat.name,
        categoryId: cat.id,
        dirName: targetDir,
        fileName,
      });
    }
    if (!nameOk) {
      entries.push({
        kind: 'paper',
        action: 'rename',
        id: p.id,
        path: [cat.name, p.shortName],
        from: found.file.fileName,
        to: fileName,
        categoryId: cat.id,
        dirName: targetDir,
        fileName,
      });
    }
    const folderDiffers = !!found.parsed && !samePaperContent(found.parsed, p);
    if (pending.papers.has(p.id) || folderDiffers) {
      entries.push({
        kind: 'paper',
        action: 'update',
        id: p.id,
        path: [cat.name, p.shortName],
        note: folderDiffers ? `ফোল্ডারের ফাইলে অন্য লেখা ছিল (${changedPaperFields(found.parsed!, p).join(', ') || 'পার্থক্য'}) - অ্যাপেরটাই থাকবে` : undefined,
        categoryId: cat.id,
        dirName: targetDir,
        fileName,
        paper: normalizePaper(p),
      });
    }
  }

  /* ---------- মোছা / বাড়তি ---------- */
  for (const [id, f] of Array.from(byId.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    if (appPaperById.has(id)) continue;
    const inDeletedCat = orphanNodes.has(f.categoryId);
    if (state.papers[id] || pending.deletes.has(id)) {
      if (!inDeletedCat) {
        entries.push({
          kind: 'paper',
          action: 'delete',
          id,
          path: [nameOfCat(f.categoryId), f.parsed?.shortName ?? paperFileBase(f.file.fileName)],
          from: f.file.fileName,
          destructive: true,
          note: 'অ্যাপে মোছা হয়েছে',
        });
      }
    } else {
      // অ্যাপ কখনো এটা চেনেনি: বাড়তি ফাইল (মোছা হয় না)
      extras.push(extra('extra-file', f.node.dirName, f.file.fileName, `ফোল্ডারে আছে, অ্যাপে নেই: ${f.node.dirName} › ${f.file.fileName}`));
    }
  }

  for (const [id, node] of Array.from(orphanNodes.entries()).sort((a, b) => a[1].dirName.localeCompare(b[1].dirName))) {
    const stillInside = node.files.filter((f) => {
      const pid = f.parsed?.id ?? paperIdForFile(state, id, f.fileName);
      return !!pid && !!appPaperById.get(pid) && byId.get(pid)?.node === node;
    }).length;
    entries.push({
      kind: 'category',
      action: 'delete',
      id,
      path: [node.dirName],
      from: node.dirName,
      destructive: true,
      papers: stillInside,
      note: 'অ্যাপে মোছা হয়েছে',
    });
  }

  // মূল ক্রম: ক্যাটেগরি আগে (নতুন, নাম বদল), তারপর প্রশ্নপত্র, শেষে ক্যাটেগরি মোছা
  const rank = (e: CategoryEntry) => (e.kind === 'category' ? (e.action === 'delete' ? 2 : 0) : 1);
  const out = entries.map((e, i) => ({ e, i })).sort((a, b) => rank(a.e) - rank(b.e) || a.i - b.i).map((x) => x.e);
  return { entries: out, extras, warnings, dirNames };
}

/** অ্যাপ চেনে না এমন পুরো ক্যাটেগরি ফোল্ডার -> Category/unnecessary/-তে */
function copiedAsOwnExtra(n: CategoryFolderNode): CategoryExtra {
  return extra('extra-folder', '', n.dirName, `ফোল্ডারে আছে, অ্যাপে নেই: ${n.dirName}`);
}

/* ------------------------------------------------------------------
 * Summary helpers
 * ---------------------------------------------------------------- */

export function summarizeCategory(r: CategoryCompareResult): CategoryTotals {
  const count = (kind: CategoryEntry['kind'], action: CategoryAction) => r.entries.filter((e) => e.kind === kind && e.action === action).length;
  return {
    categoriesAdded: count('category', 'add'),
    categoriesRenamed: count('category', 'rename'),
    categoriesDeleted: count('category', 'delete'),
    papersAdded: count('paper', 'add'),
    papersUpdated: count('paper', 'update'),
    papersMoved: count('paper', 'move'),
    papersRenamed: count('paper', 'rename'),
    papersDeleted: count('paper', 'delete'),
    extras: r.extras.length,
    warnings: r.warnings.length,
  };
}

/** কিছু বদলাবে কি (শুধু info বা সতর্কতা বদল নয়) */
export function hasAnyCategoryChange(r: CategoryCompareResult): boolean {
  return r.entries.some((e) => e.action !== 'info');
}

/** Category/ ফোল্ডারের পূর্ণ পথ দেখানোর জন্য (প্রিভিউ উইন্ডোর শিরোনাম) */
export const CATEGORY_SCOPE_LABEL = 'Category';
export { CATEGORY_ROOT };
