import React from 'react';
import { BookOpen, ChevronRight, FileText, FolderKanban, Layers, ShieldAlert } from 'lucide-react';
import { Header } from '../../components/Header';
import type { MenuItem } from '../../components/KebabMenu';
import { toBn } from '../../utils/toBn';

export interface ProfileRow {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  action: () => void;
}

export interface ProfileHomeProps {
  menuItems: MenuItem[];
  rows: ProfileRow[];
  loading: boolean;
  paperCount: number;
  questionCount: number;
  chapterQuestionCount: number;
  categoryCount: number;
  restoreFileInputRef: React.RefObject<HTMLInputElement | null>;
  onRestoreFileSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** set when a backup reminder is due: how many days since the last full backup (null = never) */
  backupReminder?: { daysSince: number | null } | null;
  onBackupReminderOpen?: () => void;
  onBackupReminderSnooze?: () => void;
}

const StatCard: React.FC<{ icon: React.ReactNode; value: string; label: string }> = ({ icon, value, label }) => (
  <div className="bg-surface rounded-2xl p-4 border border-line shadow-card flex flex-col justify-between gap-3">
    <div className="w-9 h-9 rounded-xl bg-brand-soft flex items-center justify-center text-brand">{icon}</div>
    <div>
      <span className="text-2xl font-black text-ink tracking-tight">{value}</span>
      <p className="text-xs font-semibold text-ink-muted mt-0.5">{label}</p>
    </div>
  </div>
);

/** Profile landing view: statistics + data management / settings shortcuts. */
export const ProfileHome: React.FC<ProfileHomeProps> = ({
  menuItems,
  rows,
  loading,
  paperCount,
  questionCount,
  chapterQuestionCount,
  categoryCount,
  restoreFileInputRef,
  onRestoreFileSelected,
  backupReminder,
  onBackupReminderOpen,
  onBackupReminderSnooze,
}) => (
  <>
    <Header title="প্রোফাইল (Profile)" subtitle="পরিসংখ্যান, ব্যাকআপ ও সেটিংস" menuItems={menuItems} />

    <main className="flex-1 p-4 space-y-4">
      {backupReminder && (
        <section
          role="alert"
          className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-[#FEF9C3] dark:bg-[#422006] p-3.5 space-y-2.5"
        >
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-amber-950 dark:text-amber-200">ব্যাকআপ নেওয়ার সময় হয়েছে</p>
              <p className="text-[0.6875rem] text-[#713F12] dark:text-amber-200 leading-snug mt-0.5">
                {backupReminder.daysSince === null
                  ? 'এখনো কোনো ফুল ব্যাকআপ নেওয়া হয়নি। ফোন হারালে বা অ্যাপ মুছলে সব ডাটা চলে যেতে পারে।'
                  : `শেষ ফুল ব্যাকআপের পর ${toBn(backupReminder.daysSince)} দিন পার হয়েছে।`}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onBackupReminderOpen}
              className="flex-1 min-h-[40px] rounded-xl bg-brand text-white text-xs font-bold"
            >
              ব্যাকআপ নিন
            </button>
            <button
              type="button"
              onClick={onBackupReminderSnooze}
              className="min-h-[40px] px-4 rounded-xl bg-surface border border-line text-ink text-xs font-bold"
            >
              পরে
            </button>
          </div>
        </section>
      )}

      <section className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<FileText className="w-5 h-5" />}
          value={loading ? '...' : toBn(paperCount)}
          label="তৈরি প্রশ্নপত্র"
        />
        <StatCard
          icon={<FolderKanban className="w-5 h-5" />}
          value={loading ? '...' : toBn(categoryCount)}
          label="ক্যাটেগরি"
        />
        <StatCard
          icon={<Layers className="w-5 h-5" />}
          value={loading ? '...' : toBn(questionCount)}
          label="Type CQ প্রশ্ন"
        />
        <StatCard
          icon={<BookOpen className="w-5 h-5" />}
          value={loading ? '...' : toBn(chapterQuestionCount)}
          label="Chapter CQ প্রশ্ন"
        />
      </section>

      <section className="space-y-2.5">
        <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wider px-1">
          ডাটা ব্যবস্থাপনা ও সেটিংস
        </h2>
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.id}
              onClick={row.action}
              className="bg-surface hover:border-brand rounded-2xl p-3.5 border border-line shadow-card flex items-center justify-between gap-2 cursor-pointer group transition-colors active:scale-[0.99]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-app flex items-center justify-center shrink-0 group-hover:bg-brand-soft transition-colors">
                  {row.icon}
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-bold text-ink group-hover:text-brand transition-colors">{row.title}</h3>
                  <p className="text-[0.6875rem] text-ink-muted leading-snug line-clamp-1 mt-0.5">{row.description}</p>
                </div>
              </div>
              <div className="min-h-[44px] min-w-[32px] flex items-center justify-end text-ink-muted group-hover:text-brand transition-colors">
                <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Hidden file input for database restore */}
      <input
        ref={restoreFileInputRef}
        type="file"
        accept=".json,application/json"
        onChange={onRestoreFileSelected}
        className="hidden"
      />
    </main>
  </>
);

export default ProfileHome;
