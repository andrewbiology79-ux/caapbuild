import Dexie, { type Table } from 'dexie';

export interface Subject {
  id: string;
  name: string;
  order: number;
}

export interface Chapter {
  id: string;
  subjectId: string;
  name: string;
  order: number;
}

export interface Topic {
  id: string;
  chapterId: string;
  name: string;
  order: number;
}

export interface Stimulus {
  id: string;
  topicId: string;
  text: string;
  imageIds: string[];
  boardTag?: string;
  /** boards/years in which the stimulus itself appeared (প্রশ্ন ইডিটে উদ্দীপকের নিচে বাছা হয়) */
  usedInBoards?: BoardUsage[];
  /** difficulty rating chosen for the stimulus (1-5) */
  rating?: number;
  /** where the question was collected from, e.g. "মেরি জি প্রশ্ন ব্যাংক" */
  reference?: string;
}

export type QuestionType = 'ক' | 'খ' | 'গ' | 'ঘ';

export interface BoardUsage {
  board: string;
  years: number[];
}

export interface Question {
  id: string;
  stimulusId?: string;
  topicId: string;
  type: QuestionType;
  marks: number;
  questionText: string;
  solutionText: string;
  solutionImageIds: string[];
  answerText?: string;
  rating: number; // 1 to 5
  order: number;
  usedInBoards: BoardUsage[];
}

export interface Category {
  id: string;
  name: string;
  order: number;
  createdAt: number;
}

export const DEFAULT_PAPER_NOTE =
  '[ দ্রষ্টব্য: ডান পাশের সংখ্যা প্রশ্নের পূর্ণমান নির্দেশক। প্রয়োজনীয় ক্ষেত্রে চিত্র অঙ্কন আবশ্যক। ]';

export interface Paper {
  id: string;
  shortName: string;
  category: string;
  categoryId?: string;
  createdAt: number;
  title: string;
  subjectLine?: string;
  /** দ্রষ্টব্য (note) printed under the paper header. undefined = default note, '' = hidden */
  note?: string;
  duration?: string | number;
  totalMarks?: number;
  questionIds: string[];
  /** manual position inside its category (smaller = higher). undefined = sorted by createdAt desc */
  order?: number;
}

export interface DbImage {
  id: string;
  fileName: string;
  blob: Blob;
}

export interface MetaRecord {
  key: string;
  value: any;
}

export class QbDatabase extends Dexie {
  subjects!: Table<Subject, string>;
  chapters!: Table<Chapter, string>;
  topics!: Table<Topic, string>;
  stimuli!: Table<Stimulus, string>;
  questions!: Table<Question, string>;
  papers!: Table<Paper, string>;
  categories!: Table<Category, string>;
  images!: Table<DbImage, string>;
  meta!: Table<MetaRecord, string>;

  constructor(name: string = 'QbExamDatabase') {
    super(name);

    this.version(1).stores({
      subjects: 'id, name, order',
      chapters: 'id, subjectId, name, order',
      topics: 'id, chapterId, name, order',
      stimuli: 'id, topicId',
      questions: 'id, stimulusId, topicId, type, rating, order',
      papers: 'id, shortName, category, createdAt',
      images: 'id, fileName',
      meta: 'key',
    });

    this.version(2)
      .stores({
        subjects: 'id, name, order',
        chapters: 'id, subjectId, name, order',
        topics: 'id, chapterId, name, order',
        stimuli: 'id, topicId',
        questions: 'id, stimulusId, topicId, type, rating, order',
        papers: 'id, shortName, category, categoryId, createdAt',
        categories: 'id, name, order, createdAt',
        images: 'id, fileName',
        meta: 'key',
      })
      .upgrade(async (tx) => {
        const papersTable = tx.table<Paper, string>('papers');
        const categoriesTable = tx.table<Category, string>('categories');

        const allPapers = await papersTable.toArray();
        const catMap = new Map<string, string>(); // name -> id

        let order = 1;
        for (const p of allPapers) {
          const catName = p.category?.trim();
          if (catName && !catMap.has(catName)) {
            const catId = `cat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            await categoriesTable.add({
              id: catId,
              name: catName,
              order: order++,
              createdAt: Date.now(),
            });
            catMap.set(catName, catId);
          }
        }

        // If categories still empty, add default sample categories
        if (catMap.size === 0) {
          const defCats = ['উইকলি মডেল টেস্ট', 'চ্যাপ্টার অ্যান্ড টেস্ট'];
          for (let i = 0; i < defCats.length; i++) {
            const catId = `cat_default_${i + 1}`;
            await categoriesTable.add({
              id: catId,
              name: defCats[i],
              order: i + 1,
              createdAt: Date.now(),
            });
            catMap.set(defCats[i], catId);
          }
        }

        // Assign categoryId to papers
        for (const p of allPapers) {
          const catName = p.category?.trim();
          const catId = catName ? catMap.get(catName) : undefined;
          if (catId) {
            await papersTable.update(p.id, { categoryId: catId });
          }
        }
      });
  }
}

/** Which question collection a screen / API works on */
export type CqScope = 'type' | 'chapter';

/** Type CQ (formerly "Collection") — keeps the original DB name so old data stays intact */
export const db = new QbDatabase('QbExamDatabase');
/** Chapter CQ — separate IndexedDB database (faster, isolated import/export) */
export const chapterDb = new QbDatabase('QbChapterCqDatabase');

export function getDb(scope: CqScope): QbDatabase {
  return scope === 'chapter' ? chapterDb : db;
}

export default db;
