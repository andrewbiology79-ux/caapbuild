// প্রশ্ন সম্পাদনা ফর্ম: জমে থাকা (কোনো প্রশ্ন/উদ্দীপক ব্যবহার করে না এমন) ছবি চেনার যুক্তি।
// ছবি বাছামাত্র db.images-এ লেখা হয়; বাতিল বা বদল করলে সেটা এতিম হয়ে ডেটাবেস ও ব্যাকআপ ফুলিয়ে তোলে।
// এখানে শুধু "কোনগুলো মোছা যাবে" ঠিক করা হয় (বিশুদ্ধ ফাংশন) — ডেটাবেসে মোছা api.ts-এ।
//
// জরুরি: কপি-পেস্ট করা প্রশ্ন একই ছবির id ব্যবহার করে (pasteAfter), তাই কোনো ছবি তখনই মোছা যাবে
// যখন ডেটাবেসের কোনো উদ্দীপক/প্রশ্ন সেটা আর ধরে না।

export type FormCloseMode = 'saved' | 'discarded';

/**
 * ফর্ম বন্ধের ধরন অনুযায়ী কোন ছবিগুলো "হয়তো মোছা যাবে":
 *  - discarded (সেভ ছাড়া বের হওয়া): শুধু এই সেশনে নতুন বাছা ছবি। ফর্ম খোলার সময় থাকা ছবি অক্ষত।
 *  - saved (সেভ হয়েছে): এই সেশনে বাছা ছবি + ফর্ম খোলার সময় থাকা ছবি (ছবি বদল/বাদ দিলে পুরনোটা এতিম হয়)।
 * তালিকাটা শুধু প্রার্থী; আসল সিদ্ধান্ত ডেটাবেসে ব্যবহার দেখে (createImageUseTracker)।
 */
export function imageCleanupCandidates(
  mode: FormCloseMode,
  sessionAdded: Iterable<string>,
  loaded: Iterable<string>
): string[] {
  const out = new Set<string>();
  for (const id of sessionAdded) if (id) out.add(id);
  if (mode === 'saved') for (const id of loaded) if (id) out.add(id);
  return [...out];
}

export interface ImageUseTracker {
  /** প্রার্থী ছবির সংখ্যা */
  readonly size: number;
  addStimulus(s: { imageIds?: string[] | null }): void;
  addQuestion(q: { solutionImageIds?: string[] | null }): void;
  /** সব প্রার্থীই ব্যবহার হচ্ছে দেখা গেছে (আর স্ক্যান না করলেও চলে) */
  allUsed(): boolean;
  /** কেউই ব্যবহার করে না — মোছা যাবে */
  unused(): string[];
}

/** প্রার্থী ছবির কোনটা এখনও কোনো উদ্দীপক/প্রশ্নে আছে তা মনে রাখে */
export function createImageUseTracker(candidates: Iterable<string>): ImageUseTracker {
  const cand = new Set<string>();
  for (const id of candidates) if (id) cand.add(id);
  const used = new Set<string>();
  const mark = (ids?: string[] | null) => {
    if (!ids) return;
    for (const id of ids) if (cand.has(id)) used.add(id);
  };
  return {
    size: cand.size,
    addStimulus: (s) => mark(s.imageIds),
    addQuestion: (q) => mark(q.solutionImageIds),
    allUsed: () => used.size >= cand.size,
    unused: () => [...cand].filter((id) => !used.has(id)),
  };
}

/**
 * কপি/কাট ক্লিপবোর্ডের (meta-র 'clipboard' = একটা প্রশ্ন, 'group_clipboard' = উদ্দীপক + প্রশ্নের তালিকা)
 * ছবির id "ধরে আছে" হিসেবে গোনা। কপি করা প্রশ্নের মূলটা মুছে পরে পেস্ট করলে ছবি হারানো ঠেকায়।
 * আকার চেনা না গেলে (null/অন্য কিছু) কিছু করে না।
 */
export function markClipboardUse(
  tracker: Pick<ImageUseTracker, 'addStimulus' | 'addQuestion'>,
  value: unknown
): void {
  if (!value || typeof value !== 'object') return;
  const v = value as { stimulus?: unknown; questions?: unknown };
  if (Array.isArray(v.questions)) {
    if (v.stimulus && typeof v.stimulus === 'object') tracker.addStimulus(v.stimulus as { imageIds?: string[] | null });
    for (const q of v.questions) {
      if (q && typeof q === 'object') tracker.addQuestion(q as { solutionImageIds?: string[] | null });
    }
  } else {
    tracker.addQuestion(value as { solutionImageIds?: string[] | null });
  }
}

/**
 * ধাপ ৫খ: প্রতিটা ডেটাবেসের ছবির সারির মধ্যে কোনগুলো এতিম (unused তালিকায় আছে) তা আলাদা করে।
 * কোনো ছবির id অন্য ডেটাবেসের প্রশ্ন ধরলে সেটা unused-এ থাকে না, তাই এখানেও আসে না — অনিশ্চিত হলে রাখা হয়।
 */
export function splitOrphansByDb(
  rowIdsByDb: Record<string, string[]>,
  unused: Iterable<string>
): Record<string, string[]> {
  const u = new Set(unused);
  const out: Record<string, string[]> = {};
  for (const [key, ids] of Object.entries(rowIdsByDb)) out[key] = ids.filter((id) => u.has(id));
  return out;
}
