import {
  db,
  db as typeDatabase,
  chapterDb,
  type QbDatabase,
  type CqScope,
  type Subject,
  type Chapter,
  type Topic,
  type Stimulus,
  type Question,
  type Category,
  type Paper,
  type DbImage,
  type QuestionType,
  type BoardUsage,
} from './db';

import { toBn, toEn } from '../utils/toBn';


export type {
  Subject,
  Chapter,
  Topic,
  Stimulus,
  Question,
  Category,
  Paper,
  DbImage,
  QuestionType,
  BoardUsage,
};


/**
 * Generate a unique ID (crypto.randomUUID with fallback)
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
}


/**
 * Rating label mapping (১=সহজ, ২=মোটামুটি, ৩=মাঝারি, ৪=ভালো, ৫=চ্যালেঞ্জিং)
 */
export const RATING_LABELS: Record<number, string> = {
  1: 'সহজ',
  2: 'মোটামুটি',
  3: 'মাঝারি',
  4: 'ভালো',
  5: 'চ্যালেঞ্জিং',
};


export function getRatingLabel(rating: number): string {
  return RATING_LABELS[rating] || 'মাঝারি';
}


/**
 * Rating stars string (e.g. ★★★★☆ ভালো)
 */
export function getRatingStarsText(rating: number): string {
  const safeRating = Math.max(1, Math.min(5, Math.round(rating || 3)));
  const filledStars = '★'.repeat(safeRating);
  const emptyStars = '☆'.repeat(5 - safeRating);
  const label = getRatingLabel(safeRating);
  return `${filledStars}${emptyStars} ${label}`;
}

/* -------------------------------------------------------------
 * 1. Read APIs
 * ----------------------------------------------------------- */


export interface StimulusWithQuestions {
  stimulus?: Stimulus;
  questions: Question[];
}


export interface HierarchyStats {
  subjectStats: Record<string, { total: number; selected: number }>;
  chapterStats: Record<string, { total: number; selected: number }>;
  topicStats: Record<string, { total: number; selected: number }>;
}


const META_SELECTED_KEY = 'selectedQuestionIds';


const META_CLIPBOARD_KEY = 'clipboard';

const META_GROUP_CLIPBOARD_KEY = 'group_clipboard';


export interface GroupClipboardData {
  mode: 'copy' | 'cut';
  stimulus?: Stimulus;
  questions: Question[];
  sourceTopicId: string;
}


export interface QuestionBlockInput {
  id?: string;
  type: QuestionType;
  marks: number;
  questionText: string;
  solutionText: string;
  solutionImageIds: string[];
  answerText?: string;
  rating: number;
  usedInBoards: BoardUsage[];
}


export interface SaveQuestionGroupPayload {
  stimulusId?: string;
  topicId: string;
  stimulusText: string;
  stimulusImageIds: string[];
  boardTag?: string;
  stimulusUsedInBoards?: BoardUsage[];
  stimulusRating?: number;
  reference?: string;
  questions: QuestionBlockInput[];
  deletedQuestionIds?: string[];
}


export interface QuestionGroupEditData {
  stimulus?: Stimulus;
  questions: Question[];
  topicId: string;
  chapterId?: string;
  subjectId?: string;
}


export interface QuestionPaperUsage {
  paperId: string;
  shortName: string;
  title: string;
  count: number;
}


/**
 * Paper tag = category name + running number, e.g. "উইকলি মডেল টেস্ট-১".
 * The number continues after the highest number already used inside that category.
 */
function paperLabelNumber(shortName: string | undefined, categoryName: string): number | null {
  const prefix = `${categoryName.trim()}-`;
  const name = (shortName || '').trim();
  if (!name.startsWith(prefix)) return null;
  const rest = toEn(name.slice(prefix.length)).trim();
  return /^\d+$/.test(rest) ? parseInt(rest, 10) : null;
}


export type CategoryClipboard =
  | { type: 'category'; id: string; name: string }
  | { type: 'paper'; id: string; name: string };


const META_CATEGORY_CLIPBOARD_KEY = 'category_clipboard';


/* -------------------------------------------------------------
 * API factory — one instance per database (Type CQ / Chapter CQ)
 * ----------------------------------------------------------- */

/** The permanent category that receives every paper without (or after losing) a category */
export const UNCATEGORIZED_NAME = 'অশ্রেণিবদ্ধ';

export function isUncategorizedCategory(cat?: { name: string } | null): boolean {
  return Boolean(cat) && cat!.name.trim() === UNCATEGORIZED_NAME;
}

