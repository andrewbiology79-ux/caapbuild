import type { Category, Paper, Question, Stimulus } from '../db/db';
import {
  buildCategoryDataFile,
  categoryDataToText,
  normalizePaper,
  parseCategoryData,
  questionProblem,
  stimulusProblem,
  bankPathProblem,
  type BankPath,
  type CategoryDataFile,
  type CopiedQuestion,
  type CopiedStimulus,
  type ParsedPaper,
} from './categoryLayout';

/**
 * অংশ ১খ (প্রথম অর্ধেক) - ক্যাটেগরির data.json লেখার "মগজ" (খাঁটি ফাংশন; ফাইল/ডেটাবেস IO নেই)।
 *
 * কাজ: কোনো ক্যাটেগরির প্রশ্নপত্রগুলোতে ব্যবহৃত প্রশ্ন/উদ্দীপকের কপি জোগাড় করা (ব্যাংক থেকে, না পেলে আগের
 * data.json-এর কপি থেকে), কপির অনুপস্থিত ঘর ভরা, তারপর data.json-এর লেখা বানিয়ে buildCategoryDataFile থেকে আবার
 * parseCategoryData দিয়ে ঘুরিয়ে দেখা (unsafe:false না হলে লেখা হয় না - খণ্ড গ §৬)।
 */

/** ব্যাংকের একটা প্রশ্ন + তার উদ্দীপক + আগের জায়গার পথ */
export interface BankQuestionRef {
  question: Question;
  stimulus?: Stimulus;
  path: BankPath;
}

export type BankLookup = (questionId: string) => BankQuestionRef | undefined;

/** আগের data.json-এর কপি (ব্যাংকে না থাকা প্রশ্নের কপি এখান থেকেই বাঁচে) */
export interface PreviousCopies {
  questions: Map<string, CopiedQuestion>;
  stimuli: Map<string, CopiedStimulus>;
}

export const emptyPreviousCopies = (): PreviousCopies => ({ questions: new Map(), stimuli: new Map() });

export function previousCopiesOf(data: { questions: CopiedQuestion[]; stimuli: CopiedStimulus[] } | null | undefined): PreviousCopies {
  const out = emptyPreviousCopies();
  if (!data) return out;
  for (const c of data.questions) out.questions.set(c.question.id, c);
  for (const c of data.stimuli) out.stimuli.set(c.stimulus.id, c);
  return out;
}

/** ব্যাংকের নাম থেকে পথ (Chapter CQ-তে লুকানো ডিফল্ট টপিক = খালি) */
export function bankPathOf(scope: 'type' | 'chapter', subject: string, chapter: string, topic: string): BankPath {
  return { scope, subject, chapter, topic: scope === 'chapter' ? '' : topic };
}

/* ------------------------------------------------------------------
 * কপির অনুপস্থিত ঘর ভরা (পুরনো ইমপোর্টের ডেটায় ঘর না থাকলে অ্যাপ-লেখা ফাইলও unsafe হতো - খণ্ড গ ৩(গ))
 * অ্যাপের ডেটাবেস বদলায় না; শুধু কপিতে ডিফল্ট বসে। প্রশ্নের id/topicId/type অনুমান করা যায় না - সেগুলো না থাকলে
 * কপি ভুলই থাকে (এবং ফাইল লেখা হয় না, কারণ জানানো হয়)।
 * ---------------------------------------------------------------- */

const isStr = (v: any): v is string => typeof v === 'string';
const isNum = (v: any): v is number => typeof v === 'number' && Number.isFinite(v);
const cleanIdList = (v: any): string[] | null => (Array.isArray(v) ? v.filter((x) => isStr(x) && x.trim() !== '') : null);
const cleanBoards = (v: any): any[] =>
  Array.isArray(v)
    ? v.filter((b) => b && typeof b === 'object' && isStr(b.board) && Array.isArray(b.years) && b.years.every(isNum))
    : [];

export function completeQuestionForCopy(q: Question): { copy: Question; filled: string[] } {
  const raw: any = q;
  const filled: string[] = [];
  const out: any = { ...raw };
  const fill = (key: string, value: any) => {
    out[key] = value;
    filled.push(key);
  };
  if (!isNum(raw.marks)) fill('marks', 0);
  if (!isStr(raw.questionText)) fill('questionText', '');
  if (!isStr(raw.solutionText)) fill('solutionText', '');
  const sol = cleanIdList(raw.solutionImageIds);
  if (!sol || sol.length !== (raw.solutionImageIds as any[]).length) fill('solutionImageIds', sol ?? []);
  if (!isNum(raw.rating)) fill('rating', 0);
  if (!isNum(raw.order)) fill('order', 0);
  if (!Array.isArray(raw.usedInBoards) || cleanBoards(raw.usedInBoards).length !== raw.usedInBoards.length) {
    fill('usedInBoards', cleanBoards(raw.usedInBoards));
  }
  if (raw.stimulusId !== undefined && (!isStr(raw.stimulusId) || raw.stimulusId.trim() === '')) {
    delete out.stimulusId;
    filled.push('stimulusId');
  }
  if (raw.answerText !== undefined && !isStr(raw.answerText)) {
    delete out.answerText;
    filled.push('answerText');
  }
  return { copy: out as Question, filled };
}

