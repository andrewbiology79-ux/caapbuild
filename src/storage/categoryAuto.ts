import { db, getDb, type CqScope } from '../db/db';
import { autoSyncStore } from './autoSyncStatus';
import { waitForEditorsClosed } from './editorGuard';
import { isSyncTx } from './writer';
import { createCategoryQueue, questionIdsUsingImages, type CategoryWork } from './categoryQueue';
import { flushCategoryWork } from './categoryWriter';
import { createCategoryFlusher, createMessageThrottle, type FlushOutcome } from './categoryFlusher';

/**
 * অংশ ১খ-২খ (প্রথম রাউন্ড) - ক্যাটেগরির অটো লেখা: Dexie hook + ডেটাবেস-পড়া অংশ + আসল চালক।
 * এখনো main.tsx / syncEngine-এ জোড়া লাগানো নেই (দ্বিতীয় রাউন্ডে installCategoryHooks() ডাকা হবে), তাই APK-র আচরণ বদলায়নি।
 *
 * hook-গুলো বিদ্যমান isSyncTx (writer.ts) মানে: ফোল্ডার সিঙ্ক বন্ধ থাকলে বা ফোল্ডার -> অ্যাপ লেখার transaction হলে কিছু জমে না।
 */

const SCOPES: CqScope[] = ['type', 'chapter'];

export const categoryQueue = createCategoryQueue();

let hooksInstalled = false;
let onMessages: (messages: string[]) => void = (m) => console.warn('Category folder sync:', m.join(' | '));
let onError: (message: string) => void = (m) => console.warn('Category folder sync failed:', m);

/** লেখার সতর্কতা/কারণ (যেমন "ফোল্ডার মোছা, আবার তৈরি হয়নি") ব্যবহারকারীকে দেখাতে */
export function setCategoryMessageHandler(fn: ((messages: string[]) => void) | null): void {
  onMessages = fn ?? ((m) => console.warn('Category folder sync:', m.join(' | ')));
}

/** লেখাই ব্যর্থ হলে */
export function setCategoryErrorHandler(fn: ((message: string) => void) | null): void {
  onError = fn ?? ((m) => console.warn('Category folder sync failed:', m));
}

/* ------------------------------------------------------------------
 * ডেটাবেস থেকে বাড়তি প্রশ্নের id খোঁজা
 * কী কী "বদলেছে" সারিতে আসে: প্রশ্ন/উদ্দীপকের id, ছবির id, আর নাম/জায়গা বদলানো subject/chapter/topic ("subject:<id>" ইত্যাদি)।
 * এগুলো থেকে "কোন প্রশ্নের কপি বদলাল" বের করা হয় (কপির পথ/ছবি/উদ্দীপক বদলায় বলে)।
 * ---------------------------------------------------------------- */

const ENTITY_PREFIXES = ['subject:', 'chapter:', 'topic:'] as const;

export async function expandCategoryContent(work: CategoryWork): Promise<string[]> {
  const plain: string[] = [];
  const entity: Record<string, string[]> = { 'subject:': [], 'chapter:': [], 'topic:': [] };
  for (const id of work.contentIds) {
    const pre = ENTITY_PREFIXES.find((p) => id.startsWith(p));
    if (pre) entity[pre].push(id.slice(pre.length));
    else plain.push(id);
  }
  const out = new Set<string>();

  for (const scope of SCOPES) {
    const sdb = getDb(scope);

    // উদ্দীপক বদলালে তার সব প্রশ্ন
    if (plain.length) {
      for (const q of await sdb.questions.where('stimulusId').anyOf(plain).toArray()) out.add(q.id);
    }

    // subject / chapter / topic বদলালে তার নিচের সব প্রশ্ন (নামের পথ কপিতে থাকে)
    if (entity['subject:'].length || entity['chapter:'].length || entity['topic:'].length) {
      const subjectIds = new Set(entity['subject:']);
      const chapterIds = new Set(entity['chapter:']);
      const topicIds = new Set(entity['topic:']);
      if (subjectIds.size) for (const c of await sdb.chapters.toArray()) if (subjectIds.has(c.subjectId)) chapterIds.add(c.id);
      if (chapterIds.size) for (const t of await sdb.topics.toArray()) if (chapterIds.has(t.chapterId)) topicIds.add(t.id);
      if (topicIds.size) for (const k of await sdb.questions.where('topicId').anyOf(Array.from(topicIds)).primaryKeys()) out.add(String(k));
    }

    // ছবি বদলালে/মুছলে যে প্রশ্ন/উদ্দীপক ব্যবহার করে (বড় ডেটায় ভারী, তাই শুধু ছবি বদলালে চলে)
    if (work.imageIds.size) {
      const [questions, stimuli] = await Promise.all([sdb.questions.toArray(), sdb.stimuli.toArray()]);
      for (const id of questionIdsUsingImages(questions, stimuli, work.imageIds)) out.add(id);
    }
  }
  return Array.from(out);
}

