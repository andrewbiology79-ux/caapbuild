import React from 'react';
import { Capacitor } from '@capacitor/core';
import { toBn } from '../../utils/toBn';
import { openSavedFolder, PDF_SAVE_FOLDER } from '../../utils/storageAccess';
import type { CategoriesPdfResult } from '../../utils/pdfGenerator';
import { Button } from '../../ui/Button';

export const PdfProgressDialog: React.FC<{ progress: { done: number; total: number } | null }> = ({ progress }) => {
  if (!progress) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-[300px] bg-surface rounded-2xl p-5 text-center space-y-2 shadow-pop">
        <p className="text-sm font-bold text-ink">PDF বানানো হচ্ছে…</p>
        <p className="text-xs text-ink-muted">
          {toBn(Math.min(progress.done + 1, progress.total))} / {toBn(progress.total)} — অনুগ্রহ করে অপেক্ষা করুন
        </p>
      </div>
    </div>
  );
};

export const PdfResultDialog: React.FC<{ result: CategoriesPdfResult | null; onClose: () => void }> = ({
  result,
  onClose,
}) => {
  if (!result) return null;
  const native = Capacitor.isNativePlatform();
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-[340px] bg-surface rounded-2xl p-5 shadow-pop space-y-3">
        <p className="text-sm font-bold text-ink">{toBn(result.saved)}টি PDF সেভ হয়েছে</p>
        {result.folders.length > 0 && native && (
          <div className="text-xs text-ink-muted space-y-1 max-h-40 overflow-y-auto">
            {result.folders.map((f) => (
              <p key={f.folder} className="break-all">
                <span className="font-semibold text-ink">{f.folder}</span> ({toBn(f.saved)}টি)
              </p>
            ))}
          </div>
        )}
        {result.emptyCategories.length > 0 && (
          <p className="text-[0.6875rem] text-amber-600">
            প্রশ্নপত্র না থাকায় বাদ: {result.emptyCategories.join(', ')}
          </p>
        )}
        {result.failed.length > 0 && (
          <p className="text-[0.6875rem] text-danger break-words">তৈরি করা যায়নি: {result.failed.join(', ')}</p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          {native && result.folders.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                const target = result.folders.length === 1 ? result.folders[0].folder : PDF_SAVE_FOLDER;
                await openSavedFolder(`${target}/x.pdf`);
              }}
            >
              ফোল্ডার খুলুন
            </Button>
          )}
          <Button size="sm" onClick={onClose}>
            ঠিক আছে
          </Button>
        </div>
      </div>
    </div>
  );
};
