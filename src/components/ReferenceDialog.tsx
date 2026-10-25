import React, { useEffect } from 'react';
import { BookMarked, X } from 'lucide-react';
import { useNavigation } from '../utils/navigation';

export interface ReferenceDialogProps {
  isOpen: boolean;
  /** where the question was collected from (empty = not set) */
  reference?: string;
  onClose: () => void;
}

/** Small dialog opened from the question card's 3-dot menu ("রেফারেন্স দেখুন") */
export const ReferenceDialog: React.FC<ReferenceDialogProps> = ({ isOpen, reference, onClose }) => {
  const { registerBackHandler } = useNavigation();

  useEffect(() => {
    if (!isOpen) return;
    const unregister = registerBackHandler(() => {
      onClose();
      return true;
    });
    return unregister;
  }, [isOpen, onClose, registerBackHandler]);

  if (!isOpen) return null;

  const text = (reference || '').trim();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="রেফারেন্স"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[340px] bg-surface rounded-2xl p-5 shadow-2xl border border-line space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="shrink-0 w-10 h-10 rounded-full bg-brand-soft text-brand-fg flex items-center justify-center">
              <BookMarked className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-ink">রেফারেন্স</h3>
          </div>
          <button
            type="button"
            aria-label="বন্ধ করুন"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 flex items-center justify-center rounded-full text-ink-muted hover:bg-hover"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {text ? (
          <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap break-words rounded-xl bg-surface-2 border border-line p-3">
            {text}
          </p>
        ) : (
          <p className="text-sm text-ink-muted leading-relaxed">
            এই প্রশ্নে কোনো রেফারেন্স দেওয়া নেই। প্রশ্ন সম্পাদনার "Full Editor" থেকে রেফারেন্স যোগ করতে পারবেন।
          </p>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-[44px] rounded-xl bg-brand hover:bg-brand-strong text-white text-sm font-semibold"
        >
          ঠিক আছে
        </button>
      </div>
    </div>
  );
};

export default ReferenceDialog;
