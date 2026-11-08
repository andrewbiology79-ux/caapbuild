import { getDb, type CqScope, type Category, type Subject, type Chapter, type Topic, type Stimulus, type Question, type Paper, type DbImage } from '../db/db';
import { blobToBase64, base64ToBlob, exportJsonFile } from './fileExport';
import { BACKUP_FOLDERS } from './storageAccess';
import { compressImageToWebP } from './imageCompressor';
import { hydrateImages } from '../storage/imageStore';
import { pauseSync, resumeSync, rebuildFolders, flushAfterBulkChange } from '../storage/syncEngine';
import { loadCustomBoards, saveCustomBoards, type CustomBoard } from './boards';

export interface CollectionJsonSchema {
  version: string;
  type: 'qb-question-collection';
  /** which collection this file belongs to: 'type' (Type CQ) or 'chapter' (Chapter CQ). Missing = legacy Type CQ file */
  scope?: CqScope;
  exportedAt: string;
  subjects: Subject[];
  chapters: Chapter[];
  topics: Topic[];
  stimuli: Stimulus[];
  questions: Question[];
  images?: Array<{
    id: string;
    fileName: string;
    data?: string; // base64
  }>;
}

export interface FullBackupJsonSchema {
  version: string;
  type: 'qb-full-backup';
  scope?: CqScope;
  exportedAt: string;
  subjects: Subject[];
  chapters: Chapter[];
  topics: Topic[];
  stimuli: Stimulus[];
  questions: Question[];
  papers: Paper[];
  meta: Array<{ key: string; value: any }>;
  images: Array<{
    id: string;
    fileName: string;
    data: string; // base64
  }>;
}

export interface CollectionPreviewResult {
  valid: boolean;
  errorMessage?: string;
  subjectsCount: number;
  chaptersCount: number;
  topicsCount: number;
  stimuliCount: number;
  totalQuestions: number;
  newQuestionsCount: number;
  duplicateQuestionsCount: number;
  missingImageFiles: string[];
  rawPayload?: CollectionJsonSchema;
}

export interface ImportOptions {
  mode: 'merge' | 'replace';
  manualFiles?: File[];
}

/** Current file format version (1.0 = old files, 1.1 = adds stimulus/question extras) */
export const COLLECTION_FORMAT_VERSION = '1.1';

const IMG_MARKER_RE = /\[\[img:([^\]\s]+)\]\]/g;

