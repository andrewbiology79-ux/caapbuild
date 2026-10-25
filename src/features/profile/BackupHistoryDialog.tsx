import React, { useEffect, useState } from 'react';
import { X, HardDriveDownload, Trash2 } from 'lucide-react';
import { Button } from '../../ui/Button';
import { toBn } from '../../utils/toBn';
import {
  REMINDER_OPTIONS,
  clearBackupHistory,
  getBackupHistory,
  getReminderDays,
  setReminderDays,
  type BackupKind,
  type BackupLogEntry,
} from '../../utils/backupHistory';

export interface BackupHistoryDialogProps {
  isOpen: boolean;
  busy: boolean;
  onBackupNow: () => Promise<void> | void;
  onClose: () => void;
}

const KIND_LABEL: Record<BackupKind, string> = {
  full: 'ফুল ব্যাকআপ',
  type: 'Type CQ এক্সপোর্ট',
  chapter: 'Chapter CQ এক্সপোর্ট',
};

const fmt = (ts: number) =>
  new Date(ts).toLocaleString('bn-BD', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Backup log + "remind me every N days" chooser. */
export const BackupHistoryDialog: React.FC<BackupHistoryDialogProps> = ({ isOpen, busy, onBackupNow, onClose }) => {
  const [entries, setEntries] = useState<BackupLogEntry[]>([]);
  const [days, setDays] = useState<number>(7);

  useEffect(() => {
    if (!isOpen) return;
    setEntries(getBackupHistory());
    setDays(getReminderDays());
  }, [isOpen, busy]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ব্যাকআপ ইতিহাস"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[390px] max-h-[85%] bg-surface rounded-t-3xl sm:rounded-3xl border border-line shadow-pop flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
          <h3 className="text-sm font-bold text-ink">ব্যাকআপ ইতিহাস ও রিমাইন্ডার</h3>
          <button
            type="button"
            aria-label="বন্ধ করুন"
            onClick={onClose}
            className="w-9 h-9 min-h-0 rounded-full flex items-center justify-center text-ink-muted hover:bg-app"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pb-4 space-y-4 overflow-y-auto">
          <div className="space-y-2">
            <p className="text-xs font-bold text-ink">কত দিন পর পর মনে করিয়ে দেবে?</p>
            <div className="flex flex-wrap gap-2">
              {REMINDER_OPTIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setReminderDays(d);
                    setDays(d);
                  }}
                  className={`min-h-[36px] px-3 rounded-full text-xs font-bold border transition-colors ${
                    days === d
                      ? 'bg-brand text-white border-brand'
                      : 'bg-surface text-ink border-line hover:bg-hover'
                  }`}
                >
                  {d === 0 ? 'বন্ধ' : `${toBn(d)} দিন`}
                </button>
              ))}
            </div>
          </div>

          <Button block onClick={() => onBackupNow()} disabled={busy}>
            <HardDriveDownload className="w-4 h-4" />
            {busy ? 'ব্যাকআপ তৈরি হচ্ছে…' : 'এখনই ফুল ব্যাকআপ নিন'}
          </Button>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-ink">আগের ব্যাকআপ</p>
              {entries.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    clearBackupHistory();
                    setEntries([]);
                  }}
                  className="min-h-0 text-[0.6875rem] font-semibold text-danger flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> তালিকা মুছুন
                </button>
              )}
            </div>
            {entries.length === 0 ? (
              <p className="text-xs text-ink-muted bg-app rounded-xl p-3 text-center">এখনো কোনো ব্যাকআপ নেওয়া হয়নি</p>
            ) : (
              entries.map((b) => (
                <div key={b.id} className="bg-app rounded-xl p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-ink">{KIND_LABEL[b.kind]}</p>
                    <p className="text-[0.6875rem] text-ink-muted">{fmt(b.at)}</p>
                  </div>
                  <p className="text-[0.6875rem] text-ink-muted text-right shrink-0">
                    {toBn(b.questions)} প্রশ্ন
                    {b.papers > 0 && <> · {toBn(b.papers)} প্রশ্নপত্র</>}
                  </p>
                </div>
              ))
            )}
            <p className="text-[0.6875rem] text-ink-muted leading-snug">
              ফাইলটি আপনার ফোনে/শেয়ার করা জায়গায় সেভ হয়; এখানে শুধু কবে ব্যাকআপ নেওয়া হয়েছে তার রেকর্ড থাকে।
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BackupHistoryDialog;
