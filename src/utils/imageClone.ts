// কপি-পেস্টে ছবির নকল: কপি করা প্রশ্ন/উদ্দীপক নতুন ছবির id পায়, যাতে দুটো প্রশ্ন একই ছবি ধরে না থাকে।
// এখানে শুধু id বের করা ও বদলানোর বিশুদ্ধ ফাংশন (ডেটাবেস ছোঁয় না) — ডেটাবেসের কাজ db/crossDb.ts-এ।

const MARKER_RE_SRC = '\\[\\[img:([^\\]\\s]+)\\]\\]';

interface StimulusLike {
  text?: string | null;
  imageIds?: string[] | null;
}

interface QuestionLike {
  questionText?: string | null;
  solutionText?: string | null;
  answerText?: string | null;
  solutionImageIds?: string[] | null;
}

function markerIds(text?: string | null): string[] {
  if (!text) return [];
  const out: string[] = [];
  const re = new RegExp(MARKER_RE_SRC, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return out;
}

/** একটা উদ্দীপক + তার প্রশ্নগুলোর সব ছবির id (ids তালিকা + লেখার ভেতরের [[img:ID]] চিহ্ন), ডুপ্লিকেট ছাড়া */
export function imageIdsOfGroup(stimulus: StimulusLike | undefined | null, questions: QuestionLike[]): string[] {
  const ids = new Set<string>();
  if (stimulus) {
    (stimulus.imageIds || []).forEach((i) => i && ids.add(i));
    markerIds(stimulus.text).forEach((i) => ids.add(i));
  }
  for (const q of questions) {
    (q.solutionImageIds || []).forEach((i) => i && ids.add(i));
    markerIds(q.questionText).forEach((i) => ids.add(i));
    markerIds(q.solutionText).forEach((i) => ids.add(i));
    markerIds(q.answerText).forEach((i) => ids.add(i));
  }
  return Array.from(ids);
}

/**
 * লেখার ভেতরের [[img:পুরনো]] চিহ্ন নতুন id দিয়ে বদলায়।
 * map-এ না থাকা id: dropMissing=true হলে চিহ্নটা বাদ, নইলে যেমন ছিল তেমন।
 */
export function remapMarkers(text: string | undefined | null, map: Map<string, string>, dropMissing: boolean): string {
  if (!text) return text ?? '';
  return text.replace(new RegExp(MARKER_RE_SRC, 'g'), (whole, id: string) => {
    const n = map.get(id);
    if (n) return `[[img:${n}]]`;
    return dropMissing ? '' : whole;
  });
}

function remapList(list: string[] | undefined | null, map: Map<string, string>): string[] {
  // নতুন id না থাকলে (ছবির ডেটা পাওয়া যায়নি) সেই id বাদ — না-থাকা ছবি ধরে রাখা হয় না
  return (list || []).filter((id) => map.has(id)).map((id) => map.get(id) as string);
}

/** উদ্দীপকের কপি: imageIds ও লেখার চিহ্ন নতুন id-তে। মূল অবজেক্ট বদলায় না। */
export function remapStimulusImages<T extends StimulusLike>(s: T, map: Map<string, string>): T {
  return {
    ...s,
    imageIds: remapList(s.imageIds, map),
    text: remapMarkers(s.text, map, true),
  };
}

/** প্রশ্নের কপি: solutionImageIds ও সব লেখার চিহ্ন নতুন id-তে। মূল অবজেক্ট বদলায় না। */
export function remapQuestionImages<T extends QuestionLike>(q: T, map: Map<string, string>): T {
  const out: T = {
    ...q,
    solutionImageIds: remapList(q.solutionImageIds, map),
    questionText: remapMarkers(q.questionText, map, true),
    solutionText: remapMarkers(q.solutionText, map, true),
  };
  if (q.answerText !== undefined) (out as QuestionLike).answerText = remapMarkers(q.answerText, map, true);
  return out;
}
