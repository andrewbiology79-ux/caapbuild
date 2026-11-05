import React, { useState } from 'react';
import { X, ClipboardPaste, Copy, CheckCircle2, AlertCircle } from 'lucide-react';
import { useToast } from './Toast';
import { toBn } from '../utils/toBn';
import {
  getApi,
  type QuestionType,
  type BoardUsage,
  type QuestionBlockInput,
} from '../db/api';
import type { CqScope } from '../db/db';

export interface PasteQuestionsModalProps {
  /** which collection (database) to work on — default Type CQ */
  scope?: CqScope;
  isOpen: boolean;
  topicId: string;
  topicName: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface ParsedGroup {
  stimulus: string;
  boardTag?: string;
  stimulusBoards: BoardUsage[];
  stimulusRating?: number;
  reference?: string;
  questions: QuestionBlockInput[];
}

/**
 * Sample shown by "নমুনা কপি". It is built with JSON.stringify so every backslash of the LaTeX
 * (e.g. \\times, \\frac) is escaped correctly — the old hand-typed sample had doubled backslashes.
 */
const SAMPLE_JSON = JSON.stringify(
  {
    groups: [
      {
        stimulus: 'চিত্রে AB = BC = CA = 15 m। D বিন্দু BC এর মধ্যবিন্দু। $m_B = 60\\ \\text{kg}$, $m_C = 70\\ \\text{kg}$',
        stimulusRating: 3,
        reference: 'মেরি জি প্রশ্ন ব্যাংক',
        stimulusBoards: [{ board: 'DB', years: [2026] }],
        questions: [
          {
            type: 'গ',
            marks: 3,
            rating: 3,
            questionText: 'A বিন্দুতে বিভবের মান কত? বের করো।',
            solutionText: '$V_A = -\\frac{Gm_B}{AB} - \\frac{Gm_C}{AC} = -5.78\\times 10^{-10}\\ \\text{J kg}^{-1}$',
            answerText: '-5.78 × 10⁻¹⁰ J kg⁻¹',
            usedInBoards: [{ board: 'DB', years: [2025] }],
          },
          {
            type: 'ঘ',
            marks: 4,
            rating: 4,
            questionText: 'A ও D বিন্দুর প্রাবল্যের মানের তুলনা করো।',
            solutionText: '$E_D = E_2 - E_1 = 1.18\\times 10^{-11}\\ \\text{N kg}^{-1}$',
            answerText: '',
            usedInBoards: [{ board: 'DB', years: [2025] }],
          },
        ],
      },
    ],
  },
  null,
  2
);

const TYPE_BY_MARKS: Record<number, QuestionType> = { 1: 'ক', 2: 'খ', 3: 'গ', 4: 'ঘ' };
const MARKS_BY_TYPE: Record<QuestionType, number> = { ক: 1, খ: 2, গ: 3, ঘ: 4 };

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
function normalizeNumber(v: any): number | undefined {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') {
    const en = v.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
    const n = parseFloat(en);
    if (isFinite(n)) return n;
  }
  return undefined;
}

function normalizeType(v: any): QuestionType | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  if (t === 'ক' || t === 'খ' || t === 'গ' || t === 'ঘ') return t;
  const map: Record<string, QuestionType> = { a: 'ক', b: 'খ', c: 'গ', d: 'ঘ' };
  return map[t.toLowerCase()];
}

function normalizeBoards(v: any): BoardUsage[] {
  if (!Array.isArray(v)) return [];
  const out: BoardUsage[] = [];
  for (const b of v) {
    if (!b || typeof b.board !== 'string' || !b.board.trim()) continue;
    const years = Array.isArray(b.years)
      ? (b.years.map(normalizeNumber).filter((y: any) => typeof y === 'number') as number[])
      : [];
    out.push({ board: b.board.trim(), years });
  }
  return out;
}

