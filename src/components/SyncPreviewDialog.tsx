import React, { useEffect, useRef } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, RefreshCw } from 'lucide-react';
import { useBackClose } from '../utils/useBackClose';
import { toBn } from '../utils/toBn';
import type { ConflictEntry, ExtraEntry, PreviewEntry } from '../storage/syncCompare';
import type { SyncPreview } from '../storage/syncPreview';
import { SyncProgressBar } from './SyncProgressBar';
import {
  AUTO_CONFLICT_HINT,
  CONFLICT_KIND_LABEL,
  conflictChip,
  conflictMoveText,
  counterCells,
  dialogTitle,
  entryText,
  extraGroupSummary,
  extraMoveText,
  extrasChip,
  groupEntries,
  groupExtras,
  questionsLine,
  resultHeadline,
  totalsChips,
  type Chip,
  type SyncDialogState,
  type SyncResultConflict,
  type SyncResultExtra,
} from '../storage/syncView';

export interface SyncPreviewDialogProps {
  /** null = উইন্ডো বন্ধ */
  state: SyncDialogState | null;
  /** প্রিভিউয়ে [নিশ্চিত করুন] */
  onConfirm: () => void;
  /** হিসাব চলার সময় / প্রিভিউয়ে [বাতিল] (ফোনের Back-ও এটাই ডাকে) */
  onCancel: () => void;
  /** ফল / ত্রুটির পর [ঠিক আছে] / [বন্ধ করুন] (ফোনের Back-ও এটাই ডাকে) */
  onClose: () => void;
}

const CHIP_CLASS: Record<Chip['tone'], string> = {
  neutral: 'bg-[#EEF2FF] text-[#3B4FD8] dark:bg-indigo-950 dark:text-indigo-200',
  danger: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  warn: 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
};

const ACTION_PILL: Record<PreviewEntry['action'], string> = {
  add: 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300',
  create: 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300',
  rename: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300',
  move: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300',
  update: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300',
  delete: 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300',
  info: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
};

const BTN_BASE = 'w-full min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-medium transition-colors focus:outline-none focus:ring-2';
const BTN_NEUTRAL = `${BTN_BASE} border border-[#D5D9E2] text-[#1B1F2A] bg-white hover:bg-[#F2F4F8] active:bg-[#E5E9F0] focus:ring-[#3B4FD8] dark:border-slate-600 dark:text-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700`;
const BTN_PRIMARY = `${BTN_BASE} text-white bg-[#3B4FD8] hover:bg-[#2A3BB0] active:bg-[#202E91] focus:ring-[#3B4FD8] disabled:opacity-40 disabled:pointer-events-none`;
const BTN_DANGER = `${BTN_BASE} text-white bg-red-600 hover:bg-red-700 active:bg-red-800 focus:ring-red-400 disabled:opacity-40 disabled:pointer-events-none`;

/* ------------------------------------------------------------------
 * ছোট অংশ
 * ---------------------------------------------------------------- */

