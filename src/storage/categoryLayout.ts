import type { Paper, PaperEdits, Category, Question, Stimulus } from '../db/db';
import { QB_ROOT } from '../utils/storageAccess';
import { FOLDER_META, DATA_FILE, MEDIA_DIR, UNNECESSARY_DIR, sanitizeFolderName, isReservedDirName, imageFileName } from './folderLayout';
import { stableStringify, collectImageIds } from './syncCompare';

/**
 * ধাপ ১ - ক্যাটেগরি ফোল্ডারের নকশা (কোনো ফাইল/ডেটাবেস IO নেই; সবই খাঁটি ফাংশন)।
 *
 *  Download/QB Collection/Category/
 *     <ক্যাটেগরির নাম>/   .folder.json  +  data.json  +  media/  (ছবি: <id>.webp, সাথে .nomedia)
 *     unnecessary/        (অ্যাপ যা চেনে না তা এখানে সরে যায়; স্ক্যানার এই ফোল্ডার দেখে না)
 *
 * একটা ক্যাটেগরির সব প্রশ্নপত্র একটাই data.json-এ থাকে (Type CQ-র টাইপ ফোল্ডারের data.json-এর মতো);
 * প্রতি প্রশ্নপত্রের আলাদা ফাইল বা ফোল্ডার নেই। data.json-এ প্রশ্নপত্রগুলোর সাথে তাতে ব্যবহৃত প্রশ্ন, উদ্দীপক ও
 * ছবির তালিকার কপি থাকে (প্রতিটার বিষয় > অধ্যায় > টপিকের পথসহ), যাতে প্রশ্নব্যাংকে না থাকলেও প্রশ্নপত্র পূর্ণ থাকে।
 *
 * Question_Bank-এর মতোই ক্যাটেগরি ফোল্ডারে লুকানো ".folder.json" (id, name, order) থাকে, প্রশ্নপত্রের ভেতরে নিজের id থাকে -
 * তাই ফাইল ম্যানেজারে নাম বদলালে বা সরালেও অ্যাপ একই জিনিস বলে চেনে।
 *
 * সিঙ্কের "কোনটা কী অবস্থায় লেখা হয়েছিল" মনে রাখা হয় db.meta টেবিলে (key = CATEGORY_SYNC_META_KEY)।
 * db.syncState ব্যবহার করা হয় না: Question_Bank-এর স্ক্যানার সেই টেবিলের সব সারিকে নিজের ফোল্ডার ধরে নেয়।
 */

export const CATEGORY_ROOT = `${QB_ROOT}/Category`;
export const CATEGORY_DATA_FILE = DATA_FILE;
export const CATEGORY_MEDIA_DIR = MEDIA_DIR;
export const CATEGORY_DATA_TYPE = 'qb-category';
export const CATEGORY_DATA_VERSION = 1;
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

/** প্রশ্নপত্রের ডেটা (ক্যাটেগরি এখানে নেই - ক্যাটেগরি ঠিক হয় data.json কোন ফোল্ডারে আছে তা দিয়ে) */
export type ParsedPaper = Omit<Paper, 'category' | 'categoryId'>;

/** প্রশ্নব্যাংকে প্রশ্নের আগের জায়গা (নাম দিয়ে - ফেরানোর সময় এই পথ আবার বানানো/খোঁজা হয়) */
export interface BankPath {
  scope: 'type' | 'chapter';
  subject: string;
  chapter: string;
  /** Chapter CQ-তে লুকানো ডিফল্ট টপিক: খালি */
  topic: string;
}

/** ব্যাংকের প্রশ্নের কপি (প্রশ্নপত্রে ব্যবহৃত) */
export interface CopiedQuestion {
  question: Question;
  path: BankPath;
}

/** ব্যাংকের উদ্দীপকের কপি (ব্যবহৃত প্রশ্নের উদ্দীপক) */
export interface CopiedStimulus {
  stimulus: Stimulus;
  path: BankPath;
}

