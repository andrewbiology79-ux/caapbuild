import type { CqScope } from '../db/db';
import type { FolderKind } from './folderLayout';

/**
 * নিজস্ব নিশ্চিতকরণ (window.confirm-এর বদলে): স্ক্যান যখন অ্যাপ থেকে কিছু মুছতে যাচ্ছে, তখন আইটেম সংখ্যাসহ জিজ্ঞাসা।
 * ডিফল্ট সবসময় "রেখে দাও" (Back / বাইরে চাপ / Esc = রেখে দাও)। হ্যান্ডলার না থাকলে (বা ত্রুটি হলে) উত্তর "রেখে দাও"।
 * হ্যান্ডলার বসায় SyncRunner.tsx (ConfirmDialog দিয়ে); এখানে শুধু টেক্সট ও রেজিস্ট্রি।
 */

export type DeleteRequest =
  | {
      kind: 'folders';
      scope: CqScope;
      /** অ্যাপ থেকে মুছতে যাওয়া মোট আইটেম (ভেতরেরগুলো সহ) */
      total: number;
      /** সবচেয়ে ওপরের আইটেম (ডায়ালগে নাম দেখানোর জন্য) */
      items: Array<{ name: string; kind: FolderKind }>;
      /** এগুলোর ভেতরের মোট প্রশ্ন */
      questionCount: number;
    }
  | {
      kind: 'questions';
      scope: CqScope;
      /** টাইপ/অধ্যায়ের নাম */
      name: string;
      questionCount: number;
      stimulusCount: number;
    };

export interface ConfirmTexts {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
}

const KIND_LABEL: Record<FolderKind, string> = { subject: 'বিষয়', chapter: 'অধ্যায়', topic: 'টাইপ' };
const MAX_NAMES = 5;

export function describeDeleteRequest(req: DeleteRequest): ConfirmTexts {
  if (req.kind === 'folders') {
    const shown = req.items.slice(0, MAX_NAMES).map((i) => `• ${i.name} (${KIND_LABEL[i.kind]})`);
    const more = req.items.length - shown.length;
    if (more > 0) shown.push(`• …আরও ${more}টি`);
    const qLine =
      req.questionCount > 0
        ? `অ্যাপ থেকেও মুছলে এর ভেতরের ${req.questionCount}টি প্রশ্নও মুছে যাবে।`
        : 'অ্যাপ থেকেও মুছলে এগুলো অ্যাপ থেকে চলে যাবে।';
    return {
      title: 'ফোল্ডার পাওয়া যাচ্ছে না',
      message:
        `স্টোরেজে (ফাইল ম্যানেজারে) এই ফোল্ডারগুলো নেই:\n${shown.join('\n')}\n\n${qLine}\n\n` +
        `"রেখে দাও" চাপলে অ্যাপে সব থাকবে ও ফোল্ডার আবার তৈরি হবে (মোছা ফোল্ডারের ছবির ফাইল ফেরত আসবে না)।`,
      confirmText: 'অ্যাপ থেকেও মুছো',
      cancelText: 'রেখে দাও',
    };
  }
  const parts = [`${req.questionCount}টি প্রশ্ন`];
  if (req.stimulusCount > 0) parts.push(`${req.stimulusCount}টি উদ্দীপক`);
  return {
    title: 'ফাইল থেকে প্রশ্ন বাদ পড়েছে',
    message:
      `"${req.name}"-এর data.json-এ অ্যাপের চেয়ে কম আছে: ${parts.join(' ও ')} ফাইলে নেই।\n\n` +
      `অ্যাপ থেকেও মুছবে?\n\n` +
      `"রেখে দাও" চাপলে ওগুলো থাকবে, ফাইলের বাকি বদল অ্যাপে আসবে এবং data.json আবার লেখা হবে।`,
    confirmText: 'অ্যাপ থেকেও মুছো',
    cancelText: 'রেখে দাও',
  };
}

type Handler = (req: DeleteRequest) => Promise<boolean>;
let handler: Handler | null = null;

export function setDeleteConfirmHandler(fn: Handler | null): void {
  handler = fn;
}

/** true = মুছো; false = রেখে দাও (হ্যান্ডলার না থাকলে বা ত্রুটিতেও false) */
export async function askDeleteConfirm(req: DeleteRequest): Promise<boolean> {
  if (!handler) return false;
  try {
    return (await handler(req)) === true;
  } catch {
    return false;
  }
}
