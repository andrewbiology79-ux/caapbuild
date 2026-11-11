import type { CategoryDeleteMode } from './categoryCompare';
import type { BankMissingPaper, CategoryApplyCounts } from './categoryApplyPlan';
import type { CategoryPreview } from './categoryScanner';
import type { SyncProgress, ProgressCallback } from './syncProgress';
import {
  canConfirmCategoryPreview,
  makeCategoryResultView,
  type CategoryDialogState,
  type CategoryResultExtra,
} from './categorySyncView';

/**
 * অংশ ১গ-২ক - "ফোল্ডার থেকে ক্যাটাগরি সিঙ্ক করুন"-এর নিয়ন্ত্রক (খাঁটি কোড: কোনো ফাইল/ডেটাবেস/React IO নেই)।
 *
 *   মেনু ট্যাপ -> calculating -> preview -> [নিশ্চিত করুন] -> running -> result / error -> [ঠিক আছে]
 *   preview-তে "মোছা ক্যাটেগরির প্রশ্নপত্র কী হবে" বদলালে আবার calculating -> preview।
 *
 * আসল কাজ deps হিসেবে আসে (categorySyncRun.ts), তাই টেস্টে নকল দেওয়া যায়। Question_Bank-এর syncController-এর মতোই গঠন।
 */

/** run()-এর ত্রুটি, সাথে ডেটা নিরাপদ কি না (অ্যাপের ডেটাবেসের লেখা একটাই transaction, তাই apply ব্যর্থ হলে কিছু বদলায় না) */
export class CategoryRunError extends Error {
  readonly dataSafe: boolean;
  readonly stage?: string;
  constructor(message: string, dataSafe: boolean, stage?: string) {
    super(message);
    this.name = 'CategoryRunError';
    this.dataSafe = dataSafe;
    this.stage = stage;
  }
}

export interface CategoryRunOutcome {
  counts: CategoryApplyCounts;
  warnings: string[];
  bankMissing: BankMissingPaper[];
  /** অ্যাপ -> ফোল্ডার লেখকের সারিতে দেওয়া ক্যাটেগরি */
  queuedWrites: string[];
  /** preview.result.extras-এর সূচক অনুযায়ী: unnecessary/-তে সরেছে কি না */
  extrasMoved: boolean[];
}

export interface CategorySyncControllerDeps {
  preview(deleteMode: CategoryDeleteMode, onProgress: ProgressCallback): Promise<CategoryPreview>;
  run(preview: CategoryPreview, opts: { massDeleteConfirmed: boolean }, onProgress: ProgressCallback): Promise<CategoryRunOutcome>;
  /** অন্য সিঙ্ক উইন্ডো খোলা/অটো সিঙ্ক চলছে - কারণ; ফ্রি হলে null */
  busyReason?(): string | null;
  /** result বন্ধ করার সময়: কিছু বদলালে true (তালিকা রিফ্রেশ করতে) */
  onClosedResult?(changed: boolean): void;
}

export type CategoryStartResult = { started: true } | { started: false; reason: string };

export interface CategorySyncController {
  getState(): CategoryDialogState | null;
  subscribe(fn: () => void): () => void;
  /** মেনু থেকে শুরু; অন্য সিঙ্ক চলছে/খোলা থাকলে কারণসহ started:false */
  start(): CategoryStartResult;
  /** প্রিভিউয়ে "মোছা ক্যাটেগরির প্রশ্নপত্র কী হবে" বদলানো - আবার হিসাব হয় */
  setDeleteMode(mode: CategoryDeleteMode): boolean;
  /** massDelete থাকলে massDeleteConfirmed:true ছাড়া চলে না (false ফেরত) */
  confirm(opts?: { massDeleteConfirmed?: boolean }): boolean;
  /** calculating / preview-তে [বাতিল] */
  cancel(): void;
  /** result / error-এ [ঠিক আছে] / [বন্ধ করুন] */
  close(): void;
}

