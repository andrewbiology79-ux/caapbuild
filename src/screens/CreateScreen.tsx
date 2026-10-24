import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from '../components/Header';
import { useToast } from '../components/Toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PaperFormModal } from '../components/PaperFormModal';
import { PaperViewModal } from '../components/PaperViewModal';
import { CategoryPickerDialog } from '../components/CategoryPickerDialog';
import {
  getPapers,
  getSelectedIds,
  getSelectedStimuliCount,
  getCategories,
  movePapersToCategory,
  duplicatePapers,
  deletePapers,
  type Paper,
  type Category,
} from '../db/api';
import { exportPapersToNewFolder, type BatchPdfResult } from '../utils/pdfGenerator';
import { openSavedFolder } from '../utils/storageAccess';
import { Capacitor } from '@capacitor/core';
import { useNavigation } from '../utils/navigation';
import { toBn } from '../utils/toBn';
import {
  FileText,
  Plus,
  Calendar,
  Clock,
  Award,
  ChevronRight,
  FolderCheck,
  Sparkles,
  RefreshCw,
  Layers,
  Search,
  X,
  Check,
  CheckSquare,
  FolderInput,
  Copy,
  Scissors,
  Trash2,
  ClipboardPaste,
  FileDown,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

/**
 * Copy / cut clipboard of question papers. Kept outside the component so it survives
 * switching between tabs.
 */
type PaperClipboard = { mode: 'copy' | 'cut'; ids: string[] } | null;
let paperClipboard: PaperClipboard = null;

export const CreateScreen: React.FC = () => {
  const { showToast } = useToast();
  const { switchTab } = useNavigation();

  const [papers, setPapers] = useState<Paper[]>([]);
  const [selectedCount, setSelectedCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  // Modals
  const [formOpen, setFormOpen] = useState(false);
  const [editPaper, setEditPaper] = useState<Paper | null>(null);

  const [viewPaperId, setViewPaperId] = useState<string | null>(null);

  // Filter
  const [categories, setCategories] = useState<Category[]>([]);
  const [filterCat, setFilterCat] = useState<string>('all');
  const [search, setSearch] = useState('');

  // Multi select
  const [selectMode, setSelectMode] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [clipboard, setClipboardState] = useState<PaperClipboard>(paperClipboard);

  // Dialogs / progress
  const [movePickerOpen, setMovePickerOpen] = useState(false);
  const [pastePickerOpen, setPastePickerOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [batchResult, setBatchResult] = useState<BatchPdfResult | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);

  const setClipboard = (value: PaperClipboard) => {
    paperClipboard = value;
    setClipboardState(value);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // categories first: this also gives every paper its "<category>-<number>" name
      const cats = await getCategories();
      const [list, selIds] = await Promise.all([getPapers(), getSelectedIds()]);
      const stimCount = await getSelectedStimuliCount(selIds);
      setCategories(cats);
      setPapers(list);
      setSelectedCount(stimCount);
      // forget selected / clipboard papers that no longer exist
      const existing = new Set(list.map((p) => p.id));
      setPicked((prev) => new Set([...prev].filter((id) => existing.has(id))));
      if (paperClipboard) {
        const ids = paperClipboard.ids.filter((id) => existing.has(id));
        paperClipboard = ids.length > 0 ? { mode: paperClipboard.mode, ids } : null;
        setClipboardState(paperClipboard);
      }
    } catch (err) {
      console.error('Failed to load papers:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenCreateNew = () => {
    setEditPaper(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (paper: Paper) => {
    setViewPaperId(null);
    setEditPaper(paper);
    setFormOpen(true);
  };

  /* ---------------- filter ---------------- */
  const visiblePapers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return papers.filter((p) => {
      if (filterCat !== 'all' && p.categoryId !== filterCat) return false;
      if (!q) return true;
      return (
        (p.title || '').toLowerCase().includes(q) || (p.shortName || '').toLowerCase().includes(q)
      );
    });
  }, [papers, filterCat, search]);

  const categoryStats = useMemo(() => {
    const stats: Record<string, { paperCount: number; questionCount: number }> = {};
    for (const p of papers) {
      if (!p.categoryId) continue;
      const st = stats[p.categoryId] || { paperCount: 0, questionCount: 0 };
      st.paperCount += 1;
      st.questionCount += p.questionIds?.length || 0;
      stats[p.categoryId] = st;
    }
    return stats;
  }, [papers]);

  const activeCategory = categories.find((c) => c.id === filterCat) || null;

  /* ---------------- selection ---------------- */
  const enterSelectMode = () => {
    setPicked(new Set());
    setSelectMode(true);
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setPicked(new Set());
  };

  const togglePicked = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allVisiblePicked = visiblePapers.length > 0 && visiblePapers.every((p) => picked.has(p.id));

  const selectAllVisible = () => {
    setPicked(new Set(visiblePapers.map((p) => p.id)));
  };

  // picked papers in the order they are shown in the list
  const pickedIds = papers.filter((p) => picked.has(p.id)).map((p) => p.id);

  /* ---------------- actions ---------------- */
  const handleMoveTo = async (cat: Category) => {
    setMovePickerOpen(false);
    try {
      const n = await movePapersToCategory(pickedIds, cat.id);
      showToast(`${toBn(n)}টি প্রশ্নপত্র "${cat.name}" ক্যাটেগরিতে নেওয়া হয়েছে`);
      exitSelectMode();
      await loadData();
    } catch (err: any) {
      showToast(err?.message || 'ক্যাটেগরিতে নিতে ব্যর্থ হয়েছে');
    }
  };

  const handleCopy = () => {
    if (pickedIds.length === 0) return;
    setClipboard({ mode: 'copy', ids: pickedIds });
    showToast(`${toBn(pickedIds.length)}টি প্রশ্নপত্র কপি হয়েছে`);
    exitSelectMode();
  };

  const handleCut = () => {
    if (pickedIds.length === 0) return;
    setClipboard({ mode: 'cut', ids: pickedIds });
    showToast(`${toBn(pickedIds.length)}টি প্রশ্নপত্র কাট হয়েছে`);
    exitSelectMode();
  };

  const doPaste = async (cat: Category) => {
    setPastePickerOpen(false);
    if (!clipboard || clipboard.ids.length === 0) return;
    try {
      if (clipboard.mode === 'copy') {
        const n = await duplicatePapers(clipboard.ids, cat.id);
        showToast(`${toBn(n)}টি প্রশ্নপত্র "${cat.name}" ক্যাটেগরিতে কপি হয়েছে`);
      } else {
        const n = await movePapersToCategory(clipboard.ids, cat.id);
        showToast(`${toBn(n)}টি প্রশ্নপত্র "${cat.name}" ক্যাটেগরিতে সরানো হয়েছে`);
        setClipboard(null);
      }
      await loadData();
    } catch (err: any) {
      showToast(err?.message || 'পেস্ট করতে ব্যর্থ হয়েছে');
    }
  };

  const handlePasteClick = () => {
    if (!clipboard) return;
    if (activeCategory) {
      doPaste(activeCategory);
    } else {
      setPastePickerOpen(true);
    }
  };

  const handleDeletePicked = async () => {
    setDeleteConfirmOpen(false);
    try {
      await deletePapers(pickedIds);
      showToast(`${toBn(pickedIds.length)}টি প্রশ্নপত্র মুছে ফেলা হয়েছে`);
      exitSelectMode();
      await loadData();
    } catch {
      showToast('মুছতে সমস্যা হয়েছে');
    }
  };

  const handleExportPicked = async () => {
    if (pickedIds.length === 0 || batchProgress) return;
    const ids = [...pickedIds];
    setBatchProgress({ done: 0, total: ids.length });
    try {
      const result = await exportPapersToNewFolder(ids, (done, total) =>
        setBatchProgress({ done, total })
      );
      setBatchResult(result);
      exitSelectMode();
    } catch (err: any) {
      console.error('Batch PDF export failed:', err);
      setBatchError(err?.message || 'পিডিএফ তৈরিতে অপ্রত্যাশিত সমস্যা হয়েছে।');
    } finally {
      setBatchProgress(null);
    }
  };

  const menuItems = selectMode
    ? [
        {
          id: 'select-all',
          label: 'সব নির্বাচন করুন',
          icon: <CheckSquare className="w-4 h-4 text-[#3B4FD8]" />,
          onClick: selectAllVisible,
        },
        {
          id: 'clear-selection',
          label: 'নির্বাচন বাতিল',
          icon: <X className="w-4 h-4 text-[#64748B]" />,
          onClick: exitSelectMode,
        },
      ]
    : [
        {
          id: 'new-paper',
          label: 'নতুন প্রশ্নপত্র তৈরি',
          icon: <Plus className="w-4 h-4 text-[#3B4FD8]" />,
          onClick: handleOpenCreateNew,
        },
        {
          id: 'select-papers',
          label: 'প্রশ্নপত্র নির্বাচন করুন',
          icon: <CheckSquare className="w-4 h-4 text-[#3B4FD8]" />,
          onClick: enterSelectMode,
        },
        ...(clipboard
          ? [
              {
                id: 'paste-papers',
                label: `পেস্ট করুন (${toBn(clipboard.ids.length)})`,
                icon: <ClipboardPaste className="w-4 h-4 text-[#3B4FD8]" />,
                onClick: handlePasteClick,
              },
            ]
          : []),
        {
          id: 'go-collection',
          label: 'কালেকশন থেকে প্রশ্ন নির্বাচন',
          icon: <Layers className="w-4 h-4 text-[#2A3BB0]" />,
          onClick: () => switchTab('typeCq'),
        },
      ];

  return (
    <div className="flex-1 flex flex-col min-h-full pb-24 bg-[#F2F4F8] dark:bg-slate-900 transition-colors">
      <Header
        title={selectMode ? `${toBn(picked.size)}টি নির্বাচিত` : 'তৈরি (Create)'}
        subtitle={selectMode ? 'প্রশ্নপত্র নির্বাচন মোড' : 'পরীক্ষা ও প্রশ্নপত্র ব্যবস্থাপনা'}
        showBack={selectMode}
        onBack={exitSelectMode}
        menuItems={menuItems}
      />

      <main className={`flex-1 p-3.5 space-y-3.5 ${selectMode ? 'pb-20' : ''}`}>
        {/* Selected Questions Notice / Action Banner */}
        {!selectMode && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-3.5 border border-[#D5D9E2] dark:border-slate-700 shadow-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#EEF2FF] dark:bg-indigo-950 flex items-center justify-center text-[#3B4FD8] dark:text-indigo-400 shrink-0">
              <FolderCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-[#1B1F2A] dark:text-slate-100 block">
                {selectedCount > 0
                  ? `${toBn(selectedCount)}টি প্রশ্ন নির্বাচিত আছে`
                  : 'কোনো প্রশ্ন নির্বাচন করা হয়নি'}
              </span>
              <p className="text-[0.6875rem] text-[#64748B] dark:text-slate-400">
                {selectedCount > 0
                  ? 'নির্বাচিত প্রশ্নগুলো দিয়ে সরাসরি প্রশ্নপত্র তৈরি করতে পারেন'
                  : 'কালেকশন ট্যাবে গিয়ে প্রশ্ন নির্বাচন করুন'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={selectedCount > 0 ? handleOpenCreateNew : () => switchTab('typeCq')}
            className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-[#3B4FD8] hover:bg-[#2A3BB0] active:bg-[#202E91] text-white text-xs font-bold shrink-0 shadow-2xs transition-colors"
          >
            {selectedCount > 0 ? '+ তৈরি করো' : 'নির্বাচন করো'}
          </button>
        </div>
        )}

        {/* Paste banner (after copy / cut) */}
        {!selectMode && clipboard && (
          <div className="bg-[#EEF2FF] dark:bg-indigo-950/60 rounded-2xl p-3 border border-[#C7D2FE] dark:border-indigo-900 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {clipboard.mode === 'copy' ? (
                <Copy className="w-4 h-4 text-[#3B4FD8] dark:text-indigo-300 shrink-0" />
              ) : (
                <Scissors className="w-4 h-4 text-[#3B4FD8] dark:text-indigo-300 shrink-0" />
              )}
              <span className="text-xs font-bold text-[#1B1F2A] dark:text-slate-100 truncate">
                {toBn(clipboard.ids.length)}টি প্রশ্নপত্র {clipboard.mode === 'copy' ? 'কপি' : 'কাট'} করা আছে
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handlePasteClick}
                className="min-h-[40px] px-3 rounded-xl bg-[#3B4FD8] hover:bg-[#2A3BB0] text-white text-xs font-bold flex items-center gap-1"
              >
                <ClipboardPaste className="w-4 h-4" />
                <span>{activeCategory ? 'এখানে পেস্ট' : 'পেস্ট'}</span>
              </button>
              <button
                type="button"
                aria-label="ক্লিপবোর্ড খালি করুন"
                onClick={() => setClipboard(null)}
                className="w-10 h-10 min-h-0 rounded-xl flex items-center justify-center text-[#64748B] dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Papers Section Title */}
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-bold text-[#1B1F2A] dark:text-slate-200">
            তৈরি প্রশ্নপত্রের তালিকা ({toBn(visiblePapers.length)}টি
            {visiblePapers.length !== papers.length ? ` / ${toBn(papers.length)}টির মধ্যে` : ''})
          </h2>
          {selectMode ? (
            <button
              type="button"
              onClick={allVisiblePicked ? () => setPicked(new Set()) : selectAllVisible}
              className="text-xs font-bold text-[#3B4FD8] dark:text-indigo-400 hover:underline"
            >
              {allVisiblePicked ? 'কোনোটি নয়' : 'সব নির্বাচন'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenCreateNew}
              className="text-xs font-bold text-[#3B4FD8] dark:text-indigo-400 hover:underline"
            >
              + নতুন প্রশ্নপত্র
            </button>
          )}
        </div>

        {/* Filter: search + category chips */}
        {papers.length > 0 && (
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="নাম বা শিরোনাম দিয়ে খুঁজুন"
                className="w-full min-h-[44px] pl-9 pr-9 py-2 rounded-xl border border-[#D5D9E2] dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-[#1B1F2A] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#3B4FD8]"
              />
              {search && (
                <button
                  type="button"
                  aria-label="খোঁজা মুছুন"
                  onClick={() => setSearch('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 min-h-0 rounded-full flex items-center justify-center text-[#64748B]"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-0.5 px-0.5">
              {[{ id: 'all', name: 'সব', count: papers.length }, ...categories.map((c) => ({ id: c.id, name: c.name, count: categoryStats[c.id]?.paperCount || 0 }))].map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setFilterCat(chip.id)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-full border text-[0.6875rem] font-bold whitespace-nowrap shrink-0 transition-colors ${
                    filterCat === chip.id
                      ? 'bg-[#3B4FD8] border-[#3B4FD8] text-white'
                      : 'bg-white dark:bg-slate-800 border-[#D5D9E2] dark:border-slate-700 text-[#475569] dark:text-slate-300'
                  }`}
                >
                  {chip.name} ({toBn(chip.count)})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="py-12 text-center text-xs text-[#64748B] dark:text-slate-400 flex flex-col items-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-[#3B4FD8]" />
            <span>প্রশ্নপত্র লোড হচ্ছে...</span>
          </div>
        )}

        {/* Empty State */}
        {!loading && papers.length === 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-7 text-center border border-[#D5D9E2] dark:border-slate-700 shadow-xs space-y-3">
            <div className="w-14 h-14 rounded-full bg-[#EEF2FF] dark:bg-indigo-950 flex items-center justify-center mx-auto text-[#3B4FD8] dark:text-indigo-400">
              <FileText className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-bold text-[#1B1F2A] dark:text-slate-100">
              কোনো প্রশ্নপত্র তৈরি করা হয়নি
            </h3>
            <p className="text-xs text-[#64748B] dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
              কালেকশন থেকে প্রশ্ন সিলেক্ট করে বা সরাসরি তথ্য দিয়ে সুন্দর A4 সাইজের পরীক্ষার প্রশ্নপত্র তৈরি ও প্রিন্ট করুন।
            </p>
            <button
              type="button"
              onClick={handleOpenCreateNew}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#3B4FD8] hover:bg-[#2A3BB0] text-white text-xs font-bold shadow-xs transition-colors"
            >
              + প্রথম প্রশ্নপত্র তৈরি করুন
            </button>
          </div>
        )}

        {/* List of Created Papers */}
        {!loading && papers.length > 0 && visiblePapers.length === 0 && (
          <div className="py-8 text-center text-xs text-[#64748B] dark:text-slate-400">
            এই ফিল্টারে কোনো প্রশ্নপত্র পাওয়া যায়নি
          </div>
        )}

        {!loading && visiblePapers.length > 0 && (
          <div className="space-y-2.5">
            {visiblePapers.map((paper) => {
              const qCount = paper.questionIds?.length || 0;
              const dateStr = new Date(paper.createdAt || Date.now()).toLocaleDateString('bn-BD', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              });

              return (
                <div
                  key={paper.id}
                  onClick={() => (selectMode ? togglePicked(paper.id) : setViewPaperId(paper.id))}
                  className={`bg-white dark:bg-slate-800 hover:border-[#3B4FD8] dark:hover:border-indigo-500 rounded-2xl p-4 border shadow-xs flex items-center justify-between gap-3 cursor-pointer transition-all group ${
                    selectMode && picked.has(paper.id)
                      ? 'border-[#3B4FD8] dark:border-indigo-500 ring-1 ring-[#3B4FD8]'
                      : 'border-[#D5D9E2] dark:border-slate-700'
                  }`}
                >
                  {selectMode && (
                    <span
                      aria-hidden="true"
                      className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 ${
                        picked.has(paper.id)
                          ? 'bg-[#3B4FD8] border-[#3B4FD8] text-white'
                          : 'border-[#94A3B8] dark:border-slate-500 bg-white dark:bg-slate-800'
                      }`}
                    >
                      {picked.has(paper.id) && <Check className="w-4 h-4 stroke-[3]" />}
                    </span>
                  )}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-[#EEF2FF] dark:bg-indigo-950 text-[#3B4FD8] dark:text-indigo-300 font-bold text-[0.6875rem] border border-[#D5D9E2] dark:border-indigo-900 truncate">
                        {paper.shortName}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-[#1B1F2A] dark:text-slate-100 truncate group-hover:text-[#3B4FD8] dark:group-hover:text-indigo-400 transition-colors">
                      {paper.title}
                    </h3>

                    <div className="flex flex-wrap items-center gap-3 text-[0.6875rem] text-[#64748B] dark:text-slate-400">
                      <span className="flex items-center gap-1 font-medium">
                        <Award className="w-3.5 h-3.5 text-[#3B4FD8]" />
                        <span>{toBn(paper.totalMarks || 50)} নম্বর</span>
                      </span>

                      <span className="flex items-center gap-1 font-medium">
                        <FileText className="w-3.5 h-3.5 text-[#2A3BB0]" />
                        <span>{toBn(qCount)}টি প্রশ্ন</span>
                      </span>

                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{dateStr}</span>
                      </span>
                    </div>
                  </div>

                  {!selectMode && (
                    <div className="flex items-center gap-1 text-[#3B4FD8] dark:text-indigo-400 shrink-0">
                      <span className="text-xs font-semibold hidden sm:inline">দেখুন</span>
                      <ChevronRight className="w-5 h-5 text-[#94A3B8] group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Floating Action Button (+ New Paper) */}
      {!selectMode && (
      <button
        type="button"
        aria-label="নতুন প্রশ্নপত্র তৈরি করুন"
        onClick={handleOpenCreateNew}
        style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
        className="fixed right-4 z-40 min-h-[48px] px-4 py-2.5 rounded-full bg-[#3B4FD8] hover:bg-[#2A3BB0] active:bg-[#202E91] text-white font-bold text-xs shadow-xl flex items-center gap-2 transition-transform hover:scale-105 active:scale-95"
      >
        <Plus className="w-5 h-5 stroke-[2.5]" />
        <span>নতুন প্রশ্নপত্র</span>
      </button>
      )}

      {/* Multi-select action bar */}
      {selectMode && (
        <div
          className="fixed left-0 right-0 z-40"
          style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="max-w-[390px] mx-auto bg-white dark:bg-slate-900 border-t border-[#D5D9E2] dark:border-slate-700 shadow-[0_-4px_14px_rgba(0,0,0,0.08)] px-2 py-1.5 grid grid-cols-5 gap-1">
            {[
              { id: 'move', label: 'ক্যাটেগরি', icon: <FolderInput className="w-5 h-5" />, onClick: () => setMovePickerOpen(true), danger: false },
              { id: 'copy', label: 'কপি', icon: <Copy className="w-5 h-5" />, onClick: handleCopy, danger: false },
              { id: 'cut', label: 'কাট', icon: <Scissors className="w-5 h-5" />, onClick: handleCut, danger: false },
              { id: 'pdf', label: 'PDF', icon: <FileDown className="w-5 h-5" />, onClick: handleExportPicked, danger: false },
              { id: 'delete', label: 'ডিলিট', icon: <Trash2 className="w-5 h-5" />, onClick: () => setDeleteConfirmOpen(true), danger: true },
            ].map((a) => (
              <button
                key={a.id}
                type="button"
                disabled={picked.size === 0}
                onClick={a.onClick}
                className={`min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[0.625rem] font-bold disabled:opacity-35 active:bg-[#F2F4F8] dark:active:bg-slate-800 ${
                  a.danger ? 'text-red-600 dark:text-red-400' : 'text-[#3B4FD8] dark:text-indigo-300'
                }`}
              >
                {a.icon}
                <span>{a.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Move selected papers to another category */}
      <CategoryPickerDialog
        isOpen={movePickerOpen}
        title={`${toBn(picked.size)}টি প্রশ্নপত্র কোন ক্যাটেগরিতে নেবেন?`}
        categories={categories}
        stats={categoryStats}
        onPick={handleMoveTo}
        onCancel={() => setMovePickerOpen(false)}
      />

      {/* Paste into a category */}
      <CategoryPickerDialog
        isOpen={pastePickerOpen}
        title="কোন ক্যাটেগরিতে পেস্ট করবেন?"
        categories={categories}
        stats={categoryStats}
        onPick={doPaste}
        onCancel={() => setPastePickerOpen(false)}
      />

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="প্রশ্নপত্র মুছবেন?"
        message={`নির্বাচিত ${toBn(picked.size)}টি প্রশ্নপত্র স্থায়ীভাবে মুছে ফেলতে চান? (কালেকশনের প্রশ্নগুলো মুছবে না)`}
        confirmText="হ্যাঁ, মুছে ফেলুন"
        cancelText="না"
        isDestructive={true}
        onConfirm={handleDeletePicked}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      {/* Batch PDF export progress (no preview) */}
      {batchProgress && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
        >
          <div className="w-full max-w-[300px] bg-white dark:bg-slate-900 rounded-2xl p-5 border border-[#D5D9E2] dark:border-slate-700 shadow-2xl text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#3B4FD8] mx-auto" />
            <p className="text-sm font-bold text-[#1B1F2A] dark:text-slate-100">PDF তৈরি হচ্ছে…</p>
            <p className="text-xs text-[#64748B] dark:text-slate-400">
              {toBn(Math.min(batchProgress.done + 1, batchProgress.total))} / {toBn(batchProgress.total)} — অনুগ্রহ করে অপেক্ষা করুন
            </p>
          </div>
        </div>
      )}

      {/* Batch PDF export result */}
      {(batchResult || batchError) && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
        >
          <div className="w-full max-w-[340px] bg-white dark:bg-slate-900 rounded-2xl p-5 border border-[#D5D9E2] dark:border-slate-700 shadow-2xl space-y-3.5">
            {batchError ? (
              <>
                <p className="text-sm font-bold text-red-600">PDF তৈরিতে ত্রুটি</p>
                <p className="text-xs text-[#1B1F2A] dark:text-slate-200 bg-red-50 dark:bg-red-950/40 p-3 rounded-xl border border-red-100 dark:border-red-900 break-all leading-relaxed">
                  {batchError}
                </p>
              </>
            ) : (
              batchResult && (
                <>
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>{toBn(batchResult.saved)}টি PDF সেভ হয়েছে</span>
                  </div>
                  <div className="text-[11px] text-[#64748B] dark:text-slate-400 bg-[#F2F4F8] dark:bg-slate-800 rounded-xl p-2.5 break-all">
                    {batchResult.folder
                      ? <>নতুন ফোল্ডার: <span className="font-semibold">{batchResult.folder}</span></>
                      : 'ব্রাউজারের ডাউনলোড ফোল্ডারে সেভ হয়েছে'}
                  </div>
                  {batchResult.failed.length > 0 && (
                    <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed">
                      তৈরি করা যায়নি: {batchResult.failed.join(', ')}
                    </p>
                  )}
                </>
              )
            )}
            <div className="flex flex-col gap-2 pt-1">
              {batchResult?.folder && Capacitor.isNativePlatform() && (
                <button
                  type="button"
                  onClick={async () => {
                    await openSavedFolder(`${batchResult.folder}/x.pdf`);
                  }}
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#3B4FD8] hover:bg-[#2A3BB0] text-white text-xs font-bold"
                >
                  ফোল্ডার খুলুন
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setBatchResult(null);
                  setBatchError(null);
                }}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-[#D5D9E2] dark:border-slate-700 text-xs font-semibold text-[#1B1F2A] dark:text-slate-200"
              >
                ঠিক আছে
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Paper Form Modal (Create / Edit) */}
      <PaperFormModal
        isOpen={formOpen}
        editPaper={editPaper}
        onClose={() => {
          setFormOpen(false);
          setEditPaper(null);
        }}
        onSaved={loadData}
      />

      {/* Paper View Modal (A4 Preview & PDF Export) */}
      <PaperViewModal
        paperId={viewPaperId}
        isOpen={Boolean(viewPaperId)}
        onClose={() => setViewPaperId(null)}
        onEdit={handleOpenEdit}
        onDeleted={loadData}
      />
    </div>
  );
};

export default CreateScreen;
