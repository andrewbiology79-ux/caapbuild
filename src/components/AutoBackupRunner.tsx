import React, { useEffect } from 'react';
import { useToast } from './Toast';
import { startAutoBackupScheduler } from '../utils/autoBackup';

/** Invisible component: runs the daily automatic backup (see utils/autoBackup.ts) */
export const AutoBackupRunner: React.FC = () => {
  const { showToast } = useToast();

  useEffect(() => {
    return startAutoBackupScheduler((r) => {
      if (r.status === 'done') {
        showToast(`আজকের অটো ব্যাকআপ হয়েছে: ${r.folder}`, 4500);
        if (r.staleUnfinished) {
          showToast(`${r.staleUnfinished}টি অসমাপ্ত ব্যাকআপ ফোল্ডার (_unfinished) পড়ে আছে - চাইলে নিজে মুছে দাও`, 6000);
        }
      } else if (r.status === 'no-access') {
        showToast('অটো ব্যাকআপের জন্য স্টোরেজ অনুমতি দরকার', 4000);
      } else if (r.status === 'error') {
        showToast(r.message, 6000);
      }
    });
  }, [showToast]);

  return null;
};

export default AutoBackupRunner;
