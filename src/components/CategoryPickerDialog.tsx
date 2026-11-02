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
        className="w-full max-w-[360px] max-h-[80vh] bg-white dark:bg-slate-900 rounded-2xl border border-[#D5D9E2] dark:border-slate-700 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#F2F4F8] dark:border-slate-800">
          <h3 className="text-sm font-bold text-[#1B1F2A] dark:text-slate-100">{title}</h3>
          <button
            type="button"
            aria-label="বন্ধ করুন"
            onClick={onCancel}
            className="w-8 h-8 min-h-0 rounded-full flex items-center justify-center text-[#64748B] dark:text-slate-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 space-y-2 overflow-y-auto">
          {list.length === 0 ? (
            <p className="text-xs text-[#64748B] dark:text-slate-400 text-center py-6">
              অন্য কোনো ক্যাটেগরি নেই। আগে একটি নতুন ক্যাটেগরি তৈরি করুন।
            </p>
          ) : (
            list.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => onPick(cat)}
                className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800 text-left flex items-center gap-3 hover:border-[#3B4FD8]"
              >
                <FolderKanban className="w-5 h-5 text-[#3B4FD8] dark:text-indigo-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#1B1F2A] dark:text-slate-100 truncate">{cat.name}</div>
                  <div className="text-[0.6875rem] text-[#64748B] dark:text-slate-400">
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
