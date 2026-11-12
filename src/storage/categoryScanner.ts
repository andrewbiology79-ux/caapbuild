import { db, chapterDb, type Category, type Paper } from '../db/db';
import { scanTree, readText } from './nativeStore';
import { withSyncLock } from './syncLock';
import { ProgressTracker, type ProgressCallback } from './syncProgress';
import { makeStamp } from './syncCompare';
import { markSyncTx } from './writer';
import { peekCategoryPending, queueCategoryWrites } from './categoryAuto';
import { loadCategorySyncState, saveCategorySyncState } from './categoryWriter';
import { CATEGORY_ROOT, categoryDataPath, parseCategoryData, type CategorySyncState, type ParseCategoryDataResult } from './categoryLayout';
import {
  buildCategoryNodes,
  compareFolderToApp,
  expandCategoryNode,
  hasAnyCategoryChange,
  needsDataRead,
  summarizeCategory,
  type CategoryCompareResult,
  type CategoryDeleteMode,
  type CategoryFolderNode,
  type CategoryPending,
  type CategoryTotals,
} from './categoryCompare';
import { bankMissingCareNoLock } from './categoryBankMissing';
import { planCategoryApply, planHasDbChanges, previewSignature, stampIdMaker, type BankMissingPaper, type CategoryApplyCounts, type CategoryOp } from './categoryApplyPlan';

/**
 * অংশ ১গ-১ - "ফোল্ডার থেকে ক্যাটাগরি সিঙ্ক করুন"-এর IO অংশ (ফোল্ডার -> অ্যাপ, শুধু হাতে)।
 *
 *   previewCategoriesFromFolder()  - ফোল্ডার পড়ে হিসাব করে "কী বদলাবে" (কিছু লেখে/মোছে না)
 *   applyCategoriesFromFolder()    - প্রিভিউ নিশ্চিত হলে আসলে অ্যাপে প্রয়োগ
 *
 * নিরাপত্তা (খণ্ড গ §৫, §৬):
 *  - প্রয়োগের আগে ফোল্ডার ও অ্যাপ আবার পড়ে একই compare চালানো হয়; ফল প্রিভিউয়ের সাথে না মিললে (previewSignature) থামে।
 *  - অর্ধেকের বেশি মোছা (massDelete) আলাদা নিশ্চিতকরণ ছাড়া চলে না।
 *  - অ্যাপের ডেটাবেসে লেখা একটাই transaction-এ (markSyncTx - hook ফোল্ডারে ফেরত লেখে না); ফোল্ডারে কিছু লেখা/মোছা হয় না।
 *  - ভাঙা (invalid) বা সন্দেহজনক (unsafe) data.json-এর ক্যাটেগরিতে কোনো মোছা নেই (compareFolderToApp আগেই আটকায়)।
 */

const READ_PARALLEL = 4;

export interface CategoryPreview {
  stamp: string;
  createdAt: number;
  /** ফোল্ডারে ক্যাটেগরি নেই এমন হলে প্রশ্নপত্রের কী হবে (প্রিভিউতে ব্যবহারকারী বাছবে) */
  deleteMode: CategoryDeleteMode;
  result: CategoryCompareResult;
  totals: CategoryTotals;
  /** কিছুই বদলাবে না এবং বাড়তি জিনিসও নেই */
  empty: boolean;
  /** প্রিভিউ আর আসল কাজ একই কি না মেলানোর ছাপ */
  signature: string;
  /** Category/ ফোল্ডার ডিস্কে আছে কি */
  rootExists: boolean;
  /** অ্যাপের যে বদল এখনো ফোল্ডারে লেখা হয়নি (ক্যাটেগরি + প্রশ্নপত্র + মোছা) - প্রিভিউ উইন্ডোর সতর্কতায় */
  pendingCount: number;
}

export interface CategoryApplyResult {
  counts: CategoryApplyCounts;
  warnings: string[];
  /** প্রশ্নপত্রের যে প্রশ্ন ব্যাংকে নেই কিন্তু কপি আছে (অংশ ১ঘ-তে চিহ্ন পাবে) */
  bankMissing: BankMissingPaper[];
  /** অ্যাপ থেকে নতুন করে লেখার জন্য সারিতে দেওয়া ক্যাটেগরি */
  queuedWrites: string[];
  /** অ্যাপের ডেটাবেসে কিছু বদলেছে */
  changed: boolean;
}

