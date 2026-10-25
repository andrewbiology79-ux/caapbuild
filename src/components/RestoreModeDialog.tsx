import React from 'react';
import { Replace, GitMerge, X, AlertTriangle } from 'lucide-react';
import { toBn } from '../utils/toBn';

export interface RestoreModeDialogProps {
  isOpen: boolean;
  fileName?: string;
  questions: number;
  papers: number;
  busy?: boolean;
  onReplace: () => void;
  onMerge: () => void;
  onCancel: () => void;
}

/** After picking a full-backup file: replace everything, or merge with the current data? */
export const RestoreModeDialog: React.FC<RestoreModeDialogProps> = ({
  isOpen,
  fileName,
  questions,
  papers,
  busy = false,
  onReplace,
  onMerge,
  onCancel,
}) => {
  if (!isOpen) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-150"
    >
      <div className="w-full max-w-[340px] bg-surface rounded-3xl border border-line shadow-2xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-ink">ব্যাকআপ কীভাবে ইমপোর্ট করবেন?</h3>
            <p className="text-[0.6875rem] text-ink-muted mt-1 leading-snug break-all">
              {fileName ? `${fileName} · ` : ''}
              {toBn(questions)}টি প্রশ্ন · {toBn(papers)}টি প্রশ্নপত্র
            </p>
          </div>
          <button
            type="button"
            aria-label="বন্ধ করুন"
            disabled={busy}
            onClick={onCancel}
            className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-ink-muted hover:bg-hover dark:hover:bg-slate-800 disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={onMerge}
          className="w-full text-left p-3 rounded-2xl bg-success-soft dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 dark:border-emerald-900 flex gap-3 disabled:opacity-50"
        >
          <GitMerge className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <span>
            <span className="block text-sm font-bold text-emerald-700 dark:text-emerald-300">আগের ডাটার সাথে যোগ করুন</span>
            <span className="block text-[0.6875rem] text-[#475569] dark:text-slate-400 leading-snug mt-0.5">
              বর্তমান সব ডাটা থাকবে। ব্যাকআপের নতুন প্রশ্ন, প্রশ্নপত্র ও ক্যাটেগরি শুধু যুক্ত হবে।
            </span>
          </span>
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={onReplace}
          className="w-full text-left p-3 rounded-2xl bg-danger-soft dark:bg-red-950/40 border border-red-200 dark:border-red-900 flex gap-3 disabled:opacity-50"
        >
          <Replace className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <span>
            <span className="block text-sm font-bold text-red-700 dark:text-red-300">সম্পূর্ণ রিপ্লেস করুন</span>
            <span className="flex items-start gap-1 text-[0.6875rem] text-[#475569] dark:text-slate-400 leading-snug mt-0.5">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5 text-red-500" />
              <span>বর্তমান সব ডাটা মুছে ব্যাকআপের ডাটা বসবে।</span>
            </span>
          </span>
        </button>

        {busy && <p className="text-center text-xs font-semibold text-brand-fg">ইমপোর্ট হচ্ছে… অপেক্ষা করুন</p>}
      </div>
    </div>
  );
};

export default RestoreModeDialog;
