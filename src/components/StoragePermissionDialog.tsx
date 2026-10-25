import React, { useEffect, useState } from 'react';
import { FolderOpen, ShieldCheck } from 'lucide-react';
import {
  subscribeStoragePermissionDialog,
  resolveStoragePermissionDialog,
  openStorageAccessSettings,
  PDF_SAVE_FOLDER,
} from '../utils/storageAccess';

/**
 * Explains why "All files access" is needed and opens the Android permission window.
 * Shown automatically when a PDF should be saved but the permission is missing.
 */
export const StoragePermissionDialog: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [notGranted, setNotGranted] = useState(false);

  useEffect(() => {
    return subscribeStoragePermissionDialog((open) => {
      setIsOpen(open);
      if (open) {
        setWaiting(false);
        setNotGranted(false);
      }
    });
  }, []);

  if (!isOpen) return null;

  const handleAllow = async () => {
    setWaiting(true);
    setNotGranted(false);
    const granted = await openStorageAccessSettings();
    setWaiting(false);
    if (granted) {
      resolveStoragePermissionDialog(true);
    } else {
      setNotGranted(true);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
    >
      <div className="w-full max-w-[340px] bg-surface rounded-2xl p-5 border border-line shadow-2xl space-y-3.5">
        <div className="flex items-center gap-2 text-brand font-bold text-sm">
          <ShieldCheck className="w-5 h-5" />
          <span>স্টোরেজ অনুমতি প্রয়োজন</span>
        </div>

        <p className="text-xs text-ink leading-relaxed">
          PDF সরাসরি ফোনে সেভ করতে অ্যাপটিকে <b>“সব ফাইল ম্যানেজ করার অনুমতি” (Allow access to manage all files)</b> দিতে
          হবে। নিচের বাটনে চাপ দিলে সেটিংস উইন্ডো খুলবে — সেখানে এই অ্যাপের পাশের সুইচটি চালু করে ফিরে আসুন।
        </p>

        <div className="flex items-start gap-2 text-[11px] text-ink-muted bg-app dark:bg-slate-800 rounded-xl p-2.5">
          <FolderOpen className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            PDF সেভ হবে: <span className="font-semibold">{PDF_SAVE_FOLDER}</span>
          </span>
        </div>

        {notGranted && (
          <p className="text-xs text-red-600 dark:text-red-400 font-medium">
            অনুমতি এখনো দেওয়া হয়নি। অনুগ্রহ করে সেটিংসে গিয়ে অনুমতি চালু করুন।
          </p>
        )}

        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            disabled={waiting}
            onClick={handleAllow}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-strong text-white text-xs font-bold disabled:opacity-60"
          >
            {waiting ? 'সেটিংস থেকে ফিরে আসার অপেক্ষা…' : 'অনুমতি দিন (সেটিংস খুলুন)'}
          </button>
          <button
            type="button"
            onClick={() => resolveStoragePermissionDialog(false)}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-line text-xs font-semibold text-ink"
          >
            এখন না (শুধু শেয়ার করব)
          </button>
        </div>
      </div>
    </div>
  );
};

export default StoragePermissionDialog;