export interface CategoryDataFile {
  type: typeof CATEGORY_DATA_TYPE;
  version: number;
  /** ক্যাটেগরির নাম/ক্রম (পড়ার সুবিধার জন্য; আসল পরিচয় .folder.json-এ) */
  category: { id: string; name: string; order: number };
  /** গণনা - হাতে বদলানো/অর্ধেক লেখা ফাইল ধরার জন্য */
  counts: { papers: number; questions: number; stimuli: number; images: number };
  papers: ParsedPaper[];
  questions: CopiedQuestion[];
  stimuli: CopiedStimulus[];
  /** media/ ফোল্ডারে যে ছবিগুলোর ফাইল থাকার কথা */
  images: Array<{ id: string; fileName: string }>;
}

export interface ParsedCategoryData {
  papers: ParsedPaper[];
  questions: CopiedQuestion[];
  stimuli: CopiedStimulus[];
  imageIds: string[];
  /** data.json-এর category অংশ (.folder.json-এর সাথে মেলানোর জন্য; আসল পরিচয় .folder.json-এর id) */
  category: { id: string; name: string; order: number };
  /** ফাইল পড়া গেছে কিন্তু কিছু অংশ বাদ পড়েছে/মেলেনি/সন্দেহজনক - এমন হলে মোছা বা বদলানো নিষিদ্ধ (শুধু নিরাপদ যোগ/হালনাগাদ চলে) */
  unsafe: boolean;
  /** বৈধ id আছে কিন্তু অন্য কারণে বাদ পড়া প্রশ্নপত্রের id (এগুলো \"ফাইলে নেই\" ধরে মোছা যাবে না) */
  skippedPaperIds: string[];
  /** সতর্কতা (কারণ সহ)। unsafe হলে অন্তত একটা সতর্কতা থাকে */
  warnings: string[];
}

/**
 * পড়ার ফল তিন রকম:
 *  ১) ok:true, unsafe:false           - সব স্কিমা ও গণনা ঠিক
 *  ২) ok:true, unsafe:true            - ডেটা দেখানো যায়, কিন্তু কিছু মোছা নিষিদ্ধ
 *  ৩) ok:false                        - ফাইল অগ্রহণযোগ্য; কোনো যোগ/বদল/মোছা নয়
 */
export type ParseCategoryDataResult = { ok: true; data: ParsedCategoryData } | { ok: false; reason: string };

