import React from 'react';
import { Upload, Download, X } from 'lucide-react';

export interface TransferChoiceDialogProps {
  isOpen: boolean;
  title: string;
  description?: string;
  importLabel?: string;
  exportLabel?: string;
  onImport: () => void;
  onExport: () => void;
  onClose: () => void;
}

/** Small centered popup: choose Import or Export */
export const TransferChoiceDialog: React.FC<TransferChoiceDialogProps> = ({
  isOpen,
  title,
  description,
  importLabel = 'ইমপোর্ট (ফাইল থেকে)',
  exportLabel = 'এক্সপোর্ট (ফাইল তৈরি)',
  onImport,
  onExport,
  onClose,
}) => {
  if (!isOpen) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[340px] bg-surface rounded-3xl border border-line shadow-2xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-ink">{title}</h3>
            {description && (
              <p className="text-[0.6875rem] text-ink-muted mt-1 leading-snug">{description}</p>
            )}
          </div>
          <button
            type="button"
            aria-label="বন্ধ করুন"
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-ink-muted hover:bg-hover dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              onImport();
            }}
            className="w-full min-h-[48px] px-4 rounded-xl bg-success-soft dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 text-sm font-bold flex items-center gap-3"
          >
            <Upload className="w-5 h-5" />
            <span>{importLabel}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onExport();
            }}
            className="w-full min-h-[48px] px-4 rounded-xl bg-brand-soft border border-[#C7D2FE] dark:border-indigo-900 text-brand text-sm font-bold flex items-center gap-3"
          >
            <Download className="w-5 h-5" />
            <span>{exportLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default TransferChoiceDialog;
