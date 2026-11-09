import { getDb, type CqScope } from '../db/db';
import { runAutoBackup } from './autoBackup';
import {
  restoreAppBackup,
  executeCollectionImport,
  type RestoreMode,
  type BackupFileInfo,
  type CollectionJsonSchema,
  type ImportOptions,
} from './collectionTransfer';
import { ensureSafetyBackupWith, type SafetyBackupDeps, type SafetyBackupOutcome } from './safetyBackup';

/**
 * ধাপ ১.৪ - রিস্টোর ও Replace-ইমপোর্ট এই দুই ফাংশন দিয়ে চালাতে হবে (UI সরাসরি
 * restoreAppBackup / executeCollectionImport ডাকবে না)। আগে নিরাপত্তা ব্যাকআপ, তারপর কাজ;
 * ব্যাকআপ না হলে কাজ শুরুই হয় না (SafetyBackupError)। নিয়ম: safetyBackup.ts।
 */

/** ক্যাটেগরি বাদ: ডিফল্ট ক্যাটেগরি সবসময় তৈরি থাকে (ensureDefaultCategories), তাই ওটা ব্যবহারকারীর ডেটা নয় */
async function dbHasUserData(): Promise<boolean> {
  const scopes: CqScope[] = ['type', 'chapter'];
  for (const scope of scopes) {
    const d = getDb(scope);
    const counts = await Promise.all([
      d.subjects.count(),
      d.chapters.count(),
      d.topics.count(),
      d.stimuli.count(),
      d.questions.count(),
      d.papers.count(),
      d.images.count(),
    ]);
    if (counts.some((n) => n > 0)) return true;
  }
  return false;
}

const realDeps: SafetyBackupDeps = {
  runBackup: (reason) => runAutoBackup(true, reason),
  hasUserData: dbHasUserData,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export function ensureSafetyBackup(reason: string): Promise<SafetyBackupOutcome> {
  return ensureSafetyBackupWith(realDeps, reason);
}

/** পর্দায় অবস্থা জানানোর জন্য (যেমন টোস্ট) */
export type SafetyStatus = (text: string) => void;

function lastSegment(path: string): string {
  return path.split('/').pop() || path;
}

async function backupFirst(reason: string, onStatus?: SafetyStatus): Promise<void> {
  onStatus?.('আগের ডেটার নিরাপত্তা ব্যাকআপ নেওয়া হচ্ছে… অপেক্ষা করুন');
  const out = await ensureSafetyBackup(reason);
  if (out.kind === 'done') onStatus?.(`আগের ডেটার ব্যাকআপ নেওয়া হয়েছে (${lastSegment(out.folder)})`);
}

/**
 * ব্যাকআপ ফাইল রিস্টোর (Replace বা Merge দুটোতেই আগে ব্যাকআপ - Merge শুধু যোগ করে, তবু নিরাপদ থাকতে)।
 * ফাইল বাছার সময়ই inspectBackupFile দিয়ে যাচাই হয়েছে, তাই খারাপ ফাইলের জন্য আলাদা ব্যাকআপ হয় না।
 */
export async function restoreAppBackupSafely(
  jsonText: string,
  mode: RestoreMode,
  onStatus?: SafetyStatus
): Promise<BackupFileInfo> {
  await backupFirst(`before-restore-${mode}`, onStatus);
  return restoreAppBackup(jsonText, mode);
}

/**
 * Type CQ / Chapter CQ ইমপোর্ট। শুধু Replace মোডে আগে ব্যাকআপ (প্ল্যান ১.৪)।
 * Merge মোডে ব্যাকআপ নেই - কিন্তু মনে রেখো: Merge-ও একই id-র বিদ্যমান প্রশ্ন/উদ্দীপক ফাইলের কপি দিয়ে
 * বদলে দেয় (bulkPut); সিদ্ধান্ত: Data_Safety_Plan "তোমার সিদ্ধান্ত লাগবে" ৮ নম্বর অংশ।
 */
export async function executeCollectionImportSafely(
  payload: CollectionJsonSchema,
  options: ImportOptions,
  scope: CqScope = 'type',
  onStatus?: SafetyStatus
): Promise<{ subjects: number; questions: number; images: number }> {
  if (options.mode === 'replace') await backupFirst('before-import-replace', onStatus);
  return executeCollectionImport(payload, options, scope);
}