/** Image ids written inside a solution text as [[img:<id>]] markers */
function imageIdsFromMarkers(text: string | undefined | null): string[] {
  if (!text) return [];
  const out: string[] = [];
  const re = new RegExp(IMG_MARKER_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return out;
}

/** Every image id a stimulus / question points to (list fields + solution markers) */
function stimulusImageIdsOf(s: Stimulus): string[] {
  return Array.isArray(s.imageIds) ? s.imageIds : [];
}
function questionImageIdsOf(q: Question): string[] {
  const ids = Array.isArray(q.solutionImageIds) ? q.solutionImageIds : [];
  return Array.from(new Set([...ids, ...imageIdsFromMarkers(q.solutionText)]));
}

const DEFAULT_MARKS: Record<string, number> = { 'ক': 1, 'খ': 2, 'গ': 3, 'ঘ': 4 };

function cleanBoardUsage(list: any): Array<{ board: string; years: number[] }> {
  if (!Array.isArray(list)) return [];
  return list
    .filter((b) => b && typeof b.board === 'string' && b.board.trim() !== '')
    .map((b) => ({
      board: b.board,
      years: Array.isArray(b.years) ? b.years.map((y: any) => Number(y)).filter((y: number) => Number.isFinite(y)) : [],
    }));
}

function cleanRating(v: any, fallback: number | undefined): number | undefined {
  const n = Number(v);
  if (Number.isFinite(n) && n >= 1 && n <= 5) return Math.round(n);
  return fallback;
}

/**
 * Bring a file written by ANY older version of the app up to the current data shape,
 * so newer screens (board tags, ratings, picture position, solution markers …) never meet a missing field.
 * Nothing is removed — only missing / malformed fields are filled in.
 */
export function normalizeCollectionPayload(data: CollectionJsonSchema): CollectionJsonSchema {
  const stimuli: Stimulus[] = (Array.isArray(data.stimuli) ? data.stimuli : []).map((s) => {
    const imageIds = stimulusImageIdsOf(s);
    const out: Stimulus = {
      ...s,
      text: typeof s.text === 'string' ? s.text : '',
      imageIds,
      usedInBoards: cleanBoardUsage(s.usedInBoards),
    };
    const top = Number((s as any).imageTopCount);
    if (Number.isFinite(top) && top > 0) out.imageTopCount = Math.min(Math.floor(top), imageIds.length);
    else delete (out as any).imageTopCount;
    const r = cleanRating((s as any).rating, undefined);
    if (r === undefined) delete (out as any).rating;
    else out.rating = r;
    if (typeof s.reference !== 'string' || !s.reference.trim()) delete (out as any).reference;
    return out;
  });

  const questions: Question[] = (Array.isArray(data.questions) ? data.questions : []).map((q, i) => {
    const type = (['ক', 'খ', 'গ', 'ঘ'] as const).includes(q.type as any) ? q.type : 'ক';
    const marks = Number(q.marks);
    return {
      ...q,
      type,
      marks: Number.isFinite(marks) && marks > 0 ? marks : DEFAULT_MARKS[type] ?? 1,
      questionText: typeof q.questionText === 'string' ? q.questionText : '',
      solutionText: typeof q.solutionText === 'string' ? q.solutionText : '',
      solutionImageIds: questionImageIdsOf(q),
      rating: cleanRating(q.rating, 3) as number,
      order: Number.isFinite(Number(q.order)) ? Number(q.order) : i + 1,
      usedInBoards: cleanBoardUsage(q.usedInBoards),
    } as Question;
  });

  return { ...data, stimuli, questions };
}

/**
 * Export Question Collection to JSON file
 */
export async function buildQuestionCollectionExport(
  scope: CqScope = 'type',
  pretty = true
): Promise<{ fileName: string; json: string; questionCount: number; imageCount: number; missingImages: number }> {
  const db = getDb(scope);
  try {
    const [subjects, chapters, topics, stimuli, questions] = await Promise.all([
      db.subjects.toArray(),
      db.chapters.toArray(),
      db.topics.toArray(),
      db.stimuli.toArray(),
      db.questions.toArray(),
    ]);

    // Collect all referenced image IDs
    const imageIdSet = new Set<string>();
    for (const s of stimuli) {
      stimulusImageIdsOf(s).forEach((id) => imageIdSet.add(id));
    }
    for (const q of questions) {
      questionImageIdsOf(q).forEach((id) => imageIdSet.add(id));
    }

    const exportedImages: Array<{ id: string; fileName: string; data: string }> = [];
    if (imageIdSet.size > 0) {
      const dbImages = await hydrateImages(db, await db.images.where('id').anyOf(Array.from(imageIdSet)).toArray());
      for (const img of dbImages) {
        if (img.blob) {
          const b64 = await blobToBase64(img.blob);
          exportedImages.push({
            id: img.id,
            fileName: img.fileName,
            data: b64,
          });
        }
      }
    }

    const payload: CollectionJsonSchema = {
      version: COLLECTION_FORMAT_VERSION,
      type: 'qb-question-collection',
      scope,
      exportedAt: new Date().toISOString(),
      subjects,
      chapters,
      topics,
      stimuli,
      questions,
      images: exportedImages,
    };

    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `qb-${scope === 'chapter' ? 'chapter' : 'type'}-cq-${dateStr}.json`;
    return {
      fileName,
      json: pretty ? JSON.stringify(payload, null, 2) : JSON.stringify(payload),
      questionCount: questions.length,
      imageCount: exportedImages.length,
      // প্রশ্ন/উদ্দীপক যে ছবির id ধরে আছে অথচ ছবির ফাইল পাওয়া যায়নি (আগে চুপচাপ বাদ পড়ত)
      missingImages: imageIdSet.size - exportedImages.length,
    };
  } catch (err) {
    console.error('Failed to export question collection:', err);
    throw err;
  }
}

export async function exportQuestionCollection(scope: CqScope = 'type'): Promise<boolean> {
  const { fileName, json } = await buildQuestionCollectionExport(scope, true);
  return await exportJsonFile(fileName, json, {
    folder: scope === 'chapter' ? BACKUP_FOLDERS.chapter : BACKUP_FOLDERS.type,
  });
}

/**
 * Validate and generate preview statistics for an uploaded Collection JSON file
 */
export async function parseAndValidateCollectionJson(
  jsonText: string,
  scope: CqScope = 'type'
): Promise<CollectionPreviewResult> {
  const db = getDb(scope);
  try {
    const data = JSON.parse(jsonText);

    if (!data || typeof data !== 'object') {
      return {
        valid: false,
        errorMessage: 'ফাইলটি খালি বা সঠিক JSON ফরম্যাটে নেই।',
        subjectsCount: 0,
        chaptersCount: 0,
        topicsCount: 0,
        stimuliCount: 0,
        totalQuestions: 0,
        newQuestionsCount: 0,
        duplicateQuestionsCount: 0,
        missingImageFiles: [],
      };
    }

    // Require essential collections
    if (!Array.isArray(data.subjects) || !Array.isArray(data.chapters) || !Array.isArray(data.topics) || !Array.isArray(data.questions)) {
      return {
        valid: false,
        errorMessage: 'অসম্পূর্ণ বা অবৈধ কাঠামো। ফাইলে বিষয়, অধ্যায়, টপিক বা প্রশ্ন তালিকা অনুপস্থিত।',
        subjectsCount: 0,
        chaptersCount: 0,
        topicsCount: 0,
        stimuliCount: 0,
        totalQuestions: 0,
        newQuestionsCount: 0,
        duplicateQuestionsCount: 0,
        missingImageFiles: [],
      };
    }

    // A Chapter CQ file must not be imported into Type CQ (and vice versa)
    const fileScope: CqScope = data.scope === 'chapter' ? 'chapter' : 'type';
    if (fileScope !== scope) {
      return {
        valid: false,
        errorMessage:
          scope === 'chapter'
            ? 'এটি Type CQ এর ফাইল। Chapter CQ তে ইমপোর্ট করতে Chapter CQ থেকে এক্সপোর্ট করা ফাইল দিন।'
            : 'এটি Chapter CQ এর ফাইল। Type CQ তে ইমপোর্ট করতে Type CQ থেকে এক্সপোর্ট করা ফাইল দিন।',
        subjectsCount: 0,
        chaptersCount: 0,
        topicsCount: 0,
        stimuliCount: 0,
        totalQuestions: 0,
        newQuestionsCount: 0,
        duplicateQuestionsCount: 0,
        missingImageFiles: [],
      };
    }

    // Fill in fields that older files do not have (board usage, rating, picture position …)
    const normalized = normalizeCollectionPayload(data as CollectionJsonSchema);

    const existingKeys = await db.questions.toCollection().primaryKeys();
    const existingIds = new Set(existingKeys);

    let duplicateCount = 0;
    const questions: Question[] = normalized.questions;

    for (const q of questions) {
      if (q.id && existingIds.has(q.id)) {
        duplicateCount++;
      }
    }

    const totalQuestions = questions.length;
    const newQuestionsCount = Math.max(0, totalQuestions - duplicateCount);

    // Analyze Images: find if any referenced images lack base64 data
    const embeddedImageIds = new Set<string>();
    const embeddedFileNames = new Set<string>();

    if (Array.isArray(data.images)) {
      for (const img of data.images) {
        if (img.data) {
          if (img.id) embeddedImageIds.add(img.id);
          if (img.fileName) embeddedFileNames.add(img.fileName.toLowerCase());
        }
      }
    }

    const missingImageFilesSet = new Set<string>();

    // Check images metadata in payload
    if (Array.isArray(data.images)) {
      for (const img of data.images) {
        if (!img.data && img.fileName) {
          missingImageFilesSet.add(img.fileName);
        }
      }
    }

    // Every picture used by a stimulus OR a solution must be embedded (or picked by hand)
    const imageMeta = new Map<string, string>();
    if (Array.isArray(data.images)) {
      for (const i of data.images) if (i?.id && i.fileName) imageMeta.set(i.id, i.fileName);
    }
    const checkImageId = (imgId: string) => {
      if (embeddedImageIds.has(imgId)) return;
      missingImageFilesSet.add(imageMeta.get(imgId) || `image-${String(imgId).slice(0, 8)}.png`);
    };
    for (const st of normalized.stimuli) stimulusImageIdsOf(st).forEach(checkImageId);
    for (const q of normalized.questions) questionImageIdsOf(q).forEach(checkImageId);

    return {
      valid: true,
      subjectsCount: data.subjects.length,
      chaptersCount: data.chapters.length,
      topicsCount: data.topics.length,
      stimuliCount: normalized.stimuli.length,
      totalQuestions,
      newQuestionsCount,
      duplicateQuestionsCount: duplicateCount,
      missingImageFiles: Array.from(missingImageFilesSet),
      rawPayload: normalized,
    };
  } catch (err: any) {
    return {
      valid: false,
      errorMessage: `JSON ফাইল পড়তে ব্যর্থ হয়েছে: ${err.message || 'ভুল সিনট্যাক্স'}`,
      subjectsCount: 0,
      chaptersCount: 0,
      topicsCount: 0,
      stimuliCount: 0,
      totalQuestions: 0,
      newQuestionsCount: 0,
      duplicateQuestionsCount: 0,
      missingImageFiles: [],
    };
  }
}

/**
 * Execute Question Collection Import
 */
export async function executeCollectionImport(
  payload: CollectionJsonSchema,
  options: ImportOptions,
  scope: CqScope = 'type'
): Promise<{ subjects: number; questions: number; images: number }> {
  // folder sync: no scanning while the database is being rewritten, then the folders follow the new data
  pauseSync();
  try {
    const result = await executeCollectionImportInner(payload, options, scope);
    if (options.mode === 'replace') await rebuildFolders([scope]);
    else await flushAfterBulkChange();
    return result;
  } finally {
    resumeSync();
  }
}

async function executeCollectionImportInner(
  payload: CollectionJsonSchema,
  options: ImportOptions,
  scope: CqScope
): Promise<{ subjects: number; questions: number; images: number }> {
  const db = getDb(scope);
  const { mode, manualFiles = [] } = options;
  // older files / hand-made files: make sure every record has the fields the app now expects
  payload = normalizeCollectionPayload(payload);

  let imageSavedCount = 0;

  // ধাপ ১.৩: "Replace"-এ পুরনো ছবি আগে মোছা হয় না (মাঝপথে ব্যর্থ হলে ছবি হারাত)।
  // শুধু পুরনো ছবির id মনে রাখা হয়; ইমপোর্ট পুরোপুরি সফল হওয়ার পর যেগুলো আর কোনো প্রশ্ন/উদ্দীপক
  // ধরে নেই সেগুলোই মোছা হয় (নইলে অব্যবহৃত ফাইল হয়ে পড়ে থাকত)।
  const oldImageIds: string[] =
    mode === 'replace' ? ((await db.images.toCollection().primaryKeys()) as string[]) : [];

  // 1. Process Embedded Images (base64)
  if (payload.images && Array.isArray(payload.images)) {
    for (const img of payload.images) {
      if (img.id && img.data) {
        try {
          const blob = base64ToBlob(img.data);
          await db.images.put({
            id: img.id,
            fileName: img.fileName || `${img.id}.webp`,
            blob,
          });
          imageSavedCount++;
        } catch (e) {
          console.warn('Failed to parse base64 image:', img.id, e);
        }
      }
    }
  }

  // 2. Process Manually Picked Files (if user uploaded images without base64)
  if (manualFiles.length > 0) {
    // Map of fileName (lowercase) -> file
    const fileMap = new Map<string, File>();
    for (const f of manualFiles) {
      fileMap.set(f.name.toLowerCase(), f);
    }

    if (payload.images && Array.isArray(payload.images)) {
      for (const img of payload.images) {
        if (!img.data && img.fileName) {
          const match = fileMap.get(img.fileName.toLowerCase());
          if (match) {
            try {
              const { blob } = await compressImageToWebP(match, 800, 0.8);
              await db.images.put({
                id: img.id,
                fileName: img.fileName,
                blob,
              });
              imageSavedCount++;
            } catch (e) {
              console.warn('Failed to compress uploaded image:', img.fileName, e);
            }
          }
        }
      }
    }
  }

  // 3. Database Write (Transaction)
  await db.transaction('rw', [db.subjects, db.chapters, db.topics, db.stimuli, db.questions], async () => {
    if (mode === 'replace') {
      // Clear all collection tables
      await db.questions.clear();
      await db.stimuli.clear();
      await db.topics.clear();
      await db.chapters.clear();
      await db.subjects.clear();
    }

    if (payload.subjects?.length) {
      await db.subjects.bulkPut(payload.subjects);
    }
    if (payload.chapters?.length) {
      await db.chapters.bulkPut(payload.chapters);
    }
    if (payload.topics?.length) {
      await db.topics.bulkPut(payload.topics);
    }
    if (payload.stimuli?.length) {
      await db.stimuli.bulkPut(payload.stimuli);
    }
    if (payload.questions?.length) {
      await db.questions.bulkPut(payload.questions);
    }
  });

  // সফল হওয়ার পরে: পুরনো ছবির মধ্যে যেগুলো এখন কেউ ধরে নেই সেগুলো মোছা
  if (mode === 'replace' && oldImageIds.length) {
    try {
      const [stimNow, qNow] = await Promise.all([db.stimuli.toArray(), db.questions.toArray()]);
      const used = new Set<string>();
      stimNow.forEach((st) => stimulusImageIdsOf(st).forEach((id) => used.add(id)));
      qNow.forEach((q) => questionImageIdsOf(q).forEach((id) => used.add(id)));
      const orphans = oldImageIds.filter((id) => !used.has(id));
      if (orphans.length) await db.images.bulkDelete(orphans);
    } catch (e) {
      console.warn('পুরনো অব্যবহৃত ছবি মোছা যায়নি (ডেটা অক্ষত):', e);
    }
  }

  return {
    subjects: payload.subjects?.length || 0,
    questions: payload.questions?.length || 0,
    images: imageSavedCount,
  };
}

/**
 * Generate Sample Collection JSON for downloading
 */
export function getSampleCollectionJson(scope: CqScope = 'type'): string {
  const sampleData: CollectionJsonSchema = {
    version: COLLECTION_FORMAT_VERSION,
    type: 'qb-question-collection',
    scope,
    exportedAt: new Date().toISOString(),
    subjects: [
      {
        id: 'sample-sub-1',
        name: 'পদার্থবিজ্ঞান ১ম পত্র',
        order: 1,
      },
    ],
    chapters: [
      {
        id: 'sample-chap-1',
        subjectId: 'sample-sub-1',
        name: 'মহাকর্ষ ও অভিকর্ষ',
        order: 1,
      },
    ],
    topics: [
      {
        id: 'sample-top-1',
        chapterId: 'sample-chap-1',
        name: 'মহাকর্ষীয় বিভব ও প্রাবল্য',
        order: 1,
      },
    ],
    stimuli: [
      {
        id: 'sample-stim-1',
        topicId: 'sample-top-1',
        text: 'চিত্রে $M = 6 \\times 10^{24}\\ \\text{kg}$ ভরের একটি গ্রহ থেকে $r = 6.4 \\times 10^6\\ \\text{m}$ দূরত্বে একটি কৃত্রিম উপগ্রহ আবর্তন করছে। মহাকর্ষীয় ধ্রুবক $G = 6.673 \\times 10^{-11}\\ \\text{N m}^2\\ \\text{kg}^{-2}$।',
        boardTag: "DB'২৫",
        imageIds: [],
        imageTopCount: 0,
        usedInBoards: [{ board: 'DB', years: [2025] }],
        rating: 3,
        reference: 'নমুনা প্রশ্ন ব্যাংক',
      },
    ],
    questions: [
      {
        id: 'sample-q-1',
        stimulusId: 'sample-stim-1',
        topicId: 'sample-top-1',
        type: 'গ',
        marks: 3,
        rating: 3,
        order: 1,
        questionText: 'উপগ্রহটির অবস্থান বিন্দুতে মহাকর্ষীয় বিভব $V$ এর মান হিসাব করো।',
        solutionText:
          'আমরা জানি, মহাকর্ষীয় বিভব $V = -\\frac{GM}{r} = -\\frac{6.673 \\times 10^{-11} \\times 6 \\times 10^{24}}{6.4 \\times 10^6} = -6.256 \\times 10^7\\ \\text{J kg}^{-1}$',
        solutionImageIds: [],
        answerText: '-6.256 × 10⁷ J kg⁻¹',
        usedInBoards: [{ board: 'DB', years: [2025] }],
      },
      {
        id: 'sample-q-2',
        stimulusId: 'sample-stim-1',
        topicId: 'sample-top-1',
        type: 'ঘ',
        marks: 4,
        rating: 4,
        order: 2,
        questionText: 'দূরত্ব দ্বিগুণ করা হলে মহাকর্ষীয় প্রাবল্যের কী রূপ পরিবর্তন হবে? গাণিতিক যুক্তি দাও।',
        solutionText:
          'আমরা জানি মহাকর্ষীয় প্রাবল্য $E = \\frac{GM}{r^2}$। দূরত্ব $r\' = 2r$ হলে, নতুন প্রাবল্য $E\' = \\frac{GM}{(2r)^2} = \\frac{1}{4} E$। অর্থাৎ প্রাবল্য পূর্বের মানের এক-চতুর্থাংশ হবে।',
        solutionImageIds: [],
        answerText: '১/৪ অংশ হবে',
        usedInBoards: [{ board: 'DB', years: [2025] }],
      },
    ],
    images: [],
  };

  return JSON.stringify(sampleData, null, 2);
}

/**
 * Full System Backup: exports all tables and image blobs
 */
export async function exportFullBackup(scope: CqScope = 'type'): Promise<boolean> {
  const db = getDb(scope);
  try {
    const [subjects, chapters, topics, stimuli, questions, papers, meta, images] = await Promise.all([
      db.subjects.toArray(),
      db.chapters.toArray(),
      db.topics.toArray(),
      db.stimuli.toArray(),
      db.questions.toArray(),
      db.papers.toArray(),
      db.meta.toArray(),
      db.images.toArray(),
    ]);

    const exportedImages: Array<{ id: string; fileName: string; data: string }> = [];
    for (const img of await hydrateImages(db, images)) {
      if (img.blob) {
        const b64 = await blobToBase64(img.blob);
        exportedImages.push({
          id: img.id,
          fileName: img.fileName,
          data: b64,
        });
      }
    }

    const fullPayload: FullBackupJsonSchema = {
      version: '1.0',
      type: 'qb-full-backup',
      scope,
      exportedAt: new Date().toISOString(),
      subjects,
      chapters,
      topics,
      stimuli,
      questions,
      papers,
      meta,
      images: exportedImages,
    };

    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `qb-${scope === 'chapter' ? 'chapter' : 'type'}-backup-${dateStr}.json`;
    return await exportJsonFile(fileName, JSON.stringify(fullPayload, null, 2), {
      folder: BACKUP_FOLDERS.full,
    });
  } catch (err) {
    console.error('Full backup export failed:', err);
    throw err;
  }
}

/**
 * Full System Restore: completely replaces database with backup content
 */
/** `scope` omitted = decided by the backup file itself (old files without a scope = Type CQ) */
export async function restoreFullBackup(jsonText: string, scope?: CqScope): Promise<void> {
  const data = JSON.parse(jsonText);
  const target: CqScope = scope ?? (data && data.scope === 'chapter' ? 'chapter' : 'type');
  pauseSync();
  try {
    await restoreFullBackupInner(data, target);
    await rebuildFolders([target]);
  } finally {
    resumeSync();
  }
}

async function restoreFullBackupInner(data: any, target: CqScope): Promise<void> {
  const db = getDb(target);

  if (!data || typeof data !== 'object' || !Array.isArray(data.subjects) || !Array.isArray(data.questions)) {
    throw new Error('অবৈধ ব্যাকআপ ফাইল। ফাইলে ডাটাবেসের টেবিল পাওয়া যায়নি।');
  }

  // Clear all Dexie tables
  await db.transaction(
    'rw',
    [db.subjects, db.chapters, db.topics, db.stimuli, db.questions, db.papers, db.meta, db.images],
    async () => {
      await Promise.all([
        db.subjects.clear(),
        db.chapters.clear(),
        db.topics.clear(),
        db.stimuli.clear(),
        db.questions.clear(),
        db.papers.clear(),
        db.meta.clear(),
        db.images.clear(),
      ]);

      if (data.subjects?.length) await db.subjects.bulkAdd(data.subjects);
      if (data.chapters?.length) await db.chapters.bulkAdd(data.chapters);
      if (data.topics?.length) await db.topics.bulkAdd(data.topics);
      if (data.stimuli?.length) await db.stimuli.bulkAdd(data.stimuli);
      if (data.questions?.length) await db.questions.bulkAdd(data.questions);
      if (data.papers?.length) await db.papers.bulkAdd(data.papers);
      if (data.meta?.length) await db.meta.bulkAdd(data.meta);

      if (data.images && Array.isArray(data.images)) {
        for (const img of data.images) {
          if (img.id && img.data) {
            const blob = base64ToBlob(img.data);
            await db.images.add({
              id: img.id,
              fileName: img.fileName,
              blob,
            });
          }
        }
      }
    }
  );
}


/* ------------------------------------------------------------------
 * Whole-app FULL backup (Type CQ + Chapter CQ + categories + papers + images + meta)
 * ---------------------------------------------------------------- */

export type RestoreMode = 'replace' | 'merge';

interface DbDump {
  subjects: Subject[];
  chapters: Chapter[];
  topics: Topic[];
  stimuli: Stimulus[];
  questions: Question[];
  papers: Paper[];
  categories: Category[];
  meta: Array<{ key: string; value: any }>;
  images: Array<{ id: string; fileName: string; data: string }>;
}

/** Things the app keeps in the phone's localStorage (not in the database) — they belong in a full backup too */
export interface AppLocalData {
  /** boards the user added himself (the question form's board list) */
  customBoards?: CustomBoard[];
  /** order of the Filter tab dropdown chips */
  filterDropdownOrder?: string[];
}

export interface AppFullBackupSchema {
  version: string;
  type: 'qb-app-full-backup';
  exportedAt: string;
  databases: { type: DbDump; chapter: DbDump };
  localData?: AppLocalData;
}

/** same key as utils/filterStore.ts (kept here to avoid an import cycle) */
const FILTER_ORDER_KEY = 'qb_filter_dropdown_order_v1';

function readLocalData(): AppLocalData {
  const out: AppLocalData = { customBoards: loadCustomBoards() };
  try {
    const raw = localStorage.getItem(FILTER_ORDER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) out.filterDropdownOrder = parsed.filter((k) => typeof k === 'string');
    }
  } catch {
    /* ignore */
  }
  return out;
}

