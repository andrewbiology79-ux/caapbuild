import React, { useState } from 'react';
import { X, Check, RotateCcw, Info } from 'lucide-react';
import type { PaperEdits, PaperQuestionEdit, PaperStimulusEdit, Question, Stimulus } from '../db/db';
import { RichText } from './RichText';

export interface EditableGroup {
  id: string;
  stimulus?: Stimulus;
  questions: Question[];
}

/** Result of the dialog: `null` = "same as the question bank" (edit removed) */
export interface GroupEditResult {
  stimulusId?: string;
  stimulus: PaperStimulusEdit | null;
  questions: Record<string, PaperQuestionEdit | null>;
}

export interface PaperQuestionEditDialogProps {
  /** the ORIGINAL group from the question bank */
  group: EditableGroup;
  /** current paper-only edits */
  edits?: PaperEdits;
  onSave: (result: GroupEditResult) => void;
  onResetGroup: () => void;
  onClose: () => void;
}

const fieldClass =
  'w-full px-3 py-2 rounded-xl border border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800 text-xs leading-relaxed text-[#1B1F2A] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#3B4FD8] resize-y';

const PreviewBox: React.FC<{ text: string }> = ({ text }) =>
  text.trim() ? (
    <div className="mt-1.5 px-3 py-2 rounded-xl bg-[#F8FAFC] dark:bg-slate-800/60 border border-dashed border-[#D5D9E2] dark:border-slate-700">
      <RichText text={text} className="text-xs text-[#1B1F2A] dark:text-slate-200 leading-relaxed" />
    </div>
  ) : null;

export const PaperQuestionEditDialog: React.FC<PaperQuestionEditDialogProps> = ({
  group,
  edits,
  onSave,
  onResetGroup,
  onClose,
}) => {
  const stim = group.stimulus;
  const [stimText, setStimText] = useState<string>(
    stim ? edits?.stimuli?.[stim.id]?.text ?? stim.text : ''
  );
  const [drafts, setDrafts] = useState<Record<string, { text: string; marks: string; solution: string }>>(() => {
    const init: Record<string, { text: string; marks: string; solution: string }> = {};
    for (const q of group.questions) {
      const e = edits?.questions?.[q.id];
      init[q.id] = {
        text: e?.questionText ?? q.questionText,
        marks: String(e?.marks ?? q.marks),
        solution: e?.solutionText ?? q.solutionText ?? '',
      };
    }
    return init;
  });

  const anyEditNow =
    Boolean(stim && edits?.stimuli?.[stim.id]) || group.questions.some((q) => Boolean(edits?.questions?.[q.id]));

  const setDraft = (id: string, patch: Partial<{ text: string; marks: string; solution: string }>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const handleSave = () => {
    const result: GroupEditResult = { stimulusId: stim?.id, stimulus: null, questions: {} };

    if (stim && stimText !== stim.text) {
      result.stimulus = { text: stimText };
    }

    for (const q of group.questions) {
      const d = drafts[q.id];
      const marks = parseInt(d.marks, 10);
      const safeMarks = Number.isFinite(marks) && marks >= 0 ? marks : q.marks;
      const changed =
        d.text !== q.questionText || safeMarks !== q.marks || d.solution !== (q.solutionText ?? '');
      result.questions[q.id] = changed
        ? { questionText: d.text, marks: safeMarks, solutionText: d.solution }
        : null;
    }
    onSave(result);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="প্রশ্ন সম্পাদনা (শুধু এই প্রশ্নপত্রের জন্য)"
      className="absolute inset-0 z-30 flex flex-col bg-white dark:bg-slate-900 animate-in fade-in duration-150"
    >
      <header
        className="bg-[#3B4FD8] text-white px-4 h-14 flex items-center justify-between shrink-0 shadow-md"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <h3 className="text-sm font-bold">প্রশ্ন সম্পাদনা</h3>
        <button
          type="button"
          aria-label="বন্ধ করুন"
          onClick={onClose}
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 active:bg-white/20"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-[0.6875rem] leading-relaxed text-amber-900 dark:text-amber-200">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            এখানের পরিবর্তন শুধু এই প্রশ্নপত্র ও এর PDF-এর জন্য সেভ হবে। আপনার প্রশ্ন ব্যাংকের মূল প্রশ্ন একটুও বদলাবে না।
          </span>
        </div>

        {stim && (
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#1B1F2A] dark:text-slate-200">উদ্দীপক</label>
            <textarea value={stimText} onChange={(e) => setStimText(e.target.value)} rows={5} className={fieldClass} />
            <PreviewBox text={stimText} />
          </div>
        )}

        {group.questions.map((q) => {
          const d = drafts[q.id];
          return (
            <div
              key={q.id}
              className="space-y-2 p-3 rounded-2xl border border-[#D5D9E2] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-800/40"
            >
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-black text-[#3B4FD8] dark:text-indigo-300">
                  {q.type ? `${q.type}.` : 'প্রশ্ন'}
                </label>
                <div className="flex items-center gap-1.5">
                  <span className="text-[0.6875rem] font-bold text-[#64748B] dark:text-slate-400">মান</span>
                  <input
                    type="number"
                    min={0}
                    value={d.marks}
                    onChange={(e) => setDraft(q.id, { marks: e.target.value })}
                    className="w-16 min-h-[36px] px-2 py-1 rounded-lg border border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-center focus:outline-none focus:ring-2 focus:ring-[#3B4FD8]"
                  />
                </div>
              </div>

              <div>
                <textarea
                  value={d.text}
                  onChange={(e) => setDraft(q.id, { text: e.target.value })}
                  rows={3}
                  className={fieldClass}
                />
                <PreviewBox text={d.text} />
              </div>

              <div>
                <label className="text-[0.6875rem] font-bold text-[#64748B] dark:text-slate-400">
                  সমাধান
                </label>
                <textarea
                  value={d.solution}
                  onChange={(e) => setDraft(q.id, { solution: e.target.value })}
                  rows={3}
                  className={fieldClass}
                />
                <PreviewBox text={d.solution} />
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="p-3 bg-[#F8FAFC] dark:bg-slate-800/80 border-t border-[#D5D9E2] dark:border-slate-800 flex items-center gap-2 shrink-0"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
      >
        {anyEditNow && (
          <button
            type="button"
            onClick={onResetGroup}
            className="min-h-[44px] px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-bold flex items-center gap-1.5"
          >
            <RotateCcw className="w-4 h-4" />
            <span>মূল প্রশ্ন</span>
          </button>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
        >
          বাতিল
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="min-h-[44px] px-5 py-2 rounded-xl bg-[#3B4FD8] hover:bg-[#2A3BB0] text-white text-xs font-bold flex items-center gap-1.5"
        >
          <Check className="w-4 h-4" />
          <span>ঠিক আছে</span>
        </button>
      </div>
    </div>
  );
};

export default PaperQuestionEditDialog;
