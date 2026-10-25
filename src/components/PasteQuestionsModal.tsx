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
  questions: QuestionBlockInput[];
}

const SAMPLE_JSON = `{
  "groups": [
    {
      "stimulus": "উদ্দীপক: $M = 6 \\\\times 10^{24}\\\\ \\\\text{kg}$ ভরের একটি গ্রহ ...",
      "boardTag": "DB'২৫",
      "questions": [
        {
          "type": "গ",
          "marks": 3,
          "rating": 3,
          "questionText": "বিভব $V$ এর মান হিসাব করো।",
          "solutionText": "আমরা জানি, $V = -\\\\frac{GM}{r}$ ...",
          "answerText": "-6.256 × 10⁷ J kg⁻¹",
          "usedInBoards": [{ "board": "DB", "years": [2025] }]
        },
        {
          "type": "ঘ",
          "marks": 4,
          "rating": 4,
          "questionText": "দূরত্ব দ্বিগুণ করলে প্রাবল্যের কী পরিবর্তন হবে?",
          "solutionText": "...",
          "answerText": "১/৪ অংশ"
        }
      ]
    }
  ]
}`;

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

function parseInput(text: string): ParsedGroup[] {
  let data: any;
  try {
    data = JSON.parse(text);
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
    throw new Error('"groups" তালিকা পাওয়া যায়নি। নমুনা ফরম্যাট দেখে নিন।');
  }

  if (rawGroups.length === 0) throw new Error('কোনো প্রশ্ন পাওয়া যায়নি');

  return rawGroups.map((g, gIdx) => {
    if (!g || !Array.isArray(g.questions) || g.questions.length === 0) {
      throw new Error(`গ্রুপ ${gIdx + 1}: questions তালিকা খালি বা নেই`);
    }
    const stimulusRaw = g.stimulus ?? g.stimulusText ?? g.text ?? '';
    return {
      stimulus: typeof stimulusRaw === 'string' ? stimulusRaw.trim() : '',
      boardTag: typeof g.boardTag === 'string' && g.boardTag.trim() ? g.boardTag.trim() : undefined,
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
      <div className="w-full max-w-[370px] bg-surface text-ink rounded-3xl border border-line shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="bg-brand text-white px-5 py-3.5 flex items-center justify-between shrink-0">
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
          <p className="text-[0.6875rem] text-ink-muted leading-snug">
            প্রশ্নগুলো টপিক <span className="font-bold text-ink">{topicName}</span>-এ যুক্ত হবে। বিদ্যমান কিছু পরিবর্তন হবে না।
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePasteFromClipboard}
              className="flex-1 min-h-[44px] px-3 rounded-xl bg-brand hover:bg-brand-strong text-white text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <ClipboardPaste className="w-4 h-4" />
              <span>পেস্ট করুন</span>
            </button>
            <button
              type="button"
              onClick={handleCopySample}
              className="min-h-[44px] px-3 rounded-xl border border-line bg-surface text-brand-ink dark:text-indigo-300 text-xs font-semibold flex items-center gap-1.5 shrink-0"
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
            className="w-full h-56 p-3 rounded-xl border border-line bg-surface-2 dark:bg-slate-800 text-xs font-mono leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-brand/40"
          />

          {error && (
            <div className="p-3 rounded-xl bg-danger-soft dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300 text-xs flex gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}
        </div>

        <div className="p-4 bg-surface-2 dark:bg-slate-800/60 border-t border-line flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleClose}
            className="min-h-[44px] px-4 rounded-xl border border-line bg-surface text-xs font-semibold"
          >
            বাতিল
          </button>
          <button
            type="button"
            disabled={!text.trim() || saving}
            onClick={handleSave}
            className="min-h-[44px] px-5 rounded-xl bg-brand hover:bg-brand-strong text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
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
