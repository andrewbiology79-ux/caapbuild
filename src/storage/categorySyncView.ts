import type { CategoryAction, CategoryDeleteMode, CategoryEntry, CategoryExtra, CategoryCompareResult, CategoryTotals } from './categoryCompare';
import type { BankMissingPaper, CategoryApplyCounts } from './categoryApplyPlan';
import type { CategoryPreview } from './categoryScanner';
import { PHASE_LABEL, type SyncProgress } from './syncProgress';
import { toBn } from '../utils/toBn';

/**
 * অংশ ১গ-২ক - "ফোল্ডার থেকে ক্যাটাগরি সিঙ্ক করুন" উইন্ডোর ভিউ-মডেল ও বাংলা লেখা।
 * খাঁটি কোড: IO নেই, React নেই (শুধু টাইপ import), তাই আলাদাভাবে টেস্ট করা যায়। উইন্ডো (২খ) এগুলো দেখাবে।
 */

const n = (v: number) => toBn(v);

/* ------------------------------------------------------------------
 * উইন্ডোর অবস্থা
 * ---------------------------------------------------------------- */

export interface CategoryResultExtra extends CategoryExtra {
  /** সত্যিই unnecessary/-তে সরানো হয়েছে কি না */
  moved: boolean;
}

export interface CategoryResultView {
  counts: CategoryApplyCounts;
  extras: CategoryResultExtra[];
  extrasMoved: number;
  warnings: string[];
  /** ব্যাংকে-নেই প্রশ্ন আছে এমন প্রশ্নপত্র ও প্রশ্নের সংখ্যা */
  bankMissingPapers: number;
  bankMissingQuestions: number;
  /** অ্যাপ -> ফোল্ডার লেখকের সারিতে দেওয়া ক্যাটেগরির সংখ্যা */
  queuedWrites: number;
  /** কিছু বদলায়নি এবং কোনো বাড়তি জিনিসও নেই */
  nothingChanged: boolean;
}

export type CategoryDialogState =
  | { kind: 'calculating'; progress: SyncProgress | null; deleteMode: CategoryDeleteMode }
  | { kind: 'preview'; preview: CategoryPreview }
  | { kind: 'running'; progress: SyncProgress | null }
  | { kind: 'result'; result: CategoryResultView }
  | { kind: 'error'; message: string; stage?: string; dataSafe: boolean };

export const emptyApplyCounts = (): CategoryApplyCounts => ({
  categoriesAdded: 0,
  categoriesRenamed: 0,
  categoriesDeleted: 0,
  papersAdded: 0,
  papersUpdated: 0,
  papersMoved: 0,
  papersDeleted: 0,
});

const sumCounts = (c: CategoryApplyCounts) =>
  c.categoriesAdded + c.categoriesRenamed + c.categoriesDeleted + c.papersAdded + c.papersUpdated + c.papersMoved + c.papersDeleted;

export function makeCategoryResultView(
  counts: CategoryApplyCounts,
  extras: CategoryResultExtra[] = [],
  warnings: string[] = [],
  bankMissing: BankMissingPaper[] = [],
  queuedWrites = 0
): CategoryResultView {
  const extrasMoved = extras.filter((x) => x.moved).length;
  return {
    counts,
    extras,
    extrasMoved,
    warnings,
    bankMissingPapers: bankMissing.length,
    bankMissingQuestions: bankMissing.reduce((s, p) => s + p.questionIds.length, 0),
    queuedWrites,
    nothingChanged: sumCounts(counts) === 0 && extras.length === 0,
  };
}

/** চলার সময় Back ব্লক থাকবে */
export function isCategoryBlocking(state: CategoryDialogState | null): boolean {
  return !!state && state.kind === 'running';
}

/* ------------------------------------------------------------------
 * শিরোনাম ও সাধারণ লেখা
 * ---------------------------------------------------------------- */

