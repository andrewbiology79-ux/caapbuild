import React, { useEffect, useState } from 'react';
import { PlusCircle, Layers, BookOpen, SlidersHorizontal, User, Trophy, ShieldAlert } from 'lucide-react';
import { Play } from 'lucide-react';
import { ExamModal } from '../../components/ExamModal';
import type { Paper } from '../../db/db';
import { Header } from '../../components/Header';
import { EmptyState } from '../../ui/EmptyState';
import { db, chapterDb } from '../../db/db';
import { useNavigation } from '../../utils/navigation';
import { toBn } from '../../utils/toBn';
import { getExamResults, percentOf, type ExamResult } from '../../utils/examResults';
import { getBackupReminderState } from '../../utils/backupHistory';
import type { TabType } from '../../components/BottomNav';

interface Counts {
  type: number;
  chapter: number;
  papers: number;
}

const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString('bn-BD', { day: 'numeric', month: 'short' });

/** Home / dashboard: counts, quick actions, backup reminder and recent exam results. */
export const HomeScreen: React.FC = () => {
  const { switchTab } = useNavigation();
  const [counts, setCounts] = useState<Counts>({ type: 0, chapter: 0, papers: 0 });
  const [results, setResults] = useState<ExamResult[]>([]);
  const [reminder, setReminder] = useState<{ daysSince: number | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [examPaperId, setExamPaperId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [type, chapter, papers, res] = await Promise.all([
          db.questions.count(),
          chapterDb.questions.count(),
          db.papers.count(),
          getExamResults(),
        ]);
        if (cancelled) return;
        const recent = await db.papers.orderBy('createdAt').reverse().limit(3).toArray();
        if (cancelled) return;
        setPapers(recent);
        setCounts({ type, chapter, papers });
        setResults(res.slice(0, 3));
        const st = getBackupReminderState(type + chapter + papers > 0);
        setReminder(st.due ? { daysSince: st.daysSince } : null);
      } catch (e) {
        console.warn('Home load failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats: Array<[string, number]> = [
    ['Type CQ প্রশ্ন', counts.type],
    ['Chapter CQ প্রশ্ন', counts.chapter],
    ['প্রশ্নপত্র', counts.papers],
  ];

  const actions: Array<{ tab: TabType; label: string; hint: string; icon: React.ElementType }> = [
    { tab: 'create', label: 'প্রশ্নপত্র তৈরি', hint: 'নির্বাচিত প্রশ্ন থেকে', icon: PlusCircle },
    { tab: 'typeCq', label: 'Type CQ', hint: 'ধরন অনুযায়ী প্রশ্ন', icon: Layers },
    { tab: 'chapterCq', label: 'Chapter CQ', hint: 'অধ্যায় অনুযায়ী প্রশ্ন', icon: BookOpen },
    { tab: 'filter', label: 'ফিল্টার', hint: 'বোর্ড/বছর/রেটিং দিয়ে', icon: SlidersHorizontal },
    { tab: 'profile', label: 'প্রোফাইল', hint: 'পরীক্ষা, ব্যাকআপ, ক্যাটেগরি', icon: User },
  ];

  return (
    <div className="flex flex-col flex-1 pb-24">
      <Header title="হোম" subtitle="Qb Collection & Exam" />
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {stats.map(([label, n]) => (
            <div key={label} className="bg-surface border border-line rounded-2xl py-3 text-center shadow-card">
              <p className="text-xl font-black text-brand-ink">{loading ? '…' : toBn(n)}</p>
              <p className="text-[0.625rem] text-ink-muted leading-tight px-1">{label}</p>
            </div>
          ))}
        </div>

        {reminder && (
          <button
            type="button"
            onClick={() => switchTab('profile')}
            className="w-full text-left bg-danger-soft border border-line rounded-2xl p-3 flex items-center gap-3 active:bg-press"
          >
            <ShieldAlert className="w-5 h-5 text-danger shrink-0" />
            <span className="text-xs text-ink">
              {reminder.daysSince === null
                ? 'এখনো কোনো ব্যাকআপ নেওয়া হয়নি — প্রোফাইল ট্যাবে গিয়ে নিন'
                : `শেষ ব্যাকআপের ${toBn(reminder.daysSince)} দিন পার হয়েছে — ব্যাকআপ নিন`}
            </span>
          </button>
        )}

        <div className="grid grid-cols-2 gap-2">
          {actions.map(({ tab, label, hint, icon: Icon }) => (
            <button
              key={tab}
              type="button"
              onClick={() => switchTab(tab)}
              className="bg-surface border border-line rounded-2xl p-3 text-left shadow-card active:bg-press"
            >
              <Icon className="w-5 h-5 text-brand mb-1.5" />
              <p className="text-sm font-bold text-ink">{label}</p>
              <p className="text-[0.6875rem] text-ink-muted">{hint}</p>
            </button>
          ))}
        </div>

        {papers.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-bold text-ink flex items-center gap-1.5">
              <Play className="w-4 h-4 text-brand-fg" /> পরীক্ষা শুরু করুন
            </p>
            {papers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setExamPaperId(p.id)}
                className="w-full text-left bg-surface border border-line rounded-2xl p-3 flex items-center gap-3 active:bg-press"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{p.title || p.shortName}</p>
                  <p className="text-[0.6875rem] text-ink-muted truncate">
                    {p.category} · {toBn(p.questionIds.length)}টি প্রশ্ন
                  </p>
                </div>
                <Play className="w-4 h-4 text-brand shrink-0" />
              </button>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-bold text-ink flex items-center gap-1.5">
            <Trophy className="w-4 h-4 text-brand-fg" /> সাম্প্রতিক পরীক্ষা
          </p>
          {results.length === 0 ? (
            <EmptyState
              title="এখনো কোনো পরীক্ষা দেওয়া হয়নি"
              description="প্রোফাইল ট্যাবে প্রশ্নপত্র খুলে হেডারের টাইমার আইকন থেকে পরীক্ষা শুরু করুন"
            />
          ) : (
            results.map((r) => (
              <div key={r.id} className="bg-surface border border-line rounded-2xl p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{r.paperName}</p>
                  <p className="text-[0.6875rem] text-ink-muted">{fmtDate(r.takenAt)}</p>
                </div>
                <p className="text-sm font-black text-brand-ink">
                  {toBn(r.gotMarks)}/{toBn(r.totalMarks)} · {toBn(percentOf(r))}%
                </p>
              </div>
            ))
          )}
        </div>
      </div>
      <ExamModal
        paperId={examPaperId}
        isOpen={Boolean(examPaperId)}
        onClose={() => {
          setExamPaperId(null);
          getExamResults().then((r) => setResults(r.slice(0, 3))).catch(() => {});
        }}
      />
    </div>
  );
};

export default HomeScreen;
