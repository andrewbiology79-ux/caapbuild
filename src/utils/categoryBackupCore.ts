import type { Subject, Chapter, Topic, Stimulus, Question, Paper } from '../db/db';

/**
 * ক্যাটেগরি ব্যাকআপ - খাঁটি লজিক (ডাটাবেস/ফোন ছোঁয় না, তাই আলাদা করে পরীক্ষা করা যায়)।
 *
 * ফাইলের গঠন (ভার্সন ২):
 *   { type, version, appVersion, exportedAt, counts, checksum, body: { categories, scopes: { type, chapter } } }
 *   - checksum = body-র লেখার SHA-256 (না থাকলে ছোট হ্যাশ) - ফাইল অর্ধেক লেখা / নষ্ট / বদলানো হলে ধরা পড়ে
 *   - counts   = কয়টা ক্যাটেগরি / প্রশ্নপত্র / প্রশ্ন / ছবি আছে - ইম্পোর্টের সময় মিলিয়ে দেখা হয়
 *   - scopes   = Type CQ ও Chapter CQ-র আলাদা ডেটা (প্রশ্নপত্রে দুই জায়গার প্রশ্নই থাকতে পারে)
 * পুরনো "qb-category-share" ফাইলও (শুধু Type CQ, চেকসাম নেই) পড়া যায়।
 */

export const BACKUP_TYPE = 'qb-category-backup';
export const BACKUP_VERSION = 2;
export const LEGACY_SHARE_TYPE = 'qb-category-share';

export type ScopeKey = 'type' | 'chapter';

export interface BackupImage {
  id: string;
  fileName: string;
  /** base64 data URL */
  data: string;
}

export interface ScopeData {
  subjects: Subject[];
  chapters: Chapter[];
  topics: Topic[];
  stimuli: Stimulus[];
  questions: Question[];
  images: BackupImage[];
}

export interface BackupCategory {
  id?: string;
  name: string;
  order?: number;
  createdAt?: number;
  papers: Paper[];
}

export interface BackupBody {
  categories: BackupCategory[];
  scopes: { type: ScopeData; chapter: ScopeData };
}

export interface BackupCounts {
  categories: number;
  papers: number;
  questions: number;
  stimuli: number;
  images: number;
}

export interface ParsedBackup {
  format: 'v2' | 'legacy';
  /** true = চেকসাম মিলেছে; legacy ফাইলে চেকসাম থাকে না */
  verified: boolean;
  exportedAt: string;
  appVersion?: string;
  categories: BackupCategory[];
  scopes: { type: ScopeData; chapter: ScopeData };
  counts: BackupCounts;
  /** ফাইল পড়ার সময় ঠিক করা / বাদ দেওয়া জিনিসের কথা */
  warnings: string[];
}

export class BackupError extends Error {}

export function emptyScope(): ScopeData {
  return { subjects: [], chapters: [], topics: [], stimuli: [], questions: [], images: [] };
}

/* ------------------------------------------------------------------ */
/* checksum                                                            */
/* ------------------------------------------------------------------ */

