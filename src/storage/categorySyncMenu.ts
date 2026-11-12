import { syncUnavailableReason } from './syncView';
import type { CategoryStartResult, CategorySyncControllerDeps } from './categorySyncController';
import { CATEGORY_BUSY_REASON } from './categorySyncView';

/**
 * অংশ ১গ-২খ - Create ৩-ডট মেনুর "ফোল্ডার থেকে ক্যাটাগরি সিঙ্ক করুন" ট্যাপের খাঁটি সিদ্ধান্ত (IO/React নেই, টেস্টযোগ্য)।
 * ফেরত: null = উইন্ডো শুরু হয়েছে; নইলে টোস্টে দেখানোর কারণ। মেনু আইটেম লুকানো থাকে না - না চললে কারণ জানানো হয়।
 */

export const CATEGORY_MENU_LABEL = 'ফোল্ডার থেকে ক্যাটাগরি সিঙ্ক করুন';
export const CATEGORY_MENU_ID = 'sync-category-folder-to-app';

export function categoryMenuTap(opts: { native: boolean; enabled: boolean; start: () => CategoryStartResult }): string | null {
  const why = syncUnavailableReason(opts.native, opts.enabled);
  if (why) return why;
  const r = opts.start();
  return r.started ? null : r.reason;
}

/** ডিফল্টের busyReason-এর ওপর "পুরনো সিঙ্ক উইন্ডো খোলা" পরীক্ষা যোগ (পুরনো উইন্ডো আগে দেখা হয়) */
export function withOtherWindowCheck(base: CategorySyncControllerDeps, otherWindowOpen: () => boolean): CategorySyncControllerDeps {
  return {
    ...base,
    busyReason: () => (otherWindowOpen() ? CATEGORY_BUSY_REASON : base.busyReason?.() ?? null),
  };
}