export function completeStimulusForCopy(s: Stimulus): { copy: Stimulus; filled: string[] } {
  const raw: any = s;
  const filled: string[] = [];
  const out: any = { ...raw };
  if (!isStr(raw.text)) {
    out.text = '';
    filled.push('text');
  }
  const ids = cleanIdList(raw.imageIds);
  if (!ids || ids.length !== (raw.imageIds as any[]).length) {
    out.imageIds = ids ?? [];
    filled.push('imageIds');
  }
  if (raw.imageTopCount !== undefined && !isNum(raw.imageTopCount)) {
    delete out.imageTopCount;
    filled.push('imageTopCount');
  }
  if (raw.boardTag !== undefined && !isStr(raw.boardTag)) {
    delete out.boardTag;
    filled.push('boardTag');
  }
  if (raw.usedInBoards !== undefined && (!Array.isArray(raw.usedInBoards) || cleanBoards(raw.usedInBoards).length !== raw.usedInBoards.length)) {
    out.usedInBoards = cleanBoards(raw.usedInBoards);
    filled.push('usedInBoards');
  }
  if (raw.rating !== undefined && !isNum(raw.rating)) {
    delete out.rating;
    filled.push('rating');
  }
  if (raw.reference !== undefined && !isStr(raw.reference)) {
    delete out.reference;
    filled.push('reference');
  }
  return { copy: out as Stimulus, filled };
}

/* ------------------------------------------------------------------
 * কপি জোগাড়
 * ---------------------------------------------------------------- */

export interface CopiesResult {
  questions: CopiedQuestion[];
  stimuli: CopiedStimulus[];
  /** ব্যাংকেও নেই, আগের data.json-এও নেই (হারিয়ে গেছে) - প্রশ্নপত্র থেকে বাদ যায় না, শুধু কপি থাকে না */
  lostQuestionIds: string[];
  /** প্রশ্ন আছে কিন্তু তার উদ্দীপক কোথাও পাওয়া যায়নি */
  lostStimulusIds: string[];
  /** ব্যাংকে পাওয়া যায়নি, আগের data.json-এর কপি রেখে দেওয়া হয়েছে */
  keptFromPrevious: string[];
  warnings: string[];
}

/**
 * papers-এর প্রতিটি প্রশ্ন-id-র জন্য কপি: আগে ব্যাংক (সর্বশেষ রূপ), না পেলে আগের data.json-এর কপি।
 * ব্যাংকে-নেই প্রশ্নের কপি তাই মোছা যায় না (খণ্ড খ §৩.২)।
 */
export function buildCategoryCopies(papers: Array<Paper | ParsedPaper>, lookup: BankLookup, previous: PreviousCopies = emptyPreviousCopies()): CopiesResult {
  const questions = new Map<string, CopiedQuestion>();
  const stimuli = new Map<string, CopiedStimulus>();
  const lostQuestionIds: string[] = [];
  const lostStimulusIds: string[] = [];
  const keptFromPrevious: string[] = [];
  const warnings: string[] = [];
  const filledNotes = new Set<string>();

  const addStimulus = (stimulusId: string, fromBank: BankQuestionRef | undefined, prev: CopiedStimulus | undefined) => {
    if (stimuli.has(stimulusId)) return;
    if (fromBank?.stimulus) {
      const { copy, filled } = completeStimulusForCopy(fromBank.stimulus);
      if (filled.length) filledNotes.add(`উদ্দীপক ${stimulusId}: ${filled.join(', ')}`);
      stimuli.set(stimulusId, { stimulus: copy, path: fromBank.path });
    } else if (prev) {
      stimuli.set(stimulusId, prev);
    } else {
      if (!lostStimulusIds.includes(stimulusId)) lostStimulusIds.push(stimulusId);
    }
  };

  const seen = new Set<string>();
  for (const p of papers) {
    for (const id of normalizePaper(p).questionIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      const ref = lookup(id);
      const prev = previous.questions.get(id);
      if (ref) {
        const { copy, filled } = completeQuestionForCopy(ref.question);
        if (filled.length) filledNotes.add(`প্রশ্ন ${id}: ${filled.join(', ')}`);
        questions.set(id, { question: copy, path: ref.path });
        const sid = (copy as any).stimulusId as string | undefined;
        if (sid) addStimulus(sid, ref, previous.stimuli.get(sid));
      } else if (prev) {
        questions.set(id, prev);
        keptFromPrevious.push(id);
        const sid = prev.question.stimulusId;
        if (sid) addStimulus(sid, undefined, previous.stimuli.get(sid));
      } else {
        lostQuestionIds.push(id);
      }
    }
  }

  if (filledNotes.size) {
    warnings.push(`পুরনো ডেটার কিছু ঘর ছিল না, শুধু ফোল্ডারের কপিতে ডিফল্ট বসেছে (অ্যাপের ডেটা অপরিবর্তিত): ${Array.from(filledNotes).slice(0, 5).join('; ')}${filledNotes.size > 5 ? ` ... (+${filledNotes.size - 5})` : ''}`);
  }
  if (lostQuestionIds.length) {
    warnings.push(`${lostQuestionIds.length}টি প্রশ্ন ব্যাংকেও নেই, ফোল্ডারেও কপি নেই - প্রশ্নপত্রে আইডি থাকবে কিন্তু কপি নেই`);
  }
  if (lostStimulusIds.length) {
    warnings.push(`${lostStimulusIds.length}টি উদ্দীপক কোথাও পাওয়া যায়নি - সংশ্লিষ্ট প্রশ্নের কপিতে উদ্দীপক থাকবে না`);
  }

  return {
    questions: Array.from(questions.values()),
    stimuli: Array.from(stimuli.values()),
    lostQuestionIds,
    lostStimulusIds,
    keptFromPrevious,
    warnings,
  };
}

