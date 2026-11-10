import React from 'react';
import type { SyncProgress } from '../storage/syncProgress';
import { counterCells, currentWork, percentText, progressLine, type SyncCounts } from '../storage/syncView';
import { toBn } from '../utils/toBn';

export interface SyncProgressBarProps {
  /** null = কাজ এইমাত্র শুরু, এখনো কোনো খবর আসেনি */
  progress: SyncProgress | null;
  /** দিলে নিচে চলতে থাকা সংখ্যা (যোগ / বদল / মোছা / কনফ্লিক্ট সরানো) দেখায় */
  counts?: SyncCounts;
  /** হিসাব চলার ছোট রূপ: ছোট সংখ্যা, কাউন্টার নেই */
  compact?: boolean;
}

/**
 * প্রগ্রেস বার: শতকরা + "করা / মোট, বাকি" + এখন কোন কাজ চলছে + (ঐচ্ছিক) চলতি সংখ্যা।
 * বার মসৃণভাবে বাড়ে; পিছোনো ঠেকানো ProgressTracker-এর কাজ, এখানে শুধু দেখানো হয়।
 */
export const SyncProgressBar: React.FC<SyncProgressBarProps> = ({ progress, counts, compact = false }) => {
  const pct = progress ? Math.max(0, Math.min(100, progress.percent)) : 0;

  return (
    <div className="w-full space-y-3" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3">
        <span className={`${compact ? 'text-lg' : 'text-3xl'} font-semibold text-[#1B1F2A] dark:text-slate-100`}>
          {progress ? percentText(progress) : `${toBn(0)}%`}
        </span>
        <span className="text-xs text-[#64748B] dark:text-slate-400 text-right">
          {progress ? progressLine(progress) : 'শুরু হচ্ছে…'}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-3 rounded-full bg-[#E5E9F0] dark:bg-slate-700 overflow-hidden"
      >
        <div
          className={`h-full rounded-full bg-[#3B4FD8] transition-[width] duration-300 ease-out ${progress ? '' : 'animate-pulse'}`}
          style={{ width: progress ? `${pct}%` : '8%' }}
        />
      </div>

      {progress && (
        <p className="text-sm text-[#1B1F2A] dark:text-slate-200 break-words leading-relaxed">{currentWork(progress)}</p>
      )}

      {counts && !compact && (
        <div className="grid grid-cols-4 gap-2 pt-1">
          {counterCells(counts).map((c) => (
            <div
              key={c.key}
              className={`rounded-xl border px-2 py-2 text-center ${
                c.key === 'deleted' && c.value > 0
                  ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
                  : c.key === 'conflicts' && c.value > 0
                    ? 'border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/30'
                    : 'border-[#D5D9E2] bg-white dark:border-slate-700 dark:bg-slate-800'
              }`}
            >
              <div className="text-lg font-semibold text-[#1B1F2A] dark:text-slate-100">{toBn(c.value)}</div>
              <div className="text-[11px] leading-tight text-[#64748B] dark:text-slate-400">{c.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SyncProgressBar;
