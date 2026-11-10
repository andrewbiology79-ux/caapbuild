import { QB_ROOT } from '../utils/storageAccess';
import { scopeRoot, UNNECESSARY_DIR } from './folderLayout';
import { makeDir, pathExists, renamePath, writeText } from './nativeStore';
import type { CqScope } from '../db/db';
import { planConflictMoves, withNumberSuffix } from './syncConflictPlan';

/** সরানোর যোগ্য আইটেম - কনফ্লিক্ট (Sync_Conflicts-এ) ও বাড়তি জিনিস (unnecessary/-তে) দুটোই এই আকারের */
export interface MovableEntry {
  scope: CqScope;
  path: string[];
  sourcePath: string;
  moveTo: string;
}

/**
 * ধাপ ৫ - কনফ্লিক্ট ও বাড়তি জিনিস সরানো। মোছা হয় না: হেরে যাওয়া কপি Sync_Conflicts/<stamp>/... নিচে মূল পথ বজায় রেখে যায়।
 * সরানো ব্যর্থ হলে শুধু ওই আইটেম বাদ (বাকিগুলো চলে), ডেটা যেখানে ছিল সেখানেই থাকে।
 */

export interface ConflictMoveResult {
  /** conflicts[] এর সূচক অনুযায়ী: সরানো হয়েছে কি না */
  moved: boolean[];
  failures: Array<{ index: number; message: string }>;
}

const parentOf = (p: string) => p.slice(0, p.lastIndexOf('/'));

/** unnecessary/ ফোল্ডারে .nomedia: ভেতরের ছবি গ্যালারিতে দেখা যাবে না */
async function hideUnnecessaryFromGallery(moveTo: string): Promise<void> {
  const marker = `/${UNNECESSARY_DIR}/`;
  const at = moveTo.indexOf(marker);
  if (at < 0) return;
  const dir = moveTo.slice(0, at + marker.length - 1);
  const nomedia = `${dir}/.nomedia`;
  try {
    if (!(await pathExists(nomedia))) await writeText(nomedia, '');
  } catch {
    /* গ্যালারি লুকানো না গেলেও সরানো সফল */
  }
}

async function freeDestination(moveTo: string): Promise<string> {
  if (!(await pathExists(moveTo))) return moveTo;
  for (let i = 2; i < 500; i++) {
    const cand = withNumberSuffix(moveTo, i);
    if (!(await pathExists(cand))) return cand;
  }
  throw new Error('গন্তব্যে একই নামে অনেকগুলো আছে');
}

export async function moveConflicts(
  conflicts: MovableEntry[],
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
      // unnecessary/-তে একই নাম থাকলে "নাম (2)" হয়; Sync_Conflicts/-এ (তারিখ-সময়ের নিচে) একই নাম থাকলে সেই আইটেম বাদ
      const unnecessary = c.moveTo.includes(`/${UNNECESSARY_DIR}/`);
      let to = c.moveTo;
      if (unnecessary) to = await freeDestination(to);
      else if (await pathExists(to)) throw new Error('গন্তব্যে একই নামে কিছু আছে');
      await makeDir(parentOf(to));
      await renamePath(from, to);
      moved[i] = true;
      if (unnecessary) await hideUnnecessaryFromGallery(to);
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
