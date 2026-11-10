import { QB_ROOT } from '../utils/storageAccess';
import { scopeRoot } from './folderLayout';
import { makeDir, pathExists, renamePath } from './nativeStore';
import type { ConflictEntry } from './syncCompare';
import { planConflictMoves } from './syncConflictPlan';

/**
 * ধাপ ৫ - কনফ্লিক্ট সরানো। মোছা হয় না: হেরে যাওয়া কপি Sync_Conflicts/<stamp>/... নিচে মূল পথ বজায় রেখে যায়।
 * সরানো ব্যর্থ হলে শুধু ওই আইটেম বাদ (বাকিগুলো চলে), ডেটা যেখানে ছিল সেখানেই থাকে।
 */

export interface ConflictMoveResult {
  /** conflicts[] এর সূচক অনুযায়ী: সরানো হয়েছে কি না */
  moved: boolean[];
  failures: Array<{ index: number; message: string }>;
}

const parentOf = (p: string) => p.slice(0, p.lastIndexOf('/'));

export async function moveConflicts(
  conflicts: ConflictEntry[],
  onUnit?: (label: string) => void
): Promise<ConflictMoveResult> {
  const moved = conflicts.map(() => false);
  const failures: ConflictMoveResult['failures'] = [];
  const plan = planConflictMoves(conflicts);

  for (const i of plan.order) {
    const c = conflicts[i];
    const from = `${scopeRoot(c.scope)}/${c.sourcePath}`;
    try {
      if (!(await pathExists(from))) throw new Error('আগের জায়গায় পাওয়া যায়নি');
      if (await pathExists(c.moveTo)) throw new Error('গন্তব্যে একই নামে কিছু আছে');
      await makeDir(parentOf(c.moveTo));
      await renamePath(from, c.moveTo);
      moved[i] = true;
    } catch (err: any) {
      failures.push({ index: i, message: `${c.path.join(' › ')}: ${err?.message || String(err)}` });
    }
    onUnit?.(c.path.join(' › '));
  }
  // অন্যটার ভেতরে থাকা কনফ্লিক্ট মূলটার সঙ্গেই গেছে
  for (const [i, owner] of plan.covered) {
    moved[i] = moved[owner];
    onUnit?.(conflicts[i].path.join(' › '));
  }
  return { moved, failures };
}

export const SYNC_CONFLICTS_ROOT = `${QB_ROOT}/Sync_Conflicts`;
