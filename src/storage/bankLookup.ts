import { getDb, type CqScope } from '../db/db';
import { bankPathOf, type BankLookup, type BankQuestionRef } from './categoryCopies';

/**
 * ব্যাংক থেকে প্রশ্ন (উদ্দীপক ও পথসহ) পড়া - Type CQ ও Chapter CQ দুই ডেটাবেসেই খোঁজে।
 * আগে categoryWriter.ts-এ ছিল (অংশ ১ঘ-তে এখানে সরানো, আচরণ হুবহু এক): শুধু db/db আর categoryCopies-এর ওপর নির্ভর করে,
 * তাই db/api.ts থেকেও নিরাপদে আনা যায় (categoryWriter ফাইল-সিস্টেম/সিঙ্ক কোড টানে)।
 */

/** ids-এর প্রশ্নগুলো (উদ্দীপক ও পথসহ) আগে থেকে পড়ে একটা সহজ lookup ফাংশন দেয় */
export async function buildBankLookup(ids: string[]): Promise<BankLookup> {
  const found = new Map<string, BankQuestionRef>();
  const remaining = new Set(ids);

  for (const scope of ['type', 'chapter'] as CqScope[]) {
    if (remaining.size === 0) break;
    const sdb = getDb(scope);
    const list = Array.from(remaining);
    const questions = await sdb.questions.bulkGet(list);
    const have = questions.filter((q): q is NonNullable<typeof q> => !!q);
    if (have.length === 0) continue;

    const topics = new Map((await sdb.topics.bulkGet(Array.from(new Set(have.map((q) => q.topicId))))).filter(Boolean).map((t) => [t!.id, t!]));
    const chapters = new Map((await sdb.chapters.bulkGet(Array.from(new Set(Array.from(topics.values()).map((t) => t.chapterId))))).filter(Boolean).map((c) => [c!.id, c!]));
    const subjects = new Map((await sdb.subjects.bulkGet(Array.from(new Set(Array.from(chapters.values()).map((c) => c.subjectId))))).filter(Boolean).map((s) => [s!.id, s!]));
    const stimIds = Array.from(new Set(have.map((q) => q.stimulusId).filter((x): x is string => !!x)));
    const stimuli = new Map((await sdb.stimuli.bulkGet(stimIds)).filter(Boolean).map((s) => [s!.id, s!]));

    for (const q of have) {
      const topic = topics.get(q.topicId);
      const chapter = topic ? chapters.get(topic.chapterId) : undefined;
      const subject = chapter ? subjects.get(chapter.subjectId) : undefined;
      // পথ না পেলে (এতিম প্রশ্ন) কপি বানানো যায় না - আগের data.json-এর কপিই কাজে লাগবে
      if (!topic || !chapter || !subject) continue;
      found.set(q.id, {
        question: q,
        stimulus: q.stimulusId ? stimuli.get(q.stimulusId) : undefined,
        path: bankPathOf(scope, subject.name, chapter.name, topic.name),
      });
      remaining.delete(q.id);
    }
  }
  return (id) => found.get(id);
}
