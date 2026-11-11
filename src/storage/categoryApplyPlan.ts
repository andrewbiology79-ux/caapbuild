import type { Category, Paper } from '../db/db';
import { toBn, toEn } from '../utils/toBn';
import {
  type CategoryCompareResult,
  type CategoryEntry,
  type CategoryFolderNode,
  type CategoryPending,
} from './categoryCompare';
import { isUncategorizedName, paperContentKey, type CategorySyncState } from './categoryLayout';

/**
 * অংশ ১গ-১ - "ফোল্ডার থেকে ক্যাটাগরি সিঙ্ক" এর খাঁটি অংশ (কোনো ফাইল/ডেটাবেস IO নেই)।
 *
 * compareFolderToApp-এর ফল (entries) থেকে ঠিক করে: অ্যাপের ডেটাবেসে কোন কোন লেখা/বদল/মোছা হবে (ops) এবং
 * সিঙ্কের স্মৃতি (db.meta-র CategorySyncState) তারপর কেমন হবে। আসল লেখা categoryScanner.ts করে।
 *
 * মূল নিয়ম:
 *  - প্রিভিউয়ে যা দেখানো হয়েছে (entries) শুধু তা-ই চলে; নিজে থেকে কিছু মোছা হয় না।
 *  - ক্যাটেগরির data.json পড়া না গেলে (invalid) বা সন্দেহজনক (unsafe) হলে ওই ক্যাটেগরির mtime/size স্মৃতিতে বসে না -
 *    ফলে পরের সিঙ্কেও ফাইল আবার পড়া হয় ও সতর্কতা আবার আসে।
 *  - অ্যাপে জমে থাকা (pending) বদলের ক্যাটেগরিতেও mtime/size বসে না (অ্যাপের কপি জেতে; লেখক নিজেরটা বসাবে)।
 *  - ফোল্ডারের নামের সাথে অ্যাপের নাম না মিললে (\"নাম (2)\") বা প্রশ্নপত্র অশ্রেণিবদ্ধে গেলে সেই ক্যাটেগরির ফোল্ডার
 *    নতুন করে লেখা দরকার - needsWrite-এ আসে (hook ডাকে না, কারণ এটা ফোল্ডার -> অ্যাপের লেখা)।
 */

export type CategoryOp =
  | { op: 'cat-add'; category: Category }
  | { op: 'cat-update'; id: string; changes: Partial<Category> }
  | { op: 'cat-delete'; id: string }
  | { op: 'paper-put'; paper: Paper }
  | { op: 'paper-patch'; id: string; changes: Partial<Paper> }
  | { op: 'paper-delete'; id: string };

export interface CategoryApplyCounts {
  categoriesAdded: number;
  categoriesRenamed: number;
  categoriesDeleted: number;
  papersAdded: number;
  papersUpdated: number;
  papersMoved: number;
  papersDeleted: number;
}

export interface BankMissingPaper {
  paperId: string;
  categoryId: string;
  questionIds: string[];
}

export interface CategoryApplyPlan {
  ops: CategoryOp[];
  /** সিঙ্কের পরে স্মৃতি (ইনপুটের কপি; ইনপুট বদলায় না) */
  state: CategorySyncState;
  counts: CategoryApplyCounts;
  /** যে ক্যাটেগরির ফোল্ডার অ্যাপ থেকে নতুন করে লেখা দরকার (নাম অমিল, অশ্রেণিবদ্ধে সরানো প্রশ্নপত্র) */
  needsWrite: string[];
  /** প্রশ্নপত্রের যে প্রশ্ন ব্যাংকে নেই কিন্তু data.json-এ কপি আছে (অংশ ১ঘ-তে চিহ্ন হবে) */
  bankMissing: BankMissingPaper[];
}

export interface CategoryApplyInput {
  result: CategoryCompareResult;
  /** compare-এর সময়ের ফোল্ডার নোড (expandCategoryNode-এর পরের) */
  folderNodes: CategoryFolderNode[];
  state: CategorySyncState;
  appCategories: Category[];
  appPapers: Paper[];
  pending?: CategoryPending;
  now?: number;
}

/* ------------------------------------------------------------------
 * Signature - প্রিভিউ আর আসল কাজ একই কি না মেলানোর জন্য
 * ---------------------------------------------------------------- */

/** প্রিভিউয়ের entries-এর একটা ছোট ছাপ। আসল কাজের আগে আবার compare করে ছাপ না মিললে কাজ থামে (খণ্ড গ §৫) */
export function previewSignature(result: Pick<CategoryCompareResult, 'entries' | 'massDelete'>): string {
  const rows = result.entries
    .filter((e) => e.action !== 'info')
    .map((e) => [e.kind, e.action, e.id, e.name ?? '', e.from ?? '', e.to ?? '', e.categoryId ?? '', e.moveToCategoryId ?? '', (e.paperIds ?? []).join(','), e.paper ? paperContentKey(e.paper) : '']);
  return JSON.stringify({ rows, mass: result.massDelete ? [result.massDelete.count, result.massDelete.total] : null });
}