export const CATEGORY_DIALOG_TITLE = 'ফোল্ডার থেকে ক্যাটাগরি সিঙ্ক';
export const CATEGORY_DIALOG_SUBTITLE = 'Category/ ফোল্ডার → অ্যাপ';

export const CATEGORY_ACTION_LABEL: Record<CategoryAction, string> = {
  add: 'নতুন',
  rename: 'নাম বদল',
  move: 'সরানো',
  delete: 'মোছা',
  update: 'আপডেট',
  info: 'তথ্য',
};

export const CATEGORY_KIND_LABEL = { category: 'ক্যাটেগরি', paper: 'প্রশ্নপত্র' } as const;

/** মেনুতে চাপলে কেন শুরু হলো না */
export const CATEGORY_BUSY_REASON = 'আরেকটা সিঙ্ক উইন্ডো খোলা আছে, শেষ করে আবার চেষ্টা করুন';

/* ------------------------------------------------------------------
 * প্রিভিউ
 * ---------------------------------------------------------------- */

export interface CategoryEntryText {
  action: CategoryAction;
  actionLabel: string;
  kindLabel: string;
  /** ক্যাটেগরি › প্রশ্নপত্র */
  pathText: string;
  /** নাম বদল / সরানোর "আগে → পরে" */
  change?: string;
  detail: string;
  /** লাল দেখাবে (ডেটা মোছে) */
  destructive: boolean;
}

export function categoryEntryText(e: CategoryEntry): CategoryEntryText {
  let change: string | undefined;
  if (e.from && e.to) change = `${e.from} → ${e.to}`;
  else if (e.from && e.action !== 'delete') change = `আগের জায়গা: ${e.from}`;
  const bank = e.bankMissingIds?.length ? `${n(e.bankMissingIds.length)}টি প্রশ্ন ব্যাংকে নেই (প্রশ্নপত্রে কপি থেকে যাবে)` : '';
  return {
    action: e.action,
    actionLabel: CATEGORY_ACTION_LABEL[e.action],
    kindLabel: CATEGORY_KIND_LABEL[e.kind],
    pathText: e.path.join(' › '),
    change,
    detail: [bank, e.note].filter(Boolean).join(' · '),
    destructive: !!e.destructive || e.action === 'delete',
  };
}

export interface CategoryEntryGroup {
  key: string;
  /** ক্যাটেগরির নাম (গোষ্ঠীর শিরোনাম) */
  title: string;
  entries: CategoryEntry[];
}

/**
 * ক্যাটেগরি অনুযায়ী গোষ্ঠী; গোষ্ঠীর ক্রম = প্রথম দেখার ক্রম। মোছা ক্যাটেগরির গোষ্ঠী সবার শেষে (লাল অংশ নিচে নামে)।
 */
export function groupCategoryEntries(entries: CategoryEntry[]): CategoryEntryGroup[] {
  const groups = new Map<string, CategoryEntryGroup>();
  for (const e of entries) {
    const title = e.path[0] ?? '';
    const key = title;
    let g = groups.get(key);
    if (!g) {
      g = { key, title, entries: [] };
      groups.set(key, g);
    }
    g.entries.push(e);
  }
  const rank = (g: CategoryEntryGroup) => (g.entries.some((e) => e.kind === 'category' && e.action === 'delete') ? 1 : 0);
  return [...groups.values()].map((g, i) => ({ g, i })).sort((a, b) => rank(a.g) - rank(b.g) || a.i - b.i).map((x) => x.g);
}

export interface CategoryChip {
  key: string;
  text: string;
  tone: 'neutral' | 'danger' | 'warn';
}

