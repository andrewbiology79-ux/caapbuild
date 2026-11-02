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
        className="w-full max-w-[340px] bg-white rounded-2xl p-5 shadow-2xl border border-[#D5D9E2] space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="shrink-0 w-10 h-10 rounded-full bg-[#EEF2FF] text-[#3B4FD8] flex items-center justify-center">
              <BookMarked className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-[#1B1F2A]">রেফারেন্স</h3>
          </div>
          <button
            type="button"
            aria-label="বন্ধ করুন"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 flex items-center justify-center rounded-full text-[#64748B] hover:bg-[#F2F4F8]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {text ? (
          <p className="text-sm text-[#1B1F2A] leading-relaxed whitespace-pre-wrap break-words rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-3">
            {text}
          </p>
        ) : (
          <p className="text-sm text-[#64748B] leading-relaxed">
            এই প্রশ্নে কোনো রেফারেন্স দেওয়া নেই। প্রশ্ন সম্পাদনার "Full Editor" থেকে রেফারেন্স যোগ করতে পারবেন।
          </p>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-[44px] rounded-xl bg-[#3B4FD8] hover:bg-[#2A3BB0] text-white text-sm font-semibold"
        >
          ঠিক আছে
        </button>
      </div>
    </div>
  );
};

export default ReferenceDialog;
