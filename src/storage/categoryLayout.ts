import type { Paper, PaperEdits, Category } from '../db/db';
import { QB_ROOT } from '../utils/storageAccess';
import { FOLDER_META, UNNECESSARY_DIR, sanitizeFolderName, isSystemFileName, isReservedDirName } from './folderLayout';
export { sanitizeFolderName };
import { stableStringify } from './syncCompare';

/**
 * ধাপ ১ - ক্যাটেগরি ফোল্ডারের নকশা (কোনো ফাইল/ডেটাবেস IO নেই; সবই খাঁটি ফাংশন)।
 *
 *  Download/QB Collection/Category/
 *     <ক্যাটেগরির নাম>/   .folder.json   +   <প্রশ্নপত্রের নাম>.json  (একটি প্রশ্নপত্র = একটি ফাইল)
 *     unnecessary/        (অ্যাপ যা চেনে না তা এখানে সরে যায়; স্ক্যানার এই ফোল্ডার দেখে না)
 *
 * Question_Bank-এর মতোই: ক্যাটেগরি ফোল্ডারে লুকানো ".folder.json" (id, name, order) থাকে, প্রশ্নপত্রের ফাইলের
 * ভেতরে নিজের id থাকে - তাই ফাইল ম্যানেজারে নাম বদলালে বা সরালেও অ্যাপ একই জিনিস বলে চেনে।
 *
 * সিঙ্কের "কোনটা কী অবস্থায় লেখা হয়েছিল" মনে রাখা হয় db.meta টেবিলে (key = CATEGORY_SYNC_META_KEY)।
 * db.syncState ব্যবহার করা হয় না: Question_Bank-এর স্ক্যানার সেই টেবিলের সব সারিকে নিজের ফোল্ডার ধরে নেয়,
 * তাই ক্যাটেগরির সারি সেখানে থাকলে সেগুলো "মুছে গেছে" ধরা পড়ত।
 */

export const CATEGORY_ROOT = `${QB_ROOT}/Category`;
export const PAPER_FILE_EXT = '.json';
export const PAPER_FILE_TYPE = 'qb-paper';
export const PAPER_FILE_VERSION = 1;
export const CATEGORY_META_KIND = 'category';
export const CATEGORY_SYNC_META_KEY = 'categorySyncState';

/** api.ts-এর UNCATEGORIZED_NAME-এর সঙ্গে হুবহু এক থাকতে হবে */
export const UNCATEGORIZED_CATEGORY_NAME = 'অশ্রেণিবদ্ধ';

export const isUncategorizedName = (name: string | undefined | null): boolean =>
  (name ?? '').trim() === UNCATEGORIZED_CATEGORY_NAME;

/* ------------------------------------------------------------------
 * Types
 * ---------------------------------------------------------------- */

/** ক্যাটেগরি ফোল্ডারের ভেতরের ".folder.json" */
export interface CategoryFolderMeta {
  id: string;
  kind: 'category';
  name: string;
  order: number;
}

/** ফাইলে যা থাকে (ক্যাটেগরি এখানে নেই - ক্যাটেগরি ঠিক হয় ফাইল কোন ফোল্ডারে আছে তা দিয়ে) */
export type ParsedPaper = Omit<Paper, 'category' | 'categoryId'>;

export interface PaperFileData extends ParsedPaper {
  type: typeof PAPER_FILE_TYPE;
  version: number;
}

export type ParsePaperResult = { ok: true; paper: ParsedPaper } | { ok: false; reason: string };

/** অ্যাপ শেষবার ফোল্ডারে যা লিখেছিল/পড়েছিল (db.meta-তে এক টুকরো JSON) */
export interface CategorySyncState {
  version: 1;
  /** ক্যাটেগরির id -> ডিস্কের আসল ফোল্ডারের নাম */
  categories: Record<string, { dirName: string }>;
  /** প্রশ্নপত্রের id -> কোন ক্যাটেগরির কোন ফাইলে কী অবস্থায় (mtime/size) লেখা আছে */
  papers: Record<string, { categoryId: string; fileName: string; mtime: number; size: number }>;
}

export function emptyCategorySyncState(): CategorySyncState {
  return { version: 1, categories: {}, papers: {} };
}

