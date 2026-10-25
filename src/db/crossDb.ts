import { db, chapterDb, getDb, type CqScope, type Question, type Stimulus } from './db';
import { typeApi, chapterApi, generateId } from './api';

/**
 * Papers can contain questions from BOTH collections (Type CQ + Chapter CQ).
 * Question / stimulus ids are random and unique, so a paper only stores plain ids and these
 * helpers look each id up in whichever database owns it.
 */

export async function getQuestionsByIds(ids: string[]): Promise<Question[]> {
  if (!ids || ids.length === 0) return [];
  const fromType = await db.questions.where('id').anyOf(ids).toArray();
  const found = new Set(fromType.map((q: Question) => q.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length === 0) return fromType;
  const fromChapter = await chapterDb.questions.where('id').anyOf(missing).toArray();
  return [...fromType, ...fromChapter];
}

export async function getStimuliByIds(ids: string[]): Promise<Stimulus[]> {
  if (!ids || ids.length === 0) return [];
  const fromType = await db.stimuli.where('id').anyOf(ids).toArray();
  const found = new Set(fromType.map((s: Stimulus) => s.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length === 0) return fromType;
  const fromChapter = await chapterDb.stimuli.where('id').anyOf(missing).toArray();
  return [...fromType, ...fromChapter];
}

/** Questions picked in Type CQ followed by the ones picked in Chapter CQ */
export async function getSelectedIdsAll(): Promise<string[]> {
  const [typeIds, chapterIds] = await Promise.all([typeApi.getSelectedIds(), chapterApi.getSelectedIds()]);
  return [...typeIds, ...chapterIds];
}

export async function getSelectedStimuliCountAll(): Promise<number> {
  const [typeIds, chapterIds] = await Promise.all([typeApi.getSelectedIds(), chapterApi.getSelectedIds()]);
  const [a, b] = await Promise.all([typeApi.getSelectedStimuliCount(typeIds), chapterApi.getSelectedStimuliCount(chapterIds)]);
  return a + b;
}

/** Load a paper's questions back into the selection of the collection each one belongs to */
export async function setSelectionFromPaperIds(ids: string[]): Promise<void> {
  const typeQs = await db.questions.where('id').anyOf(ids).primaryKeys();
  const typeSet = new Set<string>(typeQs as string[]);
  const typeIds = ids.filter((id) => typeSet.has(id));
  const chapterIds = ids.filter((id) => !typeSet.has(id));
  await typeApi.reorderSelected(typeIds);
  await chapterApi.reorderSelected(chapterIds);
}

/* ------------------------------------------------------------------
 * Multi-question clipboard (Filter tab -> Type CQ / Chapter CQ)
 * ---------------------------------------------------------------- */

export interface MultiClipGroup {
  /** which collection the questions come from (needed to copy their images) */
  source: CqScope;
  stimulus?: Stimulus;
  questions: Question[];
}

const MULTI_CLIPBOARD_KEY = 'multi_question_clipboard';

export async function setMultiClipboard(groups: MultiClipGroup[]): Promise<void> {
  // only one clipboard is active at a time
  await Promise.all([typeApi.clearGroupClipboard(), chapterApi.clearGroupClipboard()]);
  await db.meta.put({ key: MULTI_CLIPBOARD_KEY, value: JSON.parse(JSON.stringify(groups)) });
}

export async function getMultiClipboard(): Promise<MultiClipGroup[]> {
  const rec = await db.meta.get(MULTI_CLIPBOARD_KEY);
  const v = rec?.value as MultiClipGroup[] | null | undefined;
  return Array.isArray(v) ? v.filter((g) => g && Array.isArray(g.questions) && g.questions.length > 0) : [];
}

export async function clearMultiClipboard(): Promise<void> {
  await db.meta.put({ key: MULTI_CLIPBOARD_KEY, value: null });
}

export function countMultiClipboard(groups: MultiClipGroup[]): number {
  return groups.reduce((sum, g) => sum + g.questions.length, 0);
}

export type MultiPastePosition = 'before' | 'after' | 'end';

/**
 * Paste the multi-question clipboard into a topic / chapter of Type CQ or Chapter CQ.
 * Always makes NEW copies (new ids). Images are copied across when the source is the other database.
 * Returns how many questions were pasted.
 */
export async function pasteMultiClipboard(
  scope: CqScope,
  targetTopicId: string,
  position: MultiPastePosition,
  target?: { stimulusId?: string; questionId?: string }
): Promise<number> {
  const groups = await getMultiClipboard();
  const total = countMultiClipboard(groups);
  if (total === 0) return 0;

  const tdb = getDb(scope);

  // --- where to insert ---
  const topicQuestions = await tdb.questions.where('topicId').equals(targetTopicId).toArray();
  let insertOrder: number;
  if (position === 'end' || (!target?.stimulusId && !target?.questionId)) {
    insertOrder = topicQuestions.reduce((m, q) => Math.max(m, q.order || 0), 0) + 1;
  } else {
    let targetOrder = 1;
    if (target?.stimulusId) {
      const tq = topicQuestions.filter((q) => q.stimulusId === target.stimulusId);
      if (tq.length > 0) {
        targetOrder = position === 'before' ? Math.min(...tq.map((q) => q.order)) : Math.max(...tq.map((q) => q.order));
      }
    } else if (target?.questionId) {
      const tq = topicQuestions.find((q) => q.id === target.questionId);
      if (tq) targetOrder = tq.order;
    }
    insertOrder = position === 'before' ? targetOrder : targetOrder + 1;
  }

  // --- images used by the pasted questions that the target database does not have yet ---
  for (const g of groups) {
    if (g.source === scope) continue;
    const sdb = getDb(g.source);
    const ids = new Set<string>();
    (g.stimulus?.imageIds || []).forEach((id) => ids.add(id));
    g.questions.forEach((q) => (q.solutionImageIds || []).forEach((id) => ids.add(id)));
    for (const id of ids) {
      if (await tdb.images.get(id)) continue;
      const img = await sdb.images.get(id);
      if (img) await tdb.images.put(img);
    }
  }

  await tdb.transaction('rw', [tdb.questions, tdb.stimuli], async () => {
    for (const q of topicQuestions) {
      if (q.order >= insertOrder) await tdb.questions.update(q.id, { order: q.order + total });
    }

    let order = insertOrder;
    for (const g of groups) {
      let newStimulusId: string | undefined;
      if (g.stimulus) {
        newStimulusId = generateId();
        await tdb.stimuli.add({ ...g.stimulus, id: newStimulusId, topicId: targetTopicId });
      }
      for (const q of g.questions) {
        await tdb.questions.add({
          ...q,
          id: generateId(),
          topicId: targetTopicId,
          stimulusId: newStimulusId,
          order: order++,
        });
      }
    }
  });

  return total;
}
