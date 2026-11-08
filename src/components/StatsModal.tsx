import React, { useEffect, useMemo, useState } from 'react';
import { X, BarChart3 } from 'lucide-react';
import { loadFilterDataset, rowBoards, type FilterRow } from '../utils/filterEngine';
import { toBn } from '../utils/toBn';
import type { CqScope } from '../db/db';

export interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ChapterStat {
  key: string;
  source: CqScope;
  subject: string;
  chapter: string;
  total: number;
  /** question type (ক/খ/গ/ঘ…) -> count */
  types: Record<string, number>;
  /** rating 1..5 -> count */
  ratings: number[];
  used: number;
  /** questions that came in at least one board exam */
  inBoards: number;
  /** total board appearances (a question that came in 2 boards counts 2) */
  boardAppearances: number;
}

const SOURCE_FILTERS: Array<{ id: 'all' | CqScope; label: string }> = [
  { id: 'all', label: 'সব' },
  { id: 'type', label: 'Type CQ' },
  { id: 'chapter', label: 'Chapter CQ' },
];

const TYPE_ORDER = ['ক', 'খ', 'গ', 'ঘ'];

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** Plain CSS bar: no chart library needed */
const Bar: React.FC<{ value: number; max: number; className?: string }> = ({ value, max, className }) => (
  <div className="h-2 rounded-full bg-[#E5E9F0] dark:bg-slate-700 overflow-hidden">
    <div
      className={`h-full rounded-full ${className || 'bg-[#3B4FD8]'}`}
      style={{ width: `${max > 0 ? Math.max(value > 0 ? 3 : 0, Math.round((value / max) * 100)) : 0}%` }}
    />
  </div>
);