const Shell: React.FC<{
  title: string;
  subtitle?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, footer, children }) => (
  <div
    role="dialog"
    aria-modal="true"
    aria-label={title}
    className="fixed inset-0 z-[80] flex flex-col bg-[#F2F4F8] dark:bg-slate-900"
    onClick={(e) => e.stopPropagation()}
  >
    <header
      className="flex-shrink-0 px-4 pb-3 bg-white dark:bg-slate-800 border-b border-[#D5D9E2] dark:border-slate-700"
      style={{ paddingTop: 'calc(var(--safe-top, env(safe-area-inset-top, 0px)) + 12px)' }}
    >
      <h2 className="text-base font-semibold text-[#1B1F2A] dark:text-slate-100">{title}</h2>
      {subtitle && <p className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">{subtitle}</p>}
    </header>
    <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-4">{children}</div>
    {footer && (
      <footer
        className="flex-shrink-0 px-4 pt-3 bg-white dark:bg-slate-800 border-t border-[#D5D9E2] dark:border-slate-700"
        style={{ paddingBottom: 'calc(var(--safe-bottom, env(safe-area-inset-bottom, 0px)) + 12px)' }}
      >
        {footer}
      </footer>
    )}
  </div>
);

const Notice: React.FC<{ tone: 'red' | 'amber' | 'green' | 'slate'; icon?: React.ReactNode; children: React.ReactNode }> = ({
  tone,
  icon,
  children,
}) => {
  const cls = {
    red: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200',
    amber: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
    green: 'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-200',
    slate: 'border-[#D5D9E2] bg-white text-[#1B1F2A] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
  }[tone];
  return (
    <div className={`rounded-xl border p-3 text-sm leading-relaxed flex gap-2 ${cls}`}>
      {icon && <span className="flex-shrink-0 mt-0.5">{icon}</span>}
      <div className="min-w-0 space-y-1 break-words">{children}</div>
    </div>
  );
};

const ChipRow: React.FC<{ chips: Chip[] }> = ({ chips }) =>
  chips.length ? (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <span key={c.key} className={`px-2.5 py-1 rounded-full text-xs font-medium ${CHIP_CLASS[c.tone]}`}>
          {c.text}
        </span>
      ))}
    </div>
  ) : null;

const ConflictCard: React.FC<{ c: ConflictEntry | SyncResultConflict; moveText: string }> = ({ c, moveText }) => (
  <div className="rounded-xl border border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/30 p-3 space-y-1.5">
    <div className="flex items-center gap-2">
      <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300">
        {CONFLICT_KIND_LABEL[c.kind]}
      </span>
      <span className="text-xs text-[#64748B] dark:text-slate-400">{c.scope === 'chapter' ? 'Chapter CQ' : 'Type CQ'}</span>
    </div>
    <p className="text-sm font-medium text-[#1B1F2A] dark:text-slate-100 break-words">{c.path.join(' › ')}</p>
    <p className="text-xs text-[#1B1F2A] dark:text-slate-200 break-words">
      <span className="font-semibold">ফোল্ডারে: </span>
      {c.folderSide}
    </p>
    <p className="text-xs text-[#1B1F2A] dark:text-slate-200 break-words">
      <span className="font-semibold">অ্যাপে: </span>
      {c.appSide}
    </p>
    <p className="text-xs text-orange-800 dark:text-orange-300 break-words">{moveText}</p>
  </div>
);

/** অপ্রয়োজনীয় জিনিস (কনফ্লিক্ট নয়): মোছা হয় না, নিজের টাইপ/অধ্যায় ফোল্ডারের unnecessary/-তে যায় */
const ExtrasSection: React.FC<{ extras: Array<ExtraEntry | SyncResultExtra>; done?: boolean }> = ({ extras, done }) => {
  if (extras.length === 0) return null;
  const groups = groupExtras(extras);
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        অপ্রয়োজনীয় ({toBn(extras.length)}টি) <span className="text-xs font-normal text-[#64748B]">— কনফ্লিক্ট নয়</span>
      </h3>
      <p className="text-xs text-[#64748B] dark:text-slate-400">
        অ্যাপের দরকার নেই এমন ছবি/ফোল্ডার/ফাইল মোছা হয় না; ওই টাইপ বা অধ্যায় ফোল্ডারের ভেতরে unnecessary ফোল্ডারে সরিয়ে রাখা হয়।
      </p>
      {groups.map((g) => {
        const moved = done ? g.items.every((x) => (x as SyncResultExtra).moved) : false;
        const shown = g.names.slice(0, 5);
        return (
          <div key={g.key} className="rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                {extraGroupSummary(g)}
              </span>
              <span className="text-xs text-[#64748B] dark:text-slate-400">{g.scopeTitle}</span>
            </div>
            <p className="text-sm font-medium text-[#1B1F2A] dark:text-slate-100 break-words">{g.ownerText || 'মূল ফোল্ডার'}</p>
            <p className="text-xs text-[#1B1F2A] dark:text-slate-200 break-words">
              {shown.join(', ')}
              {g.names.length > shown.length ? ` ... আরও ${toBn(g.names.length - shown.length)}টি` : ''}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300 break-words">{extraMoveText(moved, g.moveToText)}</p>
          </div>
        );
      })}
    </section>
  );
};

