import type { Category, Paper } from '../db/db';
import type { ScanEntry } from '../utils/storageAccess';
import { FOLDER_META, MEDIA_DIR, baseOfDirName, isReservedDirName, isSystemFileName, sanitizeFolderName, uniqueAppName, imageIdFromFileName, imageFileName } from './folderLayout';
import { CONFLICT_SUBDIR, newId } from './syncCompare';
import {
  CATEGORY_DATA_FILE,
  CATEGORY_ROOT,
  categoryDirNameFor,
  categoryUnnecessaryPath,
  isUncategorizedName,
  parseCategoryMeta,
  samePaperContent,
  normalizePaper,
  type CategoryFolderMeta,
  type CategorySyncState,
  type CopiedQuestion,
  type CopiedStimulus,
  type ParsedCategoryData,
  type ParseCategoryDataResult,
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
 *  - চেনা হয় id দিয়ে (ক্যাটেগরি ফোল্ডারের .folder.json, data.json-এর ভেতর প্রশ্নপত্রের id), নাম দিয়ে নয়।
 *  - একটা ক্যাটেগরির সব প্রশ্নপত্র একটাই data.json-এ; তাই প্রশ্নপত্র "ফাইল" মানে data.json-এর ভেতরের একটা সারি (paperId)।
 *  - ফোল্ডার -> অ্যাপ: ফোল্ডারে যা বদলেছে তা অ্যাপে আসে; অ্যাপে যে বদল এখনো ফোল্ডারে লেখা হয়নি (pending) তা ছোঁয়া হয় না।
 *  - অ্যাপ -> ফোল্ডার: অ্যাপের কপিই জেতে।
 *  - অচেনা জিনিস কখনো মোছা হয় না; নিজের ফোল্ডারের unnecessary/-তে সরে যায় (extras)।
 *  - ভাঙা data.json: সতর্কতা, কিছু মোছা/বদলানো হয় না।
 *  - Category ফোল্ডারই না থাকলে ফোল্ডার -> অ্যাপে কিছু মোছা হয় না।
 */

/* ------------------------------------------------------------------
 * Types
 * ---------------------------------------------------------------- */

/**
 * data.json-এর ভেতরের একটি প্রশ্নপত্র (ফোল্ডার দেখার একক)। fileName সবসময় data.json।
 * parsed: data.json পড়া হলে প্রশ্নপত্রের লেখা; undefined = পড়া হয়নি (শেষবারের মতোই আছে ধরা হয়)।
 */
export interface PaperFileNode {
  fileName: string;
  mtime: number;
  size: number;
  /** প্রশ্নপত্রের id */
  paperId: string;
  parsed?: ParsedPaper;
}

export interface DataFileNode {
  mtime: number;
  size: number;
}

export interface CategoryCopies {
  questions: CopiedQuestion[];
  stimuli: CopiedStimulus[];
  imageIds: string[];
}

export interface CategoryFolderNode {
  dirName: string;
  meta: CategoryFolderMeta | null;
  /** data.json আছে কি (mtime/size সহ); null = নেই */
  data: DataFileNode | null;
  /** data.json পড়া/বোঝা না গেলে কারণ (তখন কিছু মোছা/বদলানো হয় না) */
  dataError?: string;
  /** data.json পড়া গেলেও কিছু অংশে আপত্তি (বাদ পড়া প্রশ্নপত্র, গণনা না মেলা ...) */
  dataWarnings?: string[];
  /** data.json পড়া গেছে কিন্তু সন্দেহজনক (বাদ পড়া অংশ, গণনা না মেলা, .folder.json-এর id না মেলা ...): কিছু মোছা হবে না */
  dataUnsafe?: boolean;
  /** বৈধ id আছে কিন্তু বাদ পড়া প্রশ্নপত্রের id (\"ফাইলে নেই\" ধরে মোছা হয় না) */
  skippedPaperIds?: string[];
  /** data.json-এর প্রশ্নপত্রগুলো; expandCategoryNode বসায় */
  files: PaperFileNode[];
  /** data.json-এ থাকা প্রশ্ন/উদ্দীপক/ছবির কপি (পড়া হলে) */
  copies?: CategoryCopies;
  /** media/ ফোল্ডারের ছবির ফাইলের নাম */
  mediaFiles: string[];
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
  /** প্রশ্নব্যাংকে থাকা প্রশ্নের id (দিলে "ব্যাংকে নেই" প্রশ্ন ধরা পড়ে) */
  knownQuestionIds?: Set<string>;
  /** অ্যাপ -> ফোল্ডার: ক্যাটেগরির id -> media/-তে যে ছবির ফাইল থাকা উচিত (দিলে বাড়তি ছবি unnecessary/-তে সরার তালিকায় আসে) */
  wantedImages?: Record<string, Set<string>>;
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
  categoryId?: string;
  paper?: ParsedPaper;
  /** ফোল্ডার -> অ্যাপ: প্রশ্নপত্রের যে প্রশ্নগুলো ব্যাংকে নেই কিন্তু data.json-এ কপি আছে ("ব্যাংকে নেই" চিহ্ন পাবে) */
  bankMissingIds?: string[];
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
  /**
   * ফোল্ডার -> অ্যাপ: যে ক্যাটেগরির data.json পড়া যায়নি (invalid) বা সন্দেহজনক (unsafe) হওয়ায় কিছু মোছা হচ্ছে না।
   * প্রিভিউ উইন্ডো এ থেকে \"কয়টি প্রশ্নপত্র বাদ/সুরক্ষিত, কেন\" দেখাবে।
   */
  protectedCategories?: Array<{ id: string; name: string; reason: 'invalid' | 'unsafe'; skippedPapers: number; heldPapers: number; why: string[] }>;
}

export interface CategoryTotals {
  categoriesAdded: number;
  categoriesRenamed: number;
  categoriesDeleted: number;
  papersAdded: number;
  papersUpdated: number;
  papersMoved: number;
  papersDeleted: number;
  extras: number;
  warnings: number;
}

/* ------------------------------------------------------------------
 * Reading the folder listing into nodes
 * ---------------------------------------------------------------- */

/**
 * scanTree(Category/)-এর তালিকা -> ক্যাটেগরি ফোল্ডারের নোড। data.json-এর লেখা এখানে পড়া হয় না
 * (দেখুন needsDataRead / expandCategoryNode)। বাদ যায়: unnecessary/, সিস্টেম ফাইল (.folder.json ছাড়া).
 * ক্যাটেগরি ফোল্ডারের ভেতরে চেনা জিনিস: .folder.json, data.json, media/ (ও তার ভেতরের ছবি)।
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
      if (e.d) dirs.set(name, { dirName: name, meta: null, data: null, files: [], mediaFiles: [], extraItems: [] });
      else rootExtras.push({ name, dir: false });
    }
  }

  for (const e of entries) {
    const parts = e.p.split('/').filter(Boolean);
    const node = dirs.get(parts[0]);
    if (!node) continue;
    if (parts.length === 2) {
      const name = parts[1];
      if (!e.d && name === FOLDER_META) {
        node.meta = parseCategoryMeta(e.t);
      } else if (!e.d && name === CATEGORY_DATA_FILE) {
        node.data = { mtime: e.m, size: e.s };
      } else if (isSystemFileName(name)) {
        // .nomedia, .tmp, .bak ... কখনো বাড়তি নয়
      } else if (e.d && isReservedDirName(name)) {
        // আগে সরানো অপ্রয়োজনীয় জিনিস
      } else if (e.d && name === MEDIA_DIR) {
        // ছবির ফোল্ডার (ভেতরের ফাইল নিচে)
      } else {
        node.extraItems.push({ name, dir: e.d });
      }
    } else if (parts.length === 3 && parts[1] === MEDIA_DIR && !e.d) {
      if (!isSystemFileName(parts[2])) node.mediaFiles.push(parts[2]);
    }
  }

  const nodes = Array.from(dirs.values()).sort((a, b) => a.dirName.localeCompare(b.dirName));
  for (const n of nodes) {
    n.mediaFiles.sort((a, b) => a.localeCompare(b));
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

/** data.json-এর লেখা পড়তে হবে কি: শেষবার এখানে লেখা/পড়া হয়নি, বা mtime/size বদলেছে (ফাইল না থাকলে পড়ার কিছু নেই) */
export function needsDataRead(node: CategoryFolderNode, state: CategorySyncState): boolean {
  if (!node.data) return false;
  const id = categoryIdForNode(node, state);
  const row = id ? state.categories[id] : undefined;
  if (!row || row.dataMtime === undefined || row.dataSize === undefined) return true;
  return row.dataMtime !== node.data.mtime || row.dataSize !== node.data.size;
}

/**
 * নোডের "প্রশ্নপত্রের তালিকা" (files/copies/dataError) বসায়। IO স্তর data.json পড়ার পর (বা না পড়ে) এটা ডাকে।
 *  - read দেওয়া হলে ও ok: data.json-এর প্রশ্নপত্রগুলো (parsed সহ)।
 *  - read দেওয়া হলে ও ভুল: dataError (কিছু মোছা হবে না)।
 *  - read না দিলে: শেষবারের মতোই আছে ধরে স্মৃতির সারি থেকে (parsed ছাড়া)।
 *  - data.json নেই: খালি তালিকা (স্মৃতিতে প্রশ্নপত্র থাকলে সেগুলো মোছা ধরা পড়বে)।
 */
export function expandCategoryNode(node: CategoryFolderNode, state: CategorySyncState, read?: ParseCategoryDataResult): CategoryFolderNode {
  const mtime = node.data?.mtime ?? 0;
  const size = node.data?.size ?? 0;
  node.files = [];
  node.copies = undefined;
  node.dataError = undefined;
  node.dataWarnings = undefined;
  node.dataUnsafe = undefined;
  node.skippedPaperIds = undefined;
  if (!node.data) return node;
  if (read) {
    if (!read.ok) {
      node.dataError = read.reason;
      return node;
    }
    node.files = read.data.papers.map((p) => ({ fileName: CATEGORY_DATA_FILE, mtime, size, paperId: p.id, parsed: p }));
    node.copies = { questions: read.data.questions, stimuli: read.data.stimuli, imageIds: read.data.imageIds };
    const warnings = [...read.data.warnings];
    let unsafe = read.data.unsafe;
    // পরিচয়ে .folder.json-এর id-ই শেষ কথা; data.json-এর category.id না মিললে মোছা বন্ধ, নাম/ক্রম না মিললে শুধু সতর্কতা
    if (node.meta) {
      if (read.data.category.id !== node.meta.id) {
        warnings.push(`data.json-এর category.id (${read.data.category.id}) আর .folder.json-এর id (${node.meta.id}) মেলেনি - ফোল্ডারটা কপি/সরানো হতে পারে`);
        unsafe = true;
      } else {
        if (read.data.category.name !== node.meta.name) warnings.push(`data.json-এ ক্যাটেগরির নাম \"${read.data.category.name}\", .folder.json-এ \"${node.meta.name}\" - .folder.json-এরটা ধরা হবে`);
        if (read.data.category.order !== node.meta.order) warnings.push(`data.json-এ ক্যাটেগরির ক্রম ${read.data.category.order}, .folder.json-এ ${node.meta.order} - .folder.json-এরটা ধরা হবে`);
      }
    }
    if (warnings.length) node.dataWarnings = warnings;
    if (unsafe) node.dataUnsafe = true;
    if (read.data.skippedPaperIds.length) node.skippedPaperIds = read.data.skippedPaperIds;
    return node;
  }
  const catId = categoryIdForNode(node, state);
  if (catId) {
    node.files = Object.entries(state.papers)
      .filter(([, r]) => r.categoryId === catId)
      .map(([id]) => id)
      .sort()
      .map((paperId) => ({ fileName: CATEGORY_DATA_FILE, mtime, size, paperId }));
  }
  return node;
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
 * ক্যাটেগরি ফোল্ডারগুলোর data.json-এর প্রশ্নপত্রগুলো id অনুযায়ী সাজায়।
 * একই id দুই ক্যাটেগরির data.json-এ থাকলে (ফোল্ডার/ফাইল কপি) আসলটা (শেষবার যে ক্যাটেগরিতে লেখা ছিল) থাকে,
 * বাকিগুলো সতর্কতা হয়ে বাদ যায়। ভাঙা data.json-এর ক্যাটেগরির স্মৃতির প্রশ্নপত্রগুলো "দেখা হয়েছে" ধরা হয় (কিছু মোছা হয় না)।
 */
function collectFiles(
  keepers: Map<string, CategoryFolderNode>,
  state: CategorySyncState,
  warnings: string[],
  catName: (id: string) => string
): { byId: Map<string, FoundFile>; seenIds: Set<string> } {
  const seenIds = new Set<string>();
  const all: FoundFile[] = [];
  const ordered = Array.from(keepers.entries()).sort((a, b) => a[1].dirName.localeCompare(b[1].dirName));
  for (const [catId, node] of ordered) {
    if (node.dataError) {
      warnings.push(`ক্যাটেগরির data.json পড়া যায়নি: ${catName(catId)} (${node.dataError}) - কিছু বদলানো হয়নি`);
      for (const [pid, r] of Object.entries(state.papers)) if (r.categoryId === catId) seenIds.add(pid);
      continue;
    }
    for (const w of node.dataWarnings ?? []) warnings.push(`${catName(catId)}: ${w}`);
    if (node.dataUnsafe) {
      // বাদ পড়া/সন্দেহজনক অংশ থাকলে এই ক্যাটেগরির কোনো প্রশ্নপত্রই \"ফাইলে নেই\" ধরা যাবে না (id ছাড়া entry-র ক্ষেত্রেও নিরাপদ)
      let held = 0;
      for (const [pid, r] of Object.entries(state.papers)) {
        if (r.categoryId === catId) {
          seenIds.add(pid);
          held++;
        }
      }
      for (const pid of node.skippedPaperIds ?? []) seenIds.add(pid);
      warnings.push(
        `ক্যাটেগরির data.json-এ সমস্যা আছে: ${catName(catId)} - বাদ পড়া প্রশ্নপত্র ${node.skippedPaperIds?.length ?? 0}টি (id সহ); এই ক্যাটেগরির কিছুই মোছা হবে না (${held}টি প্রশ্নপত্র সুরক্ষিত)`
      );
    }
    if (node.copies) {
      const have = new Set(node.mediaFiles);
      const missing = node.copies.imageIds.filter((id) => !have.has(imageFileName(id)));
      if (missing.length) {
        warnings.push(`${catName(catId)}: media/-তে ${missing.length}টি ছবির ফাইল নেই (${missing.slice(0, 3).map(imageFileName).join(', ')}${missing.length > 3 ? ' ...' : ''})`);
      }
    }
    for (const file of node.files) {
      all.push({ id: file.paperId, categoryId: catId, node, file, parsed: file.parsed, isRowFile: state.papers[file.paperId]?.categoryId === catId });
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
      warnings.push(`একই প্রশ্নপত্র দুই ক্যাটেগরিতে: ${catName(f.categoryId)} › ${f.parsed?.shortName ?? id} (${catName(keeper.categoryId)}-এরটাই ধরা হয়েছে)`);
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

/**
 * প্রশ্নপত্রের যেসব প্রশ্ন প্রশ্নব্যাংকে (known) নেই:
 *  - withCopy: ক্যাটেগরির data.json-এ কপি আছে -> প্রশ্নপত্রে কপি থেকে থাকবে, "ব্যাংকে নেই" চিহ্ন পাবে
 *  - lost: কপিও নেই -> সতর্কতা (প্রশ্নপত্রে id থেকে যাবে, দেখানোর মতো কিছু নেই)
 */
function bankMissing(paper: ParsedPaper, node: CategoryFolderNode, known?: Set<string>): { withCopy: string[]; lost: string[] } {
  if (!known) return { withCopy: [], lost: [] };
  const have = new Set((node.copies?.questions ?? []).map((c) => c.question.id));
  const withCopy: string[] = [];
  const lost: string[] = [];
  for (const q of paper.questionIds) {
    if (known.has(q)) continue;
    (have.has(q) ? withCopy : lost).push(q);
  }
  return { withCopy, lost };
}

const lostWarning = (paper: ParsedPaper, catName: string, lost: string[]): string | null =>
  lost.length > 0 ? `${catName} › ${paper.shortName}: ${lost.length}টি প্রশ্ন প্রশ্নব্যাংকেও নেই, ক্যাটেগরির data.json-এও কপি নেই (প্রশ্নপত্রে যেমন আছে তেমনই থাকবে)` : null;

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
  const { byId, seenIds } = collectFiles(keeperNodes, state, warnings, catLabel);
  const paperEntries: CategoryEntry[] = [];

  for (const [id, f] of Array.from(byId.entries()).sort((a, b) => a[1].node.dirName.localeCompare(b[1].node.dirName) || a[0].localeCompare(b[0]))) {
    if (pending.deletes.has(id) || pending.papers.has(id)) continue;
    if (!validCat.has(f.categoryId)) continue;
    const appP = appPaperById.get(id);
    if (!appP) {
      if (!f.parsed) continue; // শেষবারের মতোই আছে অথচ অ্যাপে নেই: অ্যাপ -> ফোল্ডার সিঙ্ক সারিটা সরাবে
      const bm = bankMissing(f.parsed, f.node, input.knownQuestionIds);
      paperEntries.push({
        kind: 'paper',
        action: 'add',
        id,
        path: [catLabel(f.categoryId), f.parsed.shortName],
        to: f.parsed.shortName,
        categoryId: f.categoryId,
        dirName: dirNames[f.categoryId],
        paper: f.parsed,
        bankMissingIds: bm.withCopy.length ? bm.withCopy : undefined,
      });
      const w = lostWarning(f.parsed, catLabel(f.categoryId), bm.lost);
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
      });
    }
    if (f.parsed && !samePaperContent(f.parsed, appP)) {
      const fields = changedPaperFields(f.parsed, appP);
      const bm = bankMissing(f.parsed, f.node, input.knownQuestionIds);
      paperEntries.push({
        kind: 'paper',
        action: 'update',
        id,
        path: [catLabel(f.categoryId), shown],
        note: fields.length ? `বদলেছে: ${fields.join(', ')}` : undefined,
        categoryId: f.categoryId,
        dirName: dirNames[f.categoryId],
        paper: f.parsed,
        bankMissingIds: bm.withCopy.length ? bm.withCopy : undefined,
      });
      const w = lostWarning(f.parsed, catLabel(f.categoryId), bm.lost);
      if (w) warnings.push(w);
    }
  }

  /* ---------- মোছা ---------- */
  let deletedPapers = 0;
  let deletedCats = 0;

  // data.json-এ নেই -> প্রশ্নপত্র মোছা (ক্যাটেগরি ফোল্ডার আছে, তাই এটা শুধু প্রশ্নপত্র মোছা)
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
        note: 'ফোল্ডারের data.json-এ প্রশ্নপত্রটা নেই',
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
  const protectedCategories: NonNullable<CategoryCompareResult['protectedCategories']> = [];
  for (const [catId, n] of Array.from(keeperNodes.entries()).sort((a, b) => a[1].dirName.localeCompare(b[1].dirName))) {
    if (!n.dataError && !n.dataUnsafe) continue;
    protectedCategories.push({
      id: catId,
      name: catLabel(catId),
      reason: n.dataError ? 'invalid' : 'unsafe',
      skippedPapers: n.skippedPaperIds?.length ?? 0,
      heldPapers: Object.values(state.papers).filter((r) => r.categoryId === catId).length,
      why: n.dataError ? [n.dataError] : n.dataWarnings ?? [],
    });
  }
  return { entries: out, extras, warnings, dirNames, massDelete, protectedCategories: protectedCategories.length ? protectedCategories : undefined };
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
  const { byId } = collectFiles(allKeepers, state, warnings, nameOfCat);

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

    if (!found) {
      entries.push({
        kind: 'paper',
        action: 'add',
        id: p.id,
        path: [cat.name, p.shortName],
        to: p.shortName,
        categoryId: cat.id,
        dirName: targetDir,
        paper: normalizePaper(p),
      });
      continue;
    }

    if (found.categoryId !== cat.id) {
      entries.push({
        kind: 'paper',
        action: 'move',
        id: p.id,
        path: [cat.name, p.shortName],
        from: nameOfCat(found.categoryId),
        to: cat.name,
        categoryId: cat.id,
        dirName: targetDir,
      });
    }
    const folderDiffers = !!found.parsed && !samePaperContent(found.parsed, p);
    if (pending.papers.has(p.id) || folderDiffers) {
      entries.push({
        kind: 'paper',
        action: 'update',
        id: p.id,
        path: [cat.name, p.shortName],
        note: folderDiffers ? `ফোল্ডারের data.json-এ অন্য লেখা ছিল (${changedPaperFields(found.parsed!, p).join(', ') || 'পার্থক্য'}) - অ্যাপেরটাই থাকবে` : undefined,
        categoryId: cat.id,
        dirName: targetDir,
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
          path: [nameOfCat(f.categoryId), f.parsed?.shortName ?? id],
          from: f.parsed?.shortName ?? id,
          destructive: true,
          note: 'অ্যাপে মোছা হয়েছে',
        });
      }
    } else {
      // অ্যাপ কখনো এটা চেনেনি (হাতে data.json-এ বসানো): মোছা হয় না, অ্যাপ -> ফোল্ডার সিঙ্কে data.json নতুন করে লেখার সময়
      // হারাবে - তাই আগে জানিয়ে রাখা হয় (ফোল্ডার -> অ্যাপ সিঙ্কে এটা অ্যাপে আসে)
      warnings.push(`ফোল্ডারের data.json-এ আছে, অ্যাপে নেই: ${f.node.dirName} › ${f.parsed?.shortName ?? id} (ফোল্ডার -> অ্যাপ সিঙ্ক না করলে অ্যাপ থেকে ফোল্ডারে লেখার সময় বাদ পড়বে)`);
    }
  }

  for (const [id, node] of Array.from(orphanNodes.entries()).sort((a, b) => a[1].dirName.localeCompare(b[1].dirName))) {
    const stillInside = node.files.filter((f) => !!appPaperById.get(f.paperId) && byId.get(f.paperId)?.node === node).length;
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

  // media/-তে যে ছবি কোনো প্রশ্ন ব্যবহার করে না -> মোছা হয় না, unnecessary/media/-তে সরে
  if (input.wantedImages) {
    for (const cat of cats) {
      const node = resolved.keepers.get(cat.id);
      const wanted = input.wantedImages[cat.id];
      if (!node || !wanted) continue;
      for (const f of node.mediaFiles) {
        const imgId = imageIdFromFileName(f);
        if (imgId && wanted.has(imgId)) continue;
        extras.push(extra('extra-file', node.dirName, `${MEDIA_DIR}/${f}`, `কোনো প্রশ্ন ব্যবহার করে না এমন ছবি: ${node.dirName} › ${MEDIA_DIR} › ${f}`));
      }
    }
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