function parseQuestion(raw: any, idx: number, gIdx: number): QuestionBlockInput {
  const label = `গ্রুপ ${gIdx + 1}, প্রশ্ন ${idx + 1}`;
  if (!raw || typeof raw !== 'object') throw new Error(`${label}: সঠিক অবজেক্ট নয়`);
  const questionText = typeof raw.questionText === 'string' ? raw.questionText.trim() : '';
  if (!questionText) throw new Error(`${label}: questionText খালি`);

  const marksNum = normalizeNumber(raw.marks);
  let type = normalizeType(raw.type);
  if (!type && marksNum !== undefined) type = TYPE_BY_MARKS[marksNum];
  if (!type) throw new Error(`${label}: type (ক/খ/গ/ঘ) পাওয়া যায়নি`);
  const marks = marksNum !== undefined ? marksNum : MARKS_BY_TYPE[type];

  const ratingNum = normalizeNumber(raw.rating);
  const rating = ratingNum !== undefined ? Math.max(1, Math.min(5, Math.round(ratingNum))) : 3;

  return {
    type,
    marks,
    questionText,
    solutionText: typeof raw.solutionText === 'string' ? raw.solutionText.trim() : '',
    solutionImageIds: [],
    answerText: typeof raw.answerText === 'string' ? raw.answerText.trim() : '',
    rating,
    usedInBoards: normalizeBoards(raw.usedInBoards),
  };
}

/** LaTeX commands that begin with b / f / n / r / t — JSON would read "\\t" + "imes" as TAB + "imes" */
const LATEX_CMDS = new Set([
  // b
  'beta', 'bar', 'begin', 'bf', 'binom', 'boldsymbol', 'because', 'big', 'bigl', 'bigr', 'bigg', 'biggl', 'biggr',
  'bullet', 'bmod', 'bot', 'boxed', 'breve', 'backslash', 'bowtie',
  // f
  'frac', 'forall', 'flat', 'frown', 'fbox',
  // n
  'nu', 'neq', 'ne', 'nabla', 'not', 'notin', 'newline', 'ni', 'nearrow', 'nleq', 'ngeq', 'nmid', 'nonumber', 'normalsize',
  // r
  'rho', 'right', 'rightarrow', 'rm', 'rangle', 'rbrace', 'rbrack', 'rceil', 'rfloor', 'rightleftharpoons',
  // t
  'times', 'text', 'textbf', 'textit', 'textrm', 'tan', 'tanh', 'tau', 'to', 'theta', 'tfrac', 'tilde', 'top',
  'triangle', 'therefore', 'tiny', 'thinspace',
]);

/**
 * Makes pasted JSON forgiving. AI tools often return JSON where the LaTeX has single backslashes
 * ("\\frac", "\\times", "\\(" …), real line breaks inside strings, trailing commas or ```json fences —
 * none of which JSON.parse accepts (or worse, it silently turns \t of \times into a TAB).
 */
function repairJson(input: string): string {
  let t = input.replace(/^\uFEFF/, '').trim();
  t = t.replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```$/, '').trim();

  // drop any text before the first { or [ and after the last } or ]
  const firstObj = t.search(/[\[{]/);
  if (firstObj > 0) t = t.slice(firstObj);
  const lastObj = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (lastObj >= 0 && lastObj < t.length - 1) t = t.slice(0, lastObj + 1);

  let out = '';
  let inStr = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];

    if (!inStr) {
      if (ch === '"') {
        inStr = true;
        out += ch;
      } else if (ch === ',') {
        // trailing comma before } or ]
        let j = i + 1;
        while (j < t.length && /\s/.test(t[j])) j++;
        if (t[j] === '}' || t[j] === ']') continue;
        out += ch;
      } else {
        out += ch;
      }
      continue;
    }

    // ---- inside a string ----
    if (ch === '"') {
      inStr = false;
      out += ch;
    } else if (ch === '\\') {
      const next = t[i + 1];
      if (next === undefined) {
        out += '\\\\';
      } else if (next === '\\' || next === '"' || next === '/') {
        out += ch + next; // already a valid escape
        i++;
      } else if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(t.slice(i + 2, i + 6))) {
        out += t.slice(i, i + 6);
        i += 5;
      } else if ('bfnrt'.includes(next)) {
        const run = /^[A-Za-z]+/.exec(t.slice(i + 1))?.[0] ?? '';
        if (LATEX_CMDS.has(run)) {
          out += '\\\\'; // it is LaTeX (\times, \frac …), keep the backslash
        } else {
          out += ch + next; // a real \n, \t …
          i++;
        }
      } else {
        out += '\\\\'; // \sqrt, \alpha, \( … : not a JSON escape, so it is LaTeX
      }
    } else if (ch === '\n') {
      out += '\\n';
    } else if (ch === '\r') {
      if (t[i + 1] !== '\n') out += '\\n';
    } else if (ch === '\t') {
      out += '\\t';
    } else {
      out += ch;
    }
  }
  return out;
}

/** "DB'২৫" / "DB 2025" -> { board: 'DB', years: [2025] } (old-style boardTag text) */
function boardsFromTag(tag?: string): BoardUsage[] {
  if (!tag) return [];
  const m = /^\s*([A-Za-z\u0980-\u09FF]+)\s*['’`]?\s*([০-৯0-9]{2,4})\s*$/.exec(tag);
  if (!m) return [];
  let y = normalizeNumber(m[2]);
  if (y === undefined) return [];
  if (y < 100) y += 2000;
  return [{ board: m[1], years: [y] }];
}