const EntryRow: React.FC<{ e: PreviewEntry }> = ({ e }) => {
  const t = entryText(e);
  const title = e.path[e.path.length - 1] ?? '';
  return (
    <div
      className={`rounded-xl border p-3 ${
        e.destructive
          ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
          : 'border-[#D5D9E2] bg-white dark:border-slate-700 dark:bg-slate-800'
      }`}
    >
      <div className="flex items-start gap-2">
        <span className={`flex-shrink-0 px-2 py-0.5 rounded-md text-[11px] font-semibold ${ACTION_PILL[e.action]}`}>
          {t.actionLabel}
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-medium text-[#1B1F2A] dark:text-slate-100 break-words">
            {title} <span className="text-xs font-normal text-[#64748B] dark:text-slate-400">({t.kindLabel})</span>
          </p>
          {e.path.length > 1 && <p className="text-xs text-[#64748B] dark:text-slate-400 break-words">{t.pathText}</p>}
          {t.change && <p className="text-xs text-[#1B1F2A] dark:text-slate-200 break-words">{t.change}</p>}
          {t.detail && <p className="text-xs text-[#1B1F2A] dark:text-slate-200 break-words">{t.detail}</p>}
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------
 * প্রিভিউ (নিশ্চিত করার আগে)
 * ---------------------------------------------------------------- */

const PreviewBody: React.FC<{ preview: SyncPreview }> = ({ preview }) => {
  const groups = groupEntries(preview.entries);
  const cChip = conflictChip(preview.totals);
  const xChip = extrasChip(preview.totals);
  const qLine = questionsLine(preview.totals);
  return (
    <>
      {preview.errors.length > 0 && (
        <Notice tone="red" icon={<AlertCircle className="w-4 h-4" />}>
          <p className="font-semibold">হিসাব করা যায়নি, সিঙ্ক করা যাবে না</p>
          {preview.errors.map((m, i) => (
            <p key={i}>{m}</p>
          ))}
        </Notice>
      )}

      {preview.massDelete && (
        <Notice tone="red" icon={<AlertTriangle className="w-4 h-4" />}>
          <p>
            ফোল্ডারে {toBn(preview.massDelete.total)}টির মধ্যে {toBn(preview.massDelete.count)}টি ফোল্ডার পাওয়া যাচ্ছে না। নিশ্চিত করলে এগুলো
            অ্যাপ থেকেও মুছে যাবে।
          </p>
        </Notice>
      )}

      {preview.empty && preview.errors.length === 0 ? (
        <Notice tone="green" icon={<CheckCircle2 className="w-4 h-4" />}>
          <p className="font-semibold">কিছুই বদলাবে না</p>
          <p>ফোল্ডার আর অ্যাপ মিলে আছে।</p>
        </Notice>
      ) : (
        <div className="space-y-2">
          <ChipRow chips={[...totalsChips(preview.totals), ...(cChip ? [cChip] : []), ...(xChip ? [xChip] : [])]} />
          {qLine && <p className="text-xs text-[#64748B] dark:text-slate-400">{qLine}</p>}
        </div>
      )}

      {preview.warnings.length > 0 && (
        <Notice tone="amber" icon={<Info className="w-4 h-4" />}>
          {preview.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </Notice>
      )}

      {preview.conflicts.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-orange-700 dark:text-orange-300">
            কনফ্লিক্ট ({toBn(preview.conflicts.length)}টি)
          </h3>
          <p className="text-xs text-[#64748B] dark:text-slate-400">
            এগুলো মোছা হবে না। যেটা সিঙ্কে জিতবে না সেটা Sync_Conflicts/{preview.stamp}-এ সরিয়ে রাখা হবে।
          </p>
          {preview.conflicts.map((c, i) => (
            <ConflictCard key={`${c.kind}-${c.sourcePath}-${i}`} c={c} moveText={conflictMoveText(c, false)} />
          ))}
        </section>
      )}

      <ExtrasSection extras={preview.extras ?? []} />

      {groups.map((g) => (
        <section key={g.key} className="space-y-2">
          <h3 className="text-sm font-semibold text-[#1B1F2A] dark:text-slate-100 break-words">
            {g.scopeTitle}
            {g.subject ? ` › ${g.subject}` : ''} <span className="text-xs font-normal text-[#64748B]">({toBn(g.entries.length)})</span>
          </h3>
          {g.entries.map((e, i) => (
            <EntryRow key={`${e.action}-${e.path.join('/')}-${i}`} e={e} />
          ))}
        </section>
      ))}
    </>
  );
};

/* ------------------------------------------------------------------
 * মূল উইন্ডো
 * ---------------------------------------------------------------- */

/**
 * পুরো স্ক্রিনের সিঙ্ক উইন্ডো, পাঁচ অবস্থা:
 *  calculating - হিসাব চলছে (ছোট প্রগ্রেস, [বাতিল])
 *  preview     - কী বদলাবে + কনফ্লিক্ট, [নিশ্চিত করুন] [বাতিল]
 *  running     - সিঙ্ক চলছে: প্রগ্রেস বার, কোনো বাটন নেই, Back ব্লক, পুরো স্ক্রিন ঢাকা (বাইরে ট্যাপ কাজ করে না)
 *  result      - ফল + [ঠিক আছে] (অটো সিঙ্কেও কিছু না বদলালে "কিছু বদলায়নি" + [ঠিক আছে], নিজে বন্ধ হয় না)
 *  error       - স্পষ্ট ত্রুটি, কোন ধাপে থেমেছে, ডেটা অক্ষত কি না + [বন্ধ করুন]
 * উইন্ডোটা নিজে কিছু চালায় না; অবস্থা আর বাটনের কাজ বাইরে থেকে আসে (ধাপ ৪-এর hook, ধাপ ৫-এর ইঞ্জিন)।
 */
export const SyncPreviewDialog: React.FC<SyncPreviewDialogProps> = ({ state, onConfirm, onCancel, onClose }) => {
  const active = state !== null;

  const handleBack = (): boolean | void => {
    if (!state) return;
    switch (state.kind) {
      case 'calculating':
      case 'preview':
        onCancel();
        return;
      case 'running':
        return; // সিঙ্ক চলার সময় Back কিছু করে না (কিন্তু Back-টা খরচ হয়, নিচের স্ক্রিন পিছোয় না)
      default:
        onClose();
    }
  };
  useBackClose(active, handleBack);

  // Escape (ওয়েব/ডেস্কটপ প্রিভিউ): Back-এর মতোই; সিঙ্ক চলার সময় কিছু করে না
  const backRef = useRef(handleBack);
  backRef.current = handleBack;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') backRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active]);

  if (!state) return null;

  switch (state.kind) {
    case 'calculating':
      return (
        <Shell
          title={dialogTitle(state.direction, state.auto, state.scope)}
          subtitle="কী বদলাবে হিসাব করা হচ্ছে (কিছু বদলানো হচ্ছে না)"
          footer={
            <button type="button" className={BTN_NEUTRAL} onClick={onCancel}>
              বাতিল
            </button>
          }
        >
          <SyncProgressBar progress={state.progress} compact />
        </Shell>
      );

    case 'preview': {
      const p = state.preview;
      const canConfirm = !p.empty && p.errors.length === 0;
      return (
        <Shell
          title={dialogTitle(p.direction, undefined, p.scope)}
          subtitle="কী কী বদলাবে - নিশ্চিত করার আগে দেখে নিন"
          footer={
            canConfirm ? (
              <div className="grid grid-cols-2 gap-3">
                <button type="button" className={BTN_NEUTRAL} onClick={onCancel}>
                  বাতিল
                </button>
                <button type="button" className={p.totals.delete > 0 ? BTN_DANGER : BTN_PRIMARY} onClick={onConfirm}>
                  নিশ্চিত করুন
                </button>
              </div>
            ) : (
              <button type="button" className={BTN_NEUTRAL} onClick={onCancel}>
                ঠিক আছে
              </button>
            )
          }
        >
          <PreviewBody preview={p} />
        </Shell>
      );
    }

    case 'running':
      return (
        <Shell title={dialogTitle(state.direction, state.auto, state.scope)} subtitle="সিঙ্ক চলছে - শেষ না হওয়া পর্যন্ত অ্যাপে অন্য কিছু করা যাবে না">
          <div className="flex justify-center pt-2 text-[#3B4FD8] dark:text-indigo-300">
            <RefreshCw className="w-8 h-8 animate-spin" />
          </div>
          <SyncProgressBar progress={state.progress} counts={state.counts} />
          <p className="text-xs text-center text-[#64748B] dark:text-slate-400">অ্যাপ বন্ধ করবেন না।</p>
        </Shell>
      );

    case 'result': {
      const r = state.result;
      const hasConflicts = r.conflicts.length > 0;
      const cells = counterCells(r.counts).filter((c) => c.value > 0);
      return (
        <Shell
          title={dialogTitle(state.direction, state.auto, state.scope)}
          footer={
            <button type="button" className={BTN_PRIMARY} onClick={onClose}>
              ঠিক আছে
            </button>
          }
        >
          <Notice
            tone={hasConflicts ? 'amber' : 'green'}
            icon={hasConflicts ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          >
            <p className="font-semibold">{resultHeadline(r)}</p>
            {state.auto && hasConflicts && <p>{AUTO_CONFLICT_HINT}</p>}
          </Notice>

          {cells.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {cells.map((c) => (
                <span
                  key={c.key}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    c.key === 'deleted' ? CHIP_CLASS.danger : c.key === 'conflicts' ? CHIP_CLASS.warn : CHIP_CLASS.neutral
                  }`}
                >
                  {toBn(c.value)}টি {c.label}
                </span>
              ))}
            </div>
          )}

          {r.warnings.length > 0 && (
            <Notice tone="amber" icon={<Info className="w-4 h-4" />}>
              {r.warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </Notice>
          )}

          <ExtrasSection extras={r.extras ?? []} done />

          {hasConflicts && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-orange-700 dark:text-orange-300">
                কনফ্লিক্ট ({toBn(r.conflicts.length)}টি)
              </h3>
              {r.conflicts.map((c, i) => (
                <ConflictCard key={`${c.kind}-${c.sourcePath}-${i}`} c={c} moveText={conflictMoveText(c, c.moved, state.auto)} />
              ))}
            </section>
          )}
        </Shell>
      );
    }

    case 'error':
      return (
        <Shell
          title={dialogTitle(state.direction, state.auto, state.scope)}
          footer={
            <button type="button" className={BTN_NEUTRAL} onClick={onClose}>
              বন্ধ করুন
            </button>
          }
        >
          <Notice tone="red" icon={<AlertCircle className="w-4 h-4" />}>
            <p className="font-semibold">সিঙ্ক শেষ হয়নি</p>
            <p>{state.message}</p>
            {state.stage && <p>যেখানে থেমেছে: {state.stage}</p>}
          </Notice>
          <Notice tone={state.dataSafe ? 'green' : 'amber'} icon={state.dataSafe ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}>
            <p>
              {state.dataSafe
                ? 'ডেটা অক্ষত আছে, কিছু অর্ধেক মুছে যায়নি।'
                : 'কিছু কাজ হয়ে থাকতে পারে। আবার সিঙ্ক চালিয়ে ফল দেখে নিন।'}
            </p>
          </Notice>
        </Shell>
      );
  }
};

export default SyncPreviewDialog;
