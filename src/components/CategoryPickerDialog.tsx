import React from 'react';
import { FolderKanban, X } from 'lucide-react';
import type { Category } from '../db/api';
import { toBn } from '../utils/toBn';

export interface CategoryPickerDialogProps {
  isOpen: boolean;
  title: string;
  categories: Category[];
  excludeId?: string | null;
  stats?: Record<string, { paperCount: number; questionCount: number }>;
  onPick: (category: Category) => void;
  onCancel: () => void;
}

/**
 * Lets the user choose a destination category (for move / copy)
 */
export const CategoryPickerDialog: React.FC<CategoryPickerDialogProps> = ({
  isOpen,
  title,
  categories,
  excludeId,
  stats = {} as Record<string, { paperCount: number; questionCount: number }>,
  onPick,
  onCancel,
}) => {
  if (!isOpen) return null;
  const list = categories.filter((c) => c.id !== excludeId);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[360px] max-h-[80vh] bg-surface rounded-2xl border border-line shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-line-soft dark:border-slate-800">
          <h3 className="text-sm font-bold text-ink">{title}</h3>
          <button
            type="button"
            aria-label="বন্ধ করুন"
            onClick={onCancel}
            className="w-8 h-8 min-h-0 rounded-full flex items-center justify-center text-ink-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 space-y-2 overflow-y-auto">
          {list.length === 0 ? (
            <p className="text-xs text-ink-muted text-center py-6">
              অন্য কোনো ক্যাটেগরি নেই। আগে একটি নতুন ক্যাটেগরি তৈরি করুন।
            </p>
          ) : (
            list.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => onPick(cat)}
                className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-line bg-surface text-left flex items-center gap-3 hover:border-brand"
              >
                <FolderKanban className="w-5 h-5 text-brand shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-ink truncate">{cat.name}</div>
                  <div className="text-[0.6875rem] text-ink-muted">
                    {toBn(stats[cat.id]?.paperCount || 0)}টি প্রশ্নপত্র
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default CategoryPickerDialog;
