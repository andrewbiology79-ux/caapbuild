import React from 'react';
import type { MenuItem } from './KebabMenu';

export interface ActionSheetProps {
  isOpen: boolean;
  title?: string;
  subtitle?: string;
  items: MenuItem[];
  onClose: () => void;
}

/**
 * Bottom sheet with a list of actions (used for category / paper options)
 */
export const ActionSheet: React.FC<ActionSheetProps> = ({ isOpen, title, subtitle, items, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[390px] bg-surface rounded-t-3xl border-t border-line shadow-2xl pb-3 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-2">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line dark:bg-slate-700" />
          {title && (
            <h3 className="text-sm font-bold text-ink truncate">{title}</h3>
          )}
          {subtitle && <p className="text-[0.6875rem] text-ink-muted truncate">{subtitle}</p>}
        </div>

        <div className="px-2">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onClose();
                item.onClick();
              }}
              className={`w-full min-h-[48px] px-3.5 py-2.5 rounded-xl text-left text-sm font-medium flex items-center gap-3 transition-colors ${
                item.isDestructive
                  ? 'text-red-600 dark:text-red-400 hover:bg-danger-soft dark:hover:bg-red-950/40'
                  : 'text-ink hover:bg-hover dark:hover:bg-slate-800'
              }`}
            >
              {item.icon && <span className="w-5 h-5 flex items-center justify-center shrink-0">{item.icon}</span>}
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="px-4 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[44px] rounded-xl border border-line text-xs font-semibold text-ink"
          >
            বন্ধ করুন
          </button>
        </div>
      </div>
    </div>
  );
};

export default ActionSheet;
