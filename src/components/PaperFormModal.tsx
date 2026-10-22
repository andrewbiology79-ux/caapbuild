import React, { useState, useEffect, useRef } from 'react';
import { X, FileText, Check, Plus, ArrowUp, ArrowDown, Trash2, Layers } from 'lucide-react';
import { db, type Paper, type Question, type Stimulus, type Category } from '../db/db';
import {
  savePaper,
  getSelectedIds,
  getCategories,
  saveCategory,
  getImageBlobUrl,
} from '../db/api';
import { getAppSettings } from '../utils/settings';
import { useToast } from './Toast';
import { PromptDialog } from './PromptDialog';
import { RichText } from './RichText';
import { toBn } from '../utils/toBn';

export interface PaperFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editPaper?: Paper | null;
}

interface StimulusGroupItem {
  id: string; // stimulusId or questionId
  stimulus?: Stimulus;
  stimulusImageUrl?: string;
  questions: Question[];
}

export const PaperFormModal: React.FC<PaperFormModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  editPaper,
}) => {
  const { showToast } = useToast();

  const [title, setTitle] = useState('');
  const [shortName, setShortName] = useState('');
  const [subjectLine, setSubjectLine] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [duration, setDuration] = useState('২ ঘণ্টা ৩০ মিনিট');
  const [totalMarks, setTotalMarks] = useState<number>(50);

  // Stimulus groups included in paper
  const [includedGroups, setIncludedGroups] = useState<StimulusGroupItem[]>([]);
  const [isReordering, setIsReordering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // New category prompt
  const [showNewCatPrompt, setShowNewCatPrompt] = useState(false);

  // Load Categories & Questions
  useEffect(() => {
    if (!isOpen) return;

    const init = async () => {
      setValidationError(null);
      setIsReordering(false);

      const [cats, settings, selIds] = await Promise.all([
        getCategories(),
        getAppSettings(),
        getSelectedIds(),
      ]);

      setCategories(cats);

      let targetQIds: string[] = [];

      if (editPaper) {
        setTitle(editPaper.title);
        setShortName(editPaper.shortName);
        setSubjectLine(editPaper.subjectLine || 'বিষয়: পদার্থবিজ্ঞান ১ম পত্র');
        setSelectedCategoryId(editPaper.categoryId || (cats[0]?.id ?? ''));
        setDuration(String(editPaper.duration || '২ ঘণ্টা ৩০ মিনিট'));
        setTotalMarks(editPaper.totalMarks || 50);
        targetQIds = editPaper.questionIds || [];
      } else {
        const nextCount = (await db.papers.count()) + 1;
        setTitle(settings.defaultPaperTitle || 'পদার্থবিজ্ঞান ১ম পত্র - মডেল টেস্ট');
        setShortName(`মডেল টেস্ট-${toBn(nextCount)}`);
        setSubjectLine('বিষয়: পদার্থবিজ্ঞান (প্রথম পত্র)');
        setSelectedCategoryId(cats[0]?.id || '');
        setDuration('২ ঘণ্টা ৩০ মিনিট');
        setTotalMarks(50);
        targetQIds = selIds.length > 0 ? selIds : [];
      }

      // Fetch questions and group by stimulus
      if (targetQIds.length > 0) {
        const questionsList = await db.questions.where('id').anyOf(targetQIds).toArray();
        // Preserve order
        questionsList.sort((a, b) => targetQIds.indexOf(a.id) - targetQIds.indexOf(b.id));

        const stimulusIds = Array.from(
          new Set(questionsList.map((q) => q.stimulusId).filter(Boolean))
        ) as string[];

        const stimuliMap = new Map<string, Stimulus>();
        if (stimulusIds.length > 0) {
          const stims = await db.stimuli.where('id').anyOf(stimulusIds).toArray();
          stims.forEach((s) => stimuliMap.set(s.id, s));
        }

        const groups: StimulusGroupItem[] = [];
        const stimGroupMap = new Map<string, Question[]>();
        const noStimQuestions: Question[] = [];

        for (const q of questionsList) {
          if (q.stimulusId && stimuliMap.has(q.stimulusId)) {
            const arr = stimGroupMap.get(q.stimulusId) || [];
            arr.push(q);
            stimGroupMap.set(q.stimulusId, arr);
          } else {
            noStimQuestions.push(q);
          }
        }

        // Build groups in original sequence
        const seenStimuli = new Set<string>();
        for (const q of questionsList) {
          if (q.stimulusId && stimuliMap.has(q.stimulusId)) {
            if (!seenStimuli.has(q.stimulusId)) {
              seenStimuli.add(q.stimulusId);
              const stim = stimuliMap.get(q.stimulusId);
              const qList = stimGroupMap.get(q.stimulusId) || [q];
              groups.push({
                id: q.stimulusId,
                stimulus: stim,
                questions: qList,
              });
            }
          } else if (!q.stimulusId) {
            groups.push({
              id: q.id,
              questions: [q],
            });
          }
        }

        // Fetch thumbnail image URLs
        for (const g of groups) {
          if (g.stimulus?.imageIds && g.stimulus.imageIds.length > 0) {
            const url = await getImageBlobUrl(g.stimulus.imageIds[0]);
            if (url) g.stimulusImageUrl = url;
          }
        }

        setIncludedGroups(groups);
      } else {
        setIncludedGroups([]);
      }
    };

    init();
  }, [isOpen, editPaper]);

  if (!isOpen) return null;

  // Handle Category selection & new category
  const handleCategorySelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === '__ADD_NEW__') {
      setShowNewCatPrompt(true);
    } else {
      setSelectedCategoryId(val);
      setValidationError(null);
    }
  };

  const handleCreateNewCategory = async (name: string) => {
    try {
      const newCat = await saveCategory(name);
      const updatedCats = await getCategories();
      setCategories(updatedCats);
      setSelectedCategoryId(newCat.id);
      setShowNewCatPrompt(false);
      showToast(`ক্যাটেগরি "${newCat.name}" তৈরি হয়েছে`);
    } catch (err: any) {
      showToast(err.message || 'ক্যাটেগরি তৈরিতে ব্যর্থ');
    }
  };

  // Reorder included groups
  const handleMoveGroup = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= includedGroups.length) return;

    const next = [...includedGroups];
    const temp = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = temp;
    setIncludedGroups(next);
  };

  // Remove a group from paper
  const handleRemoveGroup = (groupId: string) => {
    setIncludedGroups((prev) => prev.filter((g) => g.id !== groupId));
  };

  // Save paper
  const handleSave = async () => {
    if (!title.trim()) {
      setValidationError('প্রশ্নপত্রের শিরোনাম আবশ্যক');
      return;
    }
    if (!shortName.trim()) {
      setValidationError('সংক্ষিপ্ত নাম আবশ্যক');
      return;
    }
    if (!selectedCategoryId) {
      setValidationError('ক্যাটেগরি নির্বাচন আবশ্যক');
      return;
    }
    if (includedGroups.length === 0) {
      setValidationError('কমপক্ষে ১টি প্রশ্ন অন্তর্ভুক্ত থাকতে হবে');
      return;
    }

    setValidationError(null);
    setSaving(true);

    try {
      // Gather all question IDs in the specified reordered order
      const allQIds: string[] = [];
      includedGroups.forEach((g) => {
        g.questions.forEach((q) => {
          allQIds.push(q.id);
        });
      });

      const matchedCat = categories.find((c) => c.id === selectedCategoryId);

      await savePaper({
        id: editPaper ? editPaper.id : undefined,
        title: title.trim(),
        shortName: shortName.trim(),
        subjectLine: subjectLine.trim(),
        category: matchedCat?.name || 'মডেল টেস্ট',
        categoryId: selectedCategoryId,
        duration,
        totalMarks: Number(totalMarks) || 50,
        questionIds: allQIds,
        createdAt: editPaper ? editPaper.createdAt : Date.now(),
      });

      showToast(editPaper ? 'প্রশ্নপত্র আপডেট হয়েছে' : 'নতুন প্রশ্নপত্র তৈরি হয়েছে');
      onSaved();
      onClose();
    } catch (err) {
      console.error('Failed to save paper:', err);
      showToast('প্রশ্নপত্র সংরক্ষণ ব্যর্থ হয়েছে');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="paper-form-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in duration-150"
    >
      <div className="w-full max-w-[390px] h-full sm:h-[844px] bg-white dark:bg-slate-900 text-[#1B1F2A] dark:text-slate-100 flex flex-col relative overflow-hidden shadow-2xl sm:rounded-[36px] border border-[#D5D9E2] dark:border-slate-800">
        {/* Header with Safe Area Inset */}
        <header
          className="bg-[#3B4FD8] text-white px-4 h-14 flex items-center justify-between shrink-0 shadow-md"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-white" />
            <h2 id="paper-form-title" className="text-sm font-bold text-white">
              {editPaper ? 'প্রশ্নপত্র সম্পাদনা' : 'নতুন প্রশ্নপত্র তৈরি'}
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
        </header>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {/* Title */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#1B1F2A] dark:text-slate-200">
              প্রশ্নপত্রের শিরোনাম *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setValidationError(null);
              }}
              placeholder="যেমন: পদার্থবিজ্ঞান ১ম পত্র - মডেল টেস্ট ২০২৬"
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-[#1B1F2A] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#3B4FD8]"
            />
          </div>

          {/* Short Name & Category Dropdown */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#1B1F2A] dark:text-slate-200">
                সংক্ষিপ্ত নাম *
              </label>
              <input
                type="text"
                value={shortName}
                onChange={(e) => {
                  setShortName(e.target.value);
                  setValidationError(null);
                }}
                placeholder="যেমন: MT-01"
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-[#1B1F2A] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#3B4FD8]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#1B1F2A] dark:text-slate-200">
                ক্যাটেগরি *
              </label>
              <select
                value={selectedCategoryId}
                onChange={handleCategorySelectChange}
                className="w-full min-h-[44px] px-2.5 py-2 rounded-xl border border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-[#1B1F2A] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#3B4FD8]"
              >
                {categories.length === 0 ? (
                  <option value="__ADD_NEW__">+ নতুন ক্যাটেগরি</option>
                ) : (
                  <>
                    <option value="">-- নির্বাচন করুন --</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                    <option value="__ADD_NEW__">+ নতুন ক্যাটেগরি</option>
                  </>
                )}
              </select>
            </div>
          </div>

          {/* Subject Line */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#1B1F2A] dark:text-slate-200">
              বিষয় লাইন (প্রশ্নপত্রের ওপরে)
            </label>
            <input
              type="text"
              value={subjectLine}
              onChange={(e) => setSubjectLine(e.target.value)}
              placeholder="যেমন: বিষয়: পদার্থবিজ্ঞান ১ম পত্র"
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-[#1B1F2A] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#3B4FD8]"
            />
          </div>

          {/* Duration & Total Marks */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#1B1F2A] dark:text-slate-200">
                সময়
              </label>
              <input
                type="text"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="যেমন: ২ ঘণ্টা ৩০ মিনিট"
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-[#1B1F2A] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#3B4FD8]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#1B1F2A] dark:text-slate-200">
                পূর্ণমান
              </label>
              <input
                type="number"
                value={totalMarks}
                onChange={(e) => setTotalMarks(parseInt(e.target.value, 10) || 50)}
                placeholder="৫০"
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-[#1B1F2A] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#3B4FD8]"
              />
            </div>
          </div>

          {/* Included Questions Section */}
          <div className="space-y-2.5 pt-2 border-t border-[#F2F4F8] dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#1B1F2A] dark:text-slate-200">
                অন্তর্ভুক্ত প্রশ্ন ({toBn(includedGroups.length)}টি প্রশ্ন)
              </span>

              {includedGroups.length > 1 && (
                <button
                  type="button"
                  onClick={() => setIsReordering(!isReordering)}
                  className={`min-h-[44px] px-3 py-1 rounded-xl text-xs font-bold transition-colors border ${
                    isReordering
                      ? 'bg-[#3B4FD8] text-white border-[#3B4FD8]'
                      : 'bg-[#EEF2FF] dark:bg-indigo-950 text-[#3B4FD8] dark:text-indigo-300 border-[#D5D9E2] dark:border-indigo-900'
                  }`}
                >
                  {isReordering ? 'Done' : 'Reorder'}
                </button>
              )}
            </div>

            {includedGroups.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-[#D5D9E2] dark:border-slate-700 text-center text-xs text-[#64748B] dark:text-slate-400">
                কোনো প্রশ্ন নির্বাচন করা হয়নি। কালেকশন ট্যাব থেকে প্রশ্ন নির্বাচন করুন।
              </div>
            ) : (
              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {includedGroups.map((group, idx) => (
                  <div
                    key={group.id}
                    className="p-3 rounded-xl border border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xs space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      {/* Left: Serial Number */}
                      <span className="text-xs font-black text-[#3B4FD8] dark:text-indigo-400 shrink-0">
                        {toBn(idx + 1)}.
                      </span>

                      {/* Middle: Stimulus summary & Thumbnail */}
                      <div className="flex-1 min-w-0 space-y-1">
                        {group.stimulus && (
                          <div className="flex items-start gap-2">
                            {group.stimulusImageUrl && (
                              <img
                                src={group.stimulusImageUrl}
                                alt="চিত্র"
                                className="w-10 h-10 object-cover rounded-lg border border-[#D5D9E2] shrink-0"
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <RichText
                                text={group.stimulus.text}
                                className="text-xs text-[#1B1F2A] dark:text-slate-200 line-clamp-2 leading-relaxed"
                              />
                            </div>
                          </div>
                        )}

                        {/* Sub-questions with marks (গ. বিভব কত? (৩)) */}
                        <div className="space-y-1 pt-1">
                          {group.questions.map((q) => (
                            <div
                              key={q.id}
                              className="text-[0.6875rem] text-[#475569] dark:text-slate-300 flex items-start gap-1"
                            >
                              <span className="font-bold shrink-0">{q.type || 'গ'}.</span>
                              <span className="flex-1 truncate">{q.questionText}</span>
                              <span className="font-semibold shrink-0 text-[#64748B]">
                                ({toBn(q.marks)})
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Right: Reorder arrows or remove button */}
                      <div className="flex items-center gap-1 shrink-0">
                        {isReordering ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              aria-label="উপরে"
                              disabled={idx === 0}
                              onClick={() => handleMoveGroup(idx, 'up')}
                              className="w-8 h-8 rounded-lg bg-[#F2F4F8] dark:bg-slate-700 flex items-center justify-center text-[#1B1F2A] dark:text-slate-200 disabled:opacity-20"
                            >
                              <ArrowUp className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              aria-label="নিচে"
                              disabled={idx === includedGroups.length - 1}
                              onClick={() => handleMoveGroup(idx, 'down')}
                              className="w-8 h-8 rounded-lg bg-[#F2F4F8] dark:bg-slate-700 flex items-center justify-center text-[#1B1F2A] dark:text-slate-200 disabled:opacity-20"
                            >
                              <ArrowDown className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            aria-label="তালিকা থেকে বাদ দিন"
                            onClick={() => handleRemoveGroup(group.id)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Validation Error Message */}
        {validationError && (
          <div className="px-4 py-2 bg-red-50 dark:bg-red-950/60 border-t border-red-200 dark:border-red-900 text-xs font-bold text-red-600 dark:text-red-400">
            {validationError}
          </div>
        )}

        {/* Fixed Footer with Safe Area */}
        <div
          className="p-3 bg-[#F8FAFC] dark:bg-slate-800/80 border-t border-[#D5D9E2] dark:border-slate-800 flex items-center justify-end gap-2.5 shrink-0"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
        >
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
            disabled={saving}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-[#3B4FD8] hover:bg-[#2A3BB0] active:bg-[#202E91] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            <span>{saving ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ করুন'}</span>
          </button>
        </div>

        {/* Prompt dialog for new category creation */}
        <PromptDialog
          isOpen={showNewCatPrompt}
          title="নতুন ক্যাটেগরি"
          initialValue=""
          onConfirm={handleCreateNewCategory}
          onCancel={() => setShowNewCatPrompt(false)}
        />
      </div>
    </div>
  );
};

export default PaperFormModal;
