import React, { useState, useEffect } from 'react';
import { X, Moon, Sun, Type, FileText, Check, Settings as SettingsIcon } from 'lucide-react';
import {
  getAppSettings,
  saveAppSettings,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  DEFAULT_FONT_SIZE,
  type AppSettings,
  type ThemeMode,
  type FontSizeOption,
} from '../utils/settings';
import { toBn } from '../utils/toBn';
import { isImageEditorEnabled, setImageEditorEnabled } from '../utils/imageEdit';
import { useToast } from './Toast';
import {
  AUTO_BACKUP_ROOT,
  getLastAutoBackupTime,
  getLastAutoBackupDate,
  isAutoBackupEnabled,
  runAutoBackup,
  setAutoBackupEnabled,
} from '../utils/autoBackup';
import { useBackClose } from '../utils/useBackClose';
import { findOrphanImages, deleteOrphanImages, type OrphanImageReport } from '../db/api';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSaved }) => {
  const { showToast } = useToast();
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [fontSize, setFontSize] = useState<FontSizeOption>(DEFAULT_FONT_SIZE);
  const [defaultPaperTitle, setDefaultPaperTitle] = useState('');
  const [defaultPaperNote, setDefaultPaperNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoBackupOn, setAutoBackupOn] = useState(true);
  const [imageEditorOn, setImageEditorOn] = useState(true);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  /** result of the last "এখনই ব্যাকআপ নিন" tap — shown right under the button so it is never missed */
  const [backupMsg, setBackupMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // ধাপ ৫খ: জমে থাকা (এতিম) ছবির পরিষ্কার
  const [orphanReport, setOrphanReport] = useState<OrphanImageReport | null>(null);
  const [orphanBusy, setOrphanBusy] = useState(false);
  const [orphanMsg, setOrphanMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      const s = await getAppSettings();
      setTheme(s.theme);
      setFontSize(s.fontSize);
      setDefaultPaperTitle(s.defaultPaperTitle || '');
      setDefaultPaperNote(s.defaultPaperNote ?? '');
      setAutoBackupOn(isAutoBackupEnabled());
      setImageEditorOn(isImageEditorEnabled());
      setLastBackup(getLastAutoBackupTime() || getLastAutoBackupDate());
      setBackupMsg(null);
      setOrphanReport(null);
      setOrphanMsg(null);
    };
    load();
  }, [isOpen]);

  useBackClose(isOpen, onClose);
  if (!isOpen) return null;

  const toggleAutoBackup = () => {
    const next = !autoBackupOn;
    setAutoBackupOn(next);
    setAutoBackupEnabled(next);
  };

  const toggleImageEditor = () => {
    const next = !imageEditorOn;
    setImageEditorOn(next);
    setImageEditorEnabled(next);
  };

  const handleBackupNow = async () => {
    if (backingUp) return;
    setBackingUp(true);
    setBackupMsg(null);
    try {
      const r = await runAutoBackup(true);
      if (r.status === 'done') {
        setLastBackup(getLastAutoBackupTime() || getLastAutoBackupDate());
        setBackupMsg({ ok: true, text: `ব্যাকআপ হয়েছে: ${r.folder}` });
        showToast(`ব্যাকআপ হয়েছে: ${r.folder}`, 4500);
      } else if (r.status === 'unsupported') {
        setBackupMsg({ ok: false, text: 'ব্যাকআপ ফোনের অ্যাপে কাজ করে (ব্রাউজারে নয়)।' });
      } else if (r.status === 'no-access') {
        setBackupMsg({ ok: false, text: 'স্টোরেজ অনুমতি দেওয়া হয়নি। অনুমতি দিয়ে আবার চেষ্টা করুন।' });
      } else if (r.status === 'busy') {
        setBackupMsg({ ok: false, text: 'আরেকটি ব্যাকআপ চলছে, একটু অপেক্ষা করুন।' });
      } else if (r.status === 'error') {
        setBackupMsg({ ok: false, text: `ব্যাকআপ ব্যর্থ: ${r.message}` });
      } else {
        setBackupMsg({ ok: false, text: 'ব্যাকআপ নেওয়া যায়নি, আবার চেষ্টা করুন।' });
      }
    } catch (err: any) {
      console.error('Manual backup failed:', err);
      setBackupMsg({ ok: false, text: `ব্যাকআপ ব্যর্থ: ${err?.message || err}` });
    } finally {
      setBackingUp(false);
    }
  };

  const handleScanOrphans = async () => {
    if (orphanBusy) return;
    setOrphanBusy(true);
    setOrphanMsg(null);
    try {
      const r = await findOrphanImages();
      setOrphanReport(r);
      if (r.count === 0) setOrphanMsg({ ok: true, text: 'কোনো জমে থাকা ছবি নেই — সব ছবি কোনো না কোনো প্রশ্নে ব্যবহার হচ্ছে।' });
    } catch (err: any) {
      setOrphanReport(null);
      setOrphanMsg({ ok: false, text: `খুঁজতে সমস্যা হয়েছে: ${err?.message || err}` });
    } finally {
      setOrphanBusy(false);
    }
  };

  const handleDeleteOrphans = async () => {
    if (orphanBusy || !orphanReport || orphanReport.count === 0) return;
    setOrphanBusy(true);
    setOrphanMsg(null);
    try {
      const n = await deleteOrphanImages();
      setOrphanReport(null);
      setOrphanMsg({ ok: true, text: `${toBn(n)}টি জমে থাকা ছবি মুছে ফেলা হয়েছে। এখন নতুন ব্যাকআপ নিলে সাইজ কমবে।` });
      showToast(`${toBn(n)}টি জমে থাকা ছবি মোছা হয়েছে`);
    } catch (err: any) {
      setOrphanMsg({ ok: false, text: `মুছতে সমস্যা হয়েছে (কিছু ছবি মোছা হয়ে থাকতে পারে): ${err?.message || err}` });
    } finally {
      setOrphanBusy(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const newSettings: AppSettings = {
        theme,
        fontSize,
        defaultPaperTitle: defaultPaperTitle.trim() || 'পদার্থবিজ্ঞান ১ম পত্র - মডেল টেস্ট',
        defaultPaperNote: defaultPaperNote.trim(),
      };
      await saveAppSettings(newSettings);
      showToast('সেটিংস সফলভাবে সংরক্ষিত হয়েছে');
      if (onSaved) onSaved();
      onClose();
    } catch (err) {
      console.error('Failed to save settings:', err);
      showToast('সেটিংস সংরক্ষণে ত্রুটি হয়েছে');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
    >
      <div className="w-full max-w-[360px] bg-white dark:bg-slate-900 text-[#1B1F2A] dark:text-slate-100 rounded-3xl border border-[#D5D9E2] dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-[#3B4FD8] text-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-white" />
            <h2 id="settings-dialog-title" className="text-base font-bold text-white">
              সেটিংস (Settings)
            </h2>
          </div>
          <button
            type="button"
            aria-label="বন্ধ করুন"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 active:bg-white/20 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* 1. Theme Option */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-[#1B1F2A] dark:text-slate-200 flex items-center gap-1.5">
              <span>অ্যাপের থিম</span>
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`min-h-[44px] px-3 py-2.5 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all ${
                  theme === 'light'
                    ? 'border-[#3B4FD8] bg-[#EEF2FF] dark:bg-indigo-950 text-[#3B4FD8] dark:text-indigo-300 ring-1 ring-[#3B4FD8]'
                    : 'border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#64748B] dark:text-slate-400'
                }`}
              >
                <Sun className="w-4 h-4 text-amber-500" />
                <span>লাইট (Light)</span>
              </button>

              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`min-h-[44px] px-3 py-2.5 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all ${
                  theme === 'dark'
                    ? 'border-[#3B4FD8] bg-[#EEF2FF] dark:bg-indigo-950 text-[#3B4FD8] dark:text-indigo-300 ring-1 ring-[#3B4FD8]'
                    : 'border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#64748B] dark:text-slate-400'
                }`}
              >
                <Moon className="w-4 h-4 text-indigo-400" />
                <span>ডার্ক (Dark)</span>
              </button>
            </div>
            <p className="text-[0.6875rem] text-[#64748B] dark:text-slate-400">
              * ডার্ক মোডেও পরীক্ষার A4 প্রশ্নপত্র সবসময় স্বাভাবিক সাদা পৃষ্ঠায় প্রদর্শিত হবে।
            </p>
          </div>

          {/* 2. Font Size Option */}
          <div className="space-y-2 pt-2 border-t border-[#F2F4F8] dark:border-slate-800">
            <label className="text-xs font-bold text-[#1B1F2A] dark:text-slate-200 flex items-center gap-1.5">
              <Type className="w-4 h-4 text-[#3B4FD8]" />
              <span>লেখার সাইজ (Font Size)</span>
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {Array.from({ length: MAX_FONT_SIZE - MIN_FONT_SIZE + 1 }, (_, i) => MIN_FONT_SIZE + i).map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`লেখার সাইজ ${n}`}
                  aria-pressed={fontSize === n}
                  onClick={() => setFontSize(n)}
                  style={{ minHeight: 0, height: 36 }}
                  className={`rounded-lg border text-xs font-bold transition-all ${
                    fontSize === n
                      ? 'border-[#3B4FD8] bg-[#EEF2FF] dark:bg-indigo-950 text-[#3B4FD8] dark:text-indigo-300 ring-1 ring-[#3B4FD8]'
                      : 'border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#64748B] dark:text-slate-400'
                  }`}
                >
                  {toBn(n)}
                </button>
              ))}
            </div>
            <p
              className="px-3 py-2 rounded-xl bg-[#F8FAFC] dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-[#1B1F2A] dark:text-slate-100"
              style={{ fontSize: fontSize }}
            >
              নমুনা লেখা — {toBn(fontSize)} সাইজ
            </p>
            <p className="text-[0.6875rem] text-[#64748B] dark:text-slate-400">
              সংখ্যা বেছে নিন (ডিফল্ট {toBn(DEFAULT_FONT_SIZE)}) — সংরক্ষণ করলে পুরো অ্যাপে এই সাইজ প্রযোজ্য হবে।
            </p>
          </div>

          {/* 3. Default Paper Title */}
          <div className="space-y-2 pt-2 border-t border-[#F2F4F8] dark:border-slate-800">
            <label className="text-xs font-bold text-[#1B1F2A] dark:text-slate-200 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-[#3B4FD8]" />
              <span>প্রশ্নপত্রের ডিফল্ট শিরোনাম</span>
            </label>
            <input
              type="text"
              value={defaultPaperTitle}
              onChange={(e) => setDefaultPaperTitle(e.target.value)}
              placeholder="যেমন: পদার্থবিজ্ঞান ১ম পত্র - মডেল টেস্ট"
              className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-[#1B1F2A] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#3B4FD8]"
            />
            <p className="text-[0.6875rem] text-[#64748B] dark:text-slate-400">
              Create ট্যাবে নতুন প্রশ্নপত্র তৈরির সময় এই শিরোনামটি স্বয়ংক্রিয়ভাবে বসবে।
            </p>
          </div>

          {/* 4. Default Paper Note (দ্রষ্টব্য) */}
          <div className="space-y-2 pt-2 border-t border-[#F2F4F8] dark:border-slate-800">
            <label className="text-xs font-bold text-[#1B1F2A] dark:text-slate-200 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-[#3B4FD8]" />
              <span>প্রশ্নপত্রের ডিফল্ট দ্রষ্টব্য</span>
            </label>
            <textarea
              value={defaultPaperNote}
              onChange={(e) => setDefaultPaperNote(e.target.value)}
              rows={4}
              placeholder="যেমন: [ দ্রষ্টব্য: ডান পাশের সংখ্যা প্রশ্নের পূর্ণমান নির্দেশক। ]"
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800 text-xs leading-relaxed text-[#1B1F2A] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#3B4FD8] resize-y"
            />
            <p className="text-[0.6875rem] text-[#64748B] dark:text-slate-400">
              নতুন প্রশ্নপত্র তৈরির সময় "দ্রষ্টব্য" ঘরে এই লেখাটি স্বয়ংক্রিয়ভাবে বসবে। ফাঁকা রাখলে কোনো দ্রষ্টব্য আসবে না।
            </p>
          </div>

          {/* 5. Image editor (crop / rotate / scan) */}
          <div className="space-y-2 pt-2 border-t border-[#F2F4F8] dark:border-slate-800">
            <div className="flex items-center justify-between gap-3">
              <label className="text-xs font-bold text-[#1B1F2A] dark:text-slate-200 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-[#3B4FD8]" />
                <span>ছবি যোগের সময় এডিটর</span>
              </label>
              <button
                type="button"
                role="switch"
                aria-checked={imageEditorOn}
                onClick={toggleImageEditor}
                className={`relative w-11 h-6 min-h-0 rounded-full transition-colors ${
                  imageEditorOn ? 'bg-[#3B4FD8]' : 'bg-[#CBD5E1] dark:bg-slate-600'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    imageEditorOn ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>
            <p className="text-[0.6875rem] leading-relaxed text-[#64748B] dark:text-slate-400">
              চালু থাকলে ছবি বাছার পর ঘোরানো, ক্রপ ও স্ক্যান মোড (গ্রে / সাদা-কালো) দেখানো হয়। প্রতিবার "এডিট ছাড়া রাখো" চাপলেই ছবি আগের মতো যোগ হয়। বন্ধ করলে ছবি সরাসরি যোগ হবে।
            </p>
          </div>

          {/* 6. Daily automatic backup */}
          <div className="space-y-2 pt-2 border-t border-[#F2F4F8] dark:border-slate-800">
            <div className="flex items-center justify-between gap-3">
              <label className="text-xs font-bold text-[#1B1F2A] dark:text-slate-200 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-[#3B4FD8]" />
                <span>দৈনিক অটো ব্যাকআপ</span>
              </label>
              <button
                type="button"
                role="switch"
                aria-checked={autoBackupOn}
                onClick={toggleAutoBackup}
                className={`relative w-11 h-6 min-h-0 rounded-full transition-colors ${
                  autoBackupOn ? 'bg-[#3B4FD8]' : 'bg-[#CBD5E1] dark:bg-slate-600'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    autoBackupOn ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>
            <p className="text-[0.6875rem] leading-relaxed text-[#64748B] dark:text-slate-400">
              প্রতিটি ব্যাকআপের জন্য তারিখ ও সময় দিয়ে আলাদা নতুন ফোল্ডার হবে ({AUTO_BACKUP_ROOT}/তারিখ_সময়) — ভেতরে ৩টি ফাইল: টাইপ CQ, অধ্যায় CQ ও ফুল ব্যাকআপ।
              অ্যাপ খুললে বা চালু থাকা অবস্থায় দিনের প্রথমবার নিজে থেকে হবে; "এখনই ব্যাকআপ নিন" চাপলে প্রতিবার নতুন ফোল্ডার হবে।
            </p>
            <p className="text-[0.6875rem] font-semibold text-[#1B1F2A] dark:text-slate-200">
              সর্বশেষ ব্যাকআপ: {lastBackup || 'এখনো হয়নি'}
            </p>
            <button
              type="button"
              onClick={handleBackupNow}
              disabled={backingUp}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-[#3B4FD8] dark:text-indigo-300 disabled:opacity-50"
            >
              {backingUp ? 'ব্যাকআপ হচ্ছে...' : 'এখনই ব্যাকআপ নিন'}
            </button>
            {backupMsg && (
              <p
                role="status"
                className={`text-[0.6875rem] font-semibold leading-relaxed break-all ${
                  backupMsg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                }`}
              >
                {backupMsg.text}
              </p>
            )}
          </div>

          {/* 7. জমে থাকা ছবির পরিষ্কার (ধাপ ৫খ) */}
          <div className="space-y-2 pt-2 border-t border-[#F2F4F8] dark:border-slate-800">
            <label className="text-xs font-bold text-[#1B1F2A] dark:text-slate-200 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-[#3B4FD8]" />
              <span>জমে থাকা ছবি পরিষ্কার</span>
            </label>
            <p className="text-[0.6875rem] leading-relaxed text-[#64748B] dark:text-slate-400">
              আগে ছবি বেছে সেভ না করে বের হলে বা প্রশ্ন মোছার পর যে ছবিগুলো কোনো প্রশ্নেই আর নেই, সেগুলো ডেটাবেস ও ব্যাকআপ ফাইল ফুলিয়ে রাখে।
              এখানে আগে শুধু খুঁজে দেখানো হয় — আপনি নিশ্চিত করলে তবেই মোছা হয়। কপি-পেস্ট করা বা কপি/কাট করে রাখা প্রশ্নের ছবি কখনও মোছা হয় না।
              মোছার আগে "এখনই ব্যাকআপ নিন" চেপে ব্যাকআপ নিয়ে রাখুন। প্রশ্ন সম্পাদনা ফর্ম বা সিঙ্ক চলার সময় এটা করবেন না।
            </p>
            <button
              type="button"
              onClick={handleScanOrphans}
              disabled={orphanBusy}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-[#3B4FD8] dark:text-indigo-300 disabled:opacity-50"
            >
              {orphanBusy && !orphanReport ? 'খোঁজা হচ্ছে...' : 'জমে থাকা ছবি খুঁজুন'}
            </button>
            {orphanReport && orphanReport.count > 0 && (
              <div className="space-y-2">
                <p role="status" className="text-[0.6875rem] font-semibold leading-relaxed text-[#1B1F2A] dark:text-slate-200">
                  {toBn(orphanReport.count)}টি জমে থাকা ছবি পাওয়া গেছে (মোট ছবি {toBn(orphanReport.totalRows)}টির মধ্যে)।
                  {orphanReport.blobBytes > 0 && ` ডেটাবেসে এগুলোর আকার প্রায় ${toBn(Math.max(1, Math.round(orphanReport.blobBytes / 1024)))} KB।`}
                  {orphanReport.blobless > 0 && ` ${toBn(orphanReport.blobless)}টির ফাইল ফোল্ডারের media/-তে আছে (আকার এখানে ধরা নেই)।`}
                </p>
                <button
                  type="button"
                  onClick={handleDeleteOrphans}
                  disabled={orphanBusy}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-bold disabled:opacity-50"
                >
                  {orphanBusy ? 'মোছা হচ্ছে...' : `${toBn(orphanReport.count)}টি ছবি মুছে ফেলুন`}
                </button>
              </div>
            )}
            {orphanMsg && (
              <p
                role="status"
                className={`text-[0.6875rem] font-semibold leading-relaxed break-words ${
                  orphanMsg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                }`}
              >
                {orphanMsg.text}
              </p>
            )}
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="p-4 bg-[#F8FAFC] dark:bg-slate-800/60 border-t border-[#D5D9E2] dark:border-slate-800 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-[#1B1F2A] dark:text-slate-200 hover:bg-[#F2F4F8]"
          >
            বাতিল
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-[#3B4FD8] hover:bg-[#2A3BB0] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
          >
            <Check className="w-4 h-4" />
            <span>সংরক্ষণ করুন</span>
          </button>
        </div>
      </div>
    </div>
  );
};