export function createQbApi(db: QbDatabase) {
async function getSubjects(): Promise<Subject[]> {
  const list = await db.subjects.toArray();
  return list.sort((a, b) => a.order - b.order);
}


async function getChapters(subjectId: string): Promise<Chapter[]> {
  const list = await db.chapters.where('subjectId').equals(subjectId).toArray();
  return list.sort((a, b) => a.order - b.order);
}


async function getTopics(chapterId: string): Promise<Topic[]> {
  const list = await db.topics.where('chapterId').equals(chapterId).toArray();
  return list.sort((a, b) => a.order - b.order);
}


async function getQuestionsByTopicGrouped(topicId: string): Promise<StimulusWithQuestions[]> {
  const allQuestions = await db.questions.where('topicId').equals(topicId).toArray();
  allQuestions.sort((a, b) => a.order - b.order);

  const stimuliMap = new Map<string, Stimulus>();
  const stimulusIds = Array.from(new Set(allQuestions.map((q) => q.stimulusId).filter(Boolean))) as string[];

  if (stimulusIds.length > 0) {
    const stimuliList = await db.stimuli.where('id').anyOf(stimulusIds).toArray();
    for (const stim of stimuliList) {
      stimuliMap.set(stim.id, stim);
    }
  }

  // Group by stimulusId
  const groups: StimulusWithQuestions[] = [];
  const handledStimulus = new Set<string>();

  for (const q of allQuestions) {
    if (q.stimulusId) {
      if (!handledStimulus.has(q.stimulusId)) {
        handledStimulus.add(q.stimulusId);
        const stim = stimuliMap.get(q.stimulusId);
        const relatedQuestions = allQuestions.filter((item) => item.stimulusId === q.stimulusId);
        groups.push({
          stimulus: stim,
          questions: relatedQuestions,
        });
      }
    } else {
      // Standalone question without stimulus
      groups.push({
        stimulus: undefined,
        questions: [q],
      });
    }
  }

  return groups;
}


async function getAllQuestions(): Promise<Question[]> {
  const list = await db.questions.toArray();
  return list.sort((a, b) => a.order - b.order);
}


async function getStimulus(id: string): Promise<Stimulus | undefined> {
  return await db.stimuli.get(id);
}


async function getQuestion(id: string): Promise<Question | undefined> {
  return await db.questions.get(id);
}

/* -------------------------------------------------------------
 * 2. Hierarchy Stats (Total Questions & Selected count per node)
 * ----------------------------------------------------------- */


async function getHierarchyStats(): Promise<HierarchyStats> {
  const [allQuestions, allTopics, allChapters, selectedIds] = await Promise.all([
    db.questions.toArray(),
    db.topics.toArray(),
    db.chapters.toArray(),
    getSelectedIds(),
  ]);

  const selectedSet = new Set(selectedIds);
  const topicStats: Record<string, { total: number; selected: number }> = {};
  const chapterStats: Record<string, { total: number; selected: number }> = {};
  const subjectStats: Record<string, { total: number; selected: number }> = {};

  // Initialize
  for (const t of allTopics) topicStats[t.id] = { total: 0, selected: 0 };
  for (const c of allChapters) chapterStats[c.id] = { total: 0, selected: 0 };

  const topicToChapter = new Map<string, string>();
  for (const t of allTopics) {
    topicToChapter.set(t.id, t.chapterId);
  }

  const chapterToSubject = new Map<string, string>();
  for (const c of allChapters) {
    chapterToSubject.set(c.id, c.subjectId);
  }

  for (const q of allQuestions) {
    const isSel = selectedSet.has(q.id);

    // Topic level
    if (!topicStats[q.topicId]) {
      topicStats[q.topicId] = { total: 0, selected: 0 };
    }
    topicStats[q.topicId].total += 1;
    if (isSel) topicStats[q.topicId].selected += 1;

    // Chapter level
    const chapterId = topicToChapter.get(q.topicId);
    if (chapterId) {
      if (!chapterStats[chapterId]) chapterStats[chapterId] = { total: 0, selected: 0 };
      chapterStats[chapterId].total += 1;
      if (isSel) chapterStats[chapterId].selected += 1;

      // Subject level
      const subjectId = chapterToSubject.get(chapterId);
      if (subjectId) {
        if (!subjectStats[subjectId]) subjectStats[subjectId] = { total: 0, selected: 0 };
        subjectStats[subjectId].total += 1;
        if (isSel) subjectStats[subjectId].selected += 1;
      }
    }
  }

  return { subjectStats, chapterStats, topicStats };
}

/* -------------------------------------------------------------
 * 3. Write APIs (Add, Update, Delete with Cascade, Reorder)
 * ----------------------------------------------------------- */


async function addSubject(name: string): Promise<Subject> {
  const current = await db.subjects.toArray();
  const maxOrder = current.reduce((max, s) => Math.max(max, s.order || 0), 0);
  const subject: Subject = {
    id: generateId(),
    name: name.trim(),
    order: maxOrder + 1,
  };
  await db.subjects.add(subject);
  return subject;
}


async function updateSubject(id: string, name: string): Promise<void> {
  await db.subjects.update(id, { name: name.trim() });
}


async function addChapter(subjectId: string, name: string): Promise<Chapter> {
  const current = await db.chapters.where('subjectId').equals(subjectId).toArray();
  const maxOrder = current.reduce((max, c) => Math.max(max, c.order || 0), 0);
  const chapter: Chapter = {
    id: generateId(),
    subjectId,
    name: name.trim(),
    order: maxOrder + 1,
  };
  await db.chapters.add(chapter);
  return chapter;
}


async function updateChapter(id: string, name: string): Promise<void> {
  await db.chapters.update(id, { name: name.trim() });
}


async function addTopic(chapterId: string, name: string): Promise<Topic> {
  const current = await db.topics.where('chapterId').equals(chapterId).toArray();
  const maxOrder = current.reduce((max, t) => Math.max(max, t.order || 0), 0);
  const topic: Topic = {
    id: generateId(),
    chapterId,
    name: name.trim(),
    order: maxOrder + 1,
  };
  await db.topics.add(topic);
  return topic;
}


async function updateTopic(id: string, name: string): Promise<void> {
  await db.topics.update(id, { name: name.trim() });
}


async function addStimulus(data: Omit<Stimulus, 'id'>): Promise<Stimulus> {
  const stimulus: Stimulus = {
    ...data,
    id: generateId(),
  };
  await db.stimuli.add(stimulus);
  return stimulus;
}


async function updateStimulus(id: string, data: Partial<Omit<Stimulus, 'id'>>): Promise<void> {
  await db.stimuli.update(id, data);
}


async function addQuestion(data: Omit<Question, 'id'>): Promise<Question> {
  const current = await db.questions.where('topicId').equals(data.topicId).toArray();
  const maxOrder = current.reduce((max, q) => Math.max(max, q.order || 0), 0);
  const question: Question = {
    ...data,
    id: generateId(),
    order: data.order ?? maxOrder + 1,
  };
  await db.questions.add(question);
  return question;
}


async function updateQuestion(id: string, data: Partial<Omit<Question, 'id'>>): Promise<void> {
  await db.questions.update(id, data);
}


/**
 * Cascading deletes: Deletes target and all nested children plus image blobs
 */
async function deleteImages(imageIds: string[]): Promise<void> {
  if (imageIds && imageIds.length > 0) {
    await db.images.where('id').anyOf(imageIds).delete();
  }
}


async function deleteQuestion(questionId: string): Promise<void> {
  const q = await db.questions.get(questionId);
  if (!q) return;

  // 1. Remove associated solution images
  if (q.solutionImageIds && q.solutionImageIds.length > 0) {
    await deleteImages(q.solutionImageIds);
  }

  // 2. Remove question from selection if present
  const selected = await getSelectedIds();
  if (selected.includes(questionId)) {
    await reorderSelected(selected.filter((id) => id !== questionId));
  }

  // 3. Delete question record
  await db.questions.delete(questionId);

  // 4. Check if stimulus has no more questions left; if so, cleanup stimulus
  if (q.stimulusId) {
    const siblings = await db.questions.where('stimulusId').equals(q.stimulusId).count();
    if (siblings === 0) {
      await deleteStimulusOnly(q.stimulusId);
    }
  }
}


async function deleteStimulusOnly(stimulusId: string): Promise<void> {
  const stim = await db.stimuli.get(stimulusId);
  if (stim) {
    if (stim.imageIds && stim.imageIds.length > 0) {
      await deleteImages(stim.imageIds);
    }
    await db.stimuli.delete(stimulusId);
  }
}


async function deleteStimulus(stimulusId: string): Promise<void> {
  const questions = await db.questions.where('stimulusId').equals(stimulusId).toArray();
  for (const q of questions) {
    if (q.solutionImageIds) {
      await deleteImages(q.solutionImageIds);
    }
    await db.questions.delete(q.id);
  }
  await deleteStimulusOnly(stimulusId);
}


async function deleteTopic(topicId: string): Promise<void> {
  const questions = await db.questions.where('topicId').equals(topicId).toArray();
  for (const q of questions) {
    if (q.solutionImageIds) await deleteImages(q.solutionImageIds);
    await db.questions.delete(q.id);
  }

  const stimuli = await db.stimuli.where('topicId').equals(topicId).toArray();
  for (const s of stimuli) {
    if (s.imageIds) await deleteImages(s.imageIds);
    await db.stimuli.delete(s.id);
  }

  await db.topics.delete(topicId);
}


async function deleteChapter(chapterId: string): Promise<void> {
  const topics = await db.topics.where('chapterId').equals(chapterId).toArray();
  for (const t of topics) {
    await deleteTopic(t.id);
  }
  await db.chapters.delete(chapterId);
}


async function deleteSubject(subjectId: string): Promise<void> {
  const chapters = await db.chapters.where('subjectId').equals(subjectId).toArray();
  for (const c of chapters) {
    await deleteChapter(c.id);
  }
  await db.subjects.delete(subjectId);
}

/* -------------------------------------------------------------
 * Reordering
 * ----------------------------------------------------------- */


async function reorderSubjects(orderedIds: string[]): Promise<void> {
  await db.transaction('rw', db.subjects, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.subjects.update(orderedIds[i], { order: i + 1 });
    }
  });
}