/** প্রিভিউয়ের মাথার সংখ্যা */
export function categoryTotalsChips(t: CategoryTotals): CategoryChip[] {
  const out: CategoryChip[] = [];
  if (t.categoriesAdded) out.push({ key: 'cat-add', text: `${n(t.categoriesAdded)}টি নতুন ক্যাটেগরি`, tone: 'neutral' });
  if (t.categoriesRenamed) out.push({ key: 'cat-rename', text: `${n(t.categoriesRenamed)}টি ক্যাটেগরির নাম বদল`, tone: 'neutral' });
  if (t.papersAdded) out.push({ key: 'paper-add', text: `${n(t.papersAdded)}টি নতুন প্রশ্নপত্র`, tone: 'neutral' });
  if (t.papersUpdated) out.push({ key: 'paper-update', text: `${n(t.papersUpdated)}টি প্রশ্নপত্র আপডেট`, tone: 'neutral' });
  if (t.papersMoved) out.push({ key: 'paper-move', text: `${n(t.papersMoved)}টি প্রশ্নপত্র সরানো`, tone: 'neutral' });
  if (t.categoriesDeleted) out.push({ key: 'cat-delete', text: `${n(t.categoriesDeleted)}টি ক্যাটেগরি মোছা`, tone: 'danger' });
  if (t.papersDeleted) out.push({ key: 'paper-delete', text: `${n(t.papersDeleted)}টি প্রশ্নপত্র মোছা`, tone: 'danger' });
  if (t.extras) out.push({ key: 'extras', text: `${n(t.extras)}টি অপ্রয়োজনীয় (unnecessary-তে যাবে)`, tone: 'neutral' });
  if (t.warnings) out.push({ key: 'warnings', text: `${n(t.warnings)}টি সতর্কতা`, tone: 'warn' });
  return out;
}

/** কোন কোন ক্যাটেগরি সুরক্ষিত (ভাঙা/সন্দেহজনক data.json) - প্রিভিউয়ে লাল/হলুদ বার্তা */
export function protectedLines(r: Pick<CategoryCompareResult, 'protectedCategories'>): string[] {
  const out: string[] = [];
  for (const p of r.protectedCategories ?? []) {
    const head =
      p.reason === 'invalid'
        ? `"${p.name}": data.json পড়া যায়নি - কিছুই বদলাবে না (${n(p.heldPapers)}টি প্রশ্নপত্র সুরক্ষিত)`
        : `"${p.name}": data.json-এ সমস্যা - ${n(p.skippedPapers)}টি প্রশ্নপত্র বাদ পড়েছে, ${n(p.heldPapers)}টি সুরক্ষিত (কিছুই মোছা হবে না)`;
    out.push(p.why.length ? `${head}। কারণ: ${p.why.slice(0, 3).join('; ')}${p.why.length > 3 ? ` (আরও ${n(p.why.length - 3)}টি)` : ''}` : head);
  }
  return out;
}

/** অর্ধেকের বেশি মোছা হচ্ছে - আলাদা নিশ্চিতকরণ দরকার */
export function massDeleteText(m: { count: number; total: number }): string {
  return `সাবধান: ${n(m.total)}টির মধ্যে ${n(m.count)}টি জিনিস মোছা হচ্ছে (অর্ধেকের বেশি)। Category/ ফোল্ডার ভুল জায়গায় বা অসম্পূর্ণ নয় তো? নিশ্চিত হলে আলাদা করে সম্মতি দিন।`;
}

/** অ্যাপের যে বদল এখনো ফোল্ডারে লেখা হয়নি - সিঙ্কে সেগুলো ছোঁয়া হয় না (অ্যাপের কপিই জেতে) */
export function pendingNotice(pendingCount: number): string | null {
  if (!pendingCount) return null;
  return `অ্যাপের ${n(pendingCount)}টি বদল এখনো ফোল্ডারে লেখা হয়নি। সেগুলো এই সিঙ্কে ছোঁয়া হবে না - অ্যাপেরটাই থাকবে`;
}

export interface DeleteChoice {
  mode: CategoryDeleteMode;
  label: string;
  hint: string;
}

