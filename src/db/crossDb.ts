import { db, chapterDb, getDb, type CqScope, type Question, type Stimulus } from './db';
import { typeApi, chapterApi, generateId } from './api';
import { getImageBlob } from '../storage/imageStore';
import { fillMissingQuestions, fillMissingStimuli } from '../storage/bankMissing';
import { loadCopies } from '../storage/bankMissingStore';
import { imageIdsOfGroup, remapStimulusImages, remapQuestionImages } from '../utils/imageClone';
import { createImageUseTracker } from '../utils/imageCleanup';

/**
 * Papers can contain questions from BOTH collections (Type CQ + Chapter CQ).
 * Question / stimulus ids are random and unique, so a paper only stores plain ids and these
 * helpers look each id up in whichever database owns it.
 */

export async function getQuestionsByIds(ids: string[]): Promise<Question[]> {
  if (!ids || ids.length === 0) return [];
  const fromType = await db.questions.where('id').anyOf(ids).toArray();
  const found = new Set(fromType.map((q: Question) => q.id));
  let missing = ids.filter((id) => !found.has(id));
  if (missing.length === 0) return fromType;
  const fromChapter = await chapterDb.questions.where('id').anyOf(missing).toArray();
  const all = [...fromType, ...fromChapter];
  const foundAll = new Set(all.map((q: Question) => q.id));
  missing = missing.filter((id) => !foundAll.has(id));
  if (missing.length === 0) return all;
  // অংশ ১ঘ-খ: ব্যাংকে না পাওয়া প্রশ্ন নিঃশব্দে বাদ না দিয়ে কপি থেকে পূরণ (ব্যাংকে থাকলে ব্যাংকই জেতে)
  try {
    const copies = await loadCopies(missing);
    return copies.size > 0 ? fillMissingQuestions(missing, all, copies) : all;
  } catch (e) {
    console.warn('Bank-missing copies could not be read:', e);
    return all;
  }
}

