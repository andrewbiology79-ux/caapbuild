import React, { useState, useEffect } from 'react';
import { X, Moon, Sun, Type, FileText, Check, Settings as SettingsIcon } from 'lucide-react';
import { getAppSettings, saveAppSettings, type AppSettings, type ThemeMode, type FontSizeOption } from '../utils/settings';
import { useToast } from './Toast';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSaved }) => {
  const { showToast } = useToast();
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [fontSize, setFontSize] = useState<FontSizeOption>('medium');
  const [defaultPaperTitle, setDefaultPaperTitle] = useState('');
  const [defaultPaperNote, setDefaultPaperNote] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      const s = await getAppSettings();
      setTheme(s.theme);
      setFontSize(s.fontSize);
      setDefaultPaperTitle(s.defaultPaperTitle || '');
      setDefaultPaperNote(s.defaultPaperNote ?? '');
    };
    load();
  }, [isOpen]);

  if (!isOpen) return null;

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
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'small', label: 'ছোট' },
                  { id: 'medium', label: 'মাঝারি' },
                  { id: 'large', label: 'বড়' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFontSize(item.id)}
                  className={`min-h-[44px] px-2 py-2 rounded-xl border text-xs font-bold transition-all ${
                    fontSize === item.id
                      ? 'border-[#3B4FD8] bg-[#EEF2FF] dark:bg-indigo-950 text-[#3B4FD8] dark:text-indigo-300 ring-1 ring-[#3B4FD8]'
                      : 'border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800 text-[#64748B] dark:text-slate-400'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
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
