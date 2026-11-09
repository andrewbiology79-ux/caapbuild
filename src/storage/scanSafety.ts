/**
 * ধাপ ১.৫ ও নিশ্চিতকরণের হিসাব - ডাটাবেস/Capacitor ছাড়া, তাই টেস্ট করা যায়। ব্যবহার: scanner.ts।
 */

export interface RowLike {
  id: string;
  kind: string;
  parentId?: string;
  dirName?: string;
}

/**
 * ১.৫: স্ক্যানে কিছু ফোল্ডার পড়া না গেলে (unreadable তালিকা, স্ক্যান-রুট থেকে আপেক্ষিক পথ; "" = রুটই) ওই পথ বা
 * তার ভেতরের সবকিছু "দেখা যায়নি" - "নেই" নয়।
 */
export function isUnderUnreadable(path: string | null, unreadable: string[]): boolean {
  if (unreadable.length === 0) return false;
  if (path === null) return true; // পথ বের করা যায়নি - নিরাপদ দিকে ধরা
  return unreadable.some((u) => u === '' || path === u || path.startsWith(`${u}/`));
}

/** একটি সিঙ্ক-রেকর্ডের পূর্ণ আপেক্ষিক পথ (বিষয়/অধ্যায়/টাইপ)। চেইন ভাঙা থাকলে null। */
export function rowPathOf(row: RowLike, byId: Map<string, RowLike>): string | null {
  const parts: string[] = [];
  let cur: RowLike | undefined = row;
  let guard = 0;
  while (cur && guard++ < 6) {
    if (cur.dirName) parts.unshift(cur.dirName);
    if (!cur.parentId) return parts.length ? parts.join('/') : null;
    const next = byId.get(cur.parentId);
    if (!next) return null;
    cur = next;
  }
  return null;
}

/** মোছা সারির মধ্যে শুধু সবচেয়ে ওপরের (যার অভিভাবকও মোছা নয়) - ডায়ালগে এগুলোই দেখানো হয় */
export function pickTopLevel<T extends RowLike>(deleted: T[]): T[] {
  const ids = new Set(deleted.map((r) => r.id));
  return deleted.filter((r) => !r.parentId || !ids.has(r.parentId));
}

/** আগের আইডির তালিকা থেকে নতুন তালিকায় যেগুলো নেই */
export function missingIds(oldIds: string[], newIds: Set<string>): string[] {
  return oldIds.filter((id) => !newIds.has(id));
}
