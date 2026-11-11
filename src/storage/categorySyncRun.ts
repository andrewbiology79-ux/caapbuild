import { pathExists, makeDir, renamePath, writeText } from './nativeStore';
import { withSyncLock } from './syncLock';
import { isSyncPaused, announceSyncChanged } from './syncEngine';
import { autoSyncStore } from './autoSyncStatus';
import type { ProgressCallback, SyncProgress } from './syncProgress';
import { applyCategoriesFromFolder, previewCategoriesFromFolder, type CategoryPreview } from './categoryScanner';
import { moveCategoryExtras, type ExtraMoveFs } from './categoryExtrasMove';
import { CategoryRunError, type CategoryRunOutcome, type CategorySyncControllerDeps } from './categorySyncController';

/**
 * অংশ ১গ-২ক - নিশ্চিত করা প্রিভিউ অনুযায়ী আসল কাজ (ফোল্ডার -> অ্যাপ, ক্যাটেগরি)।
 *
 *  ১) applyCategoriesFromFolder: ফোল্ডার ও অ্যাপ আবার পড়ে প্রিভিউয়ের ছাপ মেলায়, তারপর একটাই transaction-এ অ্যাপে প্রয়োগ।
 *     ব্যর্থ হলে (ছাপ না মেলা, massDelete অনিশ্চিত, ডেটাবেস ত্রুটি) অ্যাপের ডেটা অক্ষত - transaction ফিরে যায়।
 *  ২) বাড়তি জিনিস (CategoryExtra) নিজের ক্যাটেগরি ফোল্ডারের unnecessary/-তে সরানো - কখনো মোছা নয়।
 *     প্রয়োগ সফল হওয়ার পরেই (প্রয়োগ থামলে ফোল্ডারে কিছুই সরে না)। একটা সরানো ব্যর্থ হলে সতর্কতা, বাকিরা চলে।
 */

/** nativeStore-এর সাথে জোড়া ফাইল-সিস্টেম (সরানোর খাঁটি অংশ categoryExtrasMove.ts-এ) */
export const nativeExtraFs: ExtraMoveFs = { pathExists, makeDir, renamePath, writeText };

/** উপ-কাজের প্রগ্রেস পুরো বারের [lo, hi] অংশে বসানো (বার পিছোয় না); ১০০% শুধু শেষে */
export function scaleProgress(cb: ProgressCallback, lo: number, hi: number): ProgressCallback {
  return (p: SyncProgress) => cb({ ...p, percent: Math.min(hi, lo + Math.floor((p.percent / 100) * (hi - lo))), finished: false });
}

const APPLY_SHARE = 85;

export async function runCategorySync(
  preview: CategoryPreview,
  opts: { massDeleteConfirmed: boolean },
  onProgress: ProgressCallback
): Promise<CategoryRunOutcome> {
  if (isSyncPaused()) throw new CategoryRunError('বড় ইমপোর্ট/রিস্টোর চলছে, শেষ হলে আবার চেষ্টা করুন', true, 'শুরু');

  const extras = preview.result.extras;
  let applied: Awaited<ReturnType<typeof applyCategoriesFromFolder>>;
  try {
    applied = await applyCategoriesFromFolder(preview, {
      massDeleteConfirmed: opts.massDeleteConfirmed,
      onProgress: scaleProgress(onProgress, 0, extras.length ? APPLY_SHARE : 99),
    });
  } catch (err: any) {
    // ছাপ না মেলা / massDelete অনিশ্চিত / ডেটাবেস transaction ব্যর্থ: কিছুই বদলায়নি
    throw new CategoryRunError(err?.message || String(err), true, 'অ্যাপে প্রয়োগ');
  }

  const warnings = [...applied.warnings];
  let extrasMoved: boolean[] = extras.map(() => false);
  if (extras.length) {
    try {
      let done = 0;
      const mv = await withSyncLock(() =>
        moveCategoryExtras(extras, nativeExtraFs, (label) => {
          done++;
          onProgress({
            phase: 'tidy',
            done,
            total: extras.length,
            label,
            percent: Math.min(99, APPLY_SHARE + Math.floor((done / extras.length) * (99 - APPLY_SHARE))),
            finished: false,
          });
        })
      );
      extrasMoved = mv.moved;
      for (const f of mv.failures) warnings.push(`অপ্রয়োজনীয় জিনিস সরানো যায়নি - ${f.message}`);
    } catch (err: any) {
      // অ্যাপে প্রয়োগ হয়ে গেছে; সরানো না গেলে শুধু সতর্কতা (জিনিসগুলো যেখানে ছিল সেখানেই আছে)
      warnings.push(`অপ্রয়োজনীয় জিনিস সরানো যায়নি: ${err?.message || String(err)}`);
    }
  }

  onProgress({ phase: 'finish', done: 1, total: 1, percent: 100, finished: true });
  return { counts: applied.counts, warnings, bankMissing: applied.bankMissing, queuedWrites: applied.queuedWrites, extrasMoved };
}

export const defaultCategorySyncDeps: CategorySyncControllerDeps = {
  preview: (deleteMode, onProgress) => previewCategoriesFromFolder({ onProgress, deleteMode }),
  run: runCategorySync,
  // অটো সিঙ্ক (ব্যানার) চললে শুরু হয় না; অন্য সিঙ্ক উইন্ডোর পরীক্ষা ২খ-তে (দুই নিয়ন্ত্রক একসাথে দেখে এমন জায়গায়)
  busyReason: () => (autoSyncStore.isRunning() ? 'অটো সিঙ্ক চলছে, শেষ হলে আবার চেষ্টা করুন' : null),
  onClosedResult: () => announceSyncChanged(),
};