async function reorderChapters(orderedIds: string[]): Promise<void> {
  await db.transaction('rw', db.chapters, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.chapters.update(orderedIds[i], { order: i + 1 });
    }
  });
}


async function reorderTopics(orderedIds: string[]): Promise<void> {
  await db.transaction('rw', db.topics, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.topics.update(orderedIds[i], { order: i + 1 });
    }
  });
}


async function reorderQuestions(orderedIds: string[]): Promise<void> {
  await db.transaction('rw', db.questions, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.questions.update(orderedIds[i], { order: i + 1 });
    }
  });
}

/* -------------------------------------------------------------
 * 4. Selection APIs (ordered array in meta table)
 * ----------------------------------------------------------- */


async function getSelectedIds(): Promise<string[]> {
  const record = await db.meta.get(META_SELECTED_KEY);
  if (!record || !Array.isArray(record.value)) {
    return [];
  }
  return record.value as string[];
}


async function isQuestionSelected(questionId: string): Promise<boolean> {
  const selected = await getSelectedIds();
  return selected.includes(questionId);
}


async function toggleSelected(questionId: string): Promise<string[]> {
  const current = await getSelectedIds();
  let next: string[];
  if (current.includes(questionId)) {
    next = current.filter((id) => id !== questionId);
  } else {
    next = [...current, questionId];
  }
  await db.meta.put({ key: META_SELECTED_KEY, value: next });
  return next;
}


/**
 * Toggle selection for an entire stimulus group (all its sub-questions)
 */
async function toggleStimulusSelect(
  stimulusId: string | undefined,
  questionIds: string[]
): Promise<string[]> {
  const current = await getSelectedIds();
  const allSelected = questionIds.length > 0 && questionIds.every((id) => current.includes(id));
  let next: string[];

  if (allSelected) {
    // Unselect all questions of this stimulus
    next = current.filter((id) => !questionIds.includes(id));
  } else {
    // Select all questions of this stimulus
    const toAdd = questionIds.filter((id) => !current.includes(id));
    next = [...current, ...toAdd];
  }

  await db.meta.put({ key: META_SELECTED_KEY, value: next });
  return next;
}


/**
 * Count unique stimulus groups / questions selected
 */
async function getSelectedStimuliCount(selectedIds: string[]): Promise<number> {
  if (!selectedIds || selectedIds.length === 0) return 0;
  const questions = await db.questions.where('id').anyOf(selectedIds).toArray();
  const stimuliSet = new Set<string>();
  let standaloneCount = 0;

  for (const q of questions) {
    if (q.stimulusId) {
      stimuliSet.add(q.stimulusId);
    } else {
      standaloneCount++;
    }
  }

  return stimuliSet.size + standaloneCount;
}


async function clearSelection(): Promise<void> {
  await db.meta.put({ key: META_SELECTED_KEY, value: [] });
}


async function reorderSelected(newOrderedIds: string[]): Promise<void> {
  await db.meta.put({ key: META_SELECTED_KEY, value: newOrderedIds });
}

/* -------------------------------------------------------------
 * 5. Copy & Paste Group / Question APIs
 * ----------------------------------------------------------- */


async function copyQuestion(questionId: string): Promise<void> {
  const q = await db.questions.get(questionId);
  if (!q) {
    throw new Error('Question not found');
  }
  await db.meta.put({
    key: META_CLIPBOARD_KEY,
    value: JSON.parse(JSON.stringify(q)),
  });
}


async function getClipboard(): Promise<Question | null> {
  const record = await db.meta.get(META_CLIPBOARD_KEY);
  return (record?.value as Question) || null;
}


async function pasteAfter(targetQuestionId: string): Promise<Question | null> {
  const clipboard = await getClipboard();
  if (!clipboard) {
    return null;
  }

  const target = await db.questions.get(targetQuestionId);
  if (!target) {
    return null;
  }

  const siblings = await db.questions.where('topicId').equals(target.topicId).toArray();
  siblings.sort((a, b) => a.order - b.order);

  const newOrder = target.order + 1;

  await db.transaction('rw', db.questions, async () => {
    for (const q of siblings) {
      if (q.order >= newOrder) {
        await db.questions.update(q.id, { order: q.order + 1 });
      }
    }
  });

  const newQuestion: Question = {
    ...clipboard,
    id: generateId(),
    topicId: target.topicId,
    stimulusId: target.stimulusId || clipboard.stimulusId,
    order: newOrder,
  };

  await db.questions.add(newQuestion);
  return newQuestion;
}


/**
 * Copy or Cut an entire Stimulus Question Group
 */
async function copyStimulusGroup(
  stimulusId: string | undefined,
  sampleQuestionId: string,
  mode: 'copy' | 'cut' = 'copy'
): Promise<void> {
  let stimulus: Stimulus | undefined;
  let questions: Question[] = [];
  let sourceTopicId = '';

  if (stimulusId) {
    stimulus = await db.stimuli.get(stimulusId);
    questions = await db.questions.where('stimulusId').equals(stimulusId).toArray();
    questions.sort((a, b) => a.order - b.order);
    sourceTopicId = stimulus?.topicId || (questions[0]?.topicId ?? '');
  } else {
    const q = await db.questions.get(sampleQuestionId);
    if (!q) throw new Error('Question not found');
    questions = [q];
    sourceTopicId = q.topicId;
  }

  const payload: GroupClipboardData = {
    mode,
    stimulus: stimulus ? JSON.parse(JSON.stringify(stimulus)) : undefined,
    questions: JSON.parse(JSON.stringify(questions)),
    sourceTopicId,
  };

  await db.meta.put({
    key: META_GROUP_CLIPBOARD_KEY,
    value: payload,
  });
}


async function getGroupClipboard(): Promise<GroupClipboardData | null> {
  const record = await db.meta.get(META_GROUP_CLIPBOARD_KEY);
  return (record?.value as GroupClipboardData) || null;
}


async function clearGroupClipboard(): Promise<void> {
  await db.meta.put({
    key: META_GROUP_CLIPBOARD_KEY,
    value: null,
  });
}


/**
 * Paste a stimulus group before or after a target
 */