/* ------------------------------------------------------------------
 * চালক (debounce + ফর্ম-অপেক্ষা + ব্যানার + লেখা)
 * ---------------------------------------------------------------- */

const throttle = createMessageThrottle();

const flusher = createCategoryFlusher({
  queue: categoryQueue,
  waitEditorsClosed: (isStopped) => waitForEditorsClosed(isStopped),
  expandContent: expandCategoryContent,
  flush: async (work, extraQuestionIds): Promise<FlushOutcome> => {
    const r = await flushCategoryWork(work, { extraQuestionIds });
    return {
      changed: r.written.some((w) => w.status === 'written') || r.removed.some((x) => x.status === 'removed') || r.tidy.moved > 0,
      messages: r.messages,
    };
  },
  banner: autoSyncStore,
  onMessages: (m) => {
    const fresh = throttle(m); // একই বার্তা ৬০ সেকেন্ডে বারবার নয়
    if (fresh.length) onMessages(fresh);
  },
  onError: (m) => onError(m),
});

/** এখনই লিখে ফেলা (debounce ছাড়া) - যেমন সিঙ্ক শুরুর আগে */
export function flushCategoryNow(): Promise<void> {
  return flusher.flushNow();
}

/** অপেক্ষারত লেখা থামানো (জমা কাজ সারিতেই থাকে) */
export function stopCategoryAuto(): void {
  flusher.stop();
}

/** stopCategoryAuto-র পর আবার চালু (সারিতে জমা কাজ থাকলে একটু পরে লেখা শুরু) */
export function resumeCategoryAuto(): void {
  if (categoryQueue.hasPending()) flusher.schedule();
}

/** প্রিভিউ/তুলনার জন্য: জমে থাকা বদল (কিছু বদলায় না) */
export function peekCategoryPending() {
  return categoryQueue.peek();
}

/**
 * ফোল্ডার -> অ্যাপ সিঙ্কের পর যে ক্যাটেগরির ফোল্ডার অ্যাপ থেকে নতুন করে লেখা দরকার (নাম অমিল, .folder.json নেই,
 * অশ্রেণিবদ্ধে সরানো প্রশ্নপত্র) সেগুলো সারিতে দেওয়া। সিঙ্কের transaction hook ডাকে না, তাই এখানে হাতে।
 */
export function queueCategoryWrites(categoryIds: string[]): void {
  let any = false;
  for (const id of categoryIds) {
    if (!id) continue;
    categoryQueue.markCategory(id);
    any = true;
  }
  if (any) flusher.schedule();
}

const schedule = () => flusher.schedule();

/* ------------------------------------------------------------------
 * Dexie hooks
 * ---------------------------------------------------------------- */