/** ফোল্ডার নেই এমন ক্যাটেগরির প্রশ্নপত্র কী হবে - ব্যবহারকারীর বাছাই */
export const DELETE_CHOICES: DeleteChoice[] = [
  { mode: 'delete-papers', label: 'প্রশ্নপত্রসহ মুছুক', hint: 'ক্যাটেগরি ও তার সব প্রশ্নপত্র অ্যাপ থেকে মুছে যাবে' },
  { mode: 'move-to-uncategorized', label: 'প্রশ্নপত্র অশ্রেণিবদ্ধে যাক', hint: 'ক্যাটেগরি মুছবে, প্রশ্নপত্রগুলো "অশ্রেণিবদ্ধ"-এ থাকবে' },
];

/** প্রিভিউয়ে মোছা ক্যাটেগরি থাকলে তবেই বাছাইয়ের অংশ দেখাবে */
export function needsDeleteChoice(r: Pick<CategoryCompareResult, 'entries'>): boolean {
  return r.entries.some((e) => e.kind === 'category' && e.action === 'delete');
}

/** মোছা ক্যাটেগরিগুলোর ভেতরের প্রশ্নপত্র মিলিয়ে কয়টি (বাছাইয়ের অংশে দেখানোর জন্য) */
export function deletedCategoryPapers(r: Pick<CategoryCompareResult, 'entries'>): { categories: number; papers: number } {
  let categories = 0;
  let papers = 0;
  for (const e of r.entries) {
    if (e.kind === 'category' && e.action === 'delete') {
      categories++;
      papers += e.papers ?? 0;
    }
  }
  return { categories, papers };
}

/** প্রিভিউ খালি হলে কেন - লেখা */
export function emptyPreviewText(p: Pick<CategoryPreview, 'rootExists'>): string {
  return p.rootExists ? 'কিছু বদলাবে না - ফোল্ডার আর অ্যাপ মিলে আছে' : 'Category/ ফোল্ডার পাওয়া যায়নি - কিছু মোছা বা বদলানো হবে না';
}

/** [নিশ্চিত করুন] চাপা যাবে কি না */
export function canConfirmCategoryPreview(p: Pick<CategoryPreview, 'empty' | 'result'>): boolean {
  return !p.empty && (p.result.entries.some((e) => e.action !== 'info') || p.result.extras.length > 0);
}

/* ------------------------------------------------------------------
 * বাড়তি জিনিস (unnecessary/-তে যাবে)
 * ---------------------------------------------------------------- */

export interface CategoryExtraGroup {
  key: string;
  /** যে ফোল্ডারের ভেতরে; Category/-র সরাসরি ভেতরে হলে "Category" */
  ownerText: string;
  /** <ফোল্ডার>/unnecessary */
  moveToText: string;
  names: string[];
  items: CategoryExtra[];
}

export function groupCategoryExtras<T extends CategoryExtra>(extras: T[]): CategoryExtraGroup[] {
  const groups = new Map<string, CategoryExtraGroup>();
  for (const x of extras) {
    const key = x.owner.join('/');
    let g = groups.get(key);
    if (!g) {
      const cut = x.moveTo.length - x.name.length - 1;
      g = { key, ownerText: x.owner.length ? x.owner.join(' › ') : 'Category', moveToText: x.moveTo.slice(0, Math.max(0, cut)), names: [], items: [] };
      groups.set(key, g);
    }
    g.names.push(x.name);
    g.items.push(x);
  }
  return [...groups.values()];
}

/** "৩টি ছবি, ১টি ফোল্ডার, ২টি ফাইল" */
export function categoryExtraGroupSummary(g: CategoryExtraGroup): string {
  let img = 0;
  let dir = 0;
  let file = 0;
  for (const x of g.items) {
    if (x.kind === 'extra-folder') dir++;
    else if (/\.(webp|png|jpe?g|gif)$/i.test(x.name)) img++;
    else file++;
  }
  const parts: string[] = [];
  if (img) parts.push(`${n(img)}টি ছবি`);
  if (dir) parts.push(`${n(dir)}টি ফোল্ডার`);
  if (file) parts.push(`${n(file)}টি ফাইল`);
  return parts.join(', ');
}