interface Gathered {
  result: CategoryCompareResult;
  nodes: CategoryFolderNode[];
  state: CategorySyncState;
  appCategories: Category[];
  appPapers: Paper[];
  pending: CategoryPending;
  rootExists: boolean;
}

/** দরকারি data.json কয়েকটা একসাথে পড়া */
async function readDataFiles(nodes: CategoryFolderNode[], onRead?: (n: CategoryFolderNode) => void): Promise<Map<string, ParseCategoryDataResult>> {
  const out = new Map<string, ParseCategoryDataResult>();
  let next = 0;
  const worker = async () => {
    while (next < nodes.length) {
      const n = nodes[next++];
      const text = await readText(categoryDataPath(n.dirName));
      out.set(n.dirName, parseCategoryData(text, n.data?.mtime ?? 0));
      onRead?.(n);
    }
  };
  await Promise.all(Array.from({ length: Math.min(READ_PARALLEL, nodes.length) }, worker));
  return out;
}

async function questionIdSet(): Promise<Set<string>> {
  const [a, b] = await Promise.all([db.questions.toCollection().primaryKeys(), chapterDb.questions.toCollection().primaryKeys()]);
  return new Set<string>([...(a as string[]), ...(b as string[])]);
}

/** ফোল্ডার ও অ্যাপ পড়ে compare চালায় (সিঙ্ক লকের ভেতরে ডাকতে হবে); কিছু লেখে না */
async function gather(deleteMode: CategoryDeleteMode, stamp: string, tracker?: ProgressTracker): Promise<Gathered> {
  tracker?.setPhase('list', 'Category');
  const listing = await scanTree(CATEGORY_ROOT);
  tracker?.step(1, 'Category', 'snapshot');
  const state = await loadCategorySyncState();
  const [appCategories, appPapers] = await Promise.all([db.categories.toArray(), db.papers.toArray()]);
  tracker?.step(1, 'Category');

  const { nodes, rootExtras } = listing.exists ? buildCategoryNodes(listing.entries) : { nodes: [] as CategoryFolderNode[], rootExtras: [] };

  const toRead = nodes.filter((n) => needsDataRead(n, state));
  tracker?.addTotal(toRead.length);
  tracker?.setPhase('read', 'Category');
  const reads = await readDataFiles(toRead, (n) => tracker?.step(1, `Category › ${n.dirName}`));
  for (const n of nodes) expandCategoryNode(n, state, reads.get(n.dirName));

  tracker?.setPhase('compare', 'Category');
  const pendingRaw = peekCategoryPending();
  const pending: CategoryPending = { categories: new Set(pendingRaw.categories), papers: new Set(pendingRaw.papers), deletes: new Set(pendingRaw.deletes) };
  const known = reads.size > 0 ? await questionIdSet() : undefined;
  const result = compareFolderToApp({
    folder: { rootExists: listing.exists, nodes, rootExtras },
    app: { categories: appCategories, papers: appPapers },
    state,
    pending,
    knownQuestionIds: known,
    onCategoryDelete: deleteMode,
    makeId: stampIdMaker(stamp),
  });
  tracker?.step(1, 'Category');
  return { result, nodes, state, appCategories, appPapers, pending, rootExists: listing.exists };
}

/** "ফোল্ডার থেকে ক্যাটাগরি সিঙ্ক করুন" - প্রিভিউ (ড্রাই-রান): ফোল্ডার বা ডেটাবেসে কিছুই লেখে না, মোছে না, সরায় না */
export async function previewCategoriesFromFolder(opts: { onProgress?: ProgressCallback; deleteMode?: CategoryDeleteMode } = {}): Promise<CategoryPreview> {
  const deleteMode = opts.deleteMode ?? 'delete-papers';
  const tracker = opts.onProgress ? new ProgressTracker(opts.onProgress, 3, 'list') : undefined;
  const stamp = makeStamp();
  const g = await withSyncLock(() => gather(deleteMode, stamp, tracker));
  const totals = summarizeCategory(g.result);
  tracker?.finish();
  return {
    stamp,
    createdAt: Date.now(),
    deleteMode,
    result: g.result,
    totals,
    empty: !hasAnyCategoryChange(g.result) && g.result.extras.length === 0,
    signature: previewSignature(g.result),
    rootExists: g.rootExists,
    pendingCount: g.pending.categories.size + g.pending.papers.size + g.pending.deletes.size,
  };
}

