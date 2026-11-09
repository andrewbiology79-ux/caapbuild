import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from './Toast';
import ConfirmDialog from './ConfirmDialog';
import { setDeleteConfirmHandler, describeDeleteRequest, type DeleteRequest } from '../storage/deleteConfirm';
import { isNativeApp } from '../storage/nativeStore';
import {
  isFolderSyncEnabled,
  enableFolderSync,
  startFolderSync,
  type SyncReport,
} from '../storage/syncEngine';

interface PendingAsk {
  req: DeleteRequest;
  resolve: (ok: boolean) => void;
}

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

  // নিজস্ব নিশ্চিতকরণ ডায়ালগ: স্ক্যান অ্যাপ থেকে কিছু মুছতে চাইলে এখানে জিজ্ঞাসা (একটা একটা করে, সারিতে)।
  // ডিফল্ট "রেখে দাও" - Back / বাইরে চাপ / Esc সবই রেখে দেওয়া।
  const queueRef = useRef<PendingAsk[]>([]);
  const [current, setCurrent] = useState<PendingAsk | null>(null);
  const currentRef = useRef<PendingAsk | null>(null); // state-এর সাথে হাতে মিলিয়ে রাখা (render-এ নয়)

  const pump = useCallback(() => {
    if (currentRef.current) return;
    const next = queueRef.current.shift() ?? null;
    currentRef.current = next;
    setCurrent(next);
  }, []);

  const answer = useCallback(
    (ok: boolean) => {
      const c = currentRef.current;
      if (!c) return;
      currentRef.current = null;
      setCurrent(null);
      c.resolve(ok);
      setTimeout(pump, 0);
    },
    [pump]
  );

  useEffect(() => {
    if (!isNativeApp()) return;

    setDeleteConfirmHandler(
      (req) =>
        new Promise<boolean>((resolve) => {
          queueRef.current.push({ req, resolve });
          pump();
        })
    );

    const begin = () => {
      stopRef.current?.();
      stopRef.current = startFolderSync(
        (r) => {
          if (r.error) showToast(`সিঙ্ক: ${r.error}`, 4500);
          else if (r.warnings.length) {
            r.warnings.forEach((w) => console.warn('Folder sync warning:', w));
            const more = r.warnings.length > 1 ? ` (আরও ${r.warnings.length - 1}টি সতর্কবার্তা)` : '';
            showToast(r.warnings[0] + more, 6500);
          }
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
      setDeleteConfirmHandler(null);
      // খোলা/সারির প্রশ্ন "রেখে দাও" ধরে ছেড়ে দেওয়া (স্ক্যান যাতে আটকে না থাকে)
      const open = currentRef.current;
      currentRef.current = null;
      open?.resolve(false);
      queueRef.current.splice(0).forEach((p) => p.resolve(false));
    };
  }, [showToast, pump]);

  const texts = current ? describeDeleteRequest(current.req) : null;
  return (
    <ConfirmDialog
      isOpen={!!current}
      title={texts?.title}
      message={texts?.message}
      confirmText={texts?.confirmText}
      cancelText={texts?.cancelText}
      isDestructive
      onConfirm={() => answer(true)}
      onCancel={() => answer(false)}
    />
  );
};

export default SyncRunner;
