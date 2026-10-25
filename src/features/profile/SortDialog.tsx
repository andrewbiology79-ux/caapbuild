import React from 'react';
import { Check } from 'lucide-react';

export interface SortDialogProps<T extends string> {
  isOpen: boolean;
  title: string;
  options: Array<{ id: T; label: string }>;
  value: T;
  footer?: string;
  onSelect: (id: T) => void;
  onClose: () => void;
}

/** One sort chooser for both categories and papers. */
export function SortDialog<T extends string>({
  isOpen,
  title,
  options,
  value,
  footer,
  onSelect,
  onClose,
}: SortDialogProps<T>) {
  if (!isOpen) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[340px] bg-surface rounded-3xl border border-line shadow-pop p-3 space-y-1"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-bold text-ink px-2 pb-2">{title}</h3>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => {
              onSelect(o.id);
              onClose();
            }}
            className={`w-full min-h-[46px] px-3 rounded-xl text-left text-sm font-medium flex items-center justify-between ${
              value === o.id ? 'bg-brand-soft text-brand font-bold' : 'text-ink hover:bg-app'
            }`}
          >
            <span>{o.label}</span>
            {value === o.id && <Check className="w-4 h-4" />}
          </button>
        ))}
        {footer && <p className="text-[0.6875rem] text-ink-muted px-2 pt-2 leading-snug">{footer}</p>}
      </div>
    </div>
  );
}

export default SortDialog;
