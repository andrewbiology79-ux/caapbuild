import { db, chapterDb, type Question } from '../db/db';

/**
 * Exam results are kept in the existing `meta` table (key `exam:results`) so no DB schema
 * migration is needed, and results travel with the normal full backup / restore.
 */
const KEY = 'exam:results';
const MAX_RESULTS = 300;

export interface ExamItemScore {
  questionId: string;
  type: string;
  marks: number;
  got: number;
  rating: number;
  /** অধ্যায়ের নাম (পুরোনো ফলাফলে থাকবে না) */
  chapter?: string;
  /** টপিকের নাম (পুরোনো ফলাফলে থাকবে না) */
  topic?: string;
}

export interface ExamResult {
  id: string;
  paperId: string;
  paperName: string;
  takenAt: number;
  /** allowed time in seconds */
  durationSec: number;
  /** time actually used in seconds */
  usedSec: number;
  totalMarks: number;
  gotMarks: number;
  items: ExamItemScore[];
}

export async function getExamResults(): Promise<ExamResult[]> {
  try {
    const rec = await db.meta.get(KEY);
    const list = Array.isArray(rec?.value) ? (rec!.value as ExamResult[]) : [];
    return [...list].sort((a, b) => b.takenAt - a.takenAt);
  } catch {
    return [];
  }
}

export async function saveExamResult(result: ExamResult): Promise<void> {
  const list = await getExamResults();
  const next = [result, ...list.filter((r) => r.id !== result.id)].slice(0, MAX_RESULTS);
  await db.meta.put({ key: KEY, value: next });
}

export async function deleteExamResult(id: string): Promise<void> {
  const list = await getExamResults();
  await db.meta.put({ key: KEY, value: list.filter((r) => r.id !== id) });
}

/** "২ ঘণ্টা ৩০ মিনিট", "90", 90, "1h 30m" → minutes. Falls back to `fallback`. */
export function parseDurationMinutes(duration: string | number | undefined, fallback = 60): number {
  if (duration === undefined || duration === null || duration === '') return fallback;
  if (typeof duration === 'number') return duration > 0 ? Math.round(duration) : fallback;
  const bnToEn: Record<string, string> = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
  const s = duration.replace(/[০-৯]/g, (d) => bnToEn[d]).toLowerCase();
  const hours = s.match(/(\d+(?:\.\d+)?)\s*(?:ঘণ্টা|ঘন্টা|ঘণ্টায়|hours?|hrs?|h)/);
  const mins = s.match(/(\d+(?:\.\d+)?)\s*(?:মিনিট|minutes?|mins?|m)/);
  if (hours || mins) {
    const total = (hours ? parseFloat(hours[1]) * 60 : 0) + (mins ? parseFloat(mins[1]) : 0);
    return total > 0 ? Math.round(total) : fallback;
  }
  const plain = parseFloat(s);
  return Number.isFinite(plain) && plain > 0 ? Math.round(plain) : fallback;
}

export interface TypeBreakdown {
  type: string;
  marks: number;
  got: number;
  percent: number;
  count: number;
}

/** Score share per question type (ক/খ/গ/ঘ) over any list of results */
export function breakdownByType(results: ExamResult[]): TypeBreakdown[] {
  const map = new Map<string, { marks: number; got: number; count: number }>();
  for (const r of results) {
    for (const it of r.items) {
      const key = it.type || '—';
      const cur = map.get(key) || { marks: 0, got: 0, count: 0 };
      cur.marks += it.marks;
      cur.got += it.got;
      cur.count += 1;
      map.set(key, cur);
    }
  }
  return Array.from(map.entries())
    .map(([type, v]) => ({ type, ...v, percent: v.marks > 0 ? Math.round((v.got / v.marks) * 100) : 0 }))
    .sort((a, b) => a.type.localeCompare(b.type, 'bn'));
}

/** Score share per difficulty rating (1–5) */
export function breakdownByRating(results: ExamResult[]): Array<{ rating: number; marks: number; got: number; percent: number; count: number }> {
  const map = new Map<number, { marks: number; got: number; count: number }>();
  for (const r of results) {
    for (const it of r.items) {
      const cur = map.get(it.rating) || { marks: 0, got: 0, count: 0 };
      cur.marks += it.marks;
      cur.got += it.got;
      cur.count += 1;
      map.set(it.rating, cur);
    }
  }
  return Array.from(map.entries())
    .map(([rating, v]) => ({ rating, ...v, percent: v.marks > 0 ? Math.round((v.got / v.marks) * 100) : 0 }))
    .sort((a, b) => a.rating - b.rating);
}

export function percentOf(r: Pick<ExamResult, 'gotMarks' | 'totalMarks'>): number {
  return r.totalMarks > 0 ? Math.round((r.gotMarks / r.totalMarks) * 100) : 0;
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
}

/** Looks up chapter/topic names for questions (both Type CQ and Chapter CQ databases). */
export async function resolveQuestionLocations(
  questions: Question[]
): Promise<Map<string, { chapter: string; topic: string }>> {
  const out = new Map<string, { chapter: string; topic: string }>();
  for (const d of [db, chapterDb]) {
    const topicIds = Array.from(new Set(questions.map((q) => q.topicId).filter(Boolean)));
    const topics = (await d.topics.bulkGet(topicIds)).filter((t): t is NonNullable<typeof t> => !!t);
    if (topics.length === 0) continue;
    const chapters = await d.chapters.bulkGet(Array.from(new Set(topics.map((t) => t.chapterId))));
    const chapterName = new Map(chapters.filter((c): c is NonNullable<typeof c> => !!c).map((c) => [c.id, c.name]));
    const topicInfo = new Map(topics.map((t) => [t.id, { chapter: chapterName.get(t.chapterId) ?? '', topic: t.name }]));
    for (const q of questions) {
      const info = topicInfo.get(q.topicId);
      if (info && !out.has(q.id)) out.set(q.id, info);
    }
  }
  return out;
}

export interface ChapterBreakdown {
  chapter: string;
  topics: Array<{ topic: string; marks: number; got: number; percent: number; count: number }>;
  marks: number;
  got: number;
  percent: number;
  count: number;
}

/** Score share per chapter (with its topics). Items saved before v28 have no chapter and are skipped. */
export function breakdownByChapter(results: ExamResult[]): ChapterBreakdown[] {
  const chapters = new Map<string, { marks: number; got: number; count: number; topics: Map<string, { marks: number; got: number; count: number }> }>();
  for (const r of results) {
    for (const it of r.items) {
      if (!it.chapter) continue;
      const c = chapters.get(it.chapter) || { marks: 0, got: 0, count: 0, topics: new Map() };
      c.marks += it.marks;
      c.got += it.got;
      c.count += 1;
      const tKey = it.topic || '—';
      const t = c.topics.get(tKey) || { marks: 0, got: 0, count: 0 };
      t.marks += it.marks;
      t.got += it.got;
      t.count += 1;
      c.topics.set(tKey, t);
      chapters.set(it.chapter, c);
    }
  }
  const pct = (got: number, marks: number) => (marks > 0 ? Math.round((got / marks) * 100) : 0);
  return Array.from(chapters.entries())
    .map(([chapter, c]) => ({
      chapter,
      marks: c.marks,
      got: c.got,
      count: c.count,
      percent: pct(c.got, c.marks),
      topics: Array.from(c.topics.entries())
        .map(([topic, t]) => ({ topic, ...t, percent: pct(t.got, t.marks) }))
        .sort((a, b) => a.percent - b.percent),
    }))
    .sort((a, b) => a.percent - b.percent);
}
