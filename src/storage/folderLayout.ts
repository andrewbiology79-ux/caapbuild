import type { CqScope, QbDatabase } from '../db/db';
import { QB_ROOT } from '../utils/storageAccess';

/**
 * Folder layout of the question bank inside the phone storage:
 *
 *  Download/QB Collection/Question_Bank/
 *     Type_CQ/<subject>/<chapter>/<type>/   data.json  +  media/
 *     Chapter_CQ/<subject>/<chapter>/       data.json  +  media/
 *
 * Every subject / chapter / type folder also holds a small hidden ".folder.json" (id, name, order),
 * so a folder that is renamed or moved in the file manager is still recognised as the same item.
 */

export const QUESTION_BANK_ROOT = `${QB_ROOT}/Question_Bank`;
export const FOLDER_META = '.folder.json';
export const DATA_FILE = 'data.json';
export const MEDIA_DIR = 'media';
export const NOMEDIA_FILE = '.nomedia';
/** অপ্রয়োজনীয় (অ্যাপ যা চেনে না) জিনিস এই নামের ফোল্ডারে সরে যায়; স্ক্যানার এই ফোল্ডার দেখে না */
export const UNNECESSARY_DIR = 'unnecessary';

export const isReservedDirName = (name: string): boolean => name.trim().toLowerCase() === UNNECESSARY_DIR;

/** সিস্টেমের/লেখার সময়ের ফাইল (.folder.json, .nomedia, data.json.tmp, data.json.bak ...) - এগুলো কখনো "বাড়তি" নয় */
export function isSystemFileName(name: string): boolean {
  return name.startsWith('.') || /\.(tmp|bak)$/i.test(name);
}

export type FolderKind = 'subject' | 'chapter' | 'topic';

export interface FolderMeta {
  id: string;
  kind: FolderKind;
  name: string;
  order: number;
}

export function scopeRoot(scope: CqScope): string {
  return `${QUESTION_BANK_ROOT}/${scope === 'chapter' ? 'Chapter_CQ' : 'Type_CQ'}`;
}

/** Depth (number of folder levels below the scope root) of each kind */
export function kindOfDepth(scope: CqScope, depth: number): FolderKind | null {
  if (depth === 1) return 'subject';
  if (depth === 2) return 'chapter';
  if (depth === 3 && scope === 'type') return 'topic';
  return null;
}

const MAX_DIR_BYTES = 200; // file systems allow 255 bytes; Bengali letters take 3 bytes each

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Turn an item name into a safe folder name */
export function sanitizeFolderName(name: string): string {
  let n = (name || '')
    .replace(/[\\/:*?"<>|\r\n\t]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '') // a leading dot would hide the folder
    .replace(/[. ]+$/, '');
  while (byteLength(n) > MAX_DIR_BYTES && n.length > 1) n = n.slice(0, -1);
  n = n.trim();
  return n || 'নামহীন';
}

/** "পদার্থ (2)" -> "পদার্থ" */
export function baseOfDirName(dirName: string): string {
  return dirName.replace(/ \(\d+\)$/, '');
}

/** App item name that is free among its siblings: "নাম" -> "নাম (2)" -> "নাম (3)" (case-insensitive, pure) */
export function uniqueAppName(desired: string, siblingNames: string[]): string {
  const taken = new Set(siblingNames.map((n) => n.toLowerCase()));
  if (!taken.has(desired.toLowerCase())) return desired;
  for (let i = 2; i < 500; i++) {
    const cand = `${desired} (${i})`;
    if (!taken.has(cand.toLowerCase())) return cand;
  }
  return `${desired} (${Date.now()})`;
}

/** Choose a folder name that is not used yet ("নাম", "নাম (2)", "নাম (3)" ...) */
export async function pickDirName(
  desired: string,
  taken: Set<string>,
  existsOnDisk?: (candidate: string) => Promise<boolean>
): Promise<string> {
  const takenLower = new Set(Array.from(taken).map((t) => t.toLowerCase()));
  takenLower.add(UNNECESSARY_DIR); // এই নামে কোনো বিষয়/অধ্যায়/টাইপের ফোল্ডার হবে না
  for (let i = 1; i < 500; i++) {
    const cand = i === 1 ? desired : `${desired} (${i})`;
    if (takenLower.has(cand.toLowerCase())) continue;
    if (existsOnDisk && (await existsOnDisk(cand))) continue;
    return cand;
  }
  return `${desired} (${Date.now()})`;
}

export function scopeOfDb(sdb: QbDatabase, chapterDb: QbDatabase): CqScope {
  return sdb === chapterDb ? 'chapter' : 'type';
}

/**
 * Real folder path of a subject / chapter / topic (from the folder rows kept in syncState).
 * In Chapter CQ the hidden default topic has no folder of its own - it lives in the chapter folder.
 * Returns null while the item has no folder yet.
 */
export async function entityPath(sdb: QbDatabase, scope: CqScope, id: string): Promise<string | null> {
  const parts: string[] = [];
  let cur = await sdb.syncState.get(id);
  let guard = 0;
  while (guard++ < 6) {
    if (!cur || cur.kind === 'data') return null;
    if (cur.dirName) parts.unshift(cur.dirName);
    if (cur.kind === 'subject') return [scopeRoot(scope), ...parts].join('/');
    if (!cur.parentId) return null;
    cur = await sdb.syncState.get(cur.parentId);
  }
  return null;
}

export function mediaDirOf(topicDir: string): string {
  return `${topicDir}/${MEDIA_DIR}`;
}

export function imageFileName(imageId: string): string {
  return `${imageId}.webp`;
}

export function imageIdFromFileName(fileName: string): string | null {
  const m = fileName.match(/^(.+)\.(webp|png|jpe?g|gif)$/i);
  return m ? m[1] : null;
}