async function pasteStimulusGroup(
  targetTopicId: string,
  targetStimulusId?: string,
  targetQuestionId?: string,
  position: 'before' | 'after' = 'after'
): Promise<boolean> {
  const clipboard = await getGroupClipboard();
  if (!clipboard || clipboard.questions.length === 0) {
    return false;
  }

  // Determine target order in topic
  let targetOrder = 1;
  if (targetStimulusId) {
    const targetQuestions = await db.questions.where('stimulusId').equals(targetStimulusId).toArray();
    if (targetQuestions.length > 0) {
      targetOrder = position === 'before'
        ? Math.min(...targetQuestions.map((q) => q.order))
        : Math.max(...targetQuestions.map((q) => q.order));
    }
  } else if (targetQuestionId) {
    const targetQ = await db.questions.get(targetQuestionId);
    if (targetQ) {
      targetOrder = targetQ.order;
    }
  }

  const insertOrder = position === 'before' ? targetOrder : targetOrder + 1;

  // Shift orders of existing questions
  const topicQuestions = await db.questions.where('topicId').equals(targetTopicId).toArray();
  const shiftAmount = clipboard.questions.length;

  await db.transaction('rw', [db.questions, db.stimuli, db.meta], async () => {
    for (const q of topicQuestions) {
      if (q.order >= insertOrder) {
        await db.questions.update(q.id, { order: q.order + shiftAmount });
      }
    }

    if (clipboard.mode === 'copy') {
      // New IDs for everything
      let newStimulusId: string | undefined = undefined;
      if (clipboard.stimulus) {
        newStimulusId = generateId();
        await db.stimuli.add({
          ...clipboard.stimulus,
          id: newStimulusId,
          topicId: targetTopicId,
        });
      }

      for (let i = 0; i < clipboard.questions.length; i++) {
        const q = clipboard.questions[i];
        await db.questions.add({
          ...q,
          id: generateId(),
          topicId: targetTopicId,
          stimulusId: newStimulusId,
          order: insertOrder + i,
        });
      }
    } else {
      // mode: 'cut' -> Move existing questions & stimulus
      if (clipboard.stimulus) {
        await db.stimuli.update(clipboard.stimulus.id, {
          topicId: targetTopicId,
        });
      }

      for (let i = 0; i < clipboard.questions.length; i++) {
        const q = clipboard.questions[i];
        await db.questions.update(q.id, {
          topicId: targetTopicId,
          order: insertOrder + i,
        });
      }

      // Clear clipboard after cut & paste
      await db.meta.put({ key: META_GROUP_CLIPBOARD_KEY, value: null });
    }
  });

  return true;
}


/**
 * Delete an entire stimulus group (stimulus + all its questions)
 */
async function deleteStimulusGroup(
  stimulusId: string | undefined,
  questionIds: string[]
): Promise<void> {
  await db.transaction('rw', [db.stimuli, db.questions, db.meta], async () => {
    if (stimulusId) {
      await db.stimuli.delete(stimulusId);
    }
    for (const qId of questionIds) {
      await db.questions.delete(qId);
    }
    // Remove from selectedIds
    const current = await getSelectedIds();
    const updated = current.filter((id) => !questionIds.includes(id));
    await db.meta.put({ key: META_SELECTED_KEY, value: updated });
  });
}

/* -------------------------------------------------------------
 * 6. Images & Paper Usage
 * ----------------------------------------------------------- */


async function getImageBlobUrl(imageId: string): Promise<string | null> {
  try {
    // a paper can mix Type CQ + Chapter CQ questions, so also look in the other database
    const sibling = db === chapterDb ? typeDatabase : chapterDb;
    const img = (await db.images.get(imageId)) ?? (await sibling.images.get(imageId));
    if (!img || !img.blob) return null;
    return URL.createObjectURL(img.blob);
  } catch {
    return null;
  }
}


async function saveImageBlob(blob: Blob, fileName: string): Promise<string> {
  const id = generateId();
  await db.images.add({
    id,
    fileName,
    blob,
  });
  return id;
}


async function getQuestionGroupForEdit(questionId: string): Promise<QuestionGroupEditData | null> {
  const q = await db.questions.get(questionId);
  if (!q) return null;

  const topic = await db.topics.get(q.topicId);
  const chapter = topic ? await db.chapters.get(topic.chapterId) : undefined;
  const subjectId = chapter?.subjectId;

  let stimulus: Stimulus | undefined;
  let questions: Question[] = [];

  if (q.stimulusId) {
    stimulus = await db.stimuli.get(q.stimulusId);
    questions = await db.questions.where('stimulusId').equals(q.stimulusId).toArray();
    questions.sort((a, b) => a.order - b.order);
  } else {
    questions = [q];
  }

  return {
    stimulus,
    questions,
    topicId: q.topicId,
    chapterId: topic?.chapterId,
    subjectId,
  };
}


async function saveQuestionGroup(payload: SaveQuestionGroupPayload): Promise<{ stimulusId: string; questionIds: string[] }> {
  let stimulusId = payload.stimulusId;

  // 1. Save or update Stimulus
  if (stimulusId) {
    await db.stimuli.update(stimulusId, {
      topicId: payload.topicId,
      text: payload.stimulusText,
      imageIds: payload.stimulusImageIds,
      boardTag: payload.boardTag,
      usedInBoards: payload.stimulusUsedInBoards ?? [],
      rating: payload.stimulusRating,
      reference: payload.reference ?? '',
    });
  } else {
    stimulusId = generateId();
    await db.stimuli.add({
      id: stimulusId,
      topicId: payload.topicId,
      text: payload.stimulusText,
      imageIds: payload.stimulusImageIds,
      boardTag: payload.boardTag,
      usedInBoards: payload.stimulusUsedInBoards ?? [],
      rating: payload.stimulusRating,
      reference: payload.reference ?? '',
    });
  }

  // 2. Delete removed questions if any
  if (payload.deletedQuestionIds && payload.deletedQuestionIds.length > 0) {
    for (const qId of payload.deletedQuestionIds) {
      await deleteQuestion(qId);
    }
  }

  // 3. Save or update Questions
  //    The order of payload.questions IS the order the person arranged in the editor.
  //    The group keeps the same "slots" (order numbers) it already occupied in the topic,
  //    so re-arranging ক/খ/গ/ঘ never shifts other questions around.
  const existingUnderTopic = await db.questions.where('topicId').equals(payload.topicId).toArray();
  let maxOrder = existingUnderTopic.reduce((max, item) => Math.max(max, item.order || 0), 0);

  const slots: number[] = [];
  for (const qData of payload.questions) {
    if (qData.id) {
      const old = await db.questions.get(qData.id);
      if (old && typeof old.order === 'number') slots.push(old.order);
    }
  }
  slots.sort((a, b) => a - b);
  // New blocks go after everything else, then take whatever slot their position gives them
  while (slots.length < payload.questions.length) {
    maxOrder += 1;
    slots.push(maxOrder);
  }

  const savedQuestionIds: string[] = [];

  for (let i = 0; i < payload.questions.length; i++) {
    const qData = payload.questions[i];
    const slotOrder = slots[i];
    if (qData.id) {
      // Update existing question
      await db.questions.update(qData.id, {
        topicId: payload.topicId,
        stimulusId,
        type: qData.type,
        marks: qData.marks,
        questionText: qData.questionText,
        solutionText: qData.solutionText,
        solutionImageIds: qData.solutionImageIds,
        answerText: qData.answerText,
        rating: qData.rating,
        order: slotOrder,
        usedInBoards: qData.usedInBoards,
      });
      savedQuestionIds.push(qData.id);
    } else {
      // Add new question
      const newId = generateId();
      await db.questions.add({
        id: newId,
        topicId: payload.topicId,
        stimulusId,
        type: qData.type,
        marks: qData.marks,
        questionText: qData.questionText,
        solutionText: qData.solutionText,
        solutionImageIds: qData.solutionImageIds,
        answerText: qData.answerText,
        rating: qData.rating,
        order: slotOrder,
        usedInBoards: qData.usedInBoards,
      });
      savedQuestionIds.push(newId);
    }
  }

  return { stimulusId, questionIds: savedQuestionIds };
}