const msgOf = (err: unknown): string => (err instanceof Error ? err.message : String(err ?? 'অজানা ত্রুটি'));

export function createCategorySyncController(deps: CategorySyncControllerDeps): CategorySyncController {
  let state: CategoryDialogState | null = null;
  let token = 0;
  const listeners = new Set<() => void>();

  const set = (s: CategoryDialogState | null) => {
    state = s;
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch {
        /* শ্রোতার ভুলে সিঙ্ক থামে না */
      }
    }
  };

  const calculate = (deleteMode: CategoryDeleteMode) => {
    const my = ++token;
    set({ kind: 'calculating', progress: null, deleteMode });
    deps
      .preview(deleteMode, (p: SyncProgress) => {
        if (my === token && state?.kind === 'calculating') set({ kind: 'calculating', progress: p, deleteMode });
      })
      .then((preview) => {
        if (my !== token || state?.kind !== 'calculating') return; // বাতিল হয়ে গেছে: ফল ফেলে দেওয়া
        set({ kind: 'preview', preview });
      })
      .catch((err) => {
        if (my !== token || state?.kind !== 'calculating') return;
        set({ kind: 'error', message: msgOf(err), stage: 'হিসাব করা', dataSafe: true });
      });
  };

  const start = (): CategoryStartResult => {
    if (state) return { started: false, reason: 'ক্যাটেগরি সিঙ্ক উইন্ডো আগে থেকেই খোলা আছে' };
    const busy = deps.busyReason?.() ?? null;
    if (busy) return { started: false, reason: busy };
    calculate('delete-papers');
    return { started: true };
  };

  const setDeleteMode = (mode: CategoryDeleteMode): boolean => {
    if (state?.kind !== 'preview' || state.preview.deleteMode === mode) return false;
    calculate(mode);
    return true;
  };

  const confirm = (opts: { massDeleteConfirmed?: boolean } = {}): boolean => {
    if (state?.kind !== 'preview') return false;
    const preview = state.preview;
    if (!canConfirmCategoryPreview(preview)) return false;
    const massDeleteConfirmed = !!opts.massDeleteConfirmed;
    if (preview.result.massDelete && !massDeleteConfirmed) return false;
    const my = ++token;
    let progress: SyncProgress | null = null;
    const show = () => set({ kind: 'running', progress });
    show();
    deps
      .run(preview, { massDeleteConfirmed }, (p) => {
        progress = p;
        if (my === token && state?.kind === 'running') show();
      })
      .then((out) => {
        if (my !== token) return;
        const extras: CategoryResultExtra[] = preview.result.extras.map((x, i) => ({ ...x, moved: !!out.extrasMoved[i] }));
        const warnings = Array.from(new Set([...preview.result.warnings, ...out.warnings]));
        set({ kind: 'result', result: makeCategoryResultView(out.counts, extras, warnings, out.bankMissing, out.queuedWrites.length) });
      })
      .catch((err) => {
        if (my !== token) return;
        const safe = err instanceof CategoryRunError ? err.dataSafe : false;
        const stage = err instanceof CategoryRunError && err.stage ? err.stage : progress?.label || undefined;
        set({ kind: 'error', message: msgOf(err), stage, dataSafe: safe });
      });
    return true;
  };

  const cancel = () => {
    if (!state || (state.kind !== 'calculating' && state.kind !== 'preview')) return;
    token++; // চলতি হিসাবের ফল আর ঢুকবে না
    set(null);
  };

  const close = () => {
    if (!state || (state.kind !== 'result' && state.kind !== 'error')) return;
    const changed = state.kind === 'result' && !state.result.nothingChanged;
    token++;
    set(null);
    if (changed) {
      try {
        deps.onClosedResult?.(true);
      } catch {
        /* ignore */
      }
    }
  };

  return {
    getState: () => state,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    start,
    setDeleteMode,
    confirm,
    cancel,
    close,
  };
}