function applyLocalData(local: AppLocalData | undefined, mode: RestoreMode): void {
  if (!local || typeof local !== 'object') return;

  // custom boards: replace = same list as the backup, merge = add the ones that are missing
  if (Array.isArray(local.customBoards)) {
    const incoming = local.customBoards.filter(
      (b) => b && typeof b.code === 'string' && b.code.trim() && typeof b.name === 'string'
    );
    if (mode === 'replace') {
      saveCustomBoards(incoming);
    } else {
      const current = loadCustomBoards();
      const have = new Set(current.map((b) => b.code.trim().toLowerCase()));
      const added = incoming.filter((b) => !have.has(b.code.trim().toLowerCase()));
      if (added.length) saveCustomBoards([...current, ...added]);
    }
  }

  // chip order is a personal layout: only a full replace brings it back
  if (mode === 'replace' && Array.isArray(local.filterDropdownOrder) && local.filterDropdownOrder.length) {
    try {
      localStorage.setItem(FILTER_ORDER_KEY, JSON.stringify(local.filterDropdownOrder));
    } catch {
      /* ignore */
    }
  }
}

async function dumpDb(scope: CqScope): Promise<{ dump: DbDump; missing: number }> {
  const db = getDb(scope);
  const [subjects, chapters, topics, stimuli, questions, papers, categories, meta, images] = await Promise.all([
    db.subjects.toArray(),
    db.chapters.toArray(),
    db.topics.toArray(),
    db.stimuli.toArray(),
    db.questions.toArray(),
    db.papers.toArray(),
    db.categories.toArray(),
    db.meta.toArray(),
    db.images.toArray(),
  ]);
  const exportedImages: DbDump['images'] = [];
  for (const img of await hydrateImages(db, images)) {
    if (img.blob) {
      exportedImages.push({ id: img.id, fileName: img.fileName, data: await blobToBase64(img.blob) });
    }
  }
  return {
    dump: { subjects, chapters, topics, stimuli, questions, papers, categories, meta, images: exportedImages },
    missing: images.length - exportedImages.length,
  };
}

