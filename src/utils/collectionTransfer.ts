import { db, type Subject, type Chapter, type Topic, type Stimulus, type Question, type Paper, type DbImage } from '../db/db';
import { blobToBase64, base64ToBlob, exportJsonFile } from './fileExport';
import { compressImageToWebP } from './imageCompressor';

export interface CollectionJsonSchema {
  version: string;
  type: 'qb-question-collection';
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

/**
 * Export Question Collection to JSON file
 */
export async function exportQuestionCollection(): Promise<boolean> {
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
      if (s.imageIds) {
        s.imageIds.forEach((id) => imageIdSet.add(id));
      }
    }
    for (const q of questions) {
      if (q.solutionImageIds) {
        q.solutionImageIds.forEach((id) => imageIdSet.add(id));
      }
    }

    const exportedImages: Array<{ id: string; fileName: string; data: string }> = [];
    if (imageIdSet.size > 0) {
      const dbImages = await db.images.where('id').anyOf(Array.from(imageIdSet)).toArray();
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
      version: '1.0',
      type: 'qb-question-collection',
      exportedAt: new Date().toISOString(),
      subjects,
      chapters,
      topics,
      stimuli,
      questions,
      images: exportedImages,
    };

    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `qb-collection-${dateStr}.json`;
    return await exportJsonFile(fileName, JSON.stringify(payload, null, 2));
  } catch (err) {
    console.error('Failed to export question collection:', err);
    throw err;
  }
}

/**
 * Validate and generate preview statistics for an uploaded Collection JSON file
 */
export async function parseAndValidateCollectionJson(jsonText: string): Promise<CollectionPreviewResult> {
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

    const existingKeys = await db.questions.toCollection().primaryKeys();
    const existingIds = new Set(existingKeys);

    let duplicateCount = 0;
    const questions: Question[] = data.questions;

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

    // Check stimuli
    if (Array.isArray(data.stimuli)) {
      for (const st of data.stimuli) {
        if (st.imageIds && Array.isArray(st.imageIds)) {
          for (const imgId of st.imageIds) {
            if (!embeddedImageIds.has(imgId)) {
              // Check if images table in JSON maps this ID to a fileName
              const match = (data.images as any[])?.find((i) => i.id === imgId);
              if (match?.fileName) {
                missingImageFilesSet.add(match.fileName);
              } else {
                missingImageFilesSet.add(`image-${imgId.slice(0, 8)}.png`);
              }
            }
          }
        }
      }
    }

    return {
      valid: true,
      subjectsCount: data.subjects.length,
      chaptersCount: data.chapters.length,
      topicsCount: data.topics.length,
      stimuliCount: Array.isArray(data.stimuli) ? data.stimuli.length : 0,
      totalQuestions,
      newQuestionsCount,
      duplicateQuestionsCount: duplicateCount,
      missingImageFiles: Array.from(missingImageFilesSet),
      rawPayload: data as CollectionJsonSchema,
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
  options: ImportOptions
): Promise<{ subjects: number; questions: number; images: number }> {
  const { mode, manualFiles = [] } = options;

  let imageSavedCount = 0;

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

  return {
    subjects: payload.subjects?.length || 0,
    questions: payload.questions?.length || 0,
    images: imageSavedCount,
  };
}

/**
 * Generate Sample Collection JSON for downloading
 */
export function getSampleCollectionJson(): string {
  const sampleData: CollectionJsonSchema = {
    version: '1.0',
    type: 'qb-question-collection',
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
export async function exportFullBackup(): Promise<boolean> {
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
    for (const img of images) {
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
    const fileName = `qb-backup-${dateStr}.json`;
    return await exportJsonFile(fileName, JSON.stringify(fullPayload, null, 2));
  } catch (err) {
    console.error('Full backup export failed:', err);
    throw err;
  }
}

/**
 * Full System Restore: completely replaces database with backup content
 */
export async function restoreFullBackup(jsonText: string): Promise<void> {
  const data = JSON.parse(jsonText);

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
