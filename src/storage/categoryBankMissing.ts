import { db } from '../db/db';
import { readText, readBase64, isNativeApp } from './nativeStore';
import { withSyncLock } from './syncLock';
import { base64ToBlob } from '../utils/fileExport';
import { categoryDataPath, categoryMediaPath, parseCategoryData } from './categoryLayout';
import { loadCategorySyncState } from './categoryWriter';
import { selectCopiesForIds, usedQuestionIds } from './bankMissing';
import { bankIdsAmong, loadCopies, pruneStaleCopies, saveCopiesFromCategoryData } from './bankMissingStore';

/**
 * অংশ ১ঘ-খ-১ - ফোল্ডার -> অ্যাপে ব্যাংকে-নেই প্রশ্নের কপি ডেটাবেসে রাখা (খণ্ড খ §৩.৬ (খ))।
 *
 * কোন প্রশ্নপত্রের প্রশ্ন ব্যাংকে নেই এবং ডেটাবেসে কপিও নেই - সেগুলোর কপি ওই ক্যাটেগরির Category/<নাম>/data.json (ও media/) থেকে আনে।
 * "শুধু নতুন প্রয়োগে" নয়, অ্যাপে আগে থেকে থাকা প্রশ্নপত্রের জন্যও চলে (আগে সিঙ্ক করা প্রশ্নপত্রের প্রশ্ন নিরাময়) - তাই
 * ফোল্ডার সিঙ্কের শেষে এবং অ্যাপ চালুর সময় একবার ডাকা হয়। কিছু আনার না থাকলে সস্তা (শুধু ডেটাবেস দেখে ফেরে, ফোল্ডার ছোঁয় না)।
 *
 * কখনো throw করে না। ফোল্ডারে কিছু লেখে না/মোছে না; অ্যাপের ব্যাংক বা প্রশ্নপত্রও বদলায় না - শুধু questionCopies/copyImages।
 */

export interface BankMissingCareResult {
  /** নতুন কপি রাখা হয়েছে (প্রশ্ন-id) */
  saved: string[];
  /** আর লাগে না বলে মোছা কপির সংখ্যা */
  pruned: number;
  warnings: string[];
}

/** একটা ক্যাটেগরি-ফোল্ডারের media/ থেকে ছবির ডেটা পড়ার চালক */
function mediaReader(dirName: string) {
  return async (imageId: string) => {
    const b64 = await readBase64(categoryMediaPath(dirName, imageId));
    if (!b64) return null;
    return { id: imageId, fileName: `${imageId}.webp`, blob: base64ToBlob(b64, 'image/webp') };
  };
}

/** সিঙ্ক লকের ভেতর থেকে ডাকতে হবে (scanner-এর লকের ভেতরে এটাই ডাকা হয়) */
export async function bankMissingCareNoLock(): Promise<BankMissingCareResult> {
  const out: BankMissingCareResult = { saved: [], pruned: 0, warnings: [] };
  try {
    // ১) আর লাগে না এমন কপি ছাঁটাই (প্রশ্ন ব্যাংকে ফিরেছে / কোনো প্রশ্নপত্র ব্যবহার করে না)
    out.pruned = await pruneStaleCopies();

    // ২) কোন প্রশ্ন ব্যাংকে নেই এবং কপিও নেই
    const papers = await db.papers.toArray();
    const used = usedQuestionIds(papers);
    if (used.size === 0) return out;
    const usedList = Array.from(used);
    const inBank = await bankIdsAmong(usedList);
    const haveCopy = new Set((await loadCopies(usedList)).keys());
    const need = usedList.filter((id) => !inBank.has(id) && !haveCopy.has(id));
    if (need.length === 0) return out;
    if (!isNativeApp()) return out; // ফোল্ডার পড়ার উপায় নেই

    // ৩) ক্যাটেগরি ধরে ভাগ (প্রশ্নপত্র কোন ক্যাটেগরির, সেটাই data.json কোথায় তা বলে)
    const needSet = new Set(need);
    const byCategory = new Map<string, Set<string>>();
    for (const p of papers) {
      if (!p.categoryId || !Array.isArray(p.questionIds)) continue;
      for (const id of p.questionIds) {
        if (typeof id !== 'string' || !needSet.has(id)) continue;
        const set = byCategory.get(p.categoryId) ?? new Set<string>();
        set.add(id);
        byCategory.set(p.categoryId, set);
      }
    }
    if (byCategory.size === 0) return out;

    const state = await loadCategorySyncState();
    for (const [catId, ids] of byCategory) {
      const dirName = state.categories[catId]?.dirName;
      if (!dirName) continue; // ফোল্ডার এখনো লেখা হয়নি - কপির উৎস নেই
      const text = await readText(categoryDataPath(dirName));
      if (!text) continue;
      const parsed = parseCategoryData(text);
      if (!parsed.ok) {
        out.warnings.push(`${dirName}/data.json পড়া যায়নি (${parsed.reason}) - ব্যাংকে-নেই প্রশ্নের কপি আনা হয়নি`);
        continue;
      }
      const picked = selectCopiesForIds(ids, parsed.data.questions, parsed.data.stimuli);
      if (picked.items.length === 0) continue;
      const res = await saveCopiesFromCategoryData(picked.items, mediaReader(dirName));
      out.saved.push(...res.saved);
      out.warnings.push(...res.warnings);
    }
  } catch (e: any) {
    out.warnings.push(`ব্যাংকে-নেই প্রশ্নের কপি আনতে সমস্যা: ${e?.message ?? e}`);
  }
  return out;
}

/** লক নিয়ে চালায় (অ্যাপ চালুর সময় ইত্যাদি বাইরের জায়গা থেকে) */
export function bankMissingCare(): Promise<BankMissingCareResult> {
  return withSyncLock(bankMissingCareNoLock);
}