export function categoryExtraMoveText(moved: boolean, moveToText: string): string {
  return moved ? `unnecessary-তে সরানো হয়েছে: ${moveToText}` : `সরানো হবে: ${moveToText}`;
}

/* ------------------------------------------------------------------
 * প্রগ্রেস ও ফল
 * ---------------------------------------------------------------- */

export function categoryPercentText(p: SyncProgress): string {
  return `${n(p.percent)}%`;
}

export function categoryProgressLine(p: SyncProgress): string {
  return `${n(p.done)} / ${n(p.total)} ধাপ সম্পন্ন, বাকি ${n(Math.max(0, p.total - p.done))}`;
}

export function categoryCurrentWork(p: SyncProgress): string {
  return p.label ? `${PHASE_LABEL[p.phase]}: ${p.label}` : PHASE_LABEL[p.phase];
}

export interface CategoryResultCell {
  key: string;
  label: string;
  value: number;
  tone: 'neutral' | 'danger';
}

/** ফল-পর্দার সংখ্যা (শূন্য সারি বাদ) */
export function categoryResultCells(r: CategoryResultView): CategoryResultCell[] {
  const c = r.counts;
  const all: CategoryResultCell[] = [
    { key: 'cat-add', label: 'নতুন ক্যাটেগরি', value: c.categoriesAdded, tone: 'neutral' },
    { key: 'cat-rename', label: 'ক্যাটেগরির নাম বদল', value: c.categoriesRenamed, tone: 'neutral' },
    { key: 'paper-add', label: 'নতুন প্রশ্নপত্র', value: c.papersAdded, tone: 'neutral' },
    { key: 'paper-update', label: 'প্রশ্নপত্র আপডেট', value: c.papersUpdated, tone: 'neutral' },
    { key: 'paper-move', label: 'প্রশ্নপত্র সরানো', value: c.papersMoved, tone: 'neutral' },
    { key: 'cat-delete', label: 'ক্যাটেগরি মোছা', value: c.categoriesDeleted, tone: 'danger' },
    { key: 'paper-delete', label: 'প্রশ্নপত্র মোছা', value: c.papersDeleted, tone: 'danger' },
    { key: 'extras', label: 'unnecessary-তে সরানো', value: r.extrasMoved, tone: 'neutral' },
  ];
  return all.filter((x) => x.value > 0);
}

export function categoryResultHeadline(r: CategoryResultView): string {
  return r.nothingChanged ? 'সিঙ্ক সম্পন্ন - কিছু বদলায়নি' : 'সিঙ্ক সম্পন্ন';
}

/** ফল-পর্দার নিচের টীকা: ব্যাংকে-নেই প্রশ্ন, পরে ফোল্ডারে লেখা */
export function categoryResultNotes(r: CategoryResultView): string[] {
  const out: string[] = [];
  if (r.bankMissingQuestions > 0) {
    out.push(`${n(r.bankMissingPapers)}টি প্রশ্নপত্রের ${n(r.bankMissingQuestions)}টি প্রশ্ন ব্যাংকে নেই - প্রশ্নপত্রে কপি থেকে গেছে (ব্যাংকে ফেরানো আপনি হাতে করবেন)`);
  }
  if (r.queuedWrites > 0) out.push(`${n(r.queuedWrites)}টি ক্যাটেগরির ফোল্ডার অ্যাপ থেকে নতুন করে লেখা হবে (নাম বা অবস্থান মেলাতে)`);
  return out;
}

/** ত্রুটির পর ডেটা নিরাপদ কি না - বাংলা লেখা */
export function categoryErrorSafety(dataSafe: boolean): string {
  return dataSafe ? 'অ্যাপের ডেটা অক্ষত আছে' : 'কিছু অংশ হয়তো বদলে গেছে - আবার সিঙ্ক চালিয়ে প্রিভিউ দেখে নিন';
}