function parseInput(text: string): ParsedGroup[] {
  let data: any;
  try {
    data = JSON.parse(repairJson(text));
  } catch (e: any) {
    throw new Error(`JSON ভুল আছে: ${e.message || 'সিনট্যাক্স ত্রুটি'}`);
  }

  let rawGroups: any[];
  if (Array.isArray(data)) {
    // Either array of groups, or array of flat questions
    rawGroups = data.some((x) => x && Array.isArray(x.questions)) ? data : [{ questions: data }];
  } else if (data && Array.isArray(data.groups)) {
    rawGroups = data.groups;
  } else if (data && Array.isArray(data.questions)) {
    rawGroups = [data];
  } else {
    throw new Error('"groups" তালিকা পাওয়া যায়নি। "নমুনা কপি" চেপে সঠিক ফরম্যাট দেখে নিন।');
  }

  if (rawGroups.length === 0) throw new Error('কোনো প্রশ্ন পাওয়া যায়নি');

  return rawGroups.map((g, gIdx) => {
    if (!g || !Array.isArray(g.questions) || g.questions.length === 0) {
      throw new Error(`গ্রুপ ${gIdx + 1}: questions তালিকা খালি বা নেই`);
    }
    const stimulusRaw = g.stimulus ?? g.stimulusText ?? g.text ?? '';
    const boardTag = typeof g.boardTag === 'string' && g.boardTag.trim() ? g.boardTag.trim() : undefined;

    let stimulusBoards = normalizeBoards(g.stimulusBoards ?? g.stimulusUsedInBoards ?? g.usedInBoards);
    if (stimulusBoards.length === 0) stimulusBoards = boardsFromTag(boardTag);

    const ratingNum = normalizeNumber(g.stimulusRating ?? g.rating);
    return {
      stimulus: typeof stimulusRaw === 'string' ? stimulusRaw.trim() : '',
      boardTag,
      stimulusBoards,
      stimulusRating: ratingNum !== undefined ? Math.max(1, Math.min(5, Math.round(ratingNum))) : undefined,
      reference: typeof g.reference === 'string' && g.reference.trim() ? g.reference.trim() : undefined,
      questions: g.questions.map((q: any, i: number) => parseQuestion(q, i, gIdx)),
    };
  });
}

