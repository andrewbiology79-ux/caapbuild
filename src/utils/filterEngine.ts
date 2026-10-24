import {
  db,
  chapterDb,
  type CqScope,
  type Subject,
  type Chapter,
  type Topic,
  type Question,
  type QuestionType,
  type Stimulus,
} from '../db/db';

/** One question joined with everything the Filter tab needs (both databases, one flat list) */
export interface FilterRow {
  /** unique across both databases */
  key: string;
  source: CqScope;
  question: Question;
  stimulus?: Stimulus;
  subjectName: string;
  chapterName: string;
  /** empty for Chapter CQ (it has no visible topic level) */
  topicName: string;
  /** stable position of the row in the natural (hierarchy) order */
  seq: number;
  /** lower-cased searchable text */
  haystack: string;
  /** ids of the paper categories whose papers contain this question */
  categoryIds: string[];
}

export interface FilterCriteria {
  text: string;
  sources: CqScope[];
  subjects: string[];
  /** `${subjectName}||${chapterName}` */
  chapters: string[];
  topics: string[];
  types: QuestionType[];
  ratings: number[];
  marks: number[];
  boards: string[];
  years: number[];
  /** paper-category ids the question has been used in */
  categories: string[];
  usage: 'any' | 'used' | 'unused';
  stimulus: 'any' | 'with' | 'without';
  solution: 'any' | 'with' | 'without';
}

export type SortMode = 'default' | 'rating-desc' | 'rating-asc' | 'marks-desc' | 'type';

export const EMPTY_CRITERIA: FilterCriteria = {
  text: '',
  sources: [],
  subjects: [],
  chapters: [],
  topics: [],
  types: [],
  ratings: [],
  marks: [],
  boards: [],
  years: [],
  categories: [],
  usage: 'any',
  stimulus: 'any',
  solution: 'any',
};

export interface FilterFacets {
  subjects: string[];
  chapters: Array<{ key: string; subject: string; name: string }>;
  topics: string[];
  marks: number[];
  boards: string[];
  years: number[];
  categories: Array<{ id: string; name: string }>;
}

export interface FilterDataset {
  rows: FilterRow[];
  facets: FilterFacets;
  loadedAt: number;
}

const TYPE_ORDER: Record<string, number> = { ক: 0, খ: 1, গ: 2, ঘ: 3 };

async function loadScope(
  source: CqScope,
  database: typeof db,
  startSeq: number,
  questionCategories: Map<string, Set<string>>
): Promise<FilterRow[]> {
  const subjects: Subject[] = await database.subjects.toArray();
  const chapters: Chapter[] = await database.chapters.toArray();
  const topics: Topic[] = await database.topics.toArray();
  const stimuli: Stimulus[] = await database.stimuli.toArray();
  const questions: Question[] = await database.questions.toArray();

  const subjectMap = new Map<string, Subject>(subjects.map((s): [string, Subject] => [s.id, s]));
  const chapterMap = new Map<string, Chapter>(chapters.map((c): [string, Chapter] => [c.id, c]));
  const topicMap = new Map<string, Topic>(topics.map((t): [string, Topic] => [t.id, t]));
  const stimulusMap = new Map<string, Stimulus>(stimuli.map((s): [string, Stimulus] => [s.id, s]));

  const rows: FilterRow[] = [];
  for (const q of questions) {
    const topic = topicMap.get(q.topicId);
    const chapter = topic ? chapterMap.get(topic.chapterId) : undefined;
    const subject = chapter ? subjectMap.get(chapter.subjectId) : undefined;
    if (!topic || !chapter || !subject) continue; // orphan — ignore

    const stimulus = q.stimulusId ? stimulusMap.get(q.stimulusId) : undefined;
    const haystack = [q.questionText, q.solutionText, q.answerText, stimulus?.text]
      .filter(Boolean)
      .join(' \n ')
      .toLowerCase();

    rows.push({
      key: `${source}:${q.id}`,
      source,
      question: q,
      stimulus,
      subjectName: subject.name,
      chapterName: chapter.name,
      topicName: source === 'chapter' ? '' : topic.name,
      seq: 0,
      haystack,
      categoryIds: [...(questionCategories.get(q.id) ?? [])],
    });
  }

  // Natural order: subject → chapter → topic → stimulus group → question order
  const idx = {
    s: new Map<string, number>(subjects.map((s): [string, number] => [s.name, s.order])),
    t: new Map<string, number>(topics.map((t): [string, number] => [t.id, t.order])),
  };
  rows.sort((a, b) => {
    const sa = idx.s.get(a.subjectName) ?? 0;
    const sb = idx.s.get(b.subjectName) ?? 0;
    if (sa !== sb) return sa - sb;
    const ca: number = chapterMap.get(topicMap.get(a.question.topicId)!.chapterId)!.order;
    const cb: number = chapterMap.get(topicMap.get(b.question.topicId)!.chapterId)!.order;
    if (ca !== cb) return ca - cb;
    const ta = idx.t.get(a.question.topicId) ?? 0;
    const tb = idx.t.get(b.question.topicId) ?? 0;
    if (ta !== tb) return ta - tb;
    return (a.question.order ?? 0) - (b.question.order ?? 0);
  });
  rows.forEach((r, i) => (r.seq = startSeq + i));
  return rows;
}

