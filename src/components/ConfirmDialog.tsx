import React, { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title = 'আপনি কি নিশ্চিত?',
  message = 'এই কাজটি সম্পন্ন করার বিষয়ে কি আপনি নিশ্চিত?',
  confirmText = 'হ্যাঁ',
  cancelText = 'না',
  isDestructive = false,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[340px] bg-white rounded-2xl p-5 shadow-2xl border border-[#D5D9E2] space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
              isDestructive ? 'bg-red-50 text-red-600' : 'bg-[#EEF2FF] text-[#3B4FD8]'
            }`}
          >
            <AlertCircle className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 id="confirm-dialog-title" className="text-base font-semibold text-[#1B1F2A]">
              {title}
            </h3>
            {message && <p className="text-sm text-[#64748B] leading-relaxed">{message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-[#D5D9E2] text-sm font-medium text-[#1B1F2A] bg-white hover:bg-[#F2F4F8] active:bg-[#E5E9F0] transition-colors focus:outline-none focus:ring-2 focus:ring-[#3B4FD8]"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`w-full min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-colors focus:outline-none focus:ring-2 ${
              isDestructive
                ? 'bg-red-600 hover:bg-red-700 active:bg-red-800 focus:ring-red-400'
                : 'bg-[#3B4FD8] hover:bg-[#2A3BB0] active:bg-[#202E91] focus:ring-[#3B4FD8]'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
