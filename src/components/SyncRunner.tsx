import React, { useEffect, useRef, useState } from 'react';
import { useToast } from './Toast';
import { isNativeApp } from '../storage/nativeStore';
import {
  isFolderSyncEnabled,
  enableFolderSync,
  startFolderSync,
  setMassDeleteConfirm,
  type SyncReport,
} from '../storage/syncEngine';
import { SyncPreviewDialog } from './SyncPreviewDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { CategorySyncDialog } from './CategorySyncDialog';
import { syncController, useSyncDialogState, presentAutoSync } from '../storage/syncDialogStore';
import { categorySyncController, useCategoryDialogState } from '../storage/categorySyncStore';

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
  const dialogState = useSyncDialogState();
  const categoryState = useCategoryDialogState();
  // ধাপ ৪ (সমস্যা ৩): ফোল্ডার না পাওয়া অনেক আইটেম মোছার জিজ্ঞাসা - ব্রাউজারের window.confirm-এর বদলে নিজস্ব ডায়ালগ
  const [massAsk, setMassAsk] = useState<{ count: number; total: number; resolve: (ok: boolean) => void } | null>(null);

  useEffect(() => {
    if (!isNativeApp()) return;

    setMassDeleteConfirm(
      (count, total) =>
        new Promise<boolean>((resolve) => {
          // আগের জিজ্ঞাসা খোলা থাকলে সেটা "না" ধরে বন্ধ
          setMassAsk((prev) => {
            prev?.resolve(false);
            return { count, total, resolve };
          });
        })
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
        (message) => showToast(`ফোল্ডারে লিখতে সমস্যা: ${message}`, 5000),
        { present: presentAutoSync }
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
      setMassAsk((prev) => {
        prev?.resolve(false);
        return null;
      });
    };
  }, [showToast]);

  // ধাপ ৪: মেনু থেকে শুরু করা সিঙ্কের উইন্ডো (সব স্ক্রিনের ওপরে, একটাই)।
  // ১গ-২খ: ক্যাটেগরি সিঙ্কের উইন্ডোও এখানে; দুটো একসাথে খোলা যায় না (দুই নিয়ন্ত্রক একে অন্যকে আটকায়)।
  const answerMass = (ok: boolean) => {
    massAsk?.resolve(ok);
    setMassAsk(null);
  };

  return (
    <>
      <ConfirmDialog
        isOpen={massAsk !== null}
        title="ফোল্ডার পাওয়া যাচ্ছে না"
        message={
          massAsk
            ? `স্টোরেজ ফোল্ডারে ${massAsk.total}টির মধ্যে ${massAsk.count}টি ফোল্ডার পাওয়া যাচ্ছে না।\n\nএগুলো অ্যাপ থেকেও মুছে ফেলবেন?`
            : ''
        }
        confirmText="অ্যাপ থেকেও মুছুন"
        cancelText="বাতিল"
        isDestructive
        autoFocusCancel
        onConfirm={() => answerMass(true)}
        onCancel={() => answerMass(false)}
      />
      <SyncPreviewDialog
        state={dialogState}
        onConfirm={syncController.confirm}
        onCancel={syncController.cancel}
        onClose={syncController.close}
      />
      <CategorySyncDialog
        state={categoryState}
        onConfirm={(opts) => {
          categorySyncController.confirm(opts);
        }}
        onSetDeleteMode={(mode) => {
          categorySyncController.setDeleteMode(mode);
        }}
        onCancel={categorySyncController.cancel}
        onClose={categorySyncController.close}
      />
    </>
  );
};

export default SyncRunner;