/** অ্যাপ শেষবার ফোল্ডারে যা লিখেছিল/পড়েছিল (db.meta-তে এক টুকরো JSON) */
export interface CategorySyncState {
  version: 1;
  /** ক্যাটেগরির id -> ডিস্কের আসল ফোল্ডারের নাম + তার data.json শেষবার কী অবস্থায় ছিল (mtime/size) */
  categories: Record<string, { dirName: string; dataMtime?: number; dataSize?: number }>;
  /** প্রশ্নপত্রের id -> কোন ক্যাটেগরির data.json-এ লেখা আছে */
  papers: Record<string, { categoryId: string }>;
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
      if (r && typeof r.dirName === 'string' && r.dirName) {
        const row: CategorySyncState['categories'][string] = { dirName: r.dirName };
        if (Number.isFinite(r.dataMtime)) row.dataMtime = r.dataMtime;
        if (Number.isFinite(r.dataSize)) row.dataSize = r.dataSize;
        out.categories[id] = row;
      }
    }
  }
  if (v.papers && typeof v.papers === 'object') {
    for (const [id, r] of Object.entries<any>(v.papers)) {
      if (r && typeof r.categoryId === 'string' && r.categoryId) out.papers[id] = { categoryId: r.categoryId };
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

export function categoryDataPath(dirName: string): string {
  return `${CATEGORY_ROOT}/${dirName}/${CATEGORY_DATA_FILE}`;
}

export function categoryMediaDir(dirName: string): string {
  return `${CATEGORY_ROOT}/${dirName}/${CATEGORY_MEDIA_DIR}`;
}

export function categoryMediaPath(dirName: string, imageId: string): string {
  return `${categoryMediaDir(dirName)}/${imageFileName(imageId)}`;
}

export function categoryMetaPath(dirName: string): string {
  return `${CATEGORY_ROOT}/${dirName}/${FOLDER_META}`;
}

/** unnecessary/ ফোল্ডারে সরার পূর্ণ পথ: Category/<owner>/unnecessary/<name> (owner খালি হলে Category/unnecessary/<name>) */
export function categoryUnnecessaryPath(ownerDir: string, name: string): string {
  return [CATEGORY_ROOT, ownerDir, UNNECESSARY_DIR, name].filter(Boolean).join('/');
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
 * Paper entry (one paper inside data.json)
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

/** দুই প্রশ্নপত্রের বিষয়বস্তু এক কি না (key-এর ক্রম/undefined গুরুত্বহীন; ক্যাটেগরি ধরা হয় না) */
export function paperContentKey(p: Paper | ParsedPaper): string {
  return stableStringify(JSON.parse(JSON.stringify(normalizePaper(p))));
}

export function samePaperContent(a: Paper | ParsedPaper, b: Paper | ParsedPaper): boolean {
  return paperContentKey(a) === paperContentKey(b);
}

/* ---------- যাচাইয়ের ছোট সহায়ক ---------- */

const isObj = (v: any): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: any): v is string => typeof v === 'string';
const isNonEmptyStr = (v: any): v is string => typeof v === 'string' && v.trim() !== '';
const isNum = (v: any): v is number => typeof v === 'number' && Number.isFinite(v);
const isNonNegInt = (v: any): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isIdList = (v: any): v is string[] => Array.isArray(v) && v.every((x) => isNonEmptyStr(x));

const QUESTION_TYPES = ['ক', 'খ', 'গ', 'ঘ'];

const boardUsagesProblem = (v: any, label: string): string | null => {
  if (!Array.isArray(v)) return `${label} তালিকা নয়`;
  for (const b of v) {
    if (!isObj(b) || !isStr(b.board) || !Array.isArray(b.years) || !b.years.every(isNum)) return `${label}-এর কোনো সারি ঠিক নেই`;
  }
  return null;
};

/** প্রশ্নের কপি (db.ts-এর Question interface অনুযায়ী) ঠিক কি না। ঠিক হলে null, নইলে কারণ */
export function questionProblem(q: any): string | null {
  if (!isObj(q)) return 'প্রশ্ন বস্তু নয়';
  if (!isNonEmptyStr(q.id)) return 'প্রশ্নের id নেই';
  if (!isNonEmptyStr(q.topicId)) return 'topicId নেই';
  if (!QUESTION_TYPES.includes(q.type)) return 'type ক/খ/গ/ঘ-এর একটা হতে হবে';
  if (!isNum(q.marks)) return 'marks সংখ্যা নয়';
  if (!isStr(q.questionText)) return 'questionText লেখা নয়';
  if (!isStr(q.solutionText)) return 'solutionText লেখা নয়';
  if (!isIdList(q.solutionImageIds)) return 'solutionImageIds ছবির id-র তালিকা নয়';
  if (!isNum(q.rating)) return 'rating সংখ্যা নয়';
  if (!isNum(q.order)) return 'order সংখ্যা নয়';
  const ub = boardUsagesProblem(q.usedInBoards, 'usedInBoards');
  if (ub) return ub;
  if (q.stimulusId !== undefined && !isNonEmptyStr(q.stimulusId)) return 'stimulusId লেখা নয়';
  if (q.answerText !== undefined && !isStr(q.answerText)) return 'answerText লেখা নয়';
  return null;
}

/** উদ্দীপকের কপি (db.ts-এর Stimulus interface অনুযায়ী) ঠিক কি না */
export function stimulusProblem(s: any): string | null {
  if (!isObj(s)) return 'উদ্দীপক বস্তু নয়';
  if (!isNonEmptyStr(s.id)) return 'উদ্দীপকের id নেই';
  if (!isNonEmptyStr(s.topicId)) return 'topicId নেই';
  if (!isStr(s.text)) return 'text লেখা নয়';
  if (!isIdList(s.imageIds)) return 'imageIds ছবির id-র তালিকা নয়';
  if (s.imageTopCount !== undefined && !isNum(s.imageTopCount)) return 'imageTopCount সংখ্যা নয়';
  if (s.boardTag !== undefined && !isStr(s.boardTag)) return 'boardTag লেখা নয়';
  if (s.usedInBoards !== undefined) {
    const ub = boardUsagesProblem(s.usedInBoards, 'usedInBoards');
    if (ub) return ub;
  }
  if (s.rating !== undefined && !isNum(s.rating)) return 'rating সংখ্যা নয়';
  if (s.reference !== undefined && !isStr(s.reference)) return 'reference লেখা নয়';
  return null;
}

/**
 * প্রশ্নব্যাংকের পথ ঠিক কি না। Type CQ-তে topic অবশ্যই থাকবে (ব্যবহারকারীর চূড়ান্ত সিদ্ধান্ত);
 * Chapter CQ-তে topic খালি বা অনুপস্থিত বৈধ (লুকানো ডিফল্ট টপিক)।
 */
export function bankPathProblem(p: any): string | null {
  if (!isObj(p)) return 'path নেই';
  if (p.scope !== 'type' && p.scope !== 'chapter') return 'path.scope \"type\" বা \"chapter\" হতে হবে';
  if (!isNonEmptyStr(p.subject)) return 'path.subject ফাঁকা';
  if (!isNonEmptyStr(p.chapter)) return 'path.chapter ফাঁকা';
  if (p.scope === 'type') {
    if (!isNonEmptyStr(p.topic)) return 'Type CQ-র প্রশ্নে path.topic অবশ্যই লাগবে';
  } else if (p.topic !== undefined && !isStr(p.topic)) {
    return 'path.topic লেখা নয়';
  }
  return null;
}

const editsProblem = (e: any): string | null => {
  if (e === undefined) return null;
  if (!isObj(e)) return 'edits বস্তু নয়';
  if (e.questions !== undefined) {
    if (!isObj(e.questions)) return 'edits.questions বস্তু নয়';
    for (const v of Object.values<any>(e.questions)) {
      if (!isObj(v) || !isStr(v.questionText) || !isNum(v.marks) || (v.solutionText !== undefined && !isStr(v.solutionText))) {
        return 'edits.questions-এর কোনো সারি ঠিক নেই';
      }
    }
  }
  if (e.stimuli !== undefined) {
    if (!isObj(e.stimuli)) return 'edits.stimuli বস্তু নয়';
    for (const v of Object.values<any>(e.stimuli)) {
      if (!isObj(v) || !isStr(v.text)) return 'edits.stimuli-র কোনো সারি ঠিক নেই';
    }
  }
  return null;
};

/** parsePaperEntry-র ফল। ভুল হলে error ও (বৈধ id থাকলে) সেই id - যাতে প্রশ্নপত্রটা \"ফাইলে নেই\" ধরে মোছা না হয় */
export type PaperEntryResult = { paper: ParsedPaper } | { error: string; id?: string };

/**
 * data.json-এর একটি প্রশ্নপত্র -> ParsedPaper। ভুল হলে error ও কারণ।
 * questionIds অনুপস্থিত হলে নীরবে [] ধরা হয় না - ভুল ধরা হয়। কোনো ঘর নীরবে বাদও যায় না।
 */
export function parsePaperEntry(raw: any, fallbackCreatedAt = 0): PaperEntryResult {
  if (!isObj(raw)) return { error: 'প্রশ্নপত্র নয়' };
  if (!isNonEmptyStr(raw.id)) return { error: 'id নেই' };
  const id = raw.id.trim();
  const fail = (error: string): PaperEntryResult => ({ error, id });

  if (raw.questionIds === undefined) return fail('questionIds নেই');
  if (!Array.isArray(raw.questionIds)) return fail('questionIds তালিকা নয়');
  if (!raw.questionIds.every((x: any) => isNonEmptyStr(x))) return fail('questionIds-এ ভুল মান আছে (প্রতিটি প্রশ্নের id লেখা হতে হবে)');
  if (raw.title !== undefined && !isStr(raw.title)) return fail('title লেখা নয়');
  if (raw.shortName !== undefined && !isStr(raw.shortName)) return fail('shortName লেখা নয়');
  if (raw.createdAt !== undefined && !isNum(raw.createdAt)) return fail('createdAt সংখ্যা নয়');
  if (raw.subjectLine !== undefined && !isStr(raw.subjectLine)) return fail('subjectLine লেখা নয়');
  if (raw.note !== undefined && !isStr(raw.note)) return fail('note লেখা নয়');
  if (raw.duration !== undefined && !isStr(raw.duration) && !isNum(raw.duration)) return fail('duration লেখা/সংখ্যা নয়');
  if (raw.totalMarks !== undefined && !isNum(raw.totalMarks)) return fail('totalMarks সংখ্যা নয়');
  if (raw.order !== undefined && !isNum(raw.order)) return fail('order সংখ্যা নয়');
  const ep = editsProblem(raw.edits);
  if (ep) return fail(ep);

  const title = typeof raw.title === 'string' ? raw.title : '';
  const shortName = typeof raw.shortName === 'string' && raw.shortName.trim() ? raw.shortName.trim() : title.trim() || 'নামহীন';
  const createdAt = isNum(raw.createdAt) && raw.createdAt > 0 ? raw.createdAt : fallbackCreatedAt;

  const paper: ParsedPaper = {
    id,
    shortName,
    createdAt,
    title,
    questionIds: [...raw.questionIds],
  };
  if (typeof raw.subjectLine === 'string') paper.subjectLine = raw.subjectLine;
  if (typeof raw.note === 'string') paper.note = raw.note;
  if (typeof raw.duration === 'string' || typeof raw.duration === 'number') paper.duration = raw.duration;
  if (typeof raw.totalMarks === 'number') paper.totalMarks = raw.totalMarks;
  if (typeof raw.order === 'number') paper.order = raw.order;
  const edits = cleanEdits(raw.edits);
  if (edits) paper.edits = edits;
  return { paper };
}

/* ------------------------------------------------------------------
 * data.json of a category
 * ---------------------------------------------------------------- */

const sortPapers = (a: ParsedPaper, b: ParsedPaper): number =>
  (a.order ?? 1e9) - (b.order ?? 1e9) || (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id);

/** প্রশ্নপত্রগুলোতে ব্যবহৃত সব প্রশ্নের id */
export function usedQuestionIds(papers: Array<Paper | ParsedPaper>): Set<string> {
  const out = new Set<string>();
  for (const p of papers) for (const q of p.questionIds ?? []) out.add(q);
  return out;
}

/**
 * ক্যাটেগরির data.json-এর বিষয়বস্তু। একই তথ্য থেকে সবসময় হুবহু একই লেখা তৈরি হয় (ক্রম নির্দিষ্ট),
 * তাই আগের লেখার সাথে মিললে আবার লিখতে হয় না।
 */
export function buildCategoryDataFile(input: {
  category: Pick<Category, 'id' | 'name' | 'order'>;
  papers: Array<Paper | ParsedPaper>;
  questions: CopiedQuestion[];
  stimuli: CopiedStimulus[];
}): CategoryDataFile {
  const papers = input.papers.map((p) => normalizePaper(p)).sort(sortPapers);
  const questions = [...input.questions].sort((a, b) => a.question.id.localeCompare(b.question.id));
  const stimuli = [...input.stimuli].sort((a, b) => a.stimulus.id.localeCompare(b.stimulus.id));
  const images = collectImageIds(
    stimuli.map((s) => s.stimulus),
    questions.map((q) => q.question)
  )
    .sort()
    .map((id) => ({ id, fileName: imageFileName(id) }));
  return {
    type: CATEGORY_DATA_TYPE,
    version: CATEGORY_DATA_VERSION,
    category: { id: input.category.id, name: input.category.name, order: Number.isFinite(input.category.order) ? input.category.order : 0 },
    counts: { papers: papers.length, questions: questions.length, stimuli: stimuli.length, images: images.length },
    papers,
    questions,
    stimuli,
    images,
  };
}

export function categoryDataToText(file: CategoryDataFile): string {
  return JSON.stringify(file, null, 2);
}

/**
 * data.json-এর লেখা -> তথ্য (কঠোর যাচাইসহ)।
 *
 *  - ok:false : ফাইল অগ্রহণযোগ্য - type/version/category/চারটি তালিকা/counts-এর কোনোটা অনুপস্থিত বা ভুল ধরনের,
 *               অথবা ফাইল অ্যাপের চেয়ে নতুন ভার্সনের। কিছু যোগ/বদল/মোছা হয় না।
 *  - ok:true, unsafe:true : কোনো প্রশ্নপত্র/কপি/ছবি ভুল (বাদ পড়েছে) বা গণনা মেলেনি। নীরবে বাদ দেওয়া হয় না:
 *               সতর্কতা আসে ও মোছা নিষিদ্ধ থাকে; বাদ পড়া প্রশ্নপত্রের id skippedPaperIds-এ।
 *  - ok:true, unsafe:false : সব ঠিক।
 *
 * fallbackCreatedAt: হাতে লেখা প্রশ্নপত্রে createdAt না থাকলে এই মান বসে (সাধারণত ফাইলের mtime)।
 */
export function parseCategoryData(text: string | null | undefined, fallbackCreatedAt = 0): ParseCategoryDataResult {
  if (text === null || text === undefined || !text.trim()) return { ok: false, reason: 'ফাইল খালি' };
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'JSON ঠিক নেই' };
  }
  const bad = (reason: string): ParseCategoryDataResult => ({ ok: false, reason });

  if (!isObj(raw)) return bad('ক্যাটেগরির data.json নয়');
  if (raw.type !== CATEGORY_DATA_TYPE) return bad('ক্যাটেগরির data.json নয়');
  if (typeof raw.version !== 'number' || !Number.isInteger(raw.version) || raw.version < 1) {
    return bad('version ঠিক নেই (১ বা তার বেশি পূর্ণসংখ্যা হতে হবে)');
  }
  if (raw.version > CATEGORY_DATA_VERSION) {
    return bad(`ফাইলটি অ্যাপের চেয়ে নতুন ভার্সনের (version ${raw.version}) - কিছু পড়া বা বদলানো হয়নি`);
  }

  const cat = raw.category;
  if (!isObj(cat)) return bad('category নেই বা বস্তু নয়');
  if (!isNonEmptyStr(cat.id)) return bad('category.id ফাঁকা');
  if (!isNonEmptyStr(cat.name)) return bad('category.name ফাঁকা');
  if (!isNum(cat.order)) return bad('category.order সংখ্যা নয়');

  for (const key of ['papers', 'questions', 'stimuli', 'images'] as const) {
    if (raw[key] === undefined) return bad(`${key} নেই`);
    if (!Array.isArray(raw[key])) return bad(`${key} তালিকা নয়`);
  }

  if (!isObj(raw.counts)) return bad('counts নেই বা বস্তু নয়');
  for (const key of ['papers', 'questions', 'stimuli', 'images'] as const) {
    if (!isNonNegInt(raw.counts[key])) return bad(`counts.${key} ঠিক নেই (০ বা বেশি পূর্ণসংখ্যা হতে হবে)`);
  }

  const warnings: string[] = [];
  let unsafe = false;
  /** বাদ পড়া/সন্দেহজনক কিছু পেলে: সতর্কতা + ফাইল unsafe (মোছা বন্ধ) */
  const flag = (msg: string) => {
    warnings.push(msg);
    unsafe = true;
  };

  const rawPapers: any[] = raw.papers;
  const rawQs: any[] = raw.questions;
  const rawSs: any[] = raw.stimuli;
  const rawImgs: any[] = raw.images;

  const papers: ParsedPaper[] = [];
  const skipped = new Set<string>();
  const seen = new Set<string>();
  rawPapers.forEach((rp, i) => {
    const r = parsePaperEntry(rp, fallbackCreatedAt);
    if ('error' in r) {
      if (r.id) skipped.add(r.id);
      flag(`${i + 1} নম্বর প্রশ্নপত্র বাদ${r.id ? ` (id: ${r.id})` : ''}: ${r.error}`);
    } else if (seen.has(r.paper.id)) {
      flag(`একই id-র দুটি প্রশ্নপত্র: \"${r.paper.shortName}\" - প্রথমটা ধরা হয়েছে`);
    } else {
      seen.add(r.paper.id);
      papers.push(r.paper);
      const dup = r.paper.questionIds.filter((q, k, a) => a.indexOf(q) !== k);
      if (dup.length) warnings.push(`\"${r.paper.shortName}\": একই প্রশ্নের id একাধিকবার আছে (${Array.from(new Set(dup)).join(', ')})`);
    }
  });

  const questions: CopiedQuestion[] = [];
  const qSeen = new Set<string>();
  rawQs.forEach((rq, i) => {
    const problem = (isObj(rq) ? questionProblem(rq.question) ?? bankPathProblem(rq.path) : null) ?? (isObj(rq) ? null : 'কপি বস্তু নয়');
    if (problem) {
      flag(`${i + 1} নম্বর প্রশ্নের কপি বাদ: ${problem}`);
    } else if (qSeen.has(rq.question.id)) {
      flag(`প্রশ্নের কপি দুবার আছে (id: ${rq.question.id}) - প্রথমটা ধরা হয়েছে`);
    } else {
      qSeen.add(rq.question.id);
      questions.push({ question: rq.question, path: { ...rq.path, topic: rq.path.topic ?? '' } });
    }
  });

  const stimuli: CopiedStimulus[] = [];
  const sSeen = new Set<string>();
  rawSs.forEach((rs, i) => {
    const problem = (isObj(rs) ? stimulusProblem(rs.stimulus) ?? bankPathProblem(rs.path) : null) ?? (isObj(rs) ? null : 'কপি বস্তু নয়');
    if (problem) {
      flag(`${i + 1} নম্বর উদ্দীপকের কপি বাদ: ${problem}`);
    } else if (sSeen.has(rs.stimulus.id)) {
      flag(`উদ্দীপকের কপি দুবার আছে (id: ${rs.stimulus.id}) - প্রথমটা ধরা হয়েছে`);
    } else {
      sSeen.add(rs.stimulus.id);
      stimuli.push({ stimulus: rs.stimulus, path: { ...rs.path, topic: rs.path.topic ?? '' } });
    }
  });

  const imageIds: string[] = [];
  const iIds = new Set<string>();
  const iNames = new Set<string>();
  rawImgs.forEach((ri, i) => {
    if (!isObj(ri)) return flag(`${i + 1} নম্বর ছবির সারি বাদ: বস্তু নয়`);
    if (!isNonEmptyStr(ri.id)) return flag(`${i + 1} নম্বর ছবির সারি বাদ: id নেই`);
    if (ri.fileName !== imageFileName(ri.id)) return flag(`ছবি ${ri.id} বাদ: fileName \"${imageFileName(ri.id)}\" হতে হবে`);
    if (iIds.has(ri.id)) return flag(`ছবির id দুবার আছে: ${ri.id}`);
    if (iNames.has(ri.fileName)) return flag(`ছবির fileName দুবার আছে: ${ri.fileName}`);
    iIds.add(ri.id);
    iNames.add(ri.fileName);
    imageIds.push(ri.id);
  });

  const c = raw.counts;
  const countCheck: Array<[string, number, number]> = [
    ['প্রশ্নপত্র', c.papers, rawPapers.length],
    ['প্রশ্নের কপি', c.questions, rawQs.length],
    ['উদ্দীপকের কপি', c.stimuli, rawSs.length],
    ['ছবি', c.images, rawImgs.length],
  ];
  for (const [label, written, actual] of countCheck) {
    if (written !== actual) flag(`গণনা মেলেনি: ${label} লেখা ${written}, আছে ${actual} (ফাইল হাতে বদলানো বা অর্ধেক লেখা হতে পারে)`);
  }

  return {
    ok: true,
    data: {
      papers,
      questions,
      stimuli,
      imageIds,
      category: { id: cat.id, name: cat.name, order: cat.order },
      unsafe,
      skippedPaperIds: Array.from(skipped).sort(),
      warnings,
    },
  };
}
