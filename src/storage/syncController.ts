import type { SyncDirection, SyncPreview } from './syncPreview';
import type { SyncProgress, ProgressCallback } from './syncProgress';
import { emptyCounts, makeResultView, type SyncCounts, type SyncDialogState, type SyncResultConflict } from './syncView';

/**
 * ধাপ ৪ - থ্রি ডট মেনু থেকে সিঙ্কের পুরো পথ চালানোর নিয়ন্ত্রক (খাঁটি কোড: কোনো ফাইল/ডেটাবেস/React IO নেই)।
 *
 *   মেনু আইটেম ট্যাপ -> calculating (প্রগ্রেস) -> preview -> [নিশ্চিত করুন] -> running (প্রগ্রেস) -> result / error -> [ঠিক আছে]
 *
 * আসল কাজ (প্রিভিউ হিসাব ও সিঙ্ক চালানো) deps হিসেবে আসে, তাই টেস্টে নকল দেওয়া যায়।
 * উইন্ডো (SyncPreviewDialog) শুধু getState() দেখায়।
 */

export interface RunOutcome {
  counts: SyncCounts;
  /** preview.conflicts-এর সূচক অনুযায়ী: সত্যিই সরানো হয়েছে কি না (না দিলে সব moved:false) */
  conflictsMoved?: boolean[];
  warnings?: string[];
}

export interface SyncControllerDeps {
  preview(direction: SyncDirection, onProgress: ProgressCallback): Promise<SyncPreview>;
  run(direction: SyncDirection, preview: SyncPreview, onProgress: ProgressCallback, onCounts: (c: SyncCounts) => void): Promise<RunOutcome>;
  /** result বন্ধ করার সময়: কিছু বদলালে true (তালিকা রিফ্রেশ করতে) */
  onClosedResult?(changed: boolean): void;
}

/** প্রিভিউয়ের তালিকা থেকে সংখ্যা গোনা ('info' ধরা হয় না) */
export function countsFromPreview(p: SyncPreview): SyncCounts {
  const c = emptyCounts();
  for (const e of p.entries) {
    if (e.action === 'info') continue;
    c[e.action] += 1;
  }
  return c;
}

/** প্রিভিউ থেকে [নিশ্চিত করুন] চাপা যাবে কি না (P1: ত্রুটিতে বন্ধ, P2: খালি হলে বন্ধ) */
export function canConfirmPreview(p: SyncPreview): boolean {
  return !p.empty && p.errors.length === 0;
}

export interface SyncController {
  getState(): SyncDialogState | null;
  subscribe(fn: () => void): () => void;
  /** মেনু থেকে শুরু; অন্য সিঙ্ক উইন্ডো খোলা থাকলে false */
  start(direction: SyncDirection): boolean;
  /**
   * ধাপ ৫খ - অটো সিঙ্ক: উইন্ডো সরাসরি 'running' (স্বয়ংক্রিয়) দিয়ে শুরু; শেষে সবসময় ফল দেখিয়ে থাকে ([ঠিক আছে] চেপে বন্ধ)।
   * অন্য উইন্ডো খোলা থাকলে false। task ব্যর্থ হলে error অবস্থা।
   */
  startAuto(task: (onProgress: ProgressCallback) => Promise<RunOutcome>): boolean;
  confirm(): void;
  /** calculating / preview-তে [বাতিল] */
  cancel(): void;
  /** result / error-এ [ঠিক আছে] / [বন্ধ করুন] */
  close(): void;
}

const msgOf = (err: unknown): string => (err instanceof Error ? err.message : String(err ?? 'অজানা ত্রুটি'));

export function createSyncController(deps: SyncControllerDeps): SyncController {
  let state: SyncDialogState | null = null;
  let token = 0;
  const listeners = new Set<() => void>();

  const set = (s: SyncDialogState | null) => {
    state = s;
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch {
        /* শ্রোতার ভুলে সিঙ্ক থামে না */
      }
    }
  };

  const start = (direction: SyncDirection): boolean => {
    if (state) return false;
    const my = ++token;
    set({ kind: 'calculating', direction, progress: null });
    deps
      .preview(direction, (p: SyncProgress) => {
        if (my === token && state?.kind === 'calculating') set({ kind: 'calculating', direction, progress: p });
      })
      .then((preview) => {
        if (my !== token || state?.kind !== 'calculating') return; // বাতিল হয়ে গেছে: ফল ফেলে দেওয়া (P3)
        set({ kind: 'preview', preview });
      })
      .catch((err) => {
        if (my !== token || state?.kind !== 'calculating') return;
        set({ kind: 'error', direction, message: msgOf(err), stage: 'হিসাব করা', dataSafe: true });
      });
    return true;
  };

  const startAuto = (task: (onProgress: ProgressCallback) => Promise<RunOutcome>): boolean => {
    if (state) return false;
    const my = ++token;
    const direction: SyncDirection = 'folder-to-app';
    let progress: SyncProgress | null = null;
    const show = () => set({ kind: 'running', direction, auto: true, progress, counts: emptyCounts() });
    show();
    task((p) => {
      progress = p;
      if (my === token && state?.kind === 'running') show();
    })
      .then((out) => {
        if (my !== token) return;
        // অটো সিঙ্ক নিজে কিছু সরায় না; কনফ্লিক্ট থাকলে সতর্কতায় আসে
        set({ kind: 'result', direction, auto: true, result: makeResultView(out.counts, [], out.warnings ?? []) });
      })
      .catch((err) => {
        if (my !== token) return;
        set({ kind: 'error', direction, auto: true, message: msgOf(err), stage: progress?.label || undefined, dataSafe: false });
      });
    return true;
  };

  const confirm = () => {
    if (state?.kind !== 'preview') return;
    const preview = state.preview;
    if (!canConfirmPreview(preview)) return;
    const direction = preview.direction;
    const my = ++token;
    let counts = emptyCounts();
    let progress: SyncProgress | null = null;
    const show = () => set({ kind: 'running', direction, progress, counts });
    show();
    deps
      .run(direction, preview, (p) => {
        progress = p;
        if (my === token && state?.kind === 'running') show();
      }, (c) => {
        counts = c;
        if (my === token && state?.kind === 'running') show();
      })
      .then((out) => {
        if (my !== token) return;
        const conflicts: SyncResultConflict[] = preview.conflicts.map((c, i) => ({ ...c, moved: !!out.conflictsMoved?.[i] }));
        const finalCounts = { ...out.counts, conflictsMoved: conflicts.filter((c) => c.moved).length };
        set({
          kind: 'result',
          direction,
          result: makeResultView(finalCounts, conflicts, [...preview.warnings, ...(out.warnings ?? [])], preview.stamp),
        });
      })
      .catch((err) => {
        if (my !== token) return;
        // সিঙ্কের লেখা একেকটা ফাইল নিরাপদে (.tmp -> যাচাই -> বদল) হয়; তবুও অর্ধেক হয়ে থাকতে পারে, তাই "অক্ষত" বলা হয় না
        set({ kind: 'error', direction, message: msgOf(err), stage: progress?.label || undefined, dataSafe: false });
      });
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
    startAuto,
    confirm,
    cancel,
    close,
  };
}