async function getQuestionPaperUsage(questionId: string): Promise<QuestionPaperUsage[]> {
  const papers = await db.papers.toArray();
  const usages: QuestionPaperUsage[] = [];

  for (const paper of papers) {
    if (paper.questionIds && Array.isArray(paper.questionIds)) {
      const occurrences = paper.questionIds.filter((id) => id === questionId).length;
      if (occurrences > 0) {
        usages.push({
          paperId: paper.id,
          shortName: paper.shortName,
          title: paper.title,
          count: occurrences,
        });
      }
    }
  }

  return usages;
}


async function getQuestionTotalUsageCount(questionId: string): Promise<number> {
  const usages = await getQuestionPaperUsage(questionId);
  return usages.reduce((sum, u) => sum + u.count, 0);
}

/* -------------------------------------------------------------
 * 6.5 Paper Management & Statistics APIs
 * ----------------------------------------------------------- */


async function getPaperCount(): Promise<number> {
  return await db.papers.count();
}


async function getQuestionCount(): Promise<number> {
  return await db.questions.count();
}


async function getPapers(): Promise<Paper[]> {
  const list = await db.papers.toArray();
  return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}


async function getPaperById(id: string): Promise<Paper | undefined> {
  return await db.papers.get(id);
}


async function getNextPaperLabel(
  categoryId: string,
  categoryName: string,
  excludePaperId?: string
): Promise<string> {
  const papers = await db.papers.where('categoryId').equals(categoryId).toArray();
  let max = 0;
  for (const p of papers) {
    if (p.id === excludePaperId) continue;
    const n = paperLabelNumber(p.shortName, categoryName);
    if (n !== null && n > max) max = n;
  }
  return `${categoryName.trim()}-${toBn(max + 1)}`;
}


/**
 * Give every paper whose tag is not "<category>-<number>" yet a proper tag
 * (old papers that still have a manual short name). Papers that already have a
 * proper tag keep their number.
 */
async function relabelPapersByCategory(): Promise<void> {
  const [cats, papers] = await Promise.all([db.categories.toArray(), db.papers.toArray()]);
  for (const cat of cats) {
    const inCat = papers
      .filter((p) => p.categoryId === cat.id)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    let max = 0;
    for (const p of inCat) {
      const n = paperLabelNumber(p.shortName, cat.name);
      if (n !== null && n > max) max = n;
    }
    for (const p of inCat) {
      if (paperLabelNumber(p.shortName, cat.name) === null) {
        max += 1;
        await db.papers.update(p.id, { shortName: `${cat.name.trim()}-${toBn(max)}` });
      }
    }
  }
}


async function savePaper(paper: Omit<Paper, 'id' | 'createdAt'> & { id?: string; createdAt?: number }): Promise<Paper> {
  const id = paper.id || generateId();
  const fullPaper: Paper = {
    ...paper,
    id,
    createdAt: paper.createdAt || Date.now(),
  };
  await db.papers.put(fullPaper);
  return fullPaper;
}


async function deletePaper(id: string): Promise<void> {
  await db.papers.delete(id);
}

/* -------------------------------------------------------------
 * 6.6 Category Management APIs
 * ----------------------------------------------------------- */


async function ensureUncategorized(): Promise<Category> {
  const existing = await db.categories.where('name').equalsIgnoreCase(UNCATEGORIZED_NAME).first();
  if (existing) return existing;
  const created: Category = {
    id: generateId(),
    name: UNCATEGORIZED_NAME,
    order: 0,
    createdAt: Date.now(),
  };
  await db.categories.add(created);
  return created;
}


async function ensureDefaultCategories(): Promise<Category[]> {
  let list = await db.categories.toArray();
  if (list.length === 0) {
    const defNames = ['উইকলি মডেল টেস্ট', 'চ্যাপ্টার অ্যান্ড টেস্ট'];
    const now = Date.now();
    for (let i = 0; i < defNames.length; i++) {
      await db.categories.add({
        id: `cat_${now}_${i + 1}`,
        name: defNames[i],
        order: i + 1,
        createdAt: now,
      });
    }
    list = await db.categories.toArray();
  }

  // The "অশ্রেণিবদ্ধ" (uncategorized) category always exists
  if (!list.some((c) => c.name.trim().toLowerCase() === UNCATEGORIZED_NAME.toLowerCase())) {
    list.push(await ensureUncategorized());
  }

  // Ensure all existing papers have a valid categoryId
  const allPapers = await db.papers.toArray();
  const catByName = new Map<string, Category>();
  list.forEach((c) => catByName.set(c.name.trim(), c));

  for (const p of allPapers) {
    if (!p.categoryId || !list.some((c) => c.id === p.categoryId)) {
      const existingMatch = p.category ? catByName.get(p.category.trim()) : undefined;
      if (existingMatch) {
        await db.papers.update(p.id, { categoryId: existingMatch.id });
      } else {
        // Create new category for this paper or assign to first
        const newCatName = p.category?.trim() || UNCATEGORIZED_NAME;
        const newCat = await saveCategory(newCatName);
        catByName.set(newCatName, newCat);
        await db.papers.update(p.id, { categoryId: newCat.id });
      }
    }
  }

  await relabelPapersByCategory();

  return list.sort((a, b) => a.order - b.order);
}


async function getCategories(): Promise<Category[]> {
  await ensureDefaultCategories();
  const list = await db.categories.toArray();
  return list.sort((a, b) => a.order - b.order);
}


async function getCategory(id: string): Promise<Category | undefined> {
  return await db.categories.get(id);
}


async function saveCategory(name: string): Promise<Category> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('ক্যাটেগরির নাম লিখুন');
  }

  const existing = await db.categories.where('name').equalsIgnoreCase(trimmed).first();
  if (existing) {
    return existing;
  }

  const all = await db.categories.toArray();
  const maxOrder = all.reduce((max, c) => Math.max(max, c.order || 0), 0);
  const newCat: Category = {
    id: generateId(),
    name: trimmed,
    order: maxOrder + 1,
    createdAt: Date.now(),
  };

  await db.categories.add(newCat);
  return newCat;
}