/* ------------------------------------------------------------------
 * লেখার আগে যাচাই (লেখা -> আবার পড়া -> unsafe:false)
 * ---------------------------------------------------------------- */

export type VerifiedCategoryData =
  | { ok: true; text: string; file: CategoryDataFile; warnings: string[] }
  | { ok: false; reason: string; problems: string[] };

/** প্রশ্নপত্রের কোন কোন ঘর normalizePaper-এ বাদ পড়বে (অ্যাপ -> ফাইল পথে নীরবে নয়, সতর্কতা দিয়ে) */
function droppedFromPaper(p: Paper | ParsedPaper): string | null {
  const raw = (p as any).questionIds;
  if (!Array.isArray(raw)) return `প্রশ্নপত্র "${p.shortName}"-এর প্রশ্নের তালিকা তালিকা নয়`;
  const bad = raw.filter((x) => typeof x !== 'string').length; // normalizePaper শুধু string-নয় বাদ দেয়; ফাঁকা string যাচাইয়ে ধরা পড়ে
  return bad ? `প্রশ্নপত্র "${p.shortName}"-এর ${bad}টি ভুল প্রশ্ন-id ফাইলে লেখা হয়নি` : null;
}

export function buildVerifiedCategoryData(input: {
  category: Pick<Category, 'id' | 'name' | 'order'>;
  papers: Array<Paper | ParsedPaper>;
  copies: { questions: CopiedQuestion[]; stimuli: CopiedStimulus[] };
}): VerifiedCategoryData {
  const problems: string[] = [];
  const warnings: string[] = [];

  for (const p of input.papers) {
    const d = droppedFromPaper(p);
    if (d) warnings.push(d);
  }
  for (const c of input.copies.questions) {
    const pr = questionProblem(c.question) ?? bankPathProblem(c.path);
    if (pr) problems.push(`প্রশ্ন ${c.question?.id ?? '?'}: ${pr}`);
  }
  for (const c of input.copies.stimuli) {
    const pr = stimulusProblem(c.stimulus) ?? bankPathProblem(c.path);
    if (pr) problems.push(`উদ্দীপক ${c.stimulus?.id ?? '?'}: ${pr}`);
  }
  if (problems.length) {
    return { ok: false, reason: `কপির ${problems.length}টি জিনিস ঠিক নেই - data.json লেখা হয়নি (আগের ফাইল অক্ষত)`, problems };
  }

  const file = buildCategoryDataFile({ category: input.category, papers: input.papers, questions: input.copies.questions, stimuli: input.copies.stimuli });
  const text = categoryDataToText(file);
  const back = parseCategoryData(text);
  if (!back.ok) return { ok: false, reason: `নিজের তৈরি ফাইল আবার পড়া গেল না (${back.reason}) - data.json লেখা হয়নি`, problems: [back.reason] };
  if (back.data.unsafe) {
    return { ok: false, reason: 'নিজের তৈরি ফাইল যাচাইয়ে unsafe হলো - data.json লেখা হয়নি', problems: back.data.warnings };
  }
  return { ok: true, text, file, warnings: [...warnings, ...back.data.warnings] };
}

/** data.json-এর কপির ছবির id (media/-তে যে ফাইলগুলো থাকার কথা) */
export function wantedImageIds(file: CategoryDataFile): Set<string> {
  return new Set(file.images.map((i) => i.id));
}
