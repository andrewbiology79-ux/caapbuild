import React, { useState, useEffect, useRef } from 'react';

export interface PromptDialogProps {
  isOpen: boolean;
  title: string;
  initialValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export const PromptDialog: React.FC<PromptDialogProps> = ({
  isOpen,
  title,
  initialValue = '',
  placeholder = 'নাম লিখুন...',
  confirmText = 'সংরক্ষণ',
  cancelText = 'বাতিল',
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onConfirm(value.trim());
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[340px] bg-surface rounded-2xl p-5 shadow-2xl border border-line space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="prompt-dialog-title" className="text-base font-bold text-ink">
          {title}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-line bg-app/50 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand focus:bg-surface transition-all"
          />

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-line text-sm font-medium text-ink bg-surface hover:bg-hover active:bg-hover transition-colors"
            >
              {cancelText}
            </button>
            <button
              type="submit"
              disabled={!value.trim()}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand hover:bg-brand-strong active:bg-[#202E91] disabled:opacity-50 disabled:pointer-events-none transition-colors"
            >
              {confirmText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PromptDialog;