/**
 * .folder.json ছাড়া নতুন ক্যাটেগরি ফোল্ডারের id: প্রিভিউ ও আসল কাজে একই হতে হয় (নইলে ছাপ মেলে না),
 * তাই এলোমেলো না করে stamp + ক্রমিক সংখ্যা। stamp প্রিভিউ থেকে আসল কাজে যায়।
 */
export function stampIdMaker(stamp: string): () => string {
  let n = 0;
  return () => `cat_${stamp}_${++n}`;
}

/* ------------------------------------------------------------------
 * Paper tag = "<category>-<number>"  (api.ts-এর paperLabelNumber-এর হুবহু নিয়ম)
 * ---------------------------------------------------------------- */

export function paperLabelNumber(shortName: string | undefined, categoryName: string): number | null {
  const prefix = `${categoryName.trim()}-`;
  const name = (shortName || '').trim();
  if (!name.startsWith(prefix)) return null;
  const rest = toEn(name.slice(prefix.length)).trim();
  return /^\d+$/.test(rest) ? parseInt(rest, 10) : null;
}

/* ------------------------------------------------------------------
 * Plan
 * ---------------------------------------------------------------- */

const emptyCounts = (): CategoryApplyCounts => ({
  categoriesAdded: 0,
  categoriesRenamed: 0,
  categoriesDeleted: 0,
  papersAdded: 0,
  papersUpdated: 0,
  papersMoved: 0,
  papersDeleted: 0,
});

const cloneState = (s: CategorySyncState): CategorySyncState => ({
  version: 1,
  categories: Object.fromEntries(Object.entries(s.categories).map(([id, r]) => [id, { ...r }])),
  papers: Object.fromEntries(Object.entries(s.papers).map(([id, r]) => [id, { ...r }])),
});

