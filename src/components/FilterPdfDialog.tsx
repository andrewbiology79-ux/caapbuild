import React, { useEffect, useState } from 'react';
import { FileText, RefreshCw } from 'lucide-react';
import { DEFAULT_PAPER_NOTE } from '../db/db';
import { PDF_FONT_SCALES, getPdfFontScale, savePdfFontScale } from '../utils/settings';
import { toBn } from '../utils/toBn';

export interface FilterPdfValues {
  title: string;
  subjectLine: string;
  duration: string;
  /** undefined = default note, '' = hidden */
  note: string | undefined;
  fontScale: number;
  fileBaseName: string;
}

interface Props {
  isOpen: boolean;
  questionCount: number;
  totalMarks: number;
  defaultSubjectLine?: string;
  busy: boolean;
  onConfirm: (values: FilterPdfValues) => void;
  onCancel: () => void;
}

const inputCls =
  'w-full min-h-[44px] px-3 py-2 rounded-xl bg-app border border-line text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand focus:bg-surface';

export const FilterPdfDialog: React.FC<Props> = ({
  isOpen,
  questionCount,
  totalMarks,
  defaultSubjectLine = '',
  busy,
  onConfirm,
  onCancel,
}) => {
  const [title, setTitle] = useState('প্রশ্নব্যাংক');
  const [subjectLine, setSubjectLine] = useState('');
  const [duration, setDuration] = useState('');
  const [showNote, setShowNote] = useState(true);
  const [fontScale, setFontScale] = useState<number>(1);
  const [fileBaseName, setFileBaseName] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setSubjectLine(defaultSubjectLine);
    getPdfFontScale().then(setFontScale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const submit = () => {
    savePdfFontScale(fontScale);
    onConfirm({
      title,
      subjectLine,
      duration,
      note: showNote ? undefined : '',
      fontScale,
      fileBaseName,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="PDF তৈরি"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="w-full max-w-[390px] max-h-[88vh] bg-surface rounded-t-3xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-3 pb-3 border-b border-line">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-brand-fg" />
            <h3 className="text-base font-bold text-ink">PDF তৈরি করুন</h3>
          </div>
          <p className="text-[0.6875rem] text-ink-muted mt-1">
            {toBn(questionCount)}টি প্রশ্ন · পূর্ণমান {toBn(totalMarks)}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-ink">শিরোনাম</span>
            <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-ink">বিষয় লাইন (ঐচ্ছিক)</span>
            <input
              className={inputCls}
              value={subjectLine}
              onChange={(e) => setSubjectLine(e.target.value)}
              placeholder="যেমন: পদার্থবিজ্ঞান ১ম পত্র"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-ink">সময় (ঐচ্ছিক)</span>
            <input
              className={inputCls}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="যেমন: ২ ঘণ্টা ৩০ মিনিট"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-ink">ফাইলের নাম (ঐচ্ছিক)</span>
            <input className={inputCls} value={fileBaseName} onChange={(e) => setFileBaseName(e.target.value)} />
          </label>

          <div className="space-y-2">
            <span className="text-xs font-bold text-ink">লেখার সাইজ</span>
            <div className="flex flex-wrap gap-2">
              {PDF_FONT_SCALES.map((sc) => (
                <button
                  key={sc}
                  type="button"
                  onClick={() => setFontScale(sc)}
                  className={`min-h-[36px] px-3 rounded-full border text-xs font-semibold ${
                    fontScale === sc
                      ? 'bg-brand border-brand text-white'
                      : 'bg-surface border-line text-ink'
                  }`}
                >
                  {toBn(Math.round(sc * 100))}%
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowNote((v) => !v)}
            className="w-full min-h-[44px] px-3 rounded-xl border border-line flex items-center justify-between text-left"
          >
            <span className="text-xs font-semibold text-ink pr-3">দ্রষ্টব্য দেখান</span>
            <span
              className={`w-10 h-6 rounded-full p-0.5 transition-colors ${showNote ? 'bg-brand' : 'bg-[#CBD5E1]'}`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-surface transition-transform ${showNote ? 'translate-x-4' : ''}`}
              />
            </span>
          </button>
          {showNote && <p className="text-[0.6875rem] text-ink-muted leading-relaxed">{DEFAULT_PAPER_NOTE}</p>}
        </div>

        <div className="px-5 py-3 border-t border-line flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 min-h-[48px] rounded-xl border border-line text-sm font-semibold text-ink disabled:opacity-50"
          >
            বাতিল
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="flex-[2] min-h-[48px] rounded-xl bg-brand text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {busy ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                তৈরি হচ্ছে...
              </>
            ) : (
              'PDF বানান'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FilterPdfDialog;