/** Build the whole-app backup (file name + JSON text) without saving it anywhere */
export async function buildAppFullBackupExport(): Promise<{
  fileName: string;
  json: string;
  questionCount: number;
  imageCount: number;
  missingImages: number;
}> {
  const [typeRes, chapterRes] = await Promise.all([dumpDb('type'), dumpDb('chapter')]);
  const typeDump = typeRes.dump;
  const chapterDump = chapterRes.dump;
  const payload: AppFullBackupSchema = {
    version: '2.1',
    type: 'qb-app-full-backup',
    exportedAt: new Date().toISOString(),
    databases: { type: typeDump, chapter: chapterDump },
    localData: readLocalData(),
  };
  const dateStr = new Date().toISOString().split('T')[0];
  return {
    fileName: `qb-full-backup-${dateStr}.json`,
    json: JSON.stringify(payload),
    questionCount: typeDump.questions.length + chapterDump.questions.length,
    imageCount: typeDump.images.length + chapterDump.images.length,
    missingImages: typeRes.missing + chapterRes.missing,
  };
}

/** Export EVERYTHING in the app (both question collections, categories, papers, images, settings) */
export async function exportAppFullBackup(): Promise<boolean> {
  const { fileName, json } = await buildAppFullBackupExport();
  return await exportJsonFile(fileName, json, { folder: BACKUP_FOLDERS.full });
}

