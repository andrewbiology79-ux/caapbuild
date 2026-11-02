import { getQuestionsByIds, getStimuliByIds, getSelectedIdsAll } from '../db/crossDb';
import React, { useState, useEffect, useRef } from 'react';
import { X, FileText, Check, ArrowUp, ArrowDown, Pencil, Eye, EyeOff, Settings2 } from 'lucide-react';
import { DEFAULT_PAPER_NOTE, type Paper, type PaperEdits, type Question, type Stimulus, type Category } from '../db/db';
import {
  savePaper,
  getCategories,
  saveCategory,
  getImageBlobUrl,
  getNextPaperLabel,
} from '../db/api';
import { getAppSettings } from '../utils/settings';
import { useToast } from './Toast';
import { PromptDialog } from './PromptDialog';
import { RichText } from './RichText';
import { toBn } from '../utils/toBn';
import { PopupMenu } from './PopupMenu';
import { QuestionBoardTags } from './QuestionBoardTags';
import { PaperQuestionEditDialog, type GroupEditResult } from './PaperQuestionEditDialog';
import { applyQuestionEdit, applyStimulusEdit, isQuestionEdited, isStimulusEdited, pruneEdits } from '../utils/paperEdits';

export interface PaperFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editPaper?: Paper | null;
}

interface StimulusGroupItem {
  id: string; // stimulusId or questionId
  stimulus?: Stimulus;
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
  const [subjectLine, setSubjectLine] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [note, setNote] = useState('');
  const [tagPreview, setTagPreview] = useState('');
  const [duration, setDuration] = useState('২ ঘণ্টা ৩০ মিনিট');
  const [totalMarks, setTotalMarks] = useState<number>(50);