async function updateCategory(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('ক্যাটেগরির নাম লিখুন');
  }
  const existing = await db.categories.where('name').equalsIgnoreCase(trimmed).first();
  if (existing && existing.id !== id) {
    throw new Error('এই নামের ক্যাটেগরি ইতিমধ্যে রয়েছে');
  }

  const oldCat = await db.categories.get(id);
  if (isUncategorizedCategory(oldCat)) {
    throw new Error('"অশ্রেণিবদ্ধ" ক্যাটেগরির নাম বদলানো যাবে না');
  }
  await db.categories.update(id, { name: trimmed });
  // Also update category string (and the "<category>-<number>" tag) in papers for consistency
  const papers = await db.papers.where('categoryId').equals(id).toArray();
  for (const p of papers) {
    const changes: Partial<Paper> = { category: trimmed };
    if (oldCat) {
      const n = paperLabelNumber(p.shortName, oldCat.name);
      if (n !== null) changes.shortName = `${trimmed}-${toBn(n)}`;
    }
    await db.papers.update(p.id, changes);
  }
}


async function deleteCategory(id: string): Promise<void> {
  const target = await db.categories.get(id);
  if (!target) return;
  if (isUncategorizedCategory(target)) {
    throw new Error('"অশ্রেণিবদ্ধ" ক্যাটেগরি মোছা যাবে না');
  }

  // Papers of the deleted category move to "অশ্রেণিবদ্ধ"
  const unclassified = await ensureUncategorized();
  const affectedPapers = await db.papers.where('categoryId').equals(id).toArray();
  for (const p of affectedPapers) {
    await db.papers.update(p.id, {
      categoryId: unclassified.id,
      category: unclassified.name,
    });
  }

  await db.categories.delete(id);
}


/** Delete several categories at once (papers move to "অশ্রেণিবদ্ধ"). Returns how many were deleted. */
async function deleteCategories(ids: string[]): Promise<number> {
  let deleted = 0;
  for (const id of ids) {
    const cat = await db.categories.get(id);
    if (!cat || isUncategorizedCategory(cat)) continue;
    await deleteCategory(id);
    deleted++;
  }
  return deleted;
}


/** Save a manual order: the given ids get order 1,2,3… (the "অশ্রেণিবদ্ধ" category always stays first) */
async function reorderCategories(orderedIds: string[]): Promise<void> {
  await db.transaction('rw', db.categories, async () => {
    let n = 1;
    for (const id of orderedIds) {
      const cat = await db.categories.get(id);
      if (!cat || isUncategorizedCategory(cat)) continue;
      await db.categories.update(id, { order: n++ });
    }
  });
}


