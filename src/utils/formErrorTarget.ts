// প্রশ্ন সম্পাদনা ফর্ম: সেভে ত্রুটি হলে পাতা কোন ঘরে যাবে তা ঠিক করে।
// ক্রম পর্দার ওপর থেকে নিচে: অধ্যায়/টপিক → উদ্দীপক → প্রশ্ন ব্লক (ব্লকের নিজস্ব ক্রমে)।

export const FORM_ERR_CHAPTER_ID = 'qform-chapter-select';
export const FORM_ERR_TOPIC_ID = 'qform-topic-select';
export const FORM_ERR_STIMULUS_ID = 'qform-stimulus';
export const formErrBlockTextId = (tempId: string) => `qtext-${tempId}`;

export interface FormErrorsLike {
  topic?: string;
  chapter?: string;
  stimulus?: string;
  questions?: Record<string, string>;
}

/**
 * প্রথম ত্রুটির ঘরের DOM id ফেরায়; কোনো ত্রুটি না থাকলে null।
 * questions-এর মান '' হলে (লেখা দেওয়ার পর মুছে ফেলা ত্রুটি) সেটা ত্রুটি ধরা হয় না।
 */
export function firstErrorTargetId(
  errors: FormErrorsLike,
  blockTempIds: string[]
): string | null {
  if (errors.chapter) return FORM_ERR_CHAPTER_ID;
  if (errors.topic) return FORM_ERR_TOPIC_ID;
  if (errors.stimulus) return FORM_ERR_STIMULUS_ID;
  const q = errors.questions;
  if (q) {
    for (const tempId of blockTempIds) {
      if (q[tempId]) return formErrBlockTextId(tempId);
    }
  }
  return null;
}