  // Stimulus groups included in paper
  const [includedGroups, setIncludedGroups] = useState<StimulusGroupItem[]>([]);
  const [isReordering, setIsReordering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // New category prompt
  const [showNewCatPrompt, setShowNewCatPrompt] = useState(false);

  // Paper-only edits of the questions (the question bank is never changed)
  const [edits, setEdits] = useState<PaperEdits | undefined>(undefined);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [openSolutions, setOpenSolutions] = useState<Record<string, boolean>>({});

  // Paper info (title, category, subject line, note, time, marks) lives only in the 3-dot menu
  const [showInfoPanel, setShowInfoPanel] = useState(false);

  // Load Categories & Questions
  useEffect(() => {
    if (!isOpen) return;

    const init = async () => {
      setValidationError(null);
      setIsReordering(false);
      setShowInfoPanel(false);
      setEditingGroupId(null);
      setOpenSolutions({});
      setEdits(editPaper?.edits);

      const [cats, settings, selIds] = await Promise.all([
        getCategories(),
        getAppSettings(),
        getSelectedIdsAll(),
      ]);

      setCategories(cats);

      let targetQIds: string[] = [];

      if (editPaper) {
        setTitle(editPaper.title);
        setSubjectLine(editPaper.subjectLine || 'বিষয়: পদার্থবিজ্ঞান ১ম পত্র');
        setSelectedCategoryId(editPaper.categoryId || (cats[0]?.id ?? ''));
        setDuration(String(editPaper.duration || '২ ঘণ্টা ৩০ মিনিট'));
        setTotalMarks(editPaper.totalMarks || 50);
        setNote(editPaper.note ?? settings.defaultPaperNote ?? DEFAULT_PAPER_NOTE);
        targetQIds = editPaper.questionIds || [];
      } else {
        setTitle(settings.defaultPaperTitle || 'পদার্থবিজ্ঞান ১ম পত্র - মডেল টেস্ট');
        setSubjectLine('বিষয়: পদার্থবিজ্ঞান (প্রথম পত্র)');
        setSelectedCategoryId(cats[0]?.id || '');
        setDuration('২ ঘণ্টা ৩০ মিনিট');
        setTotalMarks(50);
        setNote(settings.defaultPaperNote ?? DEFAULT_PAPER_NOTE);
        targetQIds = selIds.length > 0 ? selIds : [];
      }

      // Fetch questions and group by stimulus
      if (targetQIds.length > 0) {
        const questionsList = await getQuestionsByIds(targetQIds);
        // Preserve order
        questionsList.sort((a, b) => targetQIds.indexOf(a.id) - targetQIds.indexOf(b.id));

        const stimulusIds = Array.from(
          new Set(questionsList.map((q) => q.stimulusId).filter(Boolean))
        ) as string[];

        const stimuliMap = new Map<string, Stimulus>();
        if (stimulusIds.length > 0) {
          const stims = await getStimuliByIds(stimulusIds);
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

        // Fetch all picture URLs (stimulus + solution pictures) for the question cards
        const urls: Record<string, string> = {};
        for (const g of groups) {
          for (const imgId of g.stimulus?.imageIds || []) {
            const url = await getImageBlobUrl(imgId);
            if (url) urls[imgId] = url;
          }
          for (const q of g.questions) {
            for (const imgId of q.solutionImageIds || []) {
              const url = await getImageBlobUrl(imgId);
              if (url) urls[imgId] = url;
            }
          }
        }
        setImageUrls(urls);
        setIncludedGroups(groups);
      } else {
        setImageUrls({});
        setIncludedGroups([]);
      }
    };

    init();
  }, [isOpen, editPaper]);

  // Preview of the tag the paper will get (category name + number)
  useEffect(() => {
    if (!isOpen || !selectedCategoryId) {
      setTagPreview('');
      return;
    }
    if (editPaper && editPaper.categoryId === selectedCategoryId && editPaper.shortName) {
      setTagPreview(editPaper.shortName);
      return;
    }
    const cat = categories.find((c) => c.id === selectedCategoryId);
    if (!cat) {
      setTagPreview('');
      return;
    }
    let cancelled = false;
    getNextPaperLabel(cat.id, cat.name, editPaper?.id).then((label) => {
      if (!cancelled) setTagPreview(label);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedCategoryId, categories, editPaper]);

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

  // Paper-only edit of a question group (nothing is written to the question bank)
  const editingGroup = includedGroups.find((g) => g.id === editingGroupId) || null;

  const handleGroupEditSaved = (res: GroupEditResult) => {
    setEdits((prev) => {
      const next: PaperEdits = {
        questions: { ...(prev?.questions || {}) },
        stimuli: { ...(prev?.stimuli || {}) },
      };
      if (res.stimulusId) {
        if (res.stimulus) next.stimuli![res.stimulusId] = res.stimulus;
        else delete next.stimuli![res.stimulusId];
      }
      for (const [qid, e] of Object.entries(res.questions)) {
        if (e) next.questions![qid] = e;
        else delete next.questions![qid];
      }
      return next;
    });
    setEditingGroupId(null);
    showToast('এই প্রশ্নপত্রের জন্য পরিবর্তন রাখা হয়েছে (সংরক্ষণ করুন চাপুন)');
  };

  const handleGroupEditReset = () => {
    if (!editingGroup) return;
    setEdits((prev) => {
      if (!prev) return prev;
      const next: PaperEdits = { questions: { ...(prev.questions || {}) }, stimuli: { ...(prev.stimuli || {}) } };
      if (editingGroup.stimulus) delete next.stimuli![editingGroup.stimulus.id];
      editingGroup.questions.forEach((q) => delete next.questions![q.id]);
      return next;
    });
    setEditingGroupId(null);
    showToast('মূল প্রশ্নে ফিরে গেছে');
  };

  // Save paper
  const handleSave = async () => {
    if (!title.trim()) {
      setValidationError('প্রশ্নপত্রের শিরোনাম আবশ্যক');
      setShowInfoPanel(true);
      return;
    }
    if (!selectedCategoryId) {
      setValidationError('ক্যাটেগরি নির্বাচন আবশ্যক');
      setShowInfoPanel(true);
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
      const catName = matchedCat?.name || 'মডেল টেস্ট';

      // Tag = category name + number (e.g. "উইকলি মডেল টেস্ট-১"). Kept as it is when the
      // category did not change, otherwise the next free number of the category is used.
      const keepTag = Boolean(editPaper && editPaper.categoryId === selectedCategoryId && editPaper.shortName);
      const shortName = keepTag
        ? editPaper!.shortName
        : await getNextPaperLabel(selectedCategoryId, catName, editPaper?.id);

      await savePaper({
        id: editPaper ? editPaper.id : undefined,
        title: title.trim(),
        shortName,
        subjectLine: subjectLine.trim(),
        note: note.trim(),
        category: catName,
        categoryId: selectedCategoryId,
        duration,
        totalMarks: Number(totalMarks) || 50,
        questionIds: allQIds,
        edits: pruneEdits(
          edits,
          allQIds,
          includedGroups.map((g) => g.stimulus?.id).filter(Boolean) as string[]
        ),
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
          className="bg-[#3B4FD8] text-white pl-4 pr-2 h-14 flex items-center justify-between shrink-0 shadow-md"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-white" />
            <h2 id="paper-form-title" className="text-sm font-bold text-white">
              {editPaper ? 'প্রশ্নপত্র সম্পাদনা' : 'নতুন প্রশ্নপত্র তৈরি'}
            </h2>
          </div>
          <div className="flex items-center">
            <PopupMenu
              buttonAriaLabel="আরও অপশন"
              buttonClassName="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-white/90 hover:text-white hover:bg-white/10 active:bg-white/20"
              items={[
                {
                  id: 'paper-info',
                  label: 'প্রশ্নপত্রের তথ্য (শিরোনাম, ক্যাটেগরি, সময়, পূর্ণমান…)',
                  icon: <Settings2 className="w-4 h-4 text-[#3B4FD8]" />,
                  onClick: () => setShowInfoPanel(true),
                },
              ]}
            />
            <button
              type="button"
              aria-label="বন্ধ করুন"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 active:bg-white/20 text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Scrollable Body: only the included questions (all paper info is in the 3-dot menu) */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
              কোনো প্রশ্ন নির্বাচন করা হয়নি। কালেকশন ট্যাব থেকে প্রশ্ন নির্বাচন করুন।
            </div>
          ) : (
            <div className="space-y-3.5">
              {includedGroups.map((group, idx) => {
                const groupEdited =
                  isStimulusEdited(edits, group.stimulus?.id) ||
                  group.questions.some((q) => isQuestionEdited(edits, q.id));
                const stim = applyStimulusEdit(group.stimulus, edits);

                return (
                  <article
                    key={group.id}
                    className="rounded-2xl border border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden"
                  >
                    {/* Card header: serial, "changed" mark, edit / reorder / remove */}
                    <div className="bg-[#3B4FD8] text-white pl-3.5 pr-1.5 py-1.5 flex items-center gap-2">
                      <span className="text-xs font-black shrink-0">{toBn(idx + 1)}.</span>
                      {groupEdited && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-300 text-amber-950 text-[0.625rem] font-black flex items-center gap-1">
                          <Pencil className="w-3 h-3" />
                          <span>প্রশ্ন পরিবর্তিত</span>
                        </span>
                      )}
                      <div className="flex-1" />
                      {isReordering ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-label="উপরে"
                            disabled={idx === 0}
                            onClick={() => handleMoveGroup(idx, 'up')}
                            className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center disabled:opacity-30"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            aria-label="নিচে"
                            disabled={idx === includedGroups.length - 1}
                            onClick={() => handleMoveGroup(idx, 'down')}
                            className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center disabled:opacity-30"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-label="এই প্রশ্নপত্রে প্রশ্ন সম্পাদনা করুন"
                            onClick={() => setEditingGroupId(group.id)}
                            className="w-9 h-9 rounded-lg hover:bg-white/20 active:bg-white/30 flex items-center justify-center"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            aria-label="তালিকা থেকে বাদ দিন"
                            onClick={() => handleRemoveGroup(group.id)}
                            className="w-9 h-9 rounded-lg hover:bg-red-500/40 active:bg-red-500/60 flex items-center justify-center text-red-100"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="p-3.5 space-y-3.5">
                      {/* Stimulus text & pictures */}
                      {stim && (
                        <div className="space-y-2">
                          <RichText
                            text={stim.text}
                            className="text-xs font-medium text-[#1B1F2A] dark:text-slate-100 leading-relaxed"
                          />
                          {stim.imageIds?.map((imgId) => {
                            const url = imageUrls[imgId];
                            if (!url) return null;
                            return (
                              <div
                                key={imgId}
                                className="w-full my-2 overflow-hidden rounded-xl border border-[#D5D9E2] dark:border-slate-700 bg-white text-center"
                              >
                                <img src={url} alt="উদ্দীপকের চিত্র" className="w-full h-auto object-contain max-h-60 mx-auto" />
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Sub-questions (গ, ঘ …) with marks and the solution button */}
                      <div className={`space-y-3 pt-1 ${stim ? 'border-t border-[#F2F4F8] dark:border-slate-700' : ''}`}>
                        {group.questions.map((origQ) => {
                          const q = applyQuestionEdit(origQ, edits);
                          const solOpen = openSolutions[q.id] || false;
                          const solUrls = (q.solutionImageIds || []).map((id) => imageUrls[id]).filter(Boolean) as string[];
                          const qEdited = isQuestionEdited(edits, q.id);

                          return (
                            <div key={q.id} className="space-y-2">
                              <div className="flex items-start gap-1.5 text-xs text-[#1B1F2A] dark:text-slate-100">
                                <span className="font-bold shrink-0">{q.type ? `${q.type}.` : ''}</span>
                                <RichText
                                  text={q.questionText}
                                  className="text-xs text-[#1B1F2A] dark:text-slate-100 leading-relaxed flex-1 font-medium"
                                />
                                <span className="font-bold shrink-0 pl-1 text-[#64748B] dark:text-slate-400">
                                  ({toBn(q.marks)})
                                </span>
                              </div>

                              <div className="flex items-center gap-2 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => setOpenSolutions((prev) => ({ ...prev, [q.id]: !solOpen }))}
                                  className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-[#F2F4F8] text-[0.6875rem] font-semibold text-[#2A3BB0] dark:text-indigo-300 flex items-center gap-1 shrink-0"
                                >
                                  {solOpen ? (
                                    <>
                                      <EyeOff className="w-3.5 h-3.5" />
                                      <span>সমাধান লুকাও</span>
                                    </>
                                  ) : (
                                    <>
                                      <Eye className="w-3.5 h-3.5" />
                                      <span>সমাধান দেখো</span>
                                    </>
                                  )}
                                </button>
                                <QuestionBoardTags boards={q.usedInBoards} />
                                {qEdited && (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[0.625rem] font-bold">
                                    পরিবর্তিত
                                  </span>
                                )}
                              </div>

                              {solOpen && (
                                <div className="p-3 rounded-xl bg-[#F8FAFC] dark:bg-slate-900/60 border border-[#E2E8F0] dark:border-slate-700 space-y-2">
                                  <div className="text-[0.6875rem] font-bold text-[#2A3BB0] dark:text-indigo-300">সমাধান:</div>
                                  <RichText
                                    text={q.solutionText}
                                    className="text-xs text-[#1B1F2A] dark:text-slate-100 leading-relaxed"
                                  />
                                  {solUrls.map((url, i) => (
                                    <img
                                      key={i}
                                      src={url}
                                      alt="সমাধান চিত্র"
                                      className="w-full h-auto object-contain max-h-56 mx-auto rounded-xl border border-[#D5D9E2] dark:border-slate-700 bg-white"
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
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

        {/* Paper info panel (opened from the 3-dot menu) */}
        {showInfoPanel && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="প্রশ্নপত্রের তথ্য"
            className="absolute inset-0 z-20 flex flex-col bg-white dark:bg-slate-900 animate-in fade-in duration-150"
          >
            <header
              className="bg-[#3B4FD8] text-white px-4 h-14 flex items-center justify-between shrink-0 shadow-md"
              style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
            >
              <h3 className="text-sm font-bold">প্রশ্নপত্রের তথ্য</h3>
              <button
                type="button"
                aria-label="বন্ধ করুন"
                onClick={() => setShowInfoPanel(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 active:bg-white/20"
              >
                <X className="w-5 h-5" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
              {validationError && (
                <div className="px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 text-xs font-bold text-red-600 dark:text-red-400">
                  {validationError}
                </div>
              )}
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#1B1F2A] dark:text-slate-200">প্রশ্নপত্রের শিরোনাম *</label>
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

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#1B1F2A] dark:text-slate-200">ক্যাটেগরি *</label>
                <select
                  value={selectedCategoryId}
                  onChange={handleCategorySelectChange}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-[#1B1F2A] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#3B4FD8]"
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
                {tagPreview && (
                  <p className="text-[0.6875rem] text-[#64748B] dark:text-slate-400">
                    প্রশ্নপত্রের নাম:{' '}
                    <span className="font-bold text-[#3B4FD8] dark:text-indigo-300">{tagPreview}</span>
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#1B1F2A] dark:text-slate-200">বিষয় লাইন (প্রশ্নপত্রের ওপরে)</label>
                <input
                  type="text"
                  value={subjectLine}
                  onChange={(e) => setSubjectLine(e.target.value)}
                  placeholder="যেমন: বিষয়: পদার্থবিজ্ঞান ১ম পত্র"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-[#1B1F2A] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#3B4FD8]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#1B1F2A] dark:text-slate-200">দ্রষ্টব্য (প্রশ্নপত্রের হেডারের নিচে)</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="যেমন: [ দ্রষ্টব্য: ডান পাশের সংখ্যা প্রশ্নের পূর্ণমান নির্দেশক। ] — ফাঁকা রাখলে PDF-এ দ্রষ্টব্য আসবে না"
                  className="w-full px-3.5 py-2 rounded-xl border border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800 text-xs leading-relaxed text-[#1B1F2A] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#3B4FD8] resize-y"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#1B1F2A] dark:text-slate-200">সময়</label>
                  <input
                    type="text"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="যেমন: ২ ঘণ্টা ৩০ মিনিট"
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-[#1B1F2A] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#3B4FD8]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#1B1F2A] dark:text-slate-200">পূর্ণমান</label>
                  <input
                    type="number"
                    value={totalMarks}
                    onChange={(e) => setTotalMarks(parseInt(e.target.value, 10) || 50)}
                    placeholder="৫০"
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-[#1B1F2A] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#3B4FD8]"
                  />
                </div>
              </div>
            </div>

            <div
              className="p-3 bg-[#F8FAFC] dark:bg-slate-800/80 border-t border-[#D5D9E2] dark:border-slate-800 flex items-center justify-end shrink-0"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
            >
              <button
                type="button"
                onClick={() => setShowInfoPanel(false)}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[#3B4FD8] hover:bg-[#2A3BB0] text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>ঠিক আছে</span>
              </button>
            </div>
          </div>
        )}

        {/* Paper-only question editor */}
        {editingGroup && (
          <PaperQuestionEditDialog
            key={editingGroup.id}
            group={editingGroup}
            edits={edits}
            onSave={handleGroupEditSaved}
            onResetGroup={handleGroupEditReset}
            onClose={() => setEditingGroupId(null)}
          />
        )}

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
