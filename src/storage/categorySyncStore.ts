import { useSyncExternalStore } from 'react';
import { createCategorySyncController } from './categorySyncController';
import { defaultCategorySyncDeps } from './categorySyncRun';
import type { CategoryDialogState } from './categorySyncView';
import { withOtherWindowCheck } from './categorySyncMenu';
import { syncController, setCategoryOpenProbe, updateManualSyncActive } from './syncDialogStore';

/**
 * অংশ ১গ-২খ - অ্যাপের একটাই "ফোল্ডার থেকে ক্যাটাগরি সিঙ্ক" নিয়ন্ত্রক।
 * মেনু (Create) এটাকেই ডাকে; উইন্ডো (SyncRunner-এ মাউন্ট) এটাই দেখায়।
 * পুরনো Question_Bank সিঙ্ক উইন্ডো খোলা থাকলে এটা শুরু হয় না (বার্তা আসে), উল্টোটাও (syncDialogStore-এর busy)।
 */

export const categorySyncController = createCategorySyncController(
  withOtherWindowCheck(defaultCategorySyncDeps, () => syncController.getState() !== null)
);

// পুরনো সিঙ্ক ও অটো সিঙ্ক এই উইন্ডোর খোলা থাকা দেখতে পায়
setCategoryOpenProbe(() => categorySyncController.getState() !== null);
categorySyncController.subscribe(updateManualSyncActive);

export function useCategoryDialogState(): CategoryDialogState | null {
  return useSyncExternalStore(categorySyncController.subscribe, categorySyncController.getState, categorySyncController.getState);
}
