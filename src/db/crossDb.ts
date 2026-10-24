import { db, chapterDb, type Question, type Stimulus } from './db';
import { typeApi, chapterApi } from './api';

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
