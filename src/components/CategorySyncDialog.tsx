import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, RefreshCw } from 'lucide-react';
import { useBackClose } from '../utils/useBackClose';
import { toBn } from '../utils/toBn';
import type { CategoryDeleteMode } from '../storage/categoryCompare';
import type { CategoryPreview } from '../storage/categoryScanner';
import { SyncProgressBar } from './SyncProgressBar';
import {
  CATEGORY_DIALOG_SUBTITLE,
  CATEGORY_DIALOG_TITLE,
  DELETE_CHOICES,
  canConfirmCategoryPreview,
  categoryEntryText,
  categoryErrorSafety,
  categoryExtraGroupSummary,
  categoryExtraMoveText,
  categoryRecreateChip,
  categoryResultCells,
  categoryResultHeadline,
  categoryResultNotes,
  categoryTotalsChips,
  deletedCategoryPapers,
  emptyPreviewText,
  groupCategoryEntries,
  groupCategoryExtras,
  massDeleteText,
  needsDeleteChoice,
  pendingNotice,
  protectedLines,
  type CategoryChip,
  type CategoryDialogState,
  type CategoryResultExtra,
} from '../storage/categorySyncView';
import type { CategoryAction, CategoryExtra } from '../storage/categoryCompare';

export interface CategorySyncDialogProps {
  /** null = উইন্ডো বন্ধ */
  state: CategoryDialogState | null;
  /** প্রিভিউয়ে [নিশ্চিত করুন]; massDelete থাকলে আলাদা সম্মতিসহ */
  onConfirm: (opts: { massDeleteConfirmed: boolean }) => void;
  /** প্রিভিউয়ে "ফোল্ডার নেই এমন ক্যাটেগরির কী হবে" বদলানো */
  onSetDeleteMode: (mode: CategoryDeleteMode) => void;
  /** হিসাব চলার সময় / প্রিভিউয়ে [বাতিল] (ফোনের Back-ও এটাই ডাকে) */
  onCancel: () => void;
  /** ফল / ত্রুটির পর [ঠিক আছে] / [বন্ধ করুন] (ফোনের Back-ও এটাই ডাকে) */
  onClose: () => void;
}

const CHIP_CLASS: Record<CategoryChip['tone'], string> = {
  neutral: 'bg-[#EEF2FF] text-[#3B4FD8] dark:bg-indigo-950 dark:text-indigo-200',
  danger: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  warn: 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
};

const ACTION_PILL: Record<CategoryAction, string> = {
  add: 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300',
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

const ChipRow: React.FC<{ chips: CategoryChip[] }> = ({ chips }) =>
  chips.length ? (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <span key={c.key} className={`px-2.5 py-1 rounded-full text-xs font-medium ${CHIP_CLASS[c.tone]}`}>
          {c.text}
        </span>
      ))}
    </div>
  ) : null;

/** বাড়তি জিনিস (মোছা হয় না): নিজের ক্যাটেগরি ফোল্ডারের unnecessary/-তে সরে */
const ExtrasSection: React.FC<{ extras: Array<CategoryExtra | CategoryResultExtra>; done?: boolean }> = ({ extras, done }) => {
  if (extras.length === 0) return null;
  const groups = groupCategoryExtras(extras);
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        অপ্রয়োজনীয় ({toBn(extras.length)}টি) <span className="text-xs font-normal text-[#64748B]">— কিছু মোছা হয় না</span>
      </h3>
      <p className="text-xs text-[#64748B] dark:text-slate-400">
        অ্যাপের দরকার নেই এমন ছবি/ফোল্ডার/ফাইল মোছা হয় না; নিজের ক্যাটেগরি ফোল্ডারের ভেতরে unnecessary ফোল্ডারে সরিয়ে রাখা হয়।
      </p>
      {groups.map((g) => {
        const moved = done ? g.items.every((x) => (x as CategoryResultExtra).moved) : false;
        const shown = g.names.slice(0, 5);
        return (
          <div key={g.key} className="rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 p-3 space-y-1.5">
            <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
              {categoryExtraGroupSummary(g)}
            </span>
            <p className="text-sm font-medium text-[#1B1F2A] dark:text-slate-100 break-words">{g.ownerText}</p>
            <p className="text-xs text-[#1B1F2A] dark:text-slate-200 break-words">
              {shown.join(', ')}
              {g.names.length > shown.length ? ` ... আরও ${toBn(g.names.length - shown.length)}টি` : ''}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300 break-words">{categoryExtraMoveText(moved, g.moveToText)}</p>
          </div>
        );
      })}
    </section>
  );
};