/** অ্যাপের ডেটাবেসে ops প্রয়োগ + স্মৃতি সেভ - একটাই transaction */
async function applyOps(ops: CategoryOp[], state: CategorySyncState, onUnit?: (label: string) => void): Promise<void> {
  await db.transaction('rw', [db.categories, db.papers, db.meta], async (tx) => {
    markSyncTx(tx);
    for (const o of ops) {
      switch (o.op) {
        case 'cat-add':
          await db.categories.put(o.category);
          onUnit?.(o.category.name);
          break;
        case 'cat-update':
          await db.categories.update(o.id, o.changes);
          break;
        case 'cat-delete':
          await db.categories.delete(o.id);
          break;
        case 'paper-put':
          await db.papers.put(o.paper);
          onUnit?.(o.paper.shortName);
          break;
        case 'paper-patch':
          await db.papers.update(o.id, o.changes);
          break;
        case 'paper-delete':
          await db.papers.delete(o.id);
          break;
      }
    }
    await saveCategorySyncState(state);
  });
}

/**
 * প্রিভিউ নিশ্চিত হওয়ার পর আসল প্রয়োগ। ফোল্ডার ও অ্যাপ আবার পড়ে compare চালানো হয়; ছাপ না মিললে (প্রিভিউয়ের পর
 * কিছু বদলেছে) Error - ব্যবহারকারী আবার সিঙ্ক চালালে নতুন প্রিভিউ আসবে।
 */
export async function applyCategoriesFromFolder(
  preview: CategoryPreview,
  opts: { onProgress?: ProgressCallback; massDeleteConfirmed?: boolean } = {}
): Promise<CategoryApplyResult> {
  const tracker = opts.onProgress ? new ProgressTracker(opts.onProgress, 4, 'list') : undefined;
  const out = await withSyncLock(async (): Promise<Omit<CategoryApplyResult, 'queuedWrites'> & { needsWrite: string[] }> => {
    const g = await gather(preview.deleteMode, preview.stamp, tracker);
    if (previewSignature(g.result) !== preview.signature) {
      throw new Error('প্রিভিউ দেখার পর ফোল্ডার বা অ্যাপে বদল হয়েছে - কিছু বদলানো হয়নি। আবার সিঙ্ক চালিয়ে নতুন প্রিভিউ দেখুন');
    }
    if (g.result.massDelete && !opts.massDeleteConfirmed) {
      throw new Error(`অর্ধেকের বেশি জিনিস (${g.result.massDelete.count}/${g.result.massDelete.total}) মোছা হচ্ছে - নিশ্চিতকরণ ছাড়া চলবে না, কিছু বদলানো হয়নি`);
    }
    const plan = planCategoryApply({ result: g.result, folderNodes: g.nodes, state: g.state, appCategories: g.appCategories, appPapers: g.appPapers, pending: g.pending });
    tracker?.addTotal(Math.max(1, plan.ops.length));
    tracker?.setPhase('folders', 'অ্যাপে প্রয়োগ হচ্ছে');
    await applyOps(plan.ops, plan.state, (label) => tracker?.step(1, label));
    tracker?.step(1, 'স্মৃতি সেভ');
    // অংশ ১ঘ-খ: ব্যাংকে-নেই প্রশ্নের কপি data.json/media/ থেকে ডেটাবেসে (ব্যর্থ হলেও প্রয়োগ অক্ষত - শুধু সতর্কতা)
    const care = await bankMissingCareNoLock();
    return { counts: plan.counts, warnings: [...g.result.warnings, ...care.warnings], bankMissing: plan.bankMissing, changed: planHasDbChanges(plan), needsWrite: plan.needsWrite };
  });
  // ফোল্ডারে নতুন করে লেখা দরকার (নাম অমিল / অশ্রেণিবদ্ধে সরানো প্রশ্নপত্র) - লক ছেড়ে সারিতে দেওয়া
  const queuedWrites = out.needsWrite;
  if (queuedWrites.length) queueCategoryWrites(queuedWrites);
  tracker?.finish();
  const { needsWrite: _ignored, ...rest } = out;
  void _ignored;
  return { ...rest, queuedWrites };
}