async function getPapersByCategory(categoryId: string): Promise<Paper[]> {
  const list = await db.papers.where('categoryId').equals(categoryId).toArray();
  return list.sort((a, b) => {
    const ao = a.order;
    const bo = b.order;
    if (ao !== undefined && bo !== undefined && ao !== bo) return ao - bo;
    if (ao !== undefined && bo === undefined) return -1; // manually ordered papers first
    if (ao === undefined && bo !== undefined) return 1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}


/** Save a manual order of papers inside a category: the given ids get order 1,2,3… */
async function reorderPapers(orderedIds: string[]): Promise<void> {
  await db.transaction('rw', db.papers, async () => {
    let n = 1;
    for (const id of orderedIds) {
      await db.papers.update(id, { order: n++ });
    }
  });
}


async function getCategoryStats(categoryId: string): Promise<{ paperCount: number; questionCount: number }> {
  const papers = await db.papers.where('categoryId').equals(categoryId).toArray();
  const paperCount = papers.length;
  let questionCount = 0;
  for (const p of papers) {
    questionCount += p.questionIds?.length || 0;
  }
  return { paperCount, questionCount };
}

/* -------------------------------------------------------------
 * 6.7 Advanced Category APIs (move / copy / paste / duplicate)
 * ----------------------------------------------------------- */


async function getCategoryClipboard(): Promise<CategoryClipboard | null> {
  const rec = await db.meta.get(META_CATEGORY_CLIPBOARD_KEY);
  const v = rec?.value as CategoryClipboard | null | undefined;
  if (!v || !v.id || (v.type !== 'category' && v.type !== 'paper')) return null;
  // Make sure the copied item still exists
  if (v.type === 'category') {
    const c = await db.categories.get(v.id);
    return c ? { type: 'category', id: c.id, name: c.name } : null;
  }
  const p = await db.papers.get(v.id);
  return p ? { type: 'paper', id: p.id, name: p.title || p.shortName } : null;
}


async function setCategoryClipboard(value: CategoryClipboard | null): Promise<void> {
  await db.meta.put({ key: META_CATEGORY_CLIPBOARD_KEY, value });
}


/**
 * Generate a category name that is not used yet: "Name (কপি)", "Name (কপি 2)" ...
 */
async function getUniqueCategoryName(baseName: string): Promise<string> {
  const base = baseName.trim();
  const all = await db.categories.toArray();
  const used = new Set(all.map((c) => c.name.trim().toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  let candidate = `${base} (কপি)`;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base} (কপি ${n})`;
    n++;
  }
  return candidate;
}


/**
 * Move a paper (question paper) from its current category into another category
 */
async function movePaperToCategory(paperId: string, targetCategoryId: string): Promise<void> {
  const target = await db.categories.get(targetCategoryId);
  if (!target) throw new Error('গন্তব্য ক্যাটেগরি পাওয়া যায়নি');
  const paper = await db.papers.get(paperId);
  if (!paper) return;
  if (paper.categoryId === target.id) return;
  await db.papers.update(paperId, {
    categoryId: target.id,
    category: target.name,
    shortName: await getNextPaperLabel(target.id, target.name),
  });
}


/**
 * Copy a paper into a category (creates an independent copy of the paper)
 */
async function duplicatePaper(paperId: string, targetCategoryId: string): Promise<Paper> {
  const [paper, target] = await Promise.all([db.papers.get(paperId), db.categories.get(targetCategoryId)]);
  if (!paper) throw new Error('প্রশ্নপত্রটি পাওয়া যায়নি');
  if (!target) throw new Error('গন্তব্য ক্যাটেগরি পাওয়া যায়নি');

  const copy: Paper = {
    ...paper,
    id: generateId(),
    categoryId: target.id,
    category: target.name,
    shortName: await getNextPaperLabel(target.id, target.name),
    createdAt: Date.now(),
    questionIds: [...(paper.questionIds || [])],
  };
  await db.papers.add(copy);
  return copy;
}


/**
 * Batch helpers used by the Create screen (multi-select)
 */
async function movePapersToCategory(paperIds: string[], targetCategoryId: string): Promise<number> {
  let count = 0;
  for (const id of paperIds) {
    const paper = await db.papers.get(id);
    if (!paper) continue;
    await movePaperToCategory(id, targetCategoryId);
    count++;
  }
  return count;
}


async function duplicatePapers(paperIds: string[], targetCategoryId: string): Promise<number> {
  let count = 0;
  const base = Date.now();
  for (const id of paperIds) {
    const copy = await duplicatePaper(id, targetCategoryId);
    // keep the copies in the same order as the originals
    await db.papers.update(copy.id, { createdAt: base + (paperIds.length - 1 - count) });
    count++;
  }
  return count;
}


async function deletePapers(paperIds: string[]): Promise<void> {
  await db.papers.bulkDelete(paperIds);
}


/**
 * Copy a whole category together with all of its papers
 */
async function duplicateCategory(categoryId: string): Promise<Category> {
  const source = await db.categories.get(categoryId);
  if (!source) throw new Error('ক্যাটেগরিটি পাওয়া যায়নি');

  const name = await getUniqueCategoryName(source.name);
  const all = await db.categories.toArray();
  const maxOrder = all.reduce((max, c) => Math.max(max, c.order || 0), 0);

  const newCat: Category = {
    id: generateId(),
    name,
    order: maxOrder + 1,
    createdAt: Date.now(),
  };
  await db.categories.add(newCat);

  const papers = await db.papers.where('categoryId').equals(categoryId).toArray();
  for (const p of papers) {
    await db.papers.add({
      ...p,
      id: generateId(),
      categoryId: newCat.id,
      category: newCat.name,
      questionIds: [...(p.questionIds || [])],
    });
  }
  return newCat;
}

/* -------------------------------------------------------------
 * 7. Seed Sample Data (if database is empty)
 * ----------------------------------------------------------- */


async function seedInitialDataIfNeeded(): Promise<boolean> {
  // Chapter CQ starts empty — the sample data is only for the Type CQ database
  if (db.name !== 'QbExamDatabase') {
    await ensureDefaultCategories();
    return false;
  }
  const count = await db.subjects.count();
  if (count > 0) {
    await ensureDefaultCategories();
    return false; // Already initialized
  }

  // 1. Subject: "পদার্থবিজ্ঞান ১ম পত্র"
  const subjectId = generateId();
  await db.subjects.add({
    id: subjectId,
    name: 'পদার্থবিজ্ঞান ১ম পত্র',
    order: 1,
  });

  // 2. Chapters
  const chGravitationId = generateId();
  const chVectorId = generateId();
  const chNewtonianId = generateId();

  await db.chapters.bulkAdd([
    {
      id: chGravitationId,
      subjectId,
      name: 'মহাকর্ষ ও অভিকর্ষ',
      order: 1,
    },
    {
      id: chVectorId,
      subjectId,
      name: 'ভেক্টর (নমুনা অধ্যায় ২)',
      order: 2,
    },
    {
      id: chNewtonianId,
      subjectId,
      name: 'নিউটনিয়ান বলবিদ্যা (নমুনা অধ্যায় ৩)',
      order: 3,
    },
  ]);

  // 3. Topics
  const topicPotentialId = generateId();
  const topicVectorId = generateId();
  const topicMomentumId = generateId();

  await db.topics.bulkAdd([
    {
      id: topicPotentialId,
      chapterId: chGravitationId,
      name: 'মহাকর্ষীয় বিভব',
      order: 1,
    },
    {
      id: topicVectorId,
      chapterId: chVectorId,
      name: 'ভেক্টরের সামান্তরিক সূত্র (নমুনা টপিক)',
      order: 1,
    },
    {
      id: topicMomentumId,
      chapterId: chNewtonianId,
      name: 'রৈখিক ভরবেগের সংরক্ষণ (নমুনা টপিক)',
      order: 1,
    },
  ]);

  // 4. Sample Stimulus Diagram (SVG Blob)
  const imageId = generateId();
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 210" width="100%" height="100%">
  <rect width="100%" height="100%" fill="#F8FAFC" rx="10"/>
  <polygon points="180,35 60,175 300,175" fill="#EEF2FF" stroke="#3B4FD8" stroke-width="2.5" stroke-linejoin="round"/>
  <!-- D midpoint & Altitude -->
  <line x1="180" y1="35" x2="180" y2="175" stroke="#DC2626" stroke-width="1.8" stroke-dasharray="4,4"/>
  <circle cx="180" cy="175" r="4.5" fill="#DC2626"/>
  <!-- Points -->
  <circle cx="180" cy="35" r="5.5" fill="#3B4FD8"/>
  <circle cx="60" cy="175" r="5.5" fill="#3B4FD8"/>
  <circle cx="300" cy="175" r="5.5" fill="#3B4FD8"/>
  <!-- Labels -->
  <text x="180" y="24" font-family="sans-serif" font-size="14" font-weight="bold" fill="#1B1F2A" text-anchor="middle">A</text>
  <text x="45" y="180" font-family="sans-serif" font-size="13" font-weight="bold" fill="#1B1F2A" text-anchor="middle">B (60 kg)</text>
  <text x="315" y="180" font-family="sans-serif" font-size="13" font-weight="bold" fill="#1B1F2A" text-anchor="middle">C (70 kg)</text>
  <text x="180" y="196" font-family="sans-serif" font-size="12" font-weight="bold" fill="#DC2626" text-anchor="middle">D (মধ্যবিন্দু)</text>
  <!-- Side Lengths -->
  <text x="105" y="100" font-family="sans-serif" font-size="12" font-weight="500" fill="#64748B" transform="rotate(-50 105 100)">15 m</text>
  <text x="255" y="100" font-family="sans-serif" font-size="12" font-weight="500" fill="#64748B" transform="rotate(50 255 100)">15 m</text>
  <text x="180" y="165" font-family="sans-serif" font-size="12" font-weight="500" fill="#64748B" text-anchor="middle">15 m</text>
</svg>`;
  const svgBlob = new Blob([svgContent], { type: 'image/svg+xml' });
  await db.images.add({
    id: imageId,
    fileName: 'stimulus-triangle-mB-mC.svg',
    blob: svgBlob,
  });

  // 5. Stimulus (উদ্দীপক)
  const stimulusId = generateId();
  await db.stimuli.add({
    id: stimulusId,
    topicId: topicPotentialId,
    text: 'চিত্রে AB = BC = CA = 15 m। D বিন্দু BC এর মধ্যবিন্দু। $m_B = 60\\ \\text{kg}$, $m_C = 70\\ \\text{kg}$',
    boardTag: "DB'২৫",
    imageIds: [imageId],
  });

  // 6. Questions (গ) & (ঘ)
  const qGaId = generateId();
  const qGhaId = generateId();

  await db.questions.bulkAdd([
    {
      id: qGaId,
      stimulusId,
      topicId: topicPotentialId,
      type: 'গ',
      marks: 3,
      rating: 3,
      order: 1,
      questionText: 'A বিন্দুতে বিভবের মান কত? বের করো।',
      solutionText:
        '$V_A = V_{BA} + V_{CA} = -\\frac{Gm_B}{AB} - \\frac{Gm_C}{AC} = -\\frac{G}{15}(m_B + m_C) = -\\frac{6.673 \\times 10^{-11}}{15}(60+70) = -5.7833 \\times 10^{-10}\\ \\text{J kg}^{-1}$',
      solutionImageIds: [],
      usedInBoards: [{ board: 'DB', years: [2025] }],
    },
    {
      id: qGhaId,
      stimulusId,
      topicId: topicPotentialId,
      type: 'ঘ',
      marks: 4,
      rating: 4,
      order: 2,
      questionText: 'A ও D বিন্দুর প্রাবল্যের মানের তুলনা করো।',
      solutionText:
        '$E_1 = \\frac{Gm_B}{BD^2} = \\frac{6.673\\times10^{-11}\\times60}{(7.5)^2} = 7.12\\times10^{-11}\\ \\text{N kg}^{-1}$, $E_2 = \\frac{Gm_C}{CD^2} = 8.3\\times10^{-11}\\ \\text{N kg}^{-1}$, লব্ধি প্রাবল্য $E_D = E_2 - E_1 = 1.18\\times10^{-11}\\ \\text{N kg}^{-1}$',
      solutionImageIds: [],
      usedInBoards: [{ board: 'DB', years: [2025] }],
    },
  ]);

  // 7. Initial Categories
  const catWeeklyId = generateId();
  const catChapterId = generateId();
  await db.categories.bulkAdd([
    {
      id: catWeeklyId,
      name: 'উইকলি মডেল টেস্ট',
      order: 1,
      createdAt: Date.now(),
    },
    {
      id: catChapterId,
      name: 'চ্যাপ্টার অ্যান্ড টেস্ট',
      order: 2,
      createdAt: Date.now(),
    },
  ]);

  // 8. Sample Paper
  const paperId = generateId();
  await db.papers.add({
    id: paperId,
    shortName: 'মডেল টেস্ট-১',
    title: 'পদার্থবিজ্ঞান ১ম পত্র - স্পেশাল মডেল টেস্ট ২০২৫',
    category: 'উইকলি মডেল টেস্ট',
    categoryId: catWeeklyId,
    createdAt: Date.now(),
    duration: '২ ঘণ্টা',
    totalMarks: 50,
    questionIds: [qGaId, qGhaId],
  });

  // 9. Initial Selection & Meta
  await db.meta.bulkPut([
    { key: META_SELECTED_KEY, value: [qGaId, qGhaId] },
    { key: META_CLIPBOARD_KEY, value: null },
    { key: 'settings', value: { theme: 'light', fontSize: 15 } },
  ]);

  return true;
}


  return {
    getSubjects,
    getChapters,
    getTopics,
    getQuestionsByTopicGrouped,
    getAllQuestions,
    getStimulus,
    getQuestion,
    getHierarchyStats,
    addSubject,
    updateSubject,
    addChapter,
    updateChapter,
    addTopic,
    updateTopic,
    addStimulus,
    updateStimulus,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    deleteStimulus,
    deleteTopic,
    deleteChapter,
    deleteSubject,
    reorderSubjects,
    reorderChapters,
    reorderTopics,
    reorderQuestions,
    getSelectedIds,
    isQuestionSelected,
    toggleSelected,
    toggleStimulusSelect,
    getSelectedStimuliCount,
    clearSelection,
    reorderSelected,
    copyQuestion,
    getClipboard,
    pasteAfter,
    copyStimulusGroup,
    getGroupClipboard,
    clearGroupClipboard,
    pasteStimulusGroup,
    deleteStimulusGroup,
    getImageBlobUrl,
    saveImageBlob,
    getQuestionGroupForEdit,
    saveQuestionGroup,
    getQuestionPaperUsage,
    getQuestionTotalUsageCount,
    getPaperCount,
    getQuestionCount,
    getPapers,
    getPaperById,
    getNextPaperLabel,
    relabelPapersByCategory,
    savePaper,
    deletePaper,
    ensureDefaultCategories,
    getCategories,
    getCategory,
    saveCategory,
    updateCategory,
    deleteCategory,
    deleteCategories,
    reorderCategories,
    ensureUncategorized,
    getPapersByCategory,
    reorderPapers,
    getCategoryStats,
    getCategoryClipboard,
    setCategoryClipboard,
    getUniqueCategoryName,
    movePaperToCategory,
    duplicatePaper,
    movePapersToCategory,
    duplicatePapers,
    deletePapers,
    duplicateCategory,
    seedInitialDataIfNeeded,
  };
}

export type QbApi = ReturnType<typeof createQbApi>;

/** Type CQ (the old "Collection") — keeps the original database, so existing data is untouched */
export const typeApi: QbApi = createQbApi(db);
/** Chapter CQ — its own separate IndexedDB database */
export const chapterApi: QbApi = createQbApi(chapterDb);

export function getApi(scope: CqScope): QbApi {
  return scope === 'chapter' ? chapterApi : typeApi;
}

// Backward-compatible named exports (Type CQ / default database)
export const {
  getSubjects,
  getChapters,
  getTopics,
  getQuestionsByTopicGrouped,
  getAllQuestions,
  getStimulus,
  getQuestion,
  getHierarchyStats,
  addSubject,
  updateSubject,
  addChapter,
  updateChapter,
  addTopic,
  updateTopic,
  addStimulus,
  updateStimulus,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  deleteStimulus,
  deleteTopic,
  deleteChapter,
  deleteSubject,
  reorderSubjects,
  reorderChapters,
  reorderTopics,
  reorderQuestions,
  getSelectedIds,
  isQuestionSelected,
  toggleSelected,
  toggleStimulusSelect,
  getSelectedStimuliCount,
  clearSelection,
  reorderSelected,
  copyQuestion,
  getClipboard,
  pasteAfter,
  copyStimulusGroup,
  getGroupClipboard,
  clearGroupClipboard,
  pasteStimulusGroup,
  deleteStimulusGroup,
  getImageBlobUrl,
  saveImageBlob,
  getQuestionGroupForEdit,
  saveQuestionGroup,
  getQuestionPaperUsage,
  getQuestionTotalUsageCount,
  getPaperCount,
  getQuestionCount,
  getPapers,
  getPaperById,
  getNextPaperLabel,
  relabelPapersByCategory,
  savePaper,
  deletePaper,
  ensureDefaultCategories,
  getCategories,
  getCategory,
  saveCategory,
  updateCategory,
  deleteCategory,
  deleteCategories,
  reorderCategories,
  ensureUncategorized,
  getPapersByCategory,
  reorderPapers,
  getCategoryStats,
  getCategoryClipboard,
  setCategoryClipboard,
  getUniqueCategoryName,
  movePaperToCategory,
  duplicatePaper,
  movePapersToCategory,
  duplicatePapers,
  deletePapers,
  duplicateCategory,
  seedInitialDataIfNeeded,
} = typeApi;
