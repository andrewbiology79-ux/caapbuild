import React, { useEffect, useRef } from 'react';
import { useToast } from './Toast';
import { isNativeApp } from '../storage/nativeStore';
import {
  isFolderSyncEnabled,
  enableFolderSync,
  startFolderSync,
  setMassDeleteConfirm,
  type SyncReport,
} from '../storage/syncEngine';

/** Text for a sync result ("2টি নতুন, 1টি নাম বদল, ...") */
export function describeSyncReport(r: SyncReport): string {
  const parts: string[] = [];
  if (r.added) parts.push(`${r.added}টি নতুন ফোল্ডার`);
  if (r.renamed) parts.push(`${r.renamed}টির নাম/অবস্থান বদল`);
  if (r.deleted) parts.push(`${r.deleted}টি মোছা`);
  if (r.topicsUpdated) parts.push(`${r.topicsUpdated}টি টাইপের প্রশ্ন আপডেট`);
  return parts.length ? `ফোল্ডার থেকে সিঙ্ক: ${parts.join(', ')}` : '';
}

/**
 * Invisible component (like AutoBackupRunner):
 *  - first launch after the update: moves the database into the storage folders (once)
 *  - afterwards: keeps the app and Download/QB Collection/Question_Bank in sync
 */
export const SyncRunner: React.FC = () => {
  const { showToast } = useToast();
  const stopRef = useRef<(() => void) | null>(null);
  const triedRef = useRef(false);

  useEffect(() => {
    if (!isNativeApp()) return;

    setMassDeleteConfirm(
      (count, total) =>
        window.confirm(`স্টোরেজ ফোল্ডারে ${total}টির মধ্যে ${count}টি ফোল্ডার পাওয়া যাচ্ছে না।\n\nএগুলো অ্যাপ থেকেও মুছে ফেলবেন?`)
    );

    const begin = () => {
      stopRef.current?.();
      stopRef.current = startFolderSync(
        (r) => {
          if (r.error) showToast(`সিঙ্ক: ${r.error}`, 4500);
          else if (r.warnings.length) showToast(r.warnings[0], 5000);
          const text = describeSyncReport(r);
          if (text) showToast(text, 3500);
        },
        (message) => showToast(`ফোল্ডারে লিখতে সমস্যা: ${message}`, 5000)
      );
    };

    let timer: ReturnType<typeof setTimeout> | null = null;
    if (isFolderSyncEnabled()) {
      begin();
    } else if (!triedRef.current) {
      triedRef.current = true;
      // first time: move the existing data into the folders
      timer = setTimeout(async () => {
        showToast('প্রশ্ন ফোল্ডারে সিঙ্ক চালু হচ্ছে…', 3000);
        const res = await enableFolderSync((t) => showToast(t, 2500));
        if (res.ok) {
          showToast(`ফোল্ডার সিঙ্ক চালু হয়েছে (${res.topics}টি টাইপ, ${res.questions}টি প্রশ্ন)`, 4500);
          begin();
        } else {
          showToast(`ফোল্ডার সিঙ্ক চালু হয়নি: ${res.message}`, 5500);
        }
      }, 2500);
    }

    return () => {
      if (timer) clearTimeout(timer);
      stopRef.current?.();
      stopRef.current = null;
      setMassDeleteConfirm(null);
    };
  }, [showToast]);

  return null;
};

export default SyncRunner;
