import { CATEGORY_ROOT } from './categoryLayout';
import { UNNECESSARY_DIR } from './folderLayout';
import { withNumberSuffix } from './syncConflictPlan';

/**
 * অংশ ১গ-২ক - ক্যাটেগরি ফোল্ডারের বাড়তি জিনিস (CategoryExtra) unnecessary/-তে সরানো।
 * কখনো মোছে না। ফাইল-সিস্টেম বাইরে থেকে দেওয়া হয় (fs), তাই আলাদাভাবে টেস্ট করা যায়;
 * আসল nativeStore-এর সাথে জোড়া categorySyncRun.ts-এ।
 */

export interface ExtraMoveFs {
  pathExists(path: string): Promise<boolean>;
  makeDir(path: string): Promise<void>;
  renamePath(from: string, to: string): Promise<void>;
  writeText(path: string, text: string): Promise<void>;
}

export interface MovableCategoryExtra {
  /** দেখানোর পথ (ত্রুটির বার্তায় ব্যবহার) */
  path: string[];
  /** Category/-র সাপেক্ষে বর্তমান পথ */
  sourcePath: string;
  /** সরে যাবে যেখানে (পূর্ণ পথ) */
  moveTo: string;
}

export interface ExtraMovePlan {
  /** সত্যিই সরানো হবে - সূচক, ওপরের ফোল্ডার আগে */
  order: number[];
  /** আরেকটার ভেতরে থাকায় সঙ্গে চলে যাবে: সূচক -> যে সূচকের ভেতরে */
  covered: Map<number, number>;
}

export interface ExtraMoveResult {
  /** extras[] এর সূচক অনুযায়ী: সরানো হয়েছে কি না */
  moved: boolean[];
  failures: Array<{ index: number; message: string }>;
}

const isInside = (child: string, parent: string) => child === parent || child.startsWith(parent + '/');

/** খাঁটি: কোনটা আগে সরবে, কোনটা আরেকটার ভেতরে থাকায় সঙ্গে যাবে */
export function planCategoryExtraMoves(extras: Array<{ sourcePath: string }>): ExtraMovePlan {
  const idx = extras.map((_, i) => i).sort((a, b) => {
    const da = extras[a].sourcePath.split('/').length;
    const db = extras[b].sourcePath.split('/').length;
    return da - db || a - b;
  });
  const order: number[] = [];
  const covered = new Map<number, number>();
  for (const i of idx) {
    const owner = order.find((j) => isInside(extras[i].sourcePath, extras[j].sourcePath));
    if (owner !== undefined) covered.set(i, owner);
    else order.push(i);
  }
  return { order, covered };
}

/**
 * নিরাপত্তা-যাচাই (খাঁটি): উৎস Category/-র ভেতরে (.. বা ফাঁকা অংশ নেই), গন্তব্য Category/-র ভেতরের কোনো unnecessary/-তে,
 * আর উৎস নিজেই unnecessary/-র ভেতরে নয়। ব্যর্থ হলে কারণ (বাংলায়), ঠিক থাকলে null।
 */
export function extraMoveProblem(e: Pick<MovableCategoryExtra, 'sourcePath' | 'moveTo'>): string | null {
  const parts = e.sourcePath.split('/');
  if (!e.sourcePath || parts.some((p) => !p || p === '.' || p === '..')) return 'উৎসের পথ ঠিক নয়';
  if (parts.some((p) => p.toLowerCase() === UNNECESSARY_DIR)) return 'unnecessary/-র ভেতরের জিনিস আবার সরানো হয় না';
  const prefix = `${CATEGORY_ROOT}/`;
  if (!e.moveTo.startsWith(prefix)) return 'গন্তব্য Category/-র বাইরে';
  const rest = e.moveTo.slice(prefix.length).split('/');
  if (rest.some((p) => !p || p === '.' || p === '..')) return 'গন্তব্যের পথ ঠিক নয়';
  if (!rest.some((p) => p === UNNECESSARY_DIR)) return 'গন্তব্য unnecessary/ নয়';
  return null;
}

const parentOf = (p: string) => p.slice(0, p.lastIndexOf('/'));

async function freeDestination(fs: ExtraMoveFs, moveTo: string): Promise<string> {
  if (!(await fs.pathExists(moveTo))) return moveTo;
  for (let i = 2; i < 500; i++) {
    const cand = withNumberSuffix(moveTo, i);
    if (!(await fs.pathExists(cand))) return cand;
  }
  throw new Error('গন্তব্যে একই নামে অনেকগুলো আছে');
}

/**
 * বাড়তি জিনিস unnecessary/-তে সরানো। একই নাম থাকলে "নাম (2)"; unnecessary/-তে .nomedia (ছবি গ্যালারিতে আসে না)।
 * একটা ব্যর্থ হলে শুধু সেটা বাদ, বাকিরা চলে - জিনিসটা আগের জায়গাতেই থাকে।
 * সিঙ্ক লকের ভেতর থেকে ডাকতে হবে।
 */
export async function moveCategoryExtras(
  extras: MovableCategoryExtra[],
  fs: ExtraMoveFs,
  onUnit?: (label: string) => void
): Promise<ExtraMoveResult> {
  const moved = extras.map(() => false);
  const failures: ExtraMoveResult['failures'] = [];
  const plan = planCategoryExtraMoves(extras);

  for (const i of plan.order) {
    const e = extras[i];
    const label = e.path.join(' › ');
    try {
      const problem = extraMoveProblem(e);
      if (problem) throw new Error(problem);
      const from = `${CATEGORY_ROOT}/${e.sourcePath}`;
      if (!(await fs.pathExists(from))) throw new Error('আগের জায়গায় পাওয়া যায়নি');
      const to = await freeDestination(fs, e.moveTo);
      await fs.makeDir(parentOf(to));
      await fs.renamePath(from, to);
      moved[i] = true;
      const marker = `/${UNNECESSARY_DIR}/`;
      const at = to.indexOf(marker);
      if (at >= 0) {
        const nomedia = `${to.slice(0, at + marker.length - 1)}/.nomedia`;
        try {
          if (!(await fs.pathExists(nomedia))) await fs.writeText(nomedia, '');
        } catch {
          /* গ্যালারি লুকানো না গেলেও সরানো সফল */
        }
      }
    } catch (err: any) {
      failures.push({ index: i, message: `${label}: ${err?.message || String(err)}` });
    }
    onUnit?.(label);
  }
  for (const [i, owner] of plan.covered) {
    moved[i] = moved[owner];
    onUnit?.(extras[i].path.join(' › '));
  }
  return { moved, failures };
}