export interface BackupFileInfo {
  kind: 'app' | 'scope';
  scope?: CqScope;
  questions: number;
  papers: number;
}

/** Look inside a backup file (used to show a summary before restoring) */
export function inspectBackupFile(jsonText: string): BackupFileInfo {
  let data: any;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new Error('ফাইলটি পড়া যায়নি (JSON ফরম্যাট ঠিক নয়)');
  }
  if (data?.type === 'qb-app-full-backup' && data.databases) {
    const t = data.databases.type || {};
    const c = data.databases.chapter || {};
    return {
      kind: 'app',
      questions: (t.questions?.length || 0) + (c.questions?.length || 0),
      papers: (t.papers?.length || 0) + (c.papers?.length || 0),
    };
  }
  if (data?.type === 'qb-full-backup' && Array.isArray(data.subjects) && Array.isArray(data.questions)) {
    return {
      kind: 'scope',
      scope: data.scope === 'chapter' ? 'chapter' : 'type',
      questions: data.questions.length,
      papers: Array.isArray(data.papers) ? data.papers.length : 0,
    };
  }
  if (data?.type === 'qb-question-collection') {
    throw new Error(
      'এটি ' + (data.scope === 'chapter' ? 'Chapter CQ' : 'Type CQ') + ' এর কালেকশন ফাইল, ফুল ব্যাকআপ নয়। এটি ইমপোর্ট করতে ওই CQ-এর ইমপোর্ট অপশন ব্যবহার করুন।'
    );
  }
  throw new Error('এটি সম্পূর্ণ ব্যাকআপ ফাইল নয়। অ্যাপ থেকে এক্সপোর্ট করা ফুল ব্যাকআপ ফাইল দিন।');
}

