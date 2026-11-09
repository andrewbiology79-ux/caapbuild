import { sameContent } from './hash';

/**
 * ধাপ ১.২ - data.json-এর কনফ্লিক্ট (ফোল্ডারের ফাইলও বদলেছে, অ্যাপেও বদল জমে আছে)।
 *
 * নিয়ম (সিদ্ধান্ত ১(৫)): ফোল্ডারের কপি চালু থাকে; অ্যাপের কপি Download/QB Collection/Conflicts/ ফোল্ডারে আলাদা রাখা হয়।
 * এই ফাইলে শুধু হিসাব (ডাটাবেস/Capacitor ছাড়া), তাই টেস্ট করা যায়। ফাইল লেখা writer.ts-এ।
 */

export const CONFLICTS_DIR = 'Conflicts';

export interface DataRow {
  mtime?: number;
  size?: number;
  sha256?: string;
}

export interface FileStat {
  mtime: number;
  size: number;
}

/** ফাইলের mtime/size সিঙ্ক-রেকর্ডের সাথে মিলছে না? (মিললে ফাইল আমাদের শেষ লেখাই - পড়ার দরকার নেই) */
export function fileLooksChanged(row: DataRow | undefined, file: FileStat | null): boolean {
  if (!row || !file) return false; // কোনো ভিত্তি নেই, বা ফাইলই নেই -> লেখাই মেরামত
  if (!row.mtime && !row.size) return false; // রেকর্ডে আসল মাপ ওঠেনি
  return row.mtime !== file.mtime || row.size !== file.size;
}

/**
 * data.json লেখার আগের সিদ্ধান্ত:
 *  'write'    - লেখা নিরাপদ (ফাইল আমাদের শেষ কপিই, বা শুধু "ছোঁয়া", বা যা লিখব ফাইলে তা-ই আছে)
 *  'conflict' - ফাইল অন্যভাবে বদলেছে; ওভাররাইট করলে সেই বদল হারাবে -> অ্যাপের কপি Conflicts/-এ রাখো
 * fileSha/newSha: ফাইলের বর্তমান লেখা ও যা লিখতে যাচ্ছি তার SHA-256 (না পেলে undefined - তখন নিশ্চিত হওয়া যায় না,
 * তাই কনফ্লিক্ট ধরা হয়; হারানোর চেয়ে বাড়তি কপি ভালো)।
 */
export function decideDataWrite(
  row: DataRow | undefined,
  file: FileStat | null,
  fileSha: string | undefined,
  newSha: string | undefined
): 'write' | 'conflict' {
  if (!fileLooksChanged(row, file)) return 'write';
  if (sameContent(newSha, fileSha)) return 'write'; // ফাইলে ঠিক এই লেখাই আছে - কিছু হারাবে না
  if (sameContent(row?.sha256, fileSha)) return 'write'; // লেখা আমাদের শেষ কপির মতোই; শুধু mtime বদলেছে
  return 'conflict';
}

/** ফাইলের নামে ব্যবহারযোগ্য সময়চিহ্ন (যেমন 2026-11-09T10-20-30-123Z) */
export function conflictStamp(d: Date = new Date()): string {
  return d.toISOString().replace(/[:.]/g, '-');
}

/** Conflicts/ ফোল্ডারের ফাইলের নাম: <সময়>_<নাম>.json (নামে অচল চিহ্ন বদলে যায়, লম্বা হলে ছোট) */
export function conflictFileName(stamp: string, label: string): string {
  let n = (label || '')
    .replace(/[\\/:*?"<>|\r\n\t]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '');
  // বাংলা অক্ষর ৩ বাইট; ফাইলের নাম ২৫৫ বাইটের নিচে রাখা
  while (new TextEncoder().encode(n).length > 120 && n.length > 1) n = n.slice(0, -1);
  n = n.trim() || 'নামহীন';
  return `${stamp}_${n}.json`;
}