/** ছোট, দ্রুত হ্যাশ (cyrb53) - SHA-256 না পেলে বিকল্প */
function cyrb53(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

export async function hashText(text: string): Promise<string> {
  try {
    const subtle = (globalThis as any).crypto?.subtle;
    if (subtle && typeof TextEncoder !== 'undefined') {
      const buf = await subtle.digest('SHA-256', new TextEncoder().encode(text));
      const hex = Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      return `sha256:${hex}`;
    }
  } catch {
    /* fall through */
  }
  return `c53:${cyrb53(text)}`;
}

async function verifyHash(text: string, expected: string): Promise<boolean> {
  if (expected.startsWith('c53:')) return `c53:${cyrb53(text)}` === expected;
  if (expected.startsWith('sha256:')) {
    const got = await hashText(text);
    // SHA-256 পাওয়া না গেলে hashText ছোট হ্যাশ দেয় - তখন মেলানো যাবে না
    return got === expected;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* counts / build / parse                                              */
/* ------------------------------------------------------------------ */

export function countBody(body: BackupBody): BackupCounts {
  const t = body.scopes.type;
  const c = body.scopes.chapter;
  return {
    categories: body.categories.length,
    papers: body.categories.reduce((n, cat) => n + cat.papers.length, 0),
    questions: t.questions.length + c.questions.length,
    stimuli: t.stimuli.length + c.stimuli.length,
    images: t.images.length + c.images.length,
  };
}

/** ফাইলের পুরো লেখা তৈরি (body একবারই লেখা হয় - বড় ছবির ফাইলে মেমরি বাঁচে) */
export async function buildBackupText(
  body: BackupBody,
  appVersion: string,
  exportedAt: string = new Date().toISOString()
): Promise<{ text: string; counts: BackupCounts; checksum: string }> {
  const bodyText = JSON.stringify(body);
  const checksum = await hashText(bodyText);
  const counts = countBody(body);
  const header = JSON.stringify({ type: BACKUP_TYPE, version: BACKUP_VERSION, appVersion, exportedAt, counts, checksum });
  const text = `${header.slice(0, -1)},"body":${bodyText}}`;
  return { text, counts, checksum };
}

const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** id থাকা সারিগুলো রাখে, একই id দ্বিতীয়বার এলে বাদ দেয় */
function cleanRows<T extends { id: string }>(rows: unknown, label: string, warnings: string[]): T[] {
  if (rows === undefined || rows === null) return [];
  if (!Array.isArray(rows)) throw new BackupError(`ফাইলের "${label}" অংশ ঠিক নেই`);
  const seen = new Set<string>();
  const out: T[] = [];
  let bad = 0;
  let dup = 0;
  for (const r of rows) {
    if (!isObj(r) || typeof r.id !== 'string' || !r.id) {
      bad++;
      continue;
    }
    if (seen.has(r.id)) {
      dup++;
      continue;
    }
    seen.add(r.id);
    out.push(r as T);
  }
  if (bad) warnings.push(`${label}: ${bad}টি নষ্ট সারি বাদ দেওয়া হয়েছে`);
  if (dup) warnings.push(`${label}: ${dup}টি পুনরাবৃত্ত সারি বাদ দেওয়া হয়েছে`);
  return out;
}

function cleanScope(raw: unknown, name: string, warnings: string[]): ScopeData {
  if (raw === undefined || raw === null) return emptyScope();
  if (!isObj(raw)) throw new BackupError(`ফাইলের ${name} অংশ ঠিক নেই`);
  const images = cleanRows<BackupImage>(raw.images, `${name} ছবি`, warnings).filter((i) => {
    if (typeof i.data !== 'string' || !i.data) {
      warnings.push(`${name}: একটি ছবির ডেটা নেই (${i.id})`);
      return false;
    }
    return true;
  });
  const questions = cleanRows<Question>(raw.questions, `${name} প্রশ্ন`, warnings)
    .filter((q) => typeof q.topicId === 'string' && q.topicId)
    .map((q) => ({
      ...q,
      solutionImageIds: Array.isArray(q.solutionImageIds) ? q.solutionImageIds : [],
      usedInBoards: Array.isArray(q.usedInBoards) ? q.usedInBoards : [],
    }));
  const stimuli = cleanRows<Stimulus>(raw.stimuli, `${name} উদ্দীপক`, warnings)
    .filter((s) => typeof s.topicId === 'string' && s.topicId)
    .map((s) => ({ ...s, imageIds: Array.isArray(s.imageIds) ? s.imageIds : [] }));
  return {
    subjects: cleanRows<Subject>(raw.subjects, `${name} বিষয়`, warnings),
    chapters: cleanRows<Chapter>(raw.chapters, `${name} অধ্যায়`, warnings),
    topics: cleanRows<Topic>(raw.topics, `${name} টপিক`, warnings),
    stimuli,
    questions,
    images,
  };
}

function cleanCategories(raw: unknown, warnings: string[]): BackupCategory[] {
  if (!Array.isArray(raw)) throw new BackupError('ফাইলে ক্যাটেগরির তালিকা নেই');
  const out: BackupCategory[] = [];
  const seenNames = new Set<string>();
  for (const c of raw) {
    if (!isObj(c) || typeof c.name !== 'string' || !c.name.trim()) {
      warnings.push('নামহীন একটি ক্যাটেগরি বাদ দেওয়া হয়েছে');
      continue;
    }
    const key = c.name.trim().toLowerCase();
    if (seenNames.has(key)) {
      warnings.push(`"${c.name}" নামে একাধিক ক্যাটেগরি - দ্বিতীয়টি বাদ`);
      continue;
    }
    seenNames.add(key);
    const papers: Paper[] = [];
    let badPapers = 0;
    for (const p of Array.isArray(c.papers) ? c.papers : []) {
      if (!isObj(p) || !Array.isArray(p.questionIds)) {
        badPapers++;
        continue;
      }
      papers.push(p as unknown as Paper);
    }
    if (badPapers) warnings.push(`"${c.name}": ${badPapers}টি নষ্ট প্রশ্নপত্র বাদ`);
    out.push({
      id: typeof c.id === 'string' ? c.id : undefined,
      name: c.name.trim(),
      order: typeof c.order === 'number' ? c.order : undefined,
      createdAt: typeof c.createdAt === 'number' ? c.createdAt : undefined,
      papers,
    });
  }
  return out;
}

/**
 * ফাইলের লেখা পড়ে যাচাই করে। কিছু ঠিক না থাকলে BackupError (বাংলা বার্তাসহ) ছোড়ে।
 * এখানে ডাটাবেসে কিছুই লেখা হয় না।
 */
export async function parseBackupText(text: string): Promise<ParsedBackup> {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError('ফাইলটি পড়া যায়নি - ফাইল অসম্পূর্ণ বা নষ্ট (JSON ফরম্যাট ঠিক নয়)');
  }
  if (!isObj(data)) throw new BackupError('এটি ক্যাটেগরি ব্যাকআপ ফাইল নয়');

  const warnings: string[] = [];

  /* ---------- নতুন ফরম্যাট ---------- */
  if (data.type === BACKUP_TYPE) {
    const version = Number(data.version);
    if (!Number.isFinite(version) || version < 2) throw new BackupError('ব্যাকআপ ফাইলের ভার্সন বোঝা যায়নি');
    if (version > BACKUP_VERSION) {
      throw new BackupError('এই ফাইলটি অ্যাপের নতুন ভার্সনে তৈরি - আগে অ্যাপ আপডেট করুন');
    }
    if (!isObj(data.body)) throw new BackupError('ব্যাকআপ ফাইলের ভেতরের অংশ (body) পাওয়া যায়নি - ফাইল অসম্পূর্ণ');
    if (typeof data.checksum !== 'string' || !data.checksum) {
      throw new BackupError('ব্যাকআপ ফাইলে চেকসাম নেই - ফাইলটি নিরাপদ নয়');
    }
    if (!(await verifyHash(JSON.stringify(data.body), data.checksum))) {
      throw new BackupError('চেকসাম মেলেনি - ফাইলটি নষ্ট হয়েছে বা বদলানো হয়েছে। ডেটা ইম্পোর্ট করা হয়নি');
    }
    const categories = cleanCategories(data.body.categories, warnings);
    const scopesRaw = isObj(data.body.scopes) ? data.body.scopes : {};
    const scopes = {
      type: cleanScope(scopesRaw.type, 'Type CQ', warnings),
      chapter: cleanScope(scopesRaw.chapter, 'Chapter CQ', warnings),
    };
    const counts = countBody({ categories, scopes });
    // ফাইলে লেখা সংখ্যার সাথে আসল সংখ্যা মেলানো (সাফ করার আগের সংখ্যা)
    const rawCats: any[] = Array.isArray(data.body.categories) ? data.body.categories : [];
    const rawPapers = rawCats.reduce((n, c) => n + (Array.isArray(c?.papers) ? c.papers.length : 0), 0);
    const rawQuestions =
      (Array.isArray(scopesRaw.type?.questions) ? scopesRaw.type.questions.length : 0) +
      (Array.isArray(scopesRaw.chapter?.questions) ? scopesRaw.chapter.questions.length : 0);
    if (isObj(data.counts)) {
      if (data.counts.categories !== rawCats.length || data.counts.papers !== rawPapers || data.counts.questions !== rawQuestions) {
        throw new BackupError('ফাইলের ভেতরের সংখ্যা ও লেখা সংখ্যা মেলেনি - ফাইল নষ্ট');
      }
    }
    return {
      format: 'v2',
      verified: true,
      exportedAt: String(data.exportedAt || ''),
      appVersion: typeof data.appVersion === 'string' ? data.appVersion : undefined,
      categories,
      scopes,
      counts,
      warnings,
    };
  }

  /* ---------- পুরনো শেয়ার ফাইল (শুধু Type CQ, চেকসাম নেই) ---------- */
  if (data.type === LEGACY_SHARE_TYPE && Array.isArray(data.papers)) {
    const groups: any[] =
      Array.isArray(data.categories) && data.categories.length > 0
        ? data.categories
        : [{ name: data.category?.name || 'ইমপোর্টেড', papers: data.papers }];
    const categories = cleanCategories(groups, warnings);
    const type = cleanScope(
      {
        subjects: data.subjects,
        chapters: data.chapters,
        topics: data.topics,
        stimuli: data.stimuli,
        questions: data.questions,
        images: data.images,
      },
      'Type CQ',
      warnings
    );
    const scopes = { type, chapter: emptyScope() };
    warnings.unshift('এটি পুরনো ধরনের ফাইল - চেকসাম নেই, তাই ফাইলটি পুরোপুরি যাচাই করা যায়নি');
    return {
      format: 'legacy',
      verified: false,
      exportedAt: String(data.exportedAt || ''),
      categories,
      scopes,
      counts: countBody({ categories, scopes }),
      warnings,
    };
  }

  throw new BackupError('এটি ক্যাটেগরি ব্যাকআপ ফাইল নয়');
}

/* ------------------------------------------------------------------ */
/* ইম্পোর্ট পরিকল্পনা (কী যোগ হবে, কী আগে থেকেই আছে)                    */
/* ------------------------------------------------------------------ */

/** ফোনের বর্তমান ডেটার সারসংক্ষেপ - প্ল্যান বানাতে যা লাগে */
export interface LocalScopeSnapshot {
  subjects: Subject[];
  chapters: Chapter[];
  topics: Topic[];
  questionIds: Set<string>;
  stimulusIds: Set<string>;
  imageIds: Set<string>;
}

export interface LocalSnapshot {
  type: LocalScopeSnapshot;
  chapter: LocalScopeSnapshot;
  categories: Array<{ id: string; name: string; order: number }>;
  papers: Paper[];
}

export interface ScopePlan {
  subjects: Subject[];
  chapters: Chapter[];
  topics: Topic[];
  stimuli: Stimulus[];
  questions: Question[];
  images: BackupImage[];
}

export interface CategoryPlan {
  name: string;
  /** true = এই নামে ক্যাটেগরি ফোনে নেই, নতুন বানানো হবে */
  isNew: boolean;
  existingId?: string;
  order?: number;
  createdAt?: number;
  papersTotal: number;
  papersAdd: number;
  papersDuplicate: number;
  papersBroken: number;
}

export interface PlannedPaper {
  categoryName: string;
  paper: Paper;
}

export interface ImportPlan {
  scopes: { type: ScopePlan; chapter: ScopePlan };
  categories: CategoryPlan[];
  papersToAdd: PlannedPaper[];
  /** ফাইলে ছিল কিন্তু ফোনে আগে থেকেই আছে (ছোঁয়া হবে না) */
  alreadyHave: { questions: number; stimuli: number; images: number };
  /** কিছু প্রশ্ন/ছবি ফাইলে বা ফোনে নেই */
  missingImages: number;
  totals: {
    newCategories: number;
    newPapers: number;
    duplicatePapers: number;
    brokenPapers: number;
    newQuestions: number;
    newStimuli: number;
    newImages: number;
    newSubjects: number;
    newChapters: number;
    newTopics: number;
  };
  warnings: string[];
  /** নতুন কিছুই যোগ হবে না */
  nothingToDo: boolean;
}

const norm = (s: string | undefined) => (s || '').trim().toLowerCase();

const BN: Record<string, string> = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
const EN2BN = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
const toEnDigits = (s: string) => s.replace(/[০-৯]/g, (d) => BN[d] || d);
const toBnDigits = (n: number) => String(n).replace(/[0-9]/g, (d) => EN2BN[Number(d)]);

/** "<ক্যাটেগরি>-<সংখ্যা>" ট্যাগের সংখ্যা (api.ts-এর paperLabelNumber-এর মতোই) */
export function labelNumber(shortName: string | undefined, categoryName: string): number | null {
  const prefix = `${categoryName.trim()}-`;
  const name = (shortName || '').trim();
  if (!name.startsWith(prefix)) return null;
  const rest = toEnDigits(name.slice(prefix.length)).trim();
  return /^\d+$/.test(rest) ? parseInt(rest, 10) : null;
}

export const paperKey = (p: Paper) => `${p.shortName}|${p.title}|${(p.questionIds || []).join(',')}`;

interface HierarchyResult {
  subjects: Subject[];
  chapters: Chapter[];
  topics: Topic[];
  /** ফাইলের topicId -> ফোনের topicId (ফোনে একই নামের টপিক থাকলে সেটাতে মেলানো হয়) */
  topicMap: Map<string, string>;
}

/**
 * বিষয় > অধ্যায় > টপিক: id আগে থেকে থাকলে ওটাই; না থাকলে একই নামের (একই বাবার নিচে) থাকলে ওটাতে মেলানো;
 * তা-ও না থাকলে নতুন যোগ। এতে আরেক ফোনের ফাইল ইম্পোর্ট করলে একই নামের বিষয়/অধ্যায় দুবার তৈরি হয় না।
 */
export function planHierarchy(incoming: ScopeData, local: LocalScopeSnapshot): HierarchyResult {
  const subjectMap = new Map<string, string>();
  const chapterMap = new Map<string, string>();
  const topicMap = new Map<string, string>();
  const newSubjects: Subject[] = [];
  const newChapters: Chapter[] = [];
  const newTopics: Topic[] = [];

  const localSubjectIds = new Set(local.subjects.map((s) => s.id));
  const subjectByName = new Map(local.subjects.map((s) => [norm(s.name), s.id]));
  let subjectOrder = local.subjects.reduce((m, s) => Math.max(m, s.order || 0), 0);
  for (const s of [...incoming.subjects].sort((a, b) => (a.order || 0) - (b.order || 0))) {
    if (localSubjectIds.has(s.id)) {
      subjectMap.set(s.id, s.id);
      continue;
    }
    const hit = subjectByName.get(norm(s.name));
    if (hit) {
      subjectMap.set(s.id, hit);
      continue;
    }
    const row = { ...s, order: ++subjectOrder };
    newSubjects.push(row);
    subjectMap.set(s.id, row.id);
    subjectByName.set(norm(s.name), row.id);
  }

  const localChapterIds = new Set(local.chapters.map((c) => c.id));
  const chapterByKey = new Map(local.chapters.map((c) => [`${c.subjectId}|${norm(c.name)}`, c.id]));
  const chapterOrderBySubject = new Map<string, number>();
  for (const c of local.chapters) {
    chapterOrderBySubject.set(c.subjectId, Math.max(chapterOrderBySubject.get(c.subjectId) || 0, c.order || 0));
  }
  for (const c of [...incoming.chapters].sort((a, b) => (a.order || 0) - (b.order || 0))) {
    if (localChapterIds.has(c.id)) {
      chapterMap.set(c.id, c.id);
      continue;
    }
    const subjectId = subjectMap.get(c.subjectId) ?? (localSubjectIds.has(c.subjectId) ? c.subjectId : undefined);
    if (!subjectId) continue; // বিষয় নেই - এই অধ্যায়ের প্রশ্নগুলো "ভাঙা" ধরা হবে
    const hit = chapterByKey.get(`${subjectId}|${norm(c.name)}`);
    if (hit) {
      chapterMap.set(c.id, hit);
      continue;
    }
    const order = (chapterOrderBySubject.get(subjectId) || 0) + 1;
    chapterOrderBySubject.set(subjectId, order);
    const row = { ...c, subjectId, order };
    newChapters.push(row);
    chapterMap.set(c.id, row.id);
    chapterByKey.set(`${subjectId}|${norm(c.name)}`, row.id);
  }

  const localTopicIds = new Set(local.topics.map((t) => t.id));
  const topicByKey = new Map(local.topics.map((t) => [`${t.chapterId}|${norm(t.name)}`, t.id]));
  const topicOrderByChapter = new Map<string, number>();
  for (const t of local.topics) {
    topicOrderByChapter.set(t.chapterId, Math.max(topicOrderByChapter.get(t.chapterId) || 0, t.order || 0));
  }
  for (const t of [...incoming.topics].sort((a, b) => (a.order || 0) - (b.order || 0))) {
    if (localTopicIds.has(t.id)) {
      topicMap.set(t.id, t.id);
      continue;
    }
    const chapterId = chapterMap.get(t.chapterId) ?? (localChapterIds.has(t.chapterId) ? t.chapterId : undefined);
    if (!chapterId) continue;
    const hit = topicByKey.get(`${chapterId}|${norm(t.name)}`);
    if (hit) {
      topicMap.set(t.id, hit);
      continue;
    }
    const order = (topicOrderByChapter.get(chapterId) || 0) + 1;
    topicOrderByChapter.set(chapterId, order);
    const row = { ...t, chapterId, order };
    newTopics.push(row);
    topicMap.set(t.id, row.id);
    topicByKey.set(`${chapterId}|${norm(t.name)}`, row.id);
  }

  return { subjects: newSubjects, chapters: newChapters, topics: newTopics, topicMap };
}

/** একটি scope-এর কী কী যোগ হবে */
function planScope(
  incoming: ScopeData,
  local: LocalScopeSnapshot,
  otherLocal: LocalScopeSnapshot
): { plan: ScopePlan; validQuestionIds: Set<string>; stats: { qHave: number; sHave: number; iHave: number } } {
  const h = planHierarchy(incoming, local);
  const topicOk = (id: string) => h.topicMap.has(id);

  const stimuli: Stimulus[] = [];
  let sHave = 0;
  for (const s of incoming.stimuli) {
    if (local.stimulusIds.has(s.id) || otherLocal.stimulusIds.has(s.id)) {
      sHave++;
      continue;
    }
    if (!topicOk(s.topicId)) continue;
    stimuli.push({ ...s, topicId: h.topicMap.get(s.topicId)! });
  }

  const questions: Question[] = [];
  const validQuestionIds = new Set<string>();
  let qHave = 0;
  const incomingStimulusIds = new Set(incoming.stimuli.map((s) => s.id));
  const addedStimulusIds = new Set(stimuli.map((s) => s.id));
  for (const q of incoming.questions) {
    if (local.questionIds.has(q.id) || otherLocal.questionIds.has(q.id)) {
      qHave++;
      validQuestionIds.add(q.id);
      continue;
    }
    if (!topicOk(q.topicId)) continue;
    // উদ্দীপক ফাইলেও নেই, ফোনেও নেই -> প্রশ্নটা উদ্দীপক ছাড়া ঝুলে থাকবে; তাই বাদ
    if (
      q.stimulusId &&
      !addedStimulusIds.has(q.stimulusId) &&
      !local.stimulusIds.has(q.stimulusId) &&
      !otherLocal.stimulusIds.has(q.stimulusId) &&
      !incomingStimulusIds.has(q.stimulusId)
    ) {
      continue;
    }
    questions.push({ ...q, topicId: h.topicMap.get(q.topicId)! });
    validQuestionIds.add(q.id);
  }

  const images: BackupImage[] = [];
  let iHave = 0;
  for (const img of incoming.images) {
    if (local.imageIds.has(img.id) || otherLocal.imageIds.has(img.id)) {
      iHave++;
      continue;
    }
    images.push(img);
  }

  return {
    plan: { subjects: h.subjects, chapters: h.chapters, topics: h.topics, stimuli, questions, images },
    validQuestionIds,
    stats: { qHave, sHave, iHave },
  };
}

/** পরিকল্পনা: কিছুই লেখে না, শুধু হিসাব করে। newId = নতুন ক্যাটেগরি/প্রশ্নপত্রের id বানানোর ফাংশন */
export function planImport(parsed: ParsedBackup, local: LocalSnapshot, newId: () => string): ImportPlan {
  const warnings = [...parsed.warnings];
  const t = planScope(parsed.scopes.type, local.type, local.chapter);
  const c = planScope(parsed.scopes.chapter, local.chapter, local.type);

  // প্রশ্নপত্রের প্রতিটি প্রশ্ন ফাইলে বা ফোনে থাকতে হবে
  const available = (id: string) =>
    t.validQuestionIds.has(id) || c.validQuestionIds.has(id) || local.type.questionIds.has(id) || local.chapter.questionIds.has(id);

  const existingCatByName = new Map(local.categories.map((cat) => [norm(cat.name), cat]));
  let nextCatOrder = local.categories.reduce((m, cat) => Math.max(m, cat.order || 0), 0);

  const categories: CategoryPlan[] = [];
  const papersToAdd: PlannedPaper[] = [];

  for (const cat of parsed.categories) {
    const existing = existingCatByName.get(norm(cat.name));
    const existingPapers = existing ? local.papers.filter((p) => p.categoryId === existing.id) : [];
    const keys = new Set(existingPapers.map(paperKey));
    const usedNumbers = new Set<number>();
    let maxNumber = 0;
    for (const p of existingPapers) {
      const n = labelNumber(p.shortName, existing!.name);
      if (n !== null) {
        usedNumbers.add(n);
        maxNumber = Math.max(maxNumber, n);
      }
    }
    const targetName = existing ? existing.name : cat.name;

    const row: CategoryPlan = {
      name: targetName,
      isNew: !existing,
      existingId: existing?.id,
      order: existing ? undefined : ++nextCatOrder,
      createdAt: cat.createdAt,
      papersTotal: cat.papers.length,
      papersAdd: 0,
      papersDuplicate: 0,
      papersBroken: 0,
    };

    for (const p of cat.papers) {
      const ids = p.questionIds || [];
      if (!ids.every(available)) {
        row.papersBroken++;
        continue;
      }
      if (keys.has(paperKey(p))) {
        row.papersDuplicate++;
        continue;
      }
      keys.add(paperKey(p));
      // একই ক্যাটেগরিতে একই "নাম-সংখ্যা" দুবার হলে পরের সংখ্যা দেওয়া হয়
      let shortName = p.shortName;
      const n = labelNumber(p.shortName, targetName);
      if (n !== null) {
        if (usedNumbers.has(n)) {
          maxNumber += 1;
          shortName = `${targetName.trim()}-${toBnDigits(maxNumber)}`;
          usedNumbers.add(maxNumber);
        } else {
          usedNumbers.add(n);
          maxNumber = Math.max(maxNumber, n);
        }
      }
      papersToAdd.push({
        categoryName: targetName,
        paper: { ...p, id: newId(), shortName, category: targetName, categoryId: undefined },
      });
      row.papersAdd++;
    }
    categories.push(row);
  }

  // ছবি: প্রশ্ন/উদ্দীপক যে ছবির কথা বলে তা ফাইলে বা ফোনে আছে কি
  const haveImage = new Set<string>([
    ...local.type.imageIds,
    ...local.chapter.imageIds,
    ...parsed.scopes.type.images.map((i) => i.id),
    ...parsed.scopes.chapter.images.map((i) => i.id),
  ]);
  let missingImages = 0;
  for (const q of [...t.plan.questions, ...c.plan.questions]) {
    for (const id of q.solutionImageIds || []) if (!haveImage.has(id)) missingImages++;
  }
  for (const s of [...t.plan.stimuli, ...c.plan.stimuli]) {
    for (const id of s.imageIds || []) if (!haveImage.has(id)) missingImages++;
  }
  if (missingImages) warnings.push(`${missingImages}টি ছবি ফাইলে বা ফোনে পাওয়া যায়নি (প্রশ্ন ঠিকই আসবে, ছবি ছাড়া)`);

  const brokenPapers = categories.reduce((n, x) => n + x.papersBroken, 0);
  if (brokenPapers) {
    warnings.push(`${brokenPapers}টি প্রশ্নপত্রের কিছু প্রশ্ন ফাইলে বা ফোনে নেই - সেগুলো ইম্পোর্ট হবে না`);
  }

  const totals = {
    newCategories: categories.filter((x) => x.isNew).length,
    newPapers: papersToAdd.length,
    duplicatePapers: categories.reduce((n, x) => n + x.papersDuplicate, 0),
    brokenPapers,
    newQuestions: t.plan.questions.length + c.plan.questions.length,
    newStimuli: t.plan.stimuli.length + c.plan.stimuli.length,
    newImages: t.plan.images.length + c.plan.images.length,
    newSubjects: t.plan.subjects.length + c.plan.subjects.length,
    newChapters: t.plan.chapters.length + c.plan.chapters.length,
    newTopics: t.plan.topics.length + c.plan.topics.length,
  };

  const nothingToDo =
    totals.newCategories === 0 &&
    totals.newPapers === 0 &&
    totals.newQuestions === 0 &&
    totals.newStimuli === 0 &&
    totals.newImages === 0;

  return {
    scopes: { type: t.plan, chapter: c.plan },
    categories,
    papersToAdd,
    alreadyHave: {
      questions: t.stats.qHave + c.stats.qHave,
      stimuli: t.stats.sHave + c.stats.sHave,
      images: t.stats.iHave + c.stats.iHave,
    },
    missingImages,
    totals,
    warnings,
    nothingToDo,
  };
}
