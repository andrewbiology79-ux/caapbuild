import type { CqScope } from '../db/db';
import type { SyncDirection, SyncPreview } from './syncPreview';
import { previewFolderToApp, previewAppToFolder } from './syncPreview';
import { ProgressTracker, type ProgressCallback } from './syncProgress';
import { emptyCounts, type SyncCounts } from './syncView';
import { countsFromPreview, type RunOutcome, type SyncControllerDeps } from './syncController';
import { moveConflicts } from './syncConflictMove';
import { syncNow, pauseSync, resumeSync, isSyncPaused, announceSyncChanged } from './syncEngine';
import { flushAllWrites, markEverythingDirty, pendingUnitCount } from './writer';
import { withSyncLock } from './syncLock';

/**
 * ধাপ ৫ - নিশ্চিত করা প্রিভিউ অনুযায়ী আসল সিঙ্ক।
 *
 *  ১) কনফ্লিক্ট আগে Sync_Conflicts/<stamp>/-এ সরে (মোছা নয়); ব্যর্থ আইটেম বাদ, বাকিরা চলে।
 *     আগে সরানোর কারণ: ফোল্ডার -> অ্যাপে কপি করা ফোল্ডার নতুন আইটেম হয়ে ঢুকত, আর অ্যাপ -> ফোল্ডারে অ্যাপ লেখার সময়
 *     বাইরে বদলানো data.json ঢেকে ফেলত (N1)।
 *  ২) ফোল্ডার -> অ্যাপ : স্ক্যান (প্রিভিউয়ের লাল নিশ্চিতকরণই মোছার নিশ্চিতকরণ - Q2)।
 *  ৩) অ্যাপ -> ফোল্ডার : অ্যাপের সবকিছু জোর করে ফোল্ডারে (তৈরি, নাম বদল, data.json, ছবি); প্রতিটি একক শেষে প্রগ্রেস।
 */

const SCOPES: CqScope[] = ['type', 'chapter'];

async function runFolderToApp(preview: SyncPreview, onProgress: ProgressCallback): Promise<RunOutcome> {
  if (isSyncPaused()) throw new Error('বড় ইমপোর্ট/রিস্টোর চলছে, শেষ হলে আবার চেষ্টা করুন');
  const t = new ProgressTracker(onProgress, preview.conflicts.length + 1, 'conflicts');
  const warnings: string[] = [];

  t.setPhase('conflicts');
  const mv = await withSyncLock(() => moveConflicts(preview.conflicts, (label) => t.step(1, label)));
  for (const f of mv.failures) warnings.push(`কনফ্লিক্ট সরানো যায়নি - ${f.message}`);

  t.setPhase('folders', 'ফোল্ডার পড়ে অ্যাপে আনা হচ্ছে');
  const r = await syncNow({ massDeleteConfirmed: !!preview.massDelete });
  if (r.error) throw new Error(r.error);
  t.step(1);
  warnings.push(...r.warnings);

  const counts: SyncCounts = { ...emptyCounts(), add: r.added, rename: r.renamed, delete: r.deleted, update: r.topicsUpdated };
  t.finish();
  return { counts, conflictsMoved: mv.moved, warnings };
}

async function runAppToFolder(preview: SyncPreview, onProgress: ProgressCallback): Promise<RunOutcome> {
  const t = new ProgressTracker(onProgress, preview.conflicts.length, 'conflicts');
  const warnings: string[] = [];
  pauseSync(); // চলার সময় অটো স্ক্যান ঢুকবে না
  let moved: boolean[] = [];
  try {
    t.setPhase('conflicts');
    const mv = await withSyncLock(() => moveConflicts(preview.conflicts, (label) => t.step(1, label)));
    moved = mv.moved;
    for (const f of mv.failures) warnings.push(`কনফ্লিক্ট সরানো যায়নি - ${f.message}`);

    for (const scope of SCOPES) await markEverythingDirty(scope);
    t.addTotal(Math.max(1, pendingUnitCount()));
    t.setPhase('data', 'ফোল্ডারে লেখা হচ্ছে (ফোল্ডার, data.json, ছবি)');
    await flushAllWrites(true, (label) => t.step(1, label, 'data'));
  } finally {
    resumeSync();
  }
  t.finish();
  return { counts: countsFromPreview(preview), conflictsMoved: moved, warnings };
}

export const defaultSyncDeps: SyncControllerDeps = {
  preview: (direction: SyncDirection, onProgress) =>
    direction === 'folder-to-app' ? previewFolderToApp(onProgress) : previewAppToFolder(onProgress),
  run: (direction, preview, onProgress) =>
    direction === 'folder-to-app' ? runFolderToApp(preview, onProgress) : runAppToFolder(preview, onProgress),
  onClosedResult: () => announceSyncChanged(),
};
