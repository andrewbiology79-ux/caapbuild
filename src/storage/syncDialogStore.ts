import { useSyncExternalStore } from 'react';
import { createSyncController } from './syncController';
import { defaultSyncDeps } from './syncRun';
import { setManualSyncActive, type SyncReport } from './syncEngine';
import { ProgressTracker } from './syncProgress';
import { emptyCounts } from './syncView';
import type { SyncDialogState } from './syncView';

/** অ্যাপের একটাই সিঙ্ক নিয়ন্ত্রক: সব স্ক্রিনের মেনু এটাকেই ডাকে, উইন্ডো (SyncRunner-এ মাউন্ট) এটাই দেখায় */
export const syncController = createSyncController(defaultSyncDeps);

export function useSyncDialogState(): SyncDialogState | null {
  return useSyncExternalStore(syncController.subscribe, syncController.getState, syncController.getState);
}

// উইন্ডো খোলা থাকলে (হিসাব/প্রিভিউ/চলা/ফল) অটো সিঙ্ক চুপ থাকে
syncController.subscribe(() => setManualSyncActive(syncController.getState() !== null));

/**
 * অটো সিঙ্ক (অ্যাপ খোলা / সামনে আসা / ওয়াচার) প্রগ্রেস উইন্ডো দিয়ে চালায়। উইন্ডো খোলা থাকলে null (সিঙ্ক চলেনি)।
 */
export async function presentAutoSync(task: () => Promise<SyncReport>): Promise<SyncReport | null> {
  let report: SyncReport | null = null;
  const started = syncController.startAuto(async (onProgress) => {
    const t = new ProgressTracker(onProgress, 1, 'folders');
    t.setPhase('folders', 'ফোল্ডার পড়ে অ্যাপে আনা হচ্ছে');
    report = await task();
    if (report.error) throw new Error(report.error);
    t.finish();
    return {
      counts: { ...emptyCounts(), add: report.added, rename: report.renamed, delete: report.deleted, update: report.topicsUpdated },
      warnings: report.warnings,
    };
  });
  if (!started) return null;
  // উইন্ডো বন্ধ হওয়া পর্যন্ত অপেক্ষা নয়; কাজ শেষ হলেই ফল ফেরে
  return new Promise<SyncReport | null>((resolve) => {
    const off = syncController.subscribe(() => {
      const s = syncController.getState();
      if (s && (s.kind === 'result' || s.kind === 'error')) {
        off();
        resolve(report ?? { changed: false, added: 0, renamed: 0, deleted: 0, topicsUpdated: 0, warnings: [], error: s.kind === 'error' ? s.message : undefined });
      }
    });
  });
}
