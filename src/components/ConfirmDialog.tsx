import React, { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';

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
        className="w-full max-w-[340px] bg-surface rounded-2xl p-5 shadow-pop border border-line space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
              isDestructive ? 'bg-danger-soft text-danger' : 'bg-brand-soft text-brand'
            }`}
          >
            <AlertCircle className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 id="confirm-dialog-title" className="text-base font-semibold text-ink">
              {title}
            </h3>
            {message && <p className="text-sm text-ink-muted leading-relaxed">{message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button variant="secondary" onClick={onCancel} block>
            {cancelText}
          </Button>
          <Button variant={isDestructive ? 'danger' : 'primary'} onClick={onConfirm} block>
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
