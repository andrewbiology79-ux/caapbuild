import { useSyncExternalStore } from 'react';
import { createSyncController } from './syncController';
import { defaultSyncDeps } from './syncRun';
import { setManualSyncActive, type SyncReport } from './syncEngine';
import { autoSyncStore } from './autoSyncStatus';
import type { SyncDialogState } from './syncView';

/**
 * ক্যাটেগরি সিঙ্ক উইন্ডো খোলা কি না - categorySyncStore.ts নিজেকে এখানে নিবন্ধন করে (এক দিকের import, চক্র নয়)।
 * খোলা থাকলে পুরনো সিঙ্ক উইন্ডো ও অটো সিঙ্ক শুরু হয় না, আর অটো-ব্যাকআপ চুপ থাকে।
 */
let categoryOpenProbe: () => boolean = () => false;
export function setCategoryOpenProbe(fn: () => boolean): void {
  categoryOpenProbe = fn;
}
export function isCategoryWindowOpen(): boolean {
  return categoryOpenProbe();
}

/** অ্যাপের একটাই সিঙ্ক নিয়ন্ত্রক: সব স্ক্রিনের মেনু এটাকেই ডাকে, উইন্ডো (SyncRunner-এ মাউন্ট) এটাই দেখায় */
export const syncController = createSyncController({ ...defaultSyncDeps, busy: () => categoryOpenProbe() });

export function useSyncDialogState(): SyncDialogState | null {
  return useSyncExternalStore(syncController.subscribe, syncController.getState, syncController.getState);
}

// কোনো সিঙ্ক উইন্ডো (Question_Bank বা ক্যাটেগরি) খোলা থাকলে (হিসাব/প্রিভিউ/চলা/ফল) অটো সিঙ্ক চুপ থাকে
export function updateManualSyncActive(): void {
  setManualSyncActive(syncController.getState() !== null || categoryOpenProbe());
}
syncController.subscribe(updateManualSyncActive);

/**
 * অটো সিঙ্ক (অ্যাপ খোলা / সামনে আসা / ওয়াচার): পুরো উইন্ডো নয়, রিবনের নিচে ছোট "অটো সিঙ্ক হচ্ছে…" লেখা।
 * মেনুর সিঙ্ক উইন্ডো খোলা থাকলে বা আরেকটা অটো সিঙ্ক চললে null (সিঙ্ক চলেনি)।
 * অটো সিঙ্ক নিজে কিছু সরায় না; কনফ্লিক্ট/বাড়তি জিনিস মেনু থেকে সিঙ্ক করলে সরে।
 */
export async function presentAutoSync(task: () => Promise<SyncReport>): Promise<SyncReport | null> {
  if (syncController.getState() !== null || categoryOpenProbe() || autoSyncStore.isRunning()) return null;
  autoSyncStore.start();
  try {
    const report = await task();
    if (report.error) autoSyncStore.fail();
    else autoSyncStore.finish(report.changed);
    return report;
  } catch (err) {
    autoSyncStore.fail();
    throw err;
  }
}