async function addMissingRows(table: any, rows: Array<{ id: string }> | undefined): Promise<void> {
  if (!rows?.length) return;
  const existing: Array<any> = await table.bulkGet(rows.map((r) => r.id));
  const missing = rows.filter((_, i) => !existing[i]);
  if (missing.length) await table.bulkAdd(missing);
}

async function writeDump(scope: CqScope, dump: Partial<DbDump>, mode: RestoreMode): Promise<void> {
  const db = getDb(scope);

  // images first (blobs are created outside of the main transaction)
  const imageRows: Array<{ id: string; fileName: string; blob: Blob }> = [];
  for (const img of dump.images || []) {
    if (img?.id && img.data) {
      try {
        imageRows.push({ id: img.id, fileName: img.fileName || `${img.id}.webp`, blob: base64ToBlob(img.data) });
      } catch (e) {
        console.warn('Skipping broken image in backup:', img.id, e);
      }
    }
  }

  // older backups miss newer fields (board usage, rating, picture position …) — fill them in
  const fixed = normalizeCollectionPayload({
    stimuli: dump.stimuli || [],
    questions: dump.questions || [],
  } as unknown as CollectionJsonSchema);
  const stimuli = fixed.stimuli;
  const questions = fixed.questions;
  const papersIn: Paper[] = (dump.papers || []).map((p) => ({
    ...p,
    questionIds: Array.isArray(p.questionIds) ? p.questionIds : [],
  }));

  const tables = [db.subjects, db.chapters, db.topics, db.stimuli, db.questions, db.papers, db.categories, db.meta, db.images];

  await db.transaction('rw', tables, async () => {
    if (mode === 'replace') {
      await Promise.all(tables.map((t: any) => t.clear()));
      // bulkPut: one repeated id inside the file must not cancel the whole restore
      if (dump.subjects?.length) await db.subjects.bulkPut(dump.subjects);
      if (dump.chapters?.length) await db.chapters.bulkPut(dump.chapters);
      if (dump.topics?.length) await db.topics.bulkPut(dump.topics);
      if (stimuli.length) await db.stimuli.bulkPut(stimuli);
      if (questions.length) await db.questions.bulkPut(questions);
      if (dump.categories?.length) await db.categories.bulkPut(dump.categories);
      if (papersIn.length) await db.papers.bulkPut(papersIn);
      if (dump.meta?.length) await db.meta.bulkPut(dump.meta);
      if (imageRows.length) await db.images.bulkPut(imageRows);
      return;
    }

    // ---- merge: keep everything that already exists, only add what is missing ----
    await addMissingRows(db.subjects, dump.subjects);
    await addMissingRows(db.chapters, dump.chapters);
    await addMissingRows(db.topics, dump.topics);
    await addMissingRows(db.stimuli, stimuli);
    await addMissingRows(db.questions, questions);
    await addMissingRows(db.images, imageRows as any);

    // categories: a category with the same name is reused (papers are re-pointed to it)
    const existingCats: Category[] = await db.categories.toArray();
    const byName = new Map<string, Category>(existingCats.map((c) => [c.name.trim().toLowerCase(), c]));
    const catIdMap = new Map<string, Category>();
    let nextOrder = existingCats.reduce((m, c) => Math.max(m, c.order || 0), 0) + 1;
    for (const cat of dump.categories || []) {
      const hit = byName.get(cat.name.trim().toLowerCase());
      if (hit) {
        catIdMap.set(cat.id, hit);
      } else {
        const existsById = await db.categories.get(cat.id);
        if (existsById) {
          catIdMap.set(cat.id, existsById);
        } else {
          const created: Category = { ...cat, order: nextOrder++ };
          await db.categories.add(created);
          byName.set(created.name.trim().toLowerCase(), created);
          catIdMap.set(cat.id, created);
        }
      }
    }

    const papers = papersIn.map((p) => {
      const target = p.categoryId ? catIdMap.get(p.categoryId) : undefined;
      return target ? { ...p, categoryId: target.id, category: target.name } : p;
    });
    await addMissingRows(db.papers, papers);
    // meta (selection, clipboard…) is left untouched in merge mode
  });
}

/**
 * Restore a backup file. Works with whole-app backups and with older single-collection backups.
 * - replace: current data is erased and replaced by the backup
 * - merge: backup data is added next to the current data (nothing existing is overwritten)
 */
export async function restoreAppBackup(jsonText: string, mode: RestoreMode): Promise<BackupFileInfo> {
  const info = inspectBackupFile(jsonText);
  const data = JSON.parse(jsonText);
  const touched: CqScope[] = [];
  pauseSync();
  try {
    if (info.kind === 'app') {
      if (data.databases.type) {
        await writeDump('type', data.databases.type, mode);
        touched.push('type');
      }
      if (data.databases.chapter) {
        await writeDump('chapter', data.databases.chapter, mode);
        touched.push('chapter');
      }
      applyLocalData(data.localData, mode);
    } else {
      const sc: CqScope = info.scope || 'type';
      await writeDump(sc, data, mode);
      touched.push(sc);
    }
    if (mode === 'replace') await rebuildFolders(touched);
    else await flushAfterBulkChange();
  } finally {
    resumeSync();
  }
  return info;
}