const EntryRow: React.FC<{ e: CategoryPreview['result']['entries'][number] }> = ({ e }) => {
  const t = categoryEntryText(e);
  const title = e.path[e.path.length - 1] ?? '';
  return (
    <div
      className={`rounded-xl border p-3 ${
        t.destructive
          ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
          : 'border-[#D5D9E2] bg-white dark:border-slate-700 dark:bg-slate-800'
      }`}
    >
      <div className="flex items-start gap-2">
        <span className={`flex-shrink-0 px-2 py-0.5 rounded-md text-[11px] font-semibold ${ACTION_PILL[t.action]}`}>{t.actionLabel}</span>
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

/** ফোল্ডার নেই এমন ক্যাটেগরির কী হবে - বাছাই */
const DeleteChoiceSection: React.FC<{ preview: CategoryPreview; onSetDeleteMode: (m: CategoryDeleteMode) => void }> = ({ preview, onSetDeleteMode }) => {
  const sum = deletedCategoryPapers(preview.result);
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-[#1B1F2A] dark:text-slate-100">
        ফোল্ডার নেই এমন ক্যাটেগরি ({toBn(sum.categories)}টি, {toBn(sum.papers)}টি প্রশ্নপত্র)
      </h3>
      <p className="text-xs text-[#64748B] dark:text-slate-400">এগুলোর কী হবে বেছে নিন - বদলালে প্রিভিউ আবার হিসাব হবে।</p>
      <div role="radiogroup" className="space-y-2">
        {DELETE_CHOICES.map((c) => {
          const checked = preview.deleteMode === c.mode;
          return (
            <button
              key={c.mode}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => onSetDeleteMode(c.mode)}
              className={`w-full text-left rounded-xl border p-3 min-h-[44px] transition-colors focus:outline-none focus:ring-2 focus:ring-[#3B4FD8] ${
                checked
                  ? 'border-[#3B4FD8] bg-[#EEF2FF] dark:border-indigo-400 dark:bg-indigo-950/40'
                  : 'border-[#D5D9E2] bg-white dark:border-slate-700 dark:bg-slate-800'
              }`}
            >
              <span className="flex items-start gap-2">
                <span
                  className={`mt-0.5 w-4 h-4 flex-shrink-0 rounded-full border-2 flex items-center justify-center ${
                    checked ? 'border-[#3B4FD8] dark:border-indigo-300' : 'border-[#94A3B8]'
                  }`}
                >
                  {checked && <span className="w-2 h-2 rounded-full bg-[#3B4FD8] dark:bg-indigo-300" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[#1B1F2A] dark:text-slate-100">{c.label}</span>
                  <span className="block text-xs text-[#64748B] dark:text-slate-400 break-words">{c.hint}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

/* ------------------------------------------------------------------
 * প্রিভিউ (নিশ্চিত করার আগে) - massDelete সম্মতির নিজের অবস্থা আছে
 * ---------------------------------------------------------------- */

const PreviewScreen: React.FC<{
  preview: CategoryPreview;
  onConfirm: (opts: { massDeleteConfirmed: boolean }) => void;
  onSetDeleteMode: (m: CategoryDeleteMode) => void;
  onCancel: () => void;
}> = ({ preview, onConfirm, onSetDeleteMode, onCancel }) => {
  const r = preview.result;
  const [massOk, setMassOk] = useState(false);
  // নতুন প্রিভিউ (যেমন বাছাই বদলালে) এলে সম্মতি আবার শূন্য - পুরনো সম্মতি নতুন হিসাবে খাটে না
  useEffect(() => {
    setMassOk(false);
  }, [preview.signature]);

  const canConfirm = canConfirmCategoryPreview(preview);
  const needMass = !!r.massDelete;
  const pending = pendingNotice(preview.pendingCount);
  const prot = protectedLines(r);
  const groups = groupCategoryEntries(r.entries);
  const recreate = categoryRecreateChip(r);
  const chips = [...categoryTotalsChips(preview.totals), ...(recreate ? [recreate] : [])];
  const destructive = preview.totals.categoriesDeleted + preview.totals.papersDeleted > 0;

  return (
    <Shell
      title={CATEGORY_DIALOG_TITLE}
      subtitle="কী কী বদলাবে - নিশ্চিত করার আগে দেখে নিন"
      footer={
        canConfirm ? (
          <div className="grid grid-cols-2 gap-3">
            <button type="button" className={BTN_NEUTRAL} onClick={onCancel}>
              বাতিল
            </button>
            <button
              type="button"
              className={destructive ? BTN_DANGER : BTN_PRIMARY}
              disabled={needMass && !massOk}
              onClick={() => onConfirm({ massDeleteConfirmed: needMass && massOk })}
            >
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
      {pending && (
        <Notice tone="amber" icon={<Info className="w-4 h-4" />}>
          <p>{pending}</p>
        </Notice>
      )}

      {prot.length > 0 && (
        <Notice tone="amber" icon={<AlertTriangle className="w-4 h-4" />}>
          {prot.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </Notice>
      )}

      {r.massDelete && (
        <Notice tone="red" icon={<AlertTriangle className="w-4 h-4" />}>
          <p>{massDeleteText(r.massDelete)}</p>
          <label className="flex items-start gap-2 pt-1 cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={massOk}
              onChange={(e) => setMassOk(e.target.checked)}
              className="mt-1 w-4 h-4 flex-shrink-0 accent-red-600"
            />
            <span className="font-medium">হ্যাঁ, বুঝে নিশ্চিত করছি - এগুলো মুছে যাবে</span>
          </label>
        </Notice>
      )}

      {preview.empty ? (
        <Notice tone="green" icon={<CheckCircle2 className="w-4 h-4" />}>
          <p className="font-semibold">{emptyPreviewText(preview)}</p>
        </Notice>
      ) : (
        <ChipRow chips={chips} />
      )}

      {r.warnings.length > 0 && (
        <Notice tone="amber" icon={<Info className="w-4 h-4" />}>
          {r.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </Notice>
      )}

      {needsDeleteChoice(r) && <DeleteChoiceSection preview={preview} onSetDeleteMode={onSetDeleteMode} />}

      {groups.map((g) => {
        const danger = g.entries.some((e) => e.kind === 'category' && e.action === 'delete');
        return (
          <section key={g.key} className="space-y-2">
            <h3
              className={`text-sm font-semibold break-words ${danger ? 'text-red-700 dark:text-red-300' : 'text-[#1B1F2A] dark:text-slate-100'}`}
            >
              {g.title} <span className="text-xs font-normal text-[#64748B]">({toBn(g.entries.length)})</span>
            </h3>
            {g.entries.map((e, i) => (
              <EntryRow key={`${e.kind}-${e.action}-${e.id}-${i}`} e={e} />
            ))}
          </section>
        );
      })}

      <ExtrasSection extras={r.extras} />
    </Shell>
  );
};

/* ------------------------------------------------------------------
 * মূল উইন্ডো
 * ---------------------------------------------------------------- */

/**
 * "ফোল্ডার থেকে ক্যাটাগরি সিঙ্ক" - পুরো স্ক্রিনের উইন্ডো, পাঁচ অবস্থা (calculating / preview / running / result / error)।
 * Question_Bank-এর SyncPreviewDialog-এর মতোই; নিজে কিছু চালায় না - অবস্থা ও বাটনের কাজ বাইরে থেকে আসে (categorySyncStore)।
 * চলার সময় (running) Back কিছু করে না, কিন্তু Back-টা খরচ হয় - নিচের স্ক্রিন পিছোয় না।
 */
export const CategorySyncDialog: React.FC<CategorySyncDialogProps> = ({ state, onConfirm, onSetDeleteMode, onCancel, onClose }) => {
  const active = state !== null;

  const handleBack = (): boolean | void => {
    if (!state) return;
    switch (state.kind) {
      case 'calculating':
      case 'preview':
        onCancel();
        return;
      case 'running':
        return;
      default:
        onClose();
    }
  };
  useBackClose(active, handleBack);

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
          title={CATEGORY_DIALOG_TITLE}
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

    case 'preview':
      return <PreviewScreen preview={state.preview} onConfirm={onConfirm} onSetDeleteMode={onSetDeleteMode} onCancel={onCancel} />;

    case 'running':
      return (
        <Shell title={CATEGORY_DIALOG_TITLE} subtitle="সিঙ্ক চলছে - শেষ না হওয়া পর্যন্ত অ্যাপে অন্য কিছু করা যাবে না">
          <div className="flex justify-center pt-2 text-[#3B4FD8] dark:text-indigo-300">
            <RefreshCw className="w-8 h-8 animate-spin" />
          </div>
          <SyncProgressBar progress={state.progress} />
          <p className="text-xs text-center text-[#64748B] dark:text-slate-400">অ্যাপ বন্ধ করবেন না।</p>
        </Shell>
      );

    case 'result': {
      const r = state.result;
      const cells = categoryResultCells(r);
      const notes = categoryResultNotes(r);
      const warn = r.warnings.length > 0;
      return (
        <Shell
          title={CATEGORY_DIALOG_TITLE}
          subtitle={CATEGORY_DIALOG_SUBTITLE}
          footer={
            <button type="button" className={BTN_PRIMARY} onClick={onClose}>
              ঠিক আছে
            </button>
          }
        >
          <Notice tone={warn ? 'amber' : 'green'} icon={warn ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}>
            <p className="font-semibold">{categoryResultHeadline(r)}</p>
          </Notice>

          {cells.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {cells.map((c) => (
                <span key={c.key} className={`px-2.5 py-1 rounded-full text-xs font-medium ${c.tone === 'danger' ? CHIP_CLASS.danger : CHIP_CLASS.neutral}`}>
                  {toBn(c.value)}টি {c.label}
                </span>
              ))}
            </div>
          )}

          {notes.length > 0 && (
            <Notice tone="slate" icon={<Info className="w-4 h-4" />}>
              {notes.map((t, i) => (
                <p key={i}>{t}</p>
              ))}
            </Notice>
          )}

          {warn && (
            <Notice tone="amber" icon={<Info className="w-4 h-4" />}>
              {r.warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </Notice>
          )}

          <ExtrasSection extras={r.extras} done />
        </Shell>
      );
    }

    case 'error':
      return (
        <Shell
          title={CATEGORY_DIALOG_TITLE}
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
            <p>{categoryErrorSafety(state.dataSafe)}</p>
          </Notice>
        </Shell>
      );
  }
};

export default CategorySyncDialog;