export const PasteQuestionsModal: React.FC<PasteQuestionsModalProps> = ({
  isOpen,
  topicId,
  topicName,
  onClose,
  onSuccess,
  scope = 'type' as CqScope,
}) => {
  const { addQuestion, saveQuestionGroup } = getApi(scope);
  const { showToast } = useToast();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleClose = () => {
    setText('');
    setError(null);
    onClose();
  };

  const handlePasteFromClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip) {
        showToast('ক্লিপবোর্ড খালি');
        return;
      }
      setText(clip);
      setError(null);
    } catch {
      showToast('পেস্ট করা যায়নি, বক্সে চেপে ধরে পেস্ট করুন');
    }
  };

  const handleCopySample = async () => {
    try {
      await navigator.clipboard.writeText(SAMPLE_JSON);
      showToast('নমুনা ফরম্যাট কপি হয়েছে');
    } catch {
      setText(SAMPLE_JSON);
      showToast('নমুনা বক্সে বসানো হয়েছে');
    }
  };

  const handleSave = async () => {
    setError(null);
    let groups: ParsedGroup[];
    try {
      groups = parseInput(text.trim());
    } catch (e: any) {
      setError(e.message || 'JSON পড়া যায়নি');
      return;
    }

    setSaving(true);
    try {
      let qCount = 0;
      for (const g of groups) {
        if (g.stimulus) {
          await saveQuestionGroup({
            topicId,
            stimulusText: g.stimulus,
            stimulusImageIds: [],
            boardTag: g.boardTag,
            stimulusUsedInBoards: g.stimulusBoards,
            stimulusRating: g.stimulusRating,
            reference: g.reference,
            questions: g.questions,
          });
          qCount += g.questions.length;
        } else {
          // No stimulus: add as standalone questions
          for (const q of g.questions) {
            await addQuestion({
              topicId,
              type: q.type,
              marks: q.marks,
              questionText: q.questionText,
              solutionText: q.solutionText,
              solutionImageIds: [],
              answerText: q.answerText,
              rating: q.rating,
              usedInBoards: q.usedInBoards,
              order: undefined as unknown as number,
            });
            qCount++;
          }
        }
      }
      showToast(`${toBn(qCount)}টি প্রশ্ন যুক্ত হয়েছে`);
      onSuccess();
      handleClose();
    } catch (e: any) {
      console.error('Paste import failed:', e);
      setError(`সংরক্ষণে সমস্যা: ${e.message || 'অজানা ত্রুটি'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="paste-q-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-[370px] bg-white dark:bg-slate-900 text-[#1B1F2A] dark:text-slate-100 rounded-3xl border border-[#D5D9E2] dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="bg-[#3B4FD8] text-white px-5 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <ClipboardPaste className="w-5 h-5 shrink-0" />
            <h2 id="paste-q-title" className="text-base font-bold truncate">
              JSON থেকে প্রশ্ন যোগ
            </h2>
          </div>
          <button
            type="button"
            aria-label="বন্ধ করুন"
            onClick={handleClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 active:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          <p className="text-[0.6875rem] text-[#64748B] dark:text-slate-400 leading-snug">
            প্রশ্নগুলো টপিক <span className="font-bold text-[#1B1F2A] dark:text-slate-200">{topicName}</span>-এ যুক্ত হবে। বিদ্যমান কিছু পরিবর্তন হবে না।
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePasteFromClipboard}
              className="flex-1 min-h-[44px] px-3 rounded-xl bg-[#3B4FD8] hover:bg-[#2A3BB0] text-white text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <ClipboardPaste className="w-4 h-4" />
              <span>পেস্ট করুন</span>
            </button>
            <button
              type="button"
              onClick={handleCopySample}
              className="min-h-[44px] px-3 rounded-xl border border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#2A3BB0] dark:text-indigo-300 text-xs font-semibold flex items-center gap-1.5 shrink-0"
            >
              <Copy className="w-4 h-4" />
              <span>নমুনা কপি</span>
            </button>
          </div>

          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            placeholder="এখানে ফরম্যাটেড JSON পেস্ট করুন..."
            spellCheck={false}
            className="w-full h-56 p-3 rounded-xl border border-[#D5D9E2] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-800 text-xs font-mono leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-[#3B4FD8]/40"
          />

          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300 text-xs flex gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}
        </div>

        <div className="p-4 bg-[#F8FAFC] dark:bg-slate-800/60 border-t border-[#D5D9E2] dark:border-slate-800 flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleClose}
            className="min-h-[44px] px-4 rounded-xl border border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
          >
            বাতিল
          </button>
          <button
            type="button"
            disabled={!text.trim() || saving}
            onClick={handleSave}
            className="min-h-[44px] px-5 rounded-xl bg-[#3B4FD8] hover:bg-[#2A3BB0] text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? (
              <span>যুক্ত হচ্ছে...</span>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>প্রশ্ন যুক্ত করুন</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PasteQuestionsModal;