/** db.meta থেকে পড়া মান ভাঙা/অন্য রকম হলেও খালি অবস্থা ফেরত দেয় */
export function normalizeCategorySyncState(v: any): CategorySyncState {
  const out = emptyCategorySyncState();
  if (!v || typeof v !== 'object') return out;
  if (v.categories && typeof v.categories === 'object') {
    for (const [id, r] of Object.entries<any>(v.categories)) {
      if (r && typeof r.dirName === 'string' && r.dirName) out.categories[id] = { dirName: r.dirName };
    }
  }
  if (v.papers && typeof v.papers === 'object') {
    for (const [id, r] of Object.entries<any>(v.papers)) {
      if (r && typeof r.categoryId === 'string' && typeof r.fileName === 'string' && r.fileName) {
        out.papers[id] = {
          categoryId: r.categoryId,
          fileName: r.fileName,
          mtime: Number.isFinite(r.mtime) ? r.mtime : 0,
          size: Number.isFinite(r.size) ? r.size : 0,
        };
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------
 * Paths and names
 * ---------------------------------------------------------------- */

export function categoryDirPath(dirName: string): string {
  return `${CATEGORY_ROOT}/${dirName}`;
}

export function paperFilePath(dirName: string, fileName: string): string {
  return `${CATEGORY_ROOT}/${dirName}/${fileName}`;
}

export function categoryMetaPath(dirName: string): string {
  return `${CATEGORY_ROOT}/${dirName}/${FOLDER_META}`;
}

/** unnecessary/ ফোল্ডারে সরার পূর্ণ পথ: Category/<owner>/unnecessary/<name> (owner খালি হলে Category/unnecessary/<name>) */
export function categoryUnnecessaryPath(ownerDir: string, name: string): string {
  return [CATEGORY_ROOT, ownerDir, UNNECESSARY_DIR, name].filter(Boolean).join('/');
}

/** প্রশ্নপত্রের ফাইল কি (সিস্টেম ফাইল/.tmp/.bak নয়, শেষে .json) */
export function isPaperFileName(name: string): boolean {
  return !isSystemFileName(name) && name.toLowerCase().endsWith(PAPER_FILE_EXT);
}

/** "নাম (2).json" -> "নাম" */
export function paperFileBase(fileName: string): string {
  const noExt = fileName.toLowerCase().endsWith(PAPER_FILE_EXT) ? fileName.slice(0, -PAPER_FILE_EXT.length) : fileName;
  return noExt.replace(/ \(\d+\)$/, '');
}

/** প্রশ্নপত্রের নাম থেকে ফাইলের নাম (.json ছাড়া অংশ নিরাপদ করা হয়) */
export function paperFileStem(shortName: string): string {
  return sanitizeFolderName(shortName);
}

/**
 * এখনো ব্যবহার হয়নি এমন ফাইলের নাম: "নাম.json", "নাম (2).json", "নাম (3).json" ...
 * takenLower = ওই ফোল্ডারে যেসব নাম আছে (ছোট হাতের অক্ষরে)।
 */
export function paperFileNameFor(shortName: string, takenLower: Set<string>): string {
  const stem = paperFileStem(shortName);
  for (let i = 1; i < 500; i++) {
    const cand = `${i === 1 ? stem : `${stem} (${i})`}${PAPER_FILE_EXT}`;
    if (!takenLower.has(cand.toLowerCase())) return cand;
  }
  return `${stem} (${Date.now()})${PAPER_FILE_EXT}`;
}

/** ক্যাটেগরির জন্য ফোল্ডারের নাম ("unnecessary" নামটা নেওয়া যাবে না) */
export function categoryDirNameFor(name: string, takenLower: Set<string>): string {
  const stem = sanitizeFolderName(name);
  for (let i = 1; i < 500; i++) {
    const cand = i === 1 ? stem : `${stem} (${i})`;
    if (takenLower.has(cand.toLowerCase()) || isReservedDirName(cand)) continue;
    return cand;
  }
  return `${stem} (${Date.now()})`;
}

/* ------------------------------------------------------------------
 * Folder meta (.folder.json of a category folder)
 * ---------------------------------------------------------------- */

export function categoryMetaOf(cat: Pick<Category, 'id' | 'name' | 'order'>): CategoryFolderMeta {
  return { id: cat.id, kind: CATEGORY_META_KIND, name: cat.name, order: Number.isFinite(cat.order) ? cat.order : 0 };
}

export function categoryMetaToText(cat: Pick<Category, 'id' | 'name' | 'order'>): string {
  return JSON.stringify(categoryMetaOf(cat));
}

export function parseCategoryMeta(text: string | undefined | null): CategoryFolderMeta | null {
  if (!text) return null;
  try {
    const m = JSON.parse(text);
    if (m && typeof m.id === 'string' && m.id && m.kind === CATEGORY_META_KIND) {
      return {
        id: m.id,
        kind: CATEGORY_META_KIND,
        name: typeof m.name === 'string' ? m.name : '',
        order: Number.isFinite(Number(m.order)) ? Number(m.order) : 0,
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/* ------------------------------------------------------------------
 * Paper file (one JSON file per paper)
 * ---------------------------------------------------------------- */

const cleanEdits = (e: PaperEdits | undefined | null): PaperEdits | undefined => {
  if (!e || typeof e !== 'object') return undefined;
  const out: PaperEdits = {};
  if (e.questions && typeof e.questions === 'object' && Object.keys(e.questions).length > 0) out.questions = e.questions;
  if (e.stimuli && typeof e.stimuli === 'object' && Object.keys(e.stimuli).length > 0) out.stimuli = e.stimuli;
  return out.questions || out.stimuli ? out : undefined;
};

/** অ্যাপের প্রশ্নপত্র -> ফাইলে যে রূপে থাকবে (ক্যাটেগরির তথ্য বাদ; খালি edits বাদ) */
export function normalizePaper(p: Paper | ParsedPaper): ParsedPaper {
  const out: ParsedPaper = {
    id: p.id,
    shortName: p.shortName,
    createdAt: p.createdAt,
    title: p.title ?? '',
    questionIds: Array.isArray(p.questionIds) ? p.questionIds.filter((x) => typeof x === 'string') : [],
  };
  if (typeof p.subjectLine === 'string') out.subjectLine = p.subjectLine;
  if (typeof p.note === 'string') out.note = p.note;
  if (typeof p.duration === 'string' || typeof p.duration === 'number') out.duration = p.duration;
  if (typeof p.totalMarks === 'number' && Number.isFinite(p.totalMarks)) out.totalMarks = p.totalMarks;
  if (typeof p.order === 'number' && Number.isFinite(p.order)) out.order = p.order;
  const edits = cleanEdits(p.edits);
  if (edits) out.edits = edits;
  return out;
}

export function paperToFileData(p: Paper | ParsedPaper): PaperFileData {
  return { type: PAPER_FILE_TYPE, version: PAPER_FILE_VERSION, ...normalizePaper(p) };
}

export function paperToText(p: Paper | ParsedPaper): string {
  return JSON.stringify(paperToFileData(p), null, 2);
}

/** দুই প্রশ্নপত্রের বিষয়বস্তু এক কি না (key-এর ক্রম/undefined গুরুত্বহীন; ক্যাটেগরি ধরা হয় না) */
export function paperContentKey(p: Paper | ParsedPaper): string {
  return stableStringify(JSON.parse(JSON.stringify(normalizePaper(p))));
}

export function samePaperContent(a: Paper | ParsedPaper, b: Paper | ParsedPaper): boolean {
  return paperContentKey(a) === paperContentKey(b);
}

/**
 * ফাইলের লেখা -> প্রশ্নপত্র। ভুল/ভাঙা হলে ok:false ও কারণ (কিছু মোছা/বদলানো হয় না, শুধু সতর্কতা)।
 * fallbackCreatedAt: হাতে লেখা ফাইলে createdAt না থাকলে এই মান বসে (সাধারণত ফাইলের mtime)।
 */
export function parsePaperFile(text: string | null | undefined, fallbackCreatedAt = 0): ParsePaperResult {
  if (text === null || text === undefined || !text.trim()) return { ok: false, reason: 'ফাইল খালি' };
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'JSON ঠিক নেই' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'প্রশ্নপত্রের ফাইল নয়' };
  if (raw.type !== undefined && raw.type !== PAPER_FILE_TYPE) return { ok: false, reason: 'প্রশ্নপত্রের ফাইল নয়' };
  if (Number.isFinite(Number(raw.version)) && Number(raw.version) > PAPER_FILE_VERSION) {
    return { ok: false, reason: 'ফাইলটি অ্যাপের চেয়ে নতুন ভার্সনের' };
  }
  if (typeof raw.id !== 'string' || !raw.id.trim()) return { ok: false, reason: 'id নেই' };
  if (raw.questionIds !== undefined && !Array.isArray(raw.questionIds)) return { ok: false, reason: 'questionIds তালিকা নয়' };

  const title = typeof raw.title === 'string' ? raw.title : '';
  const shortName = typeof raw.shortName === 'string' && raw.shortName.trim() ? raw.shortName.trim() : title.trim() || 'নামহীন';
  const createdAt = Number.isFinite(Number(raw.createdAt)) && Number(raw.createdAt) > 0 ? Number(raw.createdAt) : fallbackCreatedAt;

  const paper: ParsedPaper = {
    id: raw.id.trim(),
    shortName,
    createdAt,
    title,
    questionIds: (raw.questionIds ?? []).filter((x: any) => typeof x === 'string'),
  };
  if (typeof raw.subjectLine === 'string') paper.subjectLine = raw.subjectLine;
  if (typeof raw.note === 'string') paper.note = raw.note;
  if (typeof raw.duration === 'string' || (typeof raw.duration === 'number' && Number.isFinite(raw.duration))) {
    paper.duration = raw.duration;
  }
  if (typeof raw.totalMarks === 'number' && Number.isFinite(raw.totalMarks)) paper.totalMarks = raw.totalMarks;
  if (typeof raw.order === 'number' && Number.isFinite(raw.order)) paper.order = raw.order;
  const edits = cleanEdits(raw.edits);
  if (edits) paper.edits = edits;
  return { ok: true, paper };
}