export const StatsModal: React.FC<StatsModalProps> = ({ isOpen, onClose }) => {
  const [rows, setRows] = useState<FilterRow[] | null>(null);
  const [error, setError] = useState(false);
  const [source, setSource] = useState<'all' | CqScope>('all');

  // Numbers are calculated only when this screen is opened (never at app start)
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setRows(null);
    setError(false);
    loadFilterDataset()
      .then((ds) => {
        if (!cancelled) setRows(ds.rows);
      })
      .catch((e) => {
        console.error('Stats load failed:', e);
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const { chapters, totals, boardTotals } = useMemo(() => {
    const map = new Map<string, ChapterStat>();
    const boardCount = new Map<string, number>();
    const t = { total: 0, used: 0, inBoards: 0 };
    for (const r of rows ?? []) {
      if (source !== 'all' && r.source !== source) continue;
      const key = `${r.source}|${r.subjectName}|${r.chapterName}`;
      let c = map.get(key);
      if (!c) {
        c = {
          key,
          source: r.source,
          subject: r.subjectName,
          chapter: r.chapterName,
          total: 0,
          types: {},
          ratings: [0, 0, 0, 0, 0],
          used: 0,
          inBoards: 0,
          boardAppearances: 0,
        };
        map.set(key, c);
      }
      c.total += 1;
      t.total += 1;
      const type = r.question.type || '?';
      c.types[type] = (c.types[type] || 0) + 1;
      const rating = Math.min(5, Math.max(1, Math.round(r.question.rating || 3)));
      c.ratings[rating - 1] += 1;
      if (r.usages.length > 0) {
        c.used += 1;
        t.used += 1;
      }
      const boards = rowBoards(r);
      if (boards.length > 0) {
        c.inBoards += 1;
        t.inBoards += 1;
      }
      for (const b of boards) {
        const n = Math.max(1, b.years.length);
        c.boardAppearances += n;
        boardCount.set(b.board, (boardCount.get(b.board) || 0) + n);
      }
    }
    const list = [...map.values()].sort(
      (a, b) => a.subject.localeCompare(b.subject, 'bn') || a.chapter.localeCompare(b.chapter, 'bn')
    );
    const boards = [...boardCount.entries()].sort((a, b) => b[1] - a[1]);
    return { chapters: list, totals: t, boardTotals: boards };
  }, [rows, source]);

  if (!isOpen) return null;

  const maxChapter = Math.max(1, ...chapters.map((c) => c.total));
  const average = chapters.length > 0 ? totals.total / chapters.length : 0;
  const maxBoard = Math.max(1, ...boardTotals.map((b) => b[1]));
  // "weak part": a chapter with fewer than half of the average number of questions
  const isWeak = (c: ChapterStat) => chapters.length > 1 && c.total < average / 2;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="stats-title"
      className="fixed inset-0 z-50 flex justify-center bg-black/60"
    >
      <div className="w-full max-w-[640px] h-full bg-[#F2F4F8] dark:bg-slate-900 text-[#1B1F2A] dark:text-slate-100 flex flex-col overflow-hidden">
        <header
          className="bg-[#3B4FD8] text-white pl-4 pr-2 h-14 flex items-center justify-between shrink-0 shadow-md"
          style={{ boxSizing: 'content-box', paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            <h2 id="stats-title" className="text-sm font-bold">
              পরিসংখ্যান
            </h2>
          </div>
          <button
            type="button"
            aria-label="বন্ধ করুন"
            onClick={onClose}
            className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-white/20"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div
          className="flex-1 overflow-y-auto p-3.5 space-y-4"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
        >
          <div className="flex gap-1.5">
            {SOURCE_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSource(f.id)}
                className={`min-h-[40px] px-3.5 rounded-xl text-xs font-bold border transition-colors ${
                  source === f.id
                    ? 'bg-[#3B4FD8] text-white border-[#3B4FD8]'
                    : 'bg-white dark:bg-slate-800 text-[#1B1F2A] dark:text-slate-200 border-[#D5D9E2] dark:border-slate-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {error && (
            <p className="text-xs font-bold text-red-600">পরিসংখ্যান তৈরি করা যায়নি। আবার চেষ্টা করুন।</p>
          )}
          {!rows && !error && <p className="text-xs text-[#64748B] dark:text-slate-400">হিসাব হচ্ছে…</p>}

          {rows && totals.total === 0 && (
            <p className="text-xs text-[#64748B] dark:text-slate-400">এখনো কোনো প্রশ্ন নেই।</p>
          )}

          {rows && totals.total > 0 && (
            <>
              {/* ঙ৩: used vs unused + board overview */}
              <section className="bg-white dark:bg-slate-800 rounded-2xl border border-[#D5D9E2] dark:border-slate-700 p-3.5 space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-xl font-black text-[#2A3BB0] dark:text-indigo-300">{toBn(totals.total)}</div>
                    <div className="text-[0.6875rem] text-[#64748B] dark:text-slate-400 font-semibold">মোট প্রশ্ন</div>
                  </div>
                  <div>
                    <div className="text-xl font-black text-emerald-600">{toBn(totals.used)}</div>
                    <div className="text-[0.6875rem] text-[#64748B] dark:text-slate-400 font-semibold">ব্যবহৃত</div>
                  </div>
                  <div>
                    <div className="text-xl font-black text-amber-600">{toBn(totals.total - totals.used)}</div>
                    <div className="text-[0.6875rem] text-[#64748B] dark:text-slate-400 font-semibold">অব্যবহৃত</div>
                  </div>
                </div>
                <div>
                  <Bar value={totals.used} max={totals.total} className="bg-emerald-500" />
                  <p className="text-[0.6875rem] text-[#64748B] dark:text-slate-400 mt-1">
                    {toBn(pct(totals.used, totals.total))}% প্রশ্ন কোনো না কোনো প্রশ্নপত্রে ব্যবহৃত
                  </p>
                </div>
                <p className="text-[0.6875rem] text-[#64748B] dark:text-slate-400">
                  বোর্ড পরীক্ষায় এসেছে এমন প্রশ্ন: {toBn(totals.inBoards)}টি ({toBn(pct(totals.inBoards, totals.total))}%)
                </p>
              </section>

              {/* ঙ২: board frequency */}
              {boardTotals.length > 0 && (
                <section className="bg-white dark:bg-slate-800 rounded-2xl border border-[#D5D9E2] dark:border-slate-700 p-3.5 space-y-2">
                  <h3 className="text-xs font-bold">বোর্ড অনুযায়ী (বছরসহ গণনা)</h3>
                  {boardTotals.map(([board, n]) => (
                    <div key={board} className="space-y-1">
                      <div className="flex justify-between text-[0.6875rem] font-semibold">
                        <span>{board}</span>
                        <span>{toBn(n)}</span>
                      </div>
                      <Bar value={n} max={maxBoard} className="bg-indigo-500" />
                    </div>
                  ))}
                </section>
              )}

              {/* ঙ১: per chapter */}
              <section className="space-y-2">
                <h3 className="text-xs font-bold px-1">অধ্যায়ভিত্তিক ({toBn(chapters.length)}টি অধ্যায়)</h3>
                {chapters.map((c) => (
                  <div
                    key={c.key}
                    className="bg-white dark:bg-slate-800 rounded-2xl border border-[#D5D9E2] dark:border-slate-700 p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">{c.chapter}</p>
                        <p className="text-[0.625rem] text-[#64748B] dark:text-slate-400 truncate">
                          {c.subject}
                          {source === 'all' ? ` · ${c.source === 'type' ? 'Type CQ' : 'Chapter CQ'}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isWeak(c) && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[0.625rem] font-black">
                            প্রশ্ন কম
                          </span>
                        )}
                        <span className="text-sm font-black text-[#2A3BB0] dark:text-indigo-300">{toBn(c.total)}</span>
                      </div>
                    </div>
                    <Bar value={c.total} max={maxChapter} className={isWeak(c) ? 'bg-amber-500' : 'bg-[#3B4FD8]'} />

                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[0.6875rem] text-[#475569] dark:text-slate-300">
                      {[...TYPE_ORDER, ...Object.keys(c.types).filter((t) => !TYPE_ORDER.includes(t))]
                        .filter((t) => c.types[t])
                        .map((t) => (
                          <span key={t}>
                            <b>{t}</b> {toBn(c.types[t])}
                          </span>
                        ))}
                    </div>

                    <div className="flex items-center gap-1 text-[0.6875rem] text-[#475569] dark:text-slate-300">
                      <span className="font-semibold mr-1">রেটিং</span>
                      {c.ratings.map((n, i) => (
                        <span
                          key={i}
                          className="px-1.5 py-0.5 rounded-md bg-[#F2F4F8] dark:bg-slate-700 font-semibold"
                        >
                          {toBn(i + 1)}★ {toBn(n)}
                        </span>
                      ))}
                    </div>

                    <p className="text-[0.6875rem] text-[#64748B] dark:text-slate-400">
                      ব্যবহৃত {toBn(c.used)} · অব্যবহৃত {toBn(c.total - c.used)} · বোর্ডে এসেছে {toBn(c.inBoards)}টি প্রশ্ন
                      {c.boardAppearances > 0 ? ` (${toBn(c.boardAppearances)} বার)` : ''}
                    </p>
                  </div>
                ))}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default StatsModal;
