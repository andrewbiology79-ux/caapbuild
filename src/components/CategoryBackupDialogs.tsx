import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Check, FolderKanban, Loader2, ShieldCheck, X } from 'lucide-react';
import type { Category } from '../db/api';
import { toBn } from '../utils/toBn';
import { useBackClose } from '../utils/useBackClose';
import {
  exportCategoryBackup,
  analyzeBackupText,
  runCategoryImport,
  type Analysis,
  type BackupResult,
  type ImportResult,
  type Progress,
} from '../utils/categoryBackup';
import { BackupError } from '../utils/categoryBackupCore';

/* ------------------------------------------------------------------ */
/* shared bits                                                         */
/* ------------------------------------------------------------------ */

const Shell: React.FC<{
  title: string;
  locked: boolean;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, locked, onClose, children }) => {
  // কাজ চলার সময় Back কিছু করে না (ডেটা লেখার মাঝখানে বন্ধ হতে দেওয়া হয় না)
  useBackClose(true, () => {
    if (!locked) onClose();
  });
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={() => {
        if (!locked) onClose();
      }}
    >
      <div
        className="w-full max-w-[380px] max-h-[88vh] bg-white dark:bg-slate-900 rounded-2xl border border-[#D5D9E2] dark:border-slate-700 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#F2F4F8] dark:border-slate-800">
          <h3 className="text-sm font-bold text-[#1B1F2A] dark:text-slate-100">{title}</h3>
          {!locked && (
            <button
              type="button"
              aria-label="বন্ধ করুন"
              onClick={onClose}
              className="w-8 h-8 min-h-0 rounded-full flex items-center justify-center text-[#64748B] dark:text-slate-400"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
};

const ProgressView: React.FC<{ progress: Progress | null; note: string }> = ({ progress, note }) => {
  const pct = progress && progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0;
  return (
    <div className="p-5 space-y-4" aria-live="polite">
      <div className="flex items-center gap-2 text-[#3B4FD8] dark:text-indigo-300">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm font-bold">{progress?.stage || 'শুরু হচ্ছে…'}</span>
      </div>
      <div className="h-3 rounded-full bg-[#E5E9F0] dark:bg-slate-700 overflow-hidden">
        <div
          className={`h-full rounded-full bg-[#3B4FD8] transition-[width] duration-300 ${progress ? '' : 'animate-pulse'}`}
          style={{ width: progress ? `${Math.max(pct, 4)}%` : '8%' }}
        />
      </div>
      <p className="text-xs text-[#64748B] dark:text-slate-400 leading-relaxed">{note}</p>
    </div>
  );
};

const Warnings: React.FC<{ items: string[] }> = ({ items }) =>
  items.length === 0 ? null : (
    <div className="rounded-xl border border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/30 p-3 space-y-1">
      {items.map((w, i) => (
        <div key={i} className="flex items-start gap-2 text-[0.6875rem] text-orange-800 dark:text-orange-300 leading-relaxed">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{w}</span>
        </div>
      ))}
    </div>
  );

const Stat: React.FC<{ label: string; value: number; accent?: boolean }> = ({ label, value, accent }) => (
  <div
    className={`rounded-xl border px-2 py-2 text-center ${
      accent
        ? 'border-[#C7D2FE] dark:border-indigo-900 bg-[#EEF2FF] dark:bg-indigo-950/40'
        : 'border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800'
    }`}
  >
    <div className="text-base font-bold text-[#1B1F2A] dark:text-slate-100">{toBn(value)}</div>
    <div className="text-[0.625rem] text-[#64748B] dark:text-slate-400">{label}</div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Backup dialog                                                       */
/* ------------------------------------------------------------------ */

export interface CategoryBackupDialogProps {
  isOpen: boolean;
  categories: Category[];
  stats: Record<string, { paperCount: number; questionCount: number }>;
  onClose: () => void;
}

type BackupPhase = 'select' | 'running' | 'done' | 'error';

export const CategoryBackupDialog: React.FC<CategoryBackupDialogProps> = (props) =>
  props.isOpen ? <CategoryBackupInner {...props} /> : null;

const CategoryBackupInner: React.FC<CategoryBackupDialogProps> = ({ categories, stats, onClose }) => {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(categories.map((c) => c.id)));
  const [phase, setPhase] = useState<BackupPhase>('select');
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<BackupResult | null>(null);
  const [error, setError] = useState('');
  const busy = useRef(false);

  const allPicked = categories.length > 0 && categories.every((c) => picked.has(c.id));
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const totals = useMemo(() => {
    let papers = 0;
    let questions = 0;
    for (const c of categories) {
      if (!picked.has(c.id)) continue;
      papers += stats[c.id]?.paperCount || 0;
      questions += stats[c.id]?.questionCount || 0;
    }
    return { papers, questions };
  }, [categories, picked, stats]);

  const start = async () => {
    if (busy.current || picked.size === 0) return;
    busy.current = true;
    setPhase('running');
    setProgress(null);
    try {
      // ক্যাটেগরির সাজানো ক্রম ধরে
      const ids = categories.filter((c) => picked.has(c.id)).map((c) => c.id);
      const res = await exportCategoryBackup(ids, setProgress);
      if (!res.ok) throw new Error('ব্যাকআপ ফাইল সেভ করা যায়নি');
      setResult(res);
      setPhase('done');
    } catch (err: any) {
      console.error('Category backup failed:', err);
      setError(err?.message || 'ব্যাকআপ ব্যর্থ হয়েছে');
      setPhase('error');
    } finally {
      busy.current = false;
    }
  };

  const running = phase === 'running';

  return (
    <Shell title="ক্যাটেগরি ব্যাকআপ" locked={running} onClose={onClose}>
      {phase === 'select' && (
        <>
          <div className="px-4 pt-3 pb-2 flex items-center justify-between">
            <p className="text-[0.6875rem] text-[#64748B] dark:text-slate-400">
              যে ক্যাটেগরিগুলোর প্রশ্নসহ ব্যাকআপ নেবেন সেগুলো বেছে নিন
            </p>
            <button
              type="button"
              onClick={() => setPicked(allPicked ? new Set() : new Set(categories.map((c) => c.id)))}
              className="text-xs font-bold text-[#3B4FD8] dark:text-indigo-400 shrink-0 ml-2"
            >
              {allPicked ? 'কোনোটি নয়' : 'সব বাছুন'}
            </button>
          </div>

          <div className="px-3 pb-3 space-y-2 overflow-y-auto">
            {categories.length === 0 && (
              <p className="text-xs text-[#64748B] dark:text-slate-400 text-center py-6">কোনো ক্যাটেগরি নেই</p>
            )}
            {categories.map((cat) => {
              const on = picked.has(cat.id);
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggle(cat.id)}
                  className={`w-full min-h-[52px] px-3.5 py-2.5 rounded-xl border text-left flex items-center gap-3 transition-colors ${
                    on
                      ? 'border-[#3B4FD8] dark:border-indigo-500 bg-[#EEF2FF] dark:bg-indigo-950/40'
                      : 'border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                      on ? 'bg-[#3B4FD8] border-[#3B4FD8] text-white' : 'border-[#94A3B8] dark:border-slate-500'
                    }`}
                  >
                    {on && <Check className="w-3.5 h-3.5" />}
                  </span>
                  <FolderKanban className="w-5 h-5 text-[#3B4FD8] dark:text-indigo-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#1B1F2A] dark:text-slate-100 truncate">{cat.name}</div>
                    <div className="text-[0.6875rem] text-[#64748B] dark:text-slate-400">
                      {toBn(stats[cat.id]?.paperCount || 0)}টি প্রশ্নপত্র • {toBn(stats[cat.id]?.questionCount || 0)}টি প্রশ্ন
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="p-3 border-t border-[#F2F4F8] dark:border-slate-800 space-y-2">
            <p className="text-[0.6875rem] text-[#64748B] dark:text-slate-400 text-center">
              নির্বাচিত: {toBn(picked.size)}টি ক্যাটেগরি • {toBn(totals.papers)}টি প্রশ্নপত্র • {toBn(totals.questions)}টি প্রশ্ন
            </p>
            <button
              type="button"
              disabled={picked.size === 0}
              onClick={start}
              className="w-full min-h-[46px] rounded-xl bg-[#3B4FD8] hover:bg-[#2A3BB0] disabled:opacity-40 text-white text-sm font-bold"
            >
              ব্যাকআপ নিন
            </button>
          </div>
        </>
      )}

      {running && (
        <ProgressView
          progress={progress}
          note="ব্যাকআপ তৈরি, যাচাই ও সেভ না হওয়া পর্যন্ত অপেক্ষা করুন। এখন অ্যাপ বন্ধ করবেন না।"
        />
      )}

      {phase === 'done' && result && (
        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-6 h-6" />
            <span className="text-sm font-bold">ব্যাকআপ সম্পন্ন ও যাচাই হয়েছে</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <Stat label="ক্যাটেগরি" value={result.counts.categories} />
            <Stat label="প্রশ্নপত্র" value={result.counts.papers} />
            <Stat label="প্রশ্ন" value={result.counts.questions} />
            <Stat label="ছবি" value={result.counts.images} />
          </div>
          <Warnings
            items={[
              ...(result.missingQuestions
                ? [`${toBn(result.missingQuestions)}টি প্রশ্ন ডাটাবেসে পাওয়া যায়নি, তাই ব্যাকআপে নেই`]
                : []),
              ...(result.missingImages
                ? [`${toBn(result.missingImages)}টি ছবির ফাইল পড়া যায়নি, তাই ব্যাকআপে নেই`]
                : []),
            ]}
          />
          <p className="text-[0.6875rem] text-[#64748B] dark:text-slate-400 leading-relaxed">
            ফাইলটি Download/QB Collection/Backup/Category Backup ফোল্ডারে আছে। ফাইলটি অন্য জায়গায়ও (গুগল ড্রাইভ/পিসি) কপি করে রাখুন।
          </p>
          <button type="button" onClick={onClose} className="w-full min-h-[46px] rounded-xl bg-[#3B4FD8] text-white text-sm font-bold">
            ঠিক আছে
          </button>
        </div>
      )}

      {phase === 'error' && (
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-2 text-red-600 dark:text-red-400">
            <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
            <span className="text-sm font-bold leading-relaxed">{error}</span>
          </div>
          <p className="text-[0.6875rem] text-[#64748B] dark:text-slate-400">আপনার ডেটায় কোনো পরিবর্তন হয়নি।</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onClose} className="min-h-[44px] rounded-xl border border-[#D5D9E2] dark:border-slate-700 text-sm font-medium text-[#1B1F2A] dark:text-slate-100">
              বন্ধ করুন
            </button>
            <button type="button" onClick={() => setPhase('select')} className="min-h-[44px] rounded-xl bg-[#3B4FD8] text-white text-sm font-bold">
              আবার চেষ্টা
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
};

/* ------------------------------------------------------------------ */
/* Import dialog                                                       */
/* ------------------------------------------------------------------ */

export interface CategoryImportDialogProps {
  /** the picked file; null = closed */
  file: File | null;
  onClose: () => void;
  /** called once after a successful import (the screen reloads its lists) */
  onImported: (result: ImportResult) => void;
}

type ImportPhase = 'reading' | 'preview' | 'running' | 'done' | 'error';

export const CategoryImportDialog: React.FC<CategoryImportDialogProps> = (props) =>
  props.file ? <CategoryImportInner {...props} file={props.file} /> : null;

const CategoryImportInner: React.FC<CategoryImportDialogProps & { file: File }> = ({ file, onClose, onImported }) => {
  const [phase, setPhase] = useState<ImportPhase>('reading');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const busy = useRef(false);

  // read + check the file once (nothing is written here)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const text = await file.text();
        const a = await analyzeBackupText(text);
        if (cancelled) return;
        setAnalysis(a);
        setPhase('preview');
      } catch (err: any) {
        if (cancelled) return;
        console.error('Reading category backup failed:', err);
        setError(err instanceof BackupError ? err.message : err?.message || 'ফাইলটি পড়া যায়নি');
        setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  const confirm = async () => {
    if (busy.current || !analysis) return;
    busy.current = true;
    setPhase('running');
    setProgress(null);
    try {
      const res = await runCategoryImport(analysis.plan, setProgress);
      setResult(res);
      setPhase('done');
      onImported(res);
    } catch (err: any) {
      console.error('Category import failed:', err);
      setError(err?.message || 'ইম্পোর্ট ব্যর্থ হয়েছে');
      setPhase('error');
    } finally {
      busy.current = false;
    }
  };

  const running = phase === 'running';
  const plan = analysis?.plan;

  return (
    <Shell title="ক্যাটেগরি ইম্পোর্ট" locked={running || phase === 'reading'} onClose={onClose}>
      {phase === 'reading' && (
        <div className="p-6 flex flex-col items-center gap-3 text-center">
          <Loader2 className="w-7 h-7 animate-spin text-[#3B4FD8]" />
          <p className="text-xs text-[#64748B] dark:text-slate-400">ফাইল পড়া ও যাচাই করা হচ্ছে…</p>
          <p className="text-[0.6875rem] text-[#94A3B8] break-all">{file.name}</p>
        </div>
      )}

      {phase === 'preview' && analysis && plan && (
        <>
          <div className="px-4 pt-3 pb-3 space-y-3 overflow-y-auto">
            <div
              className={`flex items-start gap-2 rounded-xl border p-3 ${
                analysis.parsed.verified
                  ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300'
                  : 'border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/30 text-orange-800 dark:text-orange-300'
              }`}
            >
              <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="text-[0.6875rem] leading-relaxed">
                {analysis.parsed.verified
                  ? 'ফাইল যাচাই হয়েছে - চেকসাম ও সংখ্যা মিলেছে।'
                  : 'এটি পুরনো ধরনের ফাইল, চেকসাম নেই।'}{' '}
                আপনার বর্তমান কোনো ডেটা মোছা বা বদলানো হবে না, শুধু যা নেই তা যোগ হবে।
              </span>
            </div>

            {plan.nothingToDo ? (
              <div className="rounded-xl border border-[#D5D9E2] dark:border-slate-700 p-4 text-center space-y-1">
                <CheckCircle2 className="w-6 h-6 mx-auto text-emerald-600" />
                <p className="text-xs font-bold text-[#1B1F2A] dark:text-slate-100">নতুন কিছু যোগ করার নেই</p>
                <p className="text-[0.6875rem] text-[#64748B] dark:text-slate-400">ফাইলের সবকিছু আগে থেকেই অ্যাপে আছে।</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                <Stat label="নতুন ক্যাটেগরি" value={plan.totals.newCategories} accent />
                <Stat label="নতুন প্রশ্নপত্র" value={plan.totals.newPapers} accent />
                <Stat label="নতুন প্রশ্ন" value={plan.totals.newQuestions} accent />
                <Stat label="নতুন ছবি" value={plan.totals.newImages} accent />
              </div>
            )}

            <div className="space-y-1.5">
              {plan.categories.map((c) => (
                <div
                  key={c.name}
                  className="rounded-xl border border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#1B1F2A] dark:text-slate-100 truncate">{c.name}</span>
                    <span
                      className={`text-[0.625rem] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${
                        c.isNew
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-[#EEF2FF] text-[#3B4FD8] dark:bg-indigo-950 dark:text-indigo-300'
                      }`}
                    >
                      {c.isNew ? 'নতুন' : 'আগের ক্যাটেগরিতে মিশবে'}
                    </span>
                  </div>
                  <div className="text-[0.6875rem] text-[#64748B] dark:text-slate-400 mt-0.5">
                    {toBn(c.papersAdd)}টি প্রশ্নপত্র যোগ হবে
                    {c.papersDuplicate > 0 && ` • ${toBn(c.papersDuplicate)}টি আগে থেকেই আছে`}
                    {c.papersBroken > 0 && ` • ${toBn(c.papersBroken)}টি বাদ (প্রশ্ন অসম্পূর্ণ)`}
                  </div>
                </div>
              ))}
            </div>

            {(plan.alreadyHave.questions > 0 || plan.alreadyHave.images > 0) && (
              <p className="text-[0.6875rem] text-[#64748B] dark:text-slate-400">
                আগে থেকেই আছে (ছোঁয়া হবে না): {toBn(plan.alreadyHave.questions)}টি প্রশ্ন, {toBn(plan.alreadyHave.images)}টি ছবি
              </p>
            )}

            <Warnings items={plan.warnings} />
          </div>

          <div className="p-3 border-t border-[#F2F4F8] dark:border-slate-800 grid grid-cols-2 gap-2">
            <button type="button" onClick={onClose} className="min-h-[46px] rounded-xl border border-[#D5D9E2] dark:border-slate-700 text-sm font-medium text-[#1B1F2A] dark:text-slate-100">
              বাতিল
            </button>
            <button
              type="button"
              disabled={plan.nothingToDo}
              onClick={confirm}
              className="min-h-[46px] rounded-xl bg-[#3B4FD8] hover:bg-[#2A3BB0] disabled:opacity-40 text-white text-sm font-bold"
            >
              নিশ্চিত করুন
            </button>
          </div>
        </>
      )}

      {running && (
        <ProgressView
          progress={progress}
          note="ইম্পোর্ট চলছে। শেষ না হওয়া পর্যন্ত অ্যাপ বন্ধ করবেন না। কোনো সমস্যা হলে সব আগের অবস্থায় ফিরে যাবে।"
        />
      )}

      {phase === 'done' && result && (
        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-6 h-6" />
            <span className="text-sm font-bold">
              {result.verified ? 'ইম্পোর্ট সম্পন্ন ও যাচাই হয়েছে' : 'ইম্পোর্ট সম্পন্ন'}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <Stat label="ক্যাটেগরি" value={result.categoriesAdded} />
            <Stat label="প্রশ্নপত্র" value={result.papersAdded} />
            <Stat label="প্রশ্ন" value={result.questionsAdded} />
            <Stat label="ছবি" value={result.imagesAdded} />
          </div>
          <p className="text-[0.6875rem] text-[#64748B] dark:text-slate-400 leading-relaxed">
            {result.categoriesMerged > 0 && `${toBn(result.categoriesMerged)}টি আগের ক্যাটেগরিতে প্রশ্নপত্র যোগ হয়েছে। `}
            {result.papersSkipped > 0 && `${toBn(result.papersSkipped)}টি প্রশ্নপত্র বাদ গেছে (আগে থেকেই ছিল বা প্রশ্ন অসম্পূর্ণ)। `}
            {!result.verified && 'যোগ হওয়া সব তথ্য ফিরে পড়ে মেলানো যায়নি - ক্যাটেগরি দেখে নিন।'}
          </p>
          <button type="button" onClick={onClose} className="w-full min-h-[46px] rounded-xl bg-[#3B4FD8] text-white text-sm font-bold">
            ঠিক আছে
          </button>
        </div>
      )}

      {phase === 'error' && (
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-2 text-red-600 dark:text-red-400">
            <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
            <span className="text-sm font-bold leading-relaxed">{error}</span>
          </div>
          <p className="text-[0.6875rem] text-[#64748B] dark:text-slate-400 leading-relaxed">
            ডেটা অক্ষত আছে - কিছু মোছা বা বদলানো হয়নি।
          </p>
          <button type="button" onClick={onClose} className="w-full min-h-[46px] rounded-xl bg-[#3B4FD8] text-white text-sm font-bold">
            বন্ধ করুন
          </button>
        </div>
      )}
    </Shell>
  );
};