export function installCategoryHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;

  // ক্যাটেগরি তৈরি / নাম বদল / ক্রম বদল / মোছা
  db.categories.hook('creating', function (_pk: any, obj: any, tx: any) {
    if (isSyncTx(tx)) return;
    categoryQueue.markCategory(obj?.id);
    schedule();
  });
  db.categories.hook('updating', function (_mods: any, pk: any, _obj: any, tx: any) {
    if (isSyncTx(tx)) return;
    categoryQueue.markCategory(pk);
    schedule();
  });
  db.categories.hook('deleting', function (pk: any, _obj: any, tx: any) {
    if (isSyncTx(tx)) return;
    categoryQueue.markDelete(pk);
    schedule();
  });

  // প্রশ্নপত্র তৈরি / এডিট / মোছা / অন্য ক্যাটেগরিতে নেওয়া (আগের ও নতুন দুই ক্যাটেগরিই)
  db.papers.hook('creating', function (_pk: any, obj: any, tx: any) {
    if (isSyncTx(tx)) return;
    categoryQueue.markPaper(obj?.id, obj?.categoryId);
    schedule();
  });
  db.papers.hook('updating', function (mods: any, pk: any, obj: any, tx: any) {
    if (isSyncTx(tx)) return;
    const hasCat = mods && Object.prototype.hasOwnProperty.call(mods, 'categoryId');
    categoryQueue.markPaper(pk, obj?.categoryId, hasCat ? mods.categoryId : obj?.categoryId);
    schedule();
  });
  db.papers.hook('deleting', function (pk: any, obj: any, tx: any) {
    if (isSyncTx(tx)) return;
    categoryQueue.markPaper(pk, obj?.categoryId);
    schedule();
  });

  for (const scope of SCOPES) {
    const sdb = getDb(scope);

    // প্রশ্ন ও উদ্দীপক (ক্যাটেগরির কপি এদের থেকে আসে)
    for (const table of [sdb.questions, sdb.stimuli] as any[]) {
      table.hook('creating', function (_pk: any, obj: any, tx: any) {
        if (isSyncTx(tx)) return;
        categoryQueue.markContent(obj?.id);
        schedule();
      });
      table.hook('updating', function (_mods: any, pk: any, _obj: any, tx: any) {
        if (isSyncTx(tx)) return;
        categoryQueue.markContent(pk);
        schedule();
      });
      table.hook('deleting', function (pk: any, _obj: any, tx: any) {
        if (isSyncTx(tx)) return;
        categoryQueue.markContent(pk);
        schedule();
      });
    }

    // subject / chapter / topic-এর নাম বা জায়গা বদলালে প্রশ্নের কপির পথ বদলায়
    const entityTables: Array<[any, string]> = [
      [sdb.subjects, 'subject:'],
      [sdb.chapters, 'chapter:'],
      [sdb.topics, 'topic:'],
    ];
    for (const [table, prefix] of entityTables) {
      table.hook('updating', function (mods: any, pk: any, _obj: any, tx: any) {
        if (isSyncTx(tx)) return;
        const has = (k: string) => mods && Object.prototype.hasOwnProperty.call(mods, k);
        if (has('name') || has('subjectId') || has('chapterId')) {
          categoryQueue.markContent(`${prefix}${pk}`);
          schedule();
        }
      });
    }

    // ছবি: নতুন, নতুন ডেটা বসানো (blob), বা মোছা। (লেখক নিজে blob সরিয়ে ফোল্ডারে রাখলে - blob ছাড়া বদল - ধরা হয় না, নইলে অকারণ ঘুরত)
    sdb.images.hook('creating', function (_pk: any, obj: any, tx: any) {
      if (isSyncTx(tx)) return;
      categoryQueue.markImage(obj?.id);
      schedule();
    });
    sdb.images.hook('updating', function (mods: any, pk: any, _obj: any, tx: any) {
      if (isSyncTx(tx)) return;
      if (mods && typeof Blob !== 'undefined' && mods.blob instanceof Blob) {
        categoryQueue.markImage(pk);
        schedule();
      }
    });
    sdb.images.hook('deleting', function (pk: any, _obj: any, tx: any) {
      if (isSyncTx(tx)) return;
      categoryQueue.markImage(pk);
      schedule();
    });
  }
}