export async function getStimuliByIds(ids: string[]): Promise<Stimulus[]> {
  if (!ids || ids.length === 0) return [];
  const fromType = await db.stimuli.where('id').anyOf(ids).toArray();
  const found = new Set(fromType.map((s: Stimulus) => s.id));
  let missing = ids.filter((id) => !found.has(id));
  if (missing.length === 0) return fromType;
  const fromChapter = await chapterDb.stimuli.where('id').anyOf(missing).toArray();
  const all = [...fromType, ...fromChapter];
  const foundAll = new Set(all.map((s: Stimulus) => s.id));
  missing = missing.filter((id) => !foundAll.has(id));
  if (missing.length === 0) return all;
  // অংশ ১ঘ-খ: ব্যাংকে না পাওয়া উদ্দীপক কপি থেকে (কপি প্রশ্ন-প্রতি, তাই সব কপি দেখা হয়; কপি সাধারণত অল্প)
  try {
    const copies = await loadCopies();
    return copies.size > 0 ? fillMissingStimuli(missing, all, Array.from(copies.values())) : all;
  } catch (e) {
    console.warn('Bank-missing copies could not be read:', e);
    return all;
  }
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
  // অংশ ১ঘ-খ: ব্যাংকে-নেই প্রশ্ন (কপি আছে, ব্যাংকে নেই) \"chapter\"-এ ধরা হতো - এখন Chapter CQ-তে সত্যিই আছে কি না দেখা হয়, না থাকলে বাদ
  const restIds = ids.filter((id) => !typeSet.has(id));
  const chapterQs = restIds.length ? await chapterDb.questions.where('id').anyOf(restIds).primaryKeys() : [];
  const chapterSet = new Set<string>(chapterQs as string[]);
  const chapterIds = restIds.filter((id) => chapterSet.has(id));
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
const MULTI_CLIPBOARD_MODE_KEY = 'multi_question_clipboard_mode';
const MULTI_CLIPBOARD_IMAGES_KEY = 'multi_question_clipboard_images';

export type MultiClipMode = 'copy' | 'cut';

/**
 * Put questions on the shared clipboard.
 * mode 'copy' -> pasting makes NEW copies.
 * mode 'cut'  -> pasting MOVES the original questions (the Filter tab's "কাট করুন").
 */
export async function setMultiClipboard(groups: MultiClipGroup[], mode: MultiClipMode = 'copy'): Promise<void> {
  // only one clipboard is active at a time
  await Promise.all([typeApi.clearGroupClipboard(), chapterApi.clearGroupClipboard()]);

  // COPY: ছবির ডেটা এখনই ক্লিপবোর্ডে নেওয়া হয়। এতে কপির পর মূল প্রশ্ন/ছবি মুছে ফেললেও পেস্ট কাজ করে,
  // আর পেস্টের সময় প্রতিটা কপি নতুন id-র নিজের ছবি পায় (দুই প্রশ্ন একই ছবি ধরে না)।
  // CUT: ছবি নেওয়ার দরকার নেই — প্রশ্ন নিজে (একই id-তে) সরে যায়।
  let images: ClipImages | null = null;
  if (mode === 'copy') {
    images = {};
    for (const g of groups) {
      const sdb = getDb(g.source);
      for (const id of imageIdsOfGroup(g.stimulus, g.questions)) {
        if (images[id]) continue;
        const blob = await getImageBlob(id, sdb);
        if (!blob) continue;
        const rec = (await sdb.images.get(id)) ?? (await (g.source === 'chapter' ? db : chapterDb).images.get(id));
        images[id] = { blob, fileName: rec?.fileName || `${id}.webp`, w: rec?.w, h: rec?.h };
      }
    }
  }

  await db.meta.put({ key: MULTI_CLIPBOARD_KEY, value: JSON.parse(JSON.stringify(groups)) });
  await db.meta.put({ key: MULTI_CLIPBOARD_MODE_KEY, value: mode });
  await db.meta.put({ key: MULTI_CLIPBOARD_IMAGES_KEY, value: images });
}

interface ClipImage {
  blob: Blob;
  fileName: string;
  w?: number;
  h?: number;
}
type ClipImages = Record<string, ClipImage>;

async function getMultiClipboardImages(): Promise<ClipImages> {
  const rec = await db.meta.get(MULTI_CLIPBOARD_IMAGES_KEY);
  const v = rec?.value as ClipImages | null | undefined;
  return v && typeof v === 'object' ? v : {};
}

export async function getMultiClipboardMode(): Promise<MultiClipMode> {
  const rec = await db.meta.get(MULTI_CLIPBOARD_MODE_KEY);
  return rec?.value === 'cut' ? 'cut' : 'copy';
}

export async function getMultiClipboard(): Promise<MultiClipGroup[]> {
  const rec = await db.meta.get(MULTI_CLIPBOARD_KEY);
  const v = rec?.value as MultiClipGroup[] | null | undefined;
  return Array.isArray(v) ? v.filter((g) => g && Array.isArray(g.questions) && g.questions.length > 0) : [];
}

export async function clearMultiClipboard(): Promise<void> {
  await db.meta.put({ key: MULTI_CLIPBOARD_KEY, value: null });
  await db.meta.put({ key: MULTI_CLIPBOARD_MODE_KEY, value: 'copy' });
  await db.meta.put({ key: MULTI_CLIPBOARD_IMAGES_KEY, value: null });
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

  const mode = await getMultiClipboardMode();

  // --- CUT: অন্য ডেটাবেস থেকে আসা প্রশ্নের ছবি (একই id-তে) এই ডেটাবেসে আনা; টপিকের media/ ফোল্ডারে নিজের ফাইল লেখার সময় তৈরি হয় ---
  if (mode === 'cut') {
    for (const g of groups) {
      if (g.source === scope) continue;
      const sdb = getDb(g.source);
      for (const id of imageIdsOfGroup(g.stimulus, g.questions)) {
        if (await tdb.images.get(id)) continue;
        const img = await sdb.images.get(id);
        if (!img) continue;
        const blob = await getImageBlob(id, sdb);
        if (blob) await tdb.images.put({ id: img.id, fileName: img.fileName, blob, w: img.w, h: img.h });
      }
    }
  }

  // ---------- CUT: move the original questions (ids stay the same, so papers keep working) ----------
  if (mode === 'cut') {
    const cutIds = new Set<string>();
    groups.forEach((g) => g.questions.forEach((q) => cutIds.add(q.id)));

    // shift the questions that are already there to make room
    for (const q of topicQuestions) {
      if (cutIds.has(q.id)) continue;
      if (q.order >= insertOrder) await tdb.questions.update(q.id, { order: q.order + total });
    }

    let cutOrder = insertOrder;
    for (const g of groups) {
      const sdb = getDb(g.source);
      let stimulusId: string | undefined;

      if (g.stimulus) {
        // does some other question still use this stimulus in the source database?
        const siblings = await sdb.questions.where('stimulusId').equals(g.stimulus.id).toArray();
        const stays = siblings.some((q) => !cutIds.has(q.id));
        const srcStimulus = (await sdb.stimuli.get(g.stimulus.id)) ?? g.stimulus;

        if (stays) {
          // only some questions of the group were cut -> the moved ones get their own copy of the stimulus
          stimulusId = generateId();
          await tdb.stimuli.put({ ...srcStimulus, id: stimulusId, topicId: targetTopicId });
        } else {
          stimulusId = srcStimulus.id;
          await tdb.stimuli.put({ ...srcStimulus, topicId: targetTopicId });
          if (g.source !== scope) await sdb.stimuli.delete(srcStimulus.id);
        }
      }

      for (const q of g.questions) {
        const fresh = (await sdb.questions.get(q.id)) ?? q;
        await tdb.questions.put({ ...fresh, topicId: targetTopicId, stimulusId, order: cutOrder++ });
        if (g.source !== scope) await sdb.questions.delete(q.id);
      }

      // moved to another database -> drop them from that database's selection list
      if (g.source !== scope) {
        const api = g.source === 'chapter' ? chapterApi : typeApi;
        const selected = await api.getSelectedIds();
        const remaining = selected.filter((id) => !g.questions.some((q) => q.id === id));
        if (remaining.length !== selected.length) await api.reorderSelected(remaining);
      }
    }

    // অন্য ডেটাবেস থেকে কাট: মূল ডেটাবেসের ছবির সারি ও ফোল্ডারের ফাইল মোছা (ছবি এখন এই ডেটাবেসের)
    for (const g of groups) {
      if (g.source !== scope) await releaseSourceImages(getDb(g.source), imageIdsOfGroup(g.stimulus, g.questions));
    }

    await clearMultiClipboard(); // a cut can only be pasted once
    return total;
  }

  // COPY: প্রতিটা কপি নতুন প্রশ্ন-id + নতুন ছবির id পায়; ছবির ডেটা ক্লিপবোর্ডে রাখা ছিল (মূল মুছে গেলেও চলে)
  const clipImages = await getMultiClipboardImages();
  let missingImages = 0;

  await tdb.transaction('rw', [tdb.questions, tdb.stimuli, tdb.images], async () => {
    for (const q of topicQuestions) {
      if (q.order >= insertOrder) await tdb.questions.update(q.id, { order: q.order + total });
    }

    let order = insertOrder;
    for (const g of groups) {
      // এই গ্রুপের জন্য আলাদা পুরনো-id → নতুন-id তালিকা (দুই গ্রুপ একই নতুন ছবি ধরে না)
      const idMap = new Map<string, string>();
      for (const oldId of imageIdsOfGroup(g.stimulus, g.questions)) {
        const c = clipImages[oldId];
        if (!c || !(c.blob instanceof Blob)) {
          missingImages++;
          continue;
        }
        const newId = generateId();
        // topicId ছাড়া blob-সহ ছবি = "নতুন ছবি, এখনো ফোল্ডারে লেখা হয়নি"; টপিক লেখার সময় media/-তে যায়
        await tdb.images.add({ id: newId, fileName: c.fileName, blob: c.blob, w: c.w, h: c.h });
        idMap.set(oldId, newId);
      }

      let newStimulusId: string | undefined;
      if (g.stimulus) {
        newStimulusId = generateId();
        await tdb.stimuli.add({ ...remapStimulusImages(g.stimulus, idMap), id: newStimulusId, topicId: targetTopicId });
      }
      for (const q of g.questions) {
        await tdb.questions.add({
          ...remapQuestionImages(q, idMap),
          id: generateId(),
          topicId: targetTopicId,
          stimulusId: newStimulusId,
          order: order++,
        });
      }
    }
  });

  if (missingImages > 0) console.warn(`পেস্ট: ${missingImages}টি ছবির ডেটা ক্লিপবোর্ডে পাওয়া যায়নি, বাদ দেওয়া হয়েছে`);
  return total;
}


/**
 * কাটে অন্য ডেটাবেসে সরে যাওয়া প্রশ্নের ছবি মূল ডেটাবেস থেকে মোছা (সারি + hook-এর মাধ্যমে ফোল্ডারের ফাইল)।
 * মূল ডেটাবেসের বাকি কোনো উদ্দীপক/প্রশ্ন এখনও ধরে থাকলে ছবি থাকে। কখনও throw করে না।
 */
async function releaseSourceImages(sdb: ReturnType<typeof getDb>, ids: string[]): Promise<void> {
  try {
    const tracker = createImageUseTracker(ids);
    if (tracker.size === 0) return;
    await sdb.stimuli.each((st) => tracker.addStimulus(st));
    await sdb.questions.each((q) => tracker.addQuestion(q));
    const unused = tracker.unused();
    if (unused.length > 0) await sdb.images.where('id').anyOf(unused).delete();
  } catch (err) {
    console.warn('releaseSourceImages failed (ছবি রেখে দেওয়া হলো):', err);
  }
}
