import {
  db,
  type Subject,
  type Chapter,
  type Topic,
  type Stimulus,
  type Question,
  type Paper,
} from '../db/db';
import { generateId, saveCategory } from '../db/api';
import { blobToBase64, base64ToBlob, exportJsonFile } from './fileExport';

/**
 * Shareable file of a Category (or of a single paper) — contains the papers and every
 * question / stimulus / image they need, so it can be imported on another phone.
 */
export interface CategorySharePayload {
  version: string;
  type: 'qb-category-share';
  exportedAt: string;
  category: { name: string };
  papers: Paper[];
  subjects: Subject[];
  chapters: Chapter[];
  topics: Topic[];
  stimuli: Stimulus[];
  questions: Question[];
  images: Array<{ id: string; fileName: string; data: string }>;
}

async function buildPayload(categoryName: string, papers: Paper[]): Promise<CategorySharePayload> {
  const questionIds = Array.from(new Set(papers.flatMap((p) => p.questionIds || [])));
  const questions = ((await db.questions.bulkGet(questionIds)).filter(Boolean) as Question[]);

  const stimulusIds = Array.from(new Set(questions.map((q) => q.stimulusId).filter(Boolean))) as string[];
  const stimuli = ((await db.stimuli.bulkGet(stimulusIds)).filter(Boolean) as Stimulus[]);

  const topicIds = Array.from(
    new Set([...questions.map((q) => q.topicId), ...stimuli.map((s) => s.topicId)].filter(Boolean))
  ) as string[];
  const topics = ((await db.topics.bulkGet(topicIds)).filter(Boolean) as Topic[]);

  const chapterIds = Array.from(new Set(topics.map((t) => t.chapterId).filter(Boolean)));
  const chapters = ((await db.chapters.bulkGet(chapterIds)).filter(Boolean) as Chapter[]);

  const subjectIds = Array.from(new Set(chapters.map((c) => c.subjectId).filter(Boolean)));
  const subjects = ((await db.subjects.bulkGet(subjectIds)).filter(Boolean) as Subject[]);

  const imageIdSet = new Set<string>();
  stimuli.forEach((s) => (s.imageIds || []).forEach((id) => imageIdSet.add(id)));
  questions.forEach((q) => (q.solutionImageIds || []).forEach((id) => imageIdSet.add(id)));

  const images: CategorySharePayload['images'] = [];
  if (imageIdSet.size > 0) {
    const dbImages = await db.images.where('id').anyOf(Array.from(imageIdSet)).toArray();
    for (const img of dbImages) {
      if (img.blob) {
        images.push({ id: img.id, fileName: img.fileName, data: await blobToBase64(img.blob) });
      }
    }
  }

  return {
    version: '1.0',
    type: 'qb-category-share',
    exportedAt: new Date().toISOString(),
    category: { name: categoryName },
    papers,
    subjects,
    chapters,
    topics,
    stimuli,
    questions,
    images,
  };
}

/**
 * Share a whole category (all its papers) as a file
 */
export async function exportCategoryShare(categoryId: string): Promise<boolean> {
  const category = await db.categories.get(categoryId);
  if (!category) throw new Error('ক্যাটেগরিটি পাওয়া যায়নি');
  const papers = await db.papers.where('categoryId').equals(categoryId).toArray();
  const payload = await buildPayload(category.name, papers);
  const dateStr = new Date().toISOString().split('T')[0];
  return await exportJsonFile(`qb-category-${dateStr}.json`, JSON.stringify(payload));
}

/**
 * Share a single paper as a file
 */
export async function exportPaperShare(paperId: string): Promise<boolean> {
  const paper = await db.papers.get(paperId);
  if (!paper) throw new Error('প্রশ্নপত্রটি পাওয়া যায়নি');
  const categoryName = paper.category?.trim() || 'সাধারণ';
  const payload = await buildPayload(categoryName, [paper]);
  const dateStr = new Date().toISOString().split('T')[0];
  return await exportJsonFile(`qb-paper-${dateStr}.json`, JSON.stringify(payload));
}

export function parseCategoryShare(jsonText: string): CategorySharePayload {
  let data: any;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new Error('ফাইলটি পড়া যায়নি (JSON ফরম্যাট ঠিক নয়)');
  }
  if (!data || data.type !== 'qb-category-share' || !Array.isArray(data.papers)) {
    throw new Error('এটি ক্যাটেগরি শেয়ার ফাইল নয়');
  }
  return {
    version: String(data.version || '1.0'),
    type: 'qb-category-share',
    exportedAt: String(data.exportedAt || ''),
    category: { name: String(data.category?.name || 'ইমপোর্টেড') },
    papers: data.papers,
    subjects: Array.isArray(data.subjects) ? data.subjects : [],
    chapters: Array.isArray(data.chapters) ? data.chapters : [],
    topics: Array.isArray(data.topics) ? data.topics : [],
    stimuli: Array.isArray(data.stimuli) ? data.stimuli : [],
    questions: Array.isArray(data.questions) ? data.questions : [],
    images: Array.isArray(data.images) ? data.images : [],
  };
}

async function addMissing<T extends { id: string }>(table: any, items: T[]): Promise<void> {
  if (!items.length) return;
  const existing: Array<T | undefined> = await table.bulkGet(items.map((i) => i.id));
  const missing = items.filter((_, idx) => !existing[idx]);
  if (missing.length) await table.bulkAdd(missing);
}

/**
 * Import a shared category/paper file. Existing local data is never overwritten.
 * Papers go into the category of the same name (created if it does not exist).
 */
export async function importCategoryShare(
  payload: CategorySharePayload
): Promise<{ categoryName: string; papersAdded: number; papersSkipped: number }> {
  // Images
  for (const img of payload.images) {
    if (!img?.id || !img.data) continue;
    const exists = await db.images.get(img.id);
    if (exists) continue;
    try {
      await db.images.put({ id: img.id, fileName: img.fileName || `${img.id}.webp`, blob: base64ToBlob(img.data) });
    } catch (e) {
      console.warn('Failed to import image', img.id, e);
    }
  }

  // Hierarchy + questions (only missing items are added)
  await addMissing(db.subjects, payload.subjects);
  await addMissing(db.chapters, payload.chapters);
  await addMissing(db.topics, payload.topics);
  await addMissing(db.stimuli, payload.stimuli);
  await addMissing(db.questions, payload.questions);

  // Category + papers
  const category = await saveCategory(payload.category.name);
  const existingPapers = await db.papers.where('categoryId').equals(category.id).toArray();
  const keyOf = (p: Paper) => `${p.shortName}|${p.title}|${(p.questionIds || []).join(',')}`;
  const existingKeys = new Set(existingPapers.map(keyOf));

  let added = 0;
  let skipped = 0;
  for (const p of payload.papers) {
    if (!p || !Array.isArray(p.questionIds)) {
      skipped++;
      continue;
    }
    if (existingKeys.has(keyOf(p))) {
      skipped++;
      continue;
    }
    await db.papers.add({
      ...p,
      id: generateId(),
      categoryId: category.id,
      category: category.name,
    });
    added++;
  }

  return { categoryName: category.name, papersAdded: added, papersSkipped: skipped };
}
