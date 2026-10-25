import React from 'react';
import type { QuestionType } from '../../db/db';
import { type SortMode } from '../../utils/filterEngine';

export const SORT_LABELS: Record<SortMode, string> = {
  default: 'স্বাভাবিক ক্রম',
  'rating-desc': 'রেটিং: বেশি → কম',
  'rating-asc': 'রেটিং: কম → বেশি',
  'marks-desc': 'নম্বর: বেশি → কম',
  type: 'টাইপ (ক → ঘ)',
};

export const TYPE_OPTIONS: QuestionType[] = ['ক', 'খ', 'গ', 'ঘ'];

/** hides the scrollbar on the horizontal chip rows */
export const NO_SCROLLBAR: React.CSSProperties = { scrollbarWidth: 'none' };

export function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

export const Chip: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}> = ({ active, onClick, children, className = '' }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`min-h-[36px] px-3 py-1.5 rounded-full border text-xs font-semibold transition-all active:scale-95 ${
      active
        ? 'bg-brand border-brand text-white shadow-sm'
        : 'bg-surface border-line text-ink hover:bg-brand-hover'
    } ${className}`}
  >
    {children}
  </button>
);

export const Section: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({
  title,
  hint,
  children,
}) => (
  <div className="space-y-2">
    <div className="flex items-baseline justify-between">
      <h4 className="text-xs font-bold text-ink">{title}</h4>
      {hint && <span className="text-[0.6875rem] text-ink-muted">{hint}</span>}
    </div>
    <div className="flex flex-wrap gap-2">{children}</div>
  </div>
);

export const Segmented: React.FC<{
  title?: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}> = ({ title, value, options, onChange }) => (
  <div className="space-y-2">
    {title && <h4 className="text-xs font-bold text-ink">{title}</h4>}
    <div className="flex w-full rounded-xl bg-app p-1 border border-line">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 min-h-[34px] rounded-lg text-xs font-semibold transition-all ${
            value === o.value ? 'bg-surface text-brand-ink shadow-sm' : 'text-ink-muted'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  </div>
);

