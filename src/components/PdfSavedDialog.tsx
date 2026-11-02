import React, { useEffect, useState } from 'react';
import { CheckCircle2, FileText } from 'lucide-react';
import {
  subscribePdfSavedDialog,
  closePdfSavedDialog,
  openSavedFile,
  getFolderOfPath,
} from '../utils/storageAccess';

/**
 * Shown after a PDF is saved to the phone: tells where it was saved and lets the user
 * open the PDF directly in another app with the "Open" button.
 */
export const PdfSavedDialog: React.FC = () => {
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [openFailed, setOpenFailed] = useState(false);

  useEffect(() => {
    return subscribePdfSavedDialog((path) => {
      setSavedPath(path);
      setOpenFailed(false);
    });
  }, []);

  if (!savedPath) return null;

  const handleOpen = async () => {
    setOpenFailed(false);
    const ok = await openSavedFile(savedPath);
    if (ok) {
      closePdfSavedDialog();
    } else {
      setOpenFailed(true);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
    >
      <div className="w-full max-w-[340px] bg-white dark:bg-slate-900 rounded-2xl p-5 border border-[#D5D9E2] dark:border-slate-700 shadow-2xl space-y-3.5">
        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
          <CheckCircle2 className="w-5 h-5" />
          <span>PDF সেভ হয়েছে</span>
        </div>

        <div className="flex items-start gap-2 text-[11px] text-[#64748B] dark:text-slate-400 bg-[#F2F4F8] dark:bg-slate-800 rounded-xl p-2.5">
          <FileText className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="break-all">
            <span className="font-semibold">{getFolderOfPath(savedPath)}</span>
            <br />
            {savedPath.slice(savedPath.lastIndexOf('/') + 1)}
          </span>
        </div>

        {openFailed && (
          <p className="text-xs text-red-600 dark:text-red-400 font-medium leading-relaxed">
            PDF খোলা যায়নি। ফোনে কোনো PDF ভিউয়ার অ্যাপ আছে কিনা দেখুন, অথবা ফাইল ম্যানেজার থেকে উপরের
            ফোল্ডারে গিয়ে খুলুন।
          </p>
        )}

        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            onClick={handleOpen}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#3B4FD8] hover:bg-[#2A3BB0] text-white text-xs font-bold flex items-center justify-center gap-1.5"
          >
            <FileText className="w-4 h-4" />
            <span>Open (PDF খুলুন)</span>
          </button>
          <button
            type="button"
            onClick={closePdfSavedDialog}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-[#D5D9E2] dark:border-slate-700 text-xs font-semibold text-[#1B1F2A] dark:text-slate-200"
          >
            ঠিক আছে
          </button>
        </div>
      </div>
    </div>
  );
};

export default PdfSavedDialog;