/** Read both databases and build one flat dataset + the facet lists for the filter sheet */
export async function loadFilterDataset(): Promise<FilterDataset> {
  // Which paper categories each question has been used in (papers live in the main database)
  const [categoryList, papers] = await Promise.all([db.categories.toArray(), db.papers.toArray()]);
  const questionCategories = new Map<string, Set<string>>();
  for (const paper of papers) {
    if (!paper.categoryId) continue;
    for (const qid of paper.questionIds || []) {
      let set = questionCategories.get(qid);
      if (!set) questionCategories.set(qid, (set = new Set<string>()));
      set.add(paper.categoryId);
    }
  }

  const typeRows = await loadScope('type', db, 0, questionCategories);
  const chapterRows = await loadScope('chapter', chapterDb, typeRows.length, questionCategories);
  const rows = [...typeRows, ...chapterRows];

  const subjects = new Set<string>();
  const chapters = new Map<string, { key: string; subject: string; name: string }>();
  const topics = new Set<string>();
  const marks = new Set<number>();
  const boards = new Set<string>();
  const years = new Set<number>();
  const usedCategoryIds = new Set<string>();

  for (const r of rows) {
    r.categoryIds.forEach((id) => usedCategoryIds.add(id));
    subjects.add(r.subjectName);
    const ck = `${r.subjectName}||${r.chapterName}`;
    if (!chapters.has(ck)) chapters.set(ck, { key: ck, subject: r.subjectName, name: r.chapterName });
    if (r.topicName) topics.add(r.topicName);
    if (typeof r.question.marks === 'number') marks.add(r.question.marks);
    for (const u of r.question.usedInBoards || []) {
      boards.add(u.board);
      (u.years || []).forEach((y) => years.add(y));
    }
  }

  return {
    rows,
    loadedAt: Date.now(),
    facets: {
      subjects: [...subjects],
      chapters: [...chapters.values()],
      topics: [...topics],
      marks: [...marks].sort((a, b) => a - b),
      boards: [...boards],
      years: [...years].sort((a, b) => b - a),
      categories: categoryList
        .filter((c) => usedCategoryIds.has(c.id))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((c) => ({ id: c.id, name: c.name })),
    },
  };
}

function inList<T>(list: T[], value: T): boolean {
  return list.length === 0 || list.includes(value);
}

export function matchesCriteria(row: FilterRow, c: FilterCriteria, textTerms: string[]): boolean {
  const q = row.question;

  if (!inList(c.sources, row.source)) return false;
  if (!inList(c.subjects, row.subjectName)) return false;
  if (!inList(c.chapters, `${row.subjectName}||${row.chapterName}`)) return false;
  if (c.topics.length > 0 && !c.topics.includes(row.topicName)) return false;
  if (!inList(c.types, q.type)) return false;
  if (c.ratings.length > 0 && !c.ratings.includes(Math.round(q.rating || 3))) return false;
  if (c.marks.length > 0 && !c.marks.includes(q.marks)) return false;

  const usedList = q.usedInBoards || [];
  if (c.usage === 'used' && usedList.length === 0) return false;
  if (c.usage === 'unused' && usedList.length > 0) return false;

  if (c.boards.length > 0 || c.years.length > 0) {
    const ok = usedList.some(
      (u) =>
        (c.boards.length === 0 || c.boards.includes(u.board)) &&
        (c.years.length === 0 || (u.years || []).some((y) => c.years.includes(y)))
    );
    if (!ok) return false;
  }

  if (c.categories.length > 0 && !row.categoryIds.some((id) => c.categories.includes(id))) return false;

  if (c.stimulus === 'with' && !row.stimulus) return false;
  if (c.stimulus === 'without' && row.stimulus) return false;

  const hasSolution = !!(q.solutionText?.trim() || q.answerText?.trim() || q.solutionImageIds?.length);
  if (c.solution === 'with' && !hasSolution) return false;
  if (c.solution === 'without' && hasSolution) return false;

  for (const term of textTerms) {
    if (!row.haystack.includes(term)) return false;
  }
  return true;
}

export function applyFilters(rows: FilterRow[], c: FilterCriteria, sort: SortMode): FilterRow[] {
  const terms = c.text
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const out = rows.filter((r) => matchesCriteria(r, c, terms));

  switch (sort) {
    case 'rating-desc':
      out.sort((a, b) => (b.question.rating || 3) - (a.question.rating || 3) || a.seq - b.seq);
      break;
    case 'rating-asc':
      out.sort((a, b) => (a.question.rating || 3) - (b.question.rating || 3) || a.seq - b.seq);
      break;
    case 'marks-desc':
      out.sort((a, b) => b.question.marks - a.question.marks || a.seq - b.seq);
      break;
    case 'type':
      out.sort(
        (a, b) =>
          (TYPE_ORDER[a.question.type] ?? 9) - (TYPE_ORDER[b.question.type] ?? 9) || a.seq - b.seq
      );
      break;
    default:
      out.sort((a, b) => a.seq - b.seq);
  }
  return out;
}

/** How many separate filters are switched on (for the badge on the Filter button) */
export function countActiveFilters(c: FilterCriteria): number {
  let n = 0;
  (['sources', 'subjects', 'chapters', 'topics', 'types', 'ratings', 'marks', 'boards', 'years', 'categories'] as const).forEach(
    (k) => {
      if (c[k].length > 0) n += 1;
    }
  );
  if (c.usage !== 'any') n += 1;
  if (c.stimulus !== 'any') n += 1;
  if (c.solution !== 'any') n += 1;
  return n;
}