export function planCategoryApply(input: CategoryApplyInput): CategoryApplyPlan {
  const { result, folderNodes } = input;
  const state = cloneState(input.state);
  const now = input.now ?? Date.now();
  const ops: CategoryOp[] = [];
  const counts = emptyCounts();
  const needsWrite = new Set<string>();
  const bankMissing: BankMissingPaper[] = [];

  const catName = new Map(input.appCategories.map((c) => [c.id, c.name]));
  const papersByCat = new Map<string, Paper[]>();
  for (const p of input.appPapers) {
    if (!p.categoryId) continue;
    (papersByCat.get(p.categoryId) ?? papersByCat.set(p.categoryId, []).get(p.categoryId)!).push(p);
  }
  const appPaperIds = new Set(input.appPapers.map((p) => p.id));
  const uncategorized = input.appCategories.find((c) => isUncategorizedName(c.name));

  const nameOf = (id: string | undefined): string => (id ? catName.get(id) ?? '' : '');
  const deletedPapers = new Set<string>();
  const nodeByDir = new Map(folderNodes.map((n) => [n.dirName, n]));

  for (const e of result.entries) {
    if (e.action === 'info') continue;
    if (e.kind === 'category') applyCategoryEntry(e);
    else applyPaperEntry(e);
  }

  function applyCategoryEntry(e: CategoryEntry): void {
    if (e.action === 'add') {
      const name = e.name ?? e.to ?? '';
      if (!name) return;
      ops.push({ op: 'cat-add', category: { id: e.id, name, order: e.order ?? 0, createdAt: now } });
      catName.set(e.id, name);
      state.categories[e.id] = { dirName: e.dirName ?? result.dirNames[e.id] ?? name };
      counts.categoriesAdded++;
      // ফোল্ডারের নাম আর অ্যাপের নাম আলাদা হলে (\"নাম (2)\") বা .folder.json না থাকলে লেখক পরে ঠিক করবে
      if ((e.dirName && e.dirName !== name) || !(e.dirName && nodeByDir.get(e.dirName)?.meta)) needsWrite.add(e.id);
    } else if (e.action === 'rename') {
      const name = e.name ?? e.to ?? '';
      const old = e.from ?? nameOf(e.id);
      if (!name) return;
      ops.push({ op: 'cat-update', id: e.id, changes: { name } });
      catName.set(e.id, name);
      for (const p of papersByCat.get(e.id) ?? []) {
        const changes: Partial<Paper> = { category: name };
        const n = paperLabelNumber(p.shortName, old);
        if (n !== null) changes.shortName = `${name}-${toBn(n)}`;
        ops.push({ op: 'paper-patch', id: p.id, changes });
      }
      if (e.dirName) state.categories[e.id] = { ...(state.categories[e.id] ?? { dirName: e.dirName }), dirName: e.dirName };
      counts.categoriesRenamed++;
      if (e.dirName && e.dirName !== name) needsWrite.add(e.id);
    } else if (e.action === 'delete') {
      const ids = e.paperIds ?? [];
      if (e.moveToCategoryId) {
        const target = e.moveToCategoryId;
        for (const pid of ids) {
          if (!appPaperIds.has(pid)) continue;
          ops.push({ op: 'paper-patch', id: pid, changes: { categoryId: target, category: nameOf(target) || uncategorized?.name || '' } });
          delete state.papers[pid]; // নতুন ক্যাটেগরির data.json-এ এখনো লেখা হয়নি
          counts.papersMoved++;
        }
        needsWrite.add(target);
      } else {
        for (const pid of ids) {
          if (!appPaperIds.has(pid)) continue;
          ops.push({ op: 'paper-delete', id: pid });
          deletedPapers.add(pid);
          delete state.papers[pid];
          counts.papersDeleted++;
        }
      }
      ops.push({ op: 'cat-delete', id: e.id });
      delete state.categories[e.id];
      for (const [pid, r] of Object.entries(state.papers)) if (r.categoryId === e.id) delete state.papers[pid];
      counts.categoriesDeleted++;
    }
  }

  function applyPaperEntry(e: CategoryEntry): void {
    const catId = e.categoryId ?? '';
    if (e.action === 'add') {
      if (!e.paper || !catId) return;
      ops.push({ op: 'paper-put', paper: { ...e.paper, category: nameOf(catId), categoryId: catId } });
      state.papers[e.id] = { categoryId: catId };
      counts.papersAdded++;
    } else if (e.action === 'update') {
      if (!e.paper || !catId) return;
      ops.push({ op: 'paper-put', paper: { ...e.paper, category: nameOf(catId), categoryId: catId } });
      state.papers[e.id] = { categoryId: catId };
      counts.papersUpdated++;
    } else if (e.action === 'move') {
      if (!catId) return;
      ops.push({ op: 'paper-patch', id: e.id, changes: { categoryId: catId, category: nameOf(catId) } });
      state.papers[e.id] = { categoryId: catId };
      counts.papersMoved++;
    } else if (e.action === 'delete') {
      ops.push({ op: 'paper-delete', id: e.id });
      deletedPapers.add(e.id);
      delete state.papers[e.id];
      counts.papersDeleted++;
    }
    if (e.bankMissingIds?.length && catId && (e.action === 'add' || e.action === 'update')) {
      bankMissing.push({ paperId: e.id, categoryId: catId, questionIds: [...e.bankMissingIds] });
    }
  }

  /* ---------- স্মৃতি: ফোল্ডারের নাম, data.json-এর অবস্থা, প্রশ্নপত্র -> ক্যাটেগরি ---------- */
  const pending = input.pending;
  const pendingCats = new Set<string>(pending ? pending.categories : []);
  if (pending) {
    for (const pid of pending.papers) {
      const p = input.appPapers.find((x) => x.id === pid);
      if (p?.categoryId) pendingCats.add(p.categoryId);
    }
  }
  const putIds = new Set(ops.filter((o): o is Extract<CategoryOp, { op: 'paper-put' }> => o.op === 'paper-put').map((o) => o.paper.id));
  const pendingPapers = pending ? pending.papers : new Set<string>();

  for (const [catId, dirName] of Object.entries(result.dirNames)) {
    if (!catName.has(catId)) continue; // অ্যাপে (বা এই সিঙ্কে) নেই
    const node = nodeByDir.get(dirName);
    const row: CategorySyncState['categories'][string] = { dirName };
    if (node?.data && node.copies && !node.dataError && !node.dataUnsafe && !pendingCats.has(catId)) {
      // data.json এই সিঙ্কে পড়া হয়েছে ও পুরোপুরি ঠিক: পরের বার বদল না হলে আবার পড়তে হবে না
      row.dataMtime = node.data.mtime;
      row.dataSize = node.data.size;
      // data.json-এ থাকা প্রশ্নপত্র অ্যাপে আছে -> স্মৃতিতে এই ক্যাটেগরির বলে লেখা (পরে ফাইল থেকে বাদ গেলে মোছা ধরা পড়বে)
      for (const f of node.files) {
        if (!f.parsed) continue;
        if (deletedPapers.has(f.paperId)) continue;
        const inApp = appPaperIds.has(f.paperId) || putIds.has(f.paperId);
        if (inApp && !pendingPapers.has(f.paperId)) state.papers[f.paperId] = { categoryId: catId };
      }
    }
    // সন্দেহজনক (unsafe/invalid) বা জমে থাকা ক্যাটেগরিতে mtime/size বসে না - পরের বার ফাইল আবার পড়া হবে
    state.categories[catId] = row;
  }

  return { ops, state, counts, needsWrite: Array.from(needsWrite).filter((id) => catName.has(id)), bankMissing };
}

/** কিছু কি বদলাবে (শুধু স্মৃতি বদল নয়) */
export function planHasDbChanges(plan: CategoryApplyPlan): boolean {
  return plan.ops.length > 0;
}
