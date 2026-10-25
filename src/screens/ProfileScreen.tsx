import { getQuestionsByIds, getStimuliByIds, setSelectionFromPaperIds } from '../db/crossDb';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from '../components/Header';
import { useToast } from '../components/Toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PromptDialog } from '../components/PromptDialog';
import { SettingsModal } from '../components/SettingsModal';
import { ImportCollectionModal } from '../components/ImportCollectionModal';
import { PaperViewModal } from '../components/PaperViewModal';
import { RichText } from '../components/RichText';
import { ActionSheet } from '../components/ActionSheet';
import { CategoryPickerDialog } from '../components/CategoryPickerDialog';
import { toBn } from '../utils/toBn';
import { useNavigation } from '../utils/navigation';
import {
  getPaperCount,
  getQuestionCount,
  getCategories,
  saveCategory,
  updateCategory,
  deleteCategory,
  getPapersByCategory,
  getCategoryStats,
  savePaper,
  deletePaper,
  movePaperToCategory,
  duplicatePaper,
  duplicateCategory,
  movePapersToCategory,
  deletePapers,
  isUncategorizedName,
  getCategoryClipboard,
  setCategoryClipboard,
  type CategoryClipboard,
  type Category,
  type Paper,
  type Question,
  type Stimulus,
} from '../db/api';
import { db, type CqScope } from '../db/db';
import {
  exportFullBackup,
  restoreFullBackup,
  exportQuestionCollection,
} from '../utils/collectionTransfer';
import {
  FileText,
  HelpCircle,
  Upload,
  Download,
  Settings,
  ChevronRight,
  ChevronDown,
  Share2,
  Info,
  HardDriveDownload,
  HardDriveUpload,
  FolderKanban,
  Plus,
  Edit2,
  Trash2,
  ExternalLink,
  FileDown,
  Layers,
  ArrowLeft,
  AlertTriangle,
  MoreVertical,
  Copy,
  ClipboardPaste,
  FolderInput,
  X,
  CheckSquare,
  Square,
  Loader2,
  CheckCircle2,
  Pin,
  FolderDown,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { exportPaperById, exportPapersToNewFolder, type BatchPdfResult } from '../utils/pdfGenerator';
import { showPdfSavedDialog, openSavedFolder } from '../utils/storageAccess';
import {
  exportCategoryShare,
  exportPaperShare,
  parseCategoryShare,
  importCategoryShare,
} from '../utils/categoryTransfer';

type ProfileViewMode = 'main' | 'categories' | 'category-detail';

export const ProfileScreen: React.FC = () => {
  const { showToast } = useToast();
  const { switchTab, registerBackHandler } = useNavigation();

  const [viewMode, setViewMode] = useState<ProfileViewMode>('main');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

  const [paperCount, setPaperCount] = useState<number>(0);
  const [questionCount, setQuestionCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  // Category state
  const [categories, setCategories] = useState<Category[]>([]);
  const [catStats, setCatStats] = useState<
    Record<string, { paperCount: number; questionCount: number }>
  >({});
  const [categoryPapers, setCategoryPapers] = useState<Paper[]>([]);
  const [expandedPaperIds, setExpandedPaperIds] = useState<Record<string, boolean>>({});
  const [paperDetailsMap, setPaperDetailsMap] = useState<
    Record<string, Array<{ stimulus?: Stimulus; questions: Question[] }>>
  >({});

  // Modals state
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [showImportChapterModal, setShowImportChapterModal] = useState<boolean>(false);
  const [viewPaperId, setViewPaperId] = useState<string | null>(null);
  const [exportingPaperId, setExportingPaperId] = useState<string | null>(null);
  const [pdfErrorMessage, setPdfErrorMessage] = useState<string | null>(null);

  // Category Dialogs
  const [categoryPrompt, setCategoryPrompt] = useState<{
    isOpen: boolean;
    title: string;
    initialValue: string;
    onConfirm: (val: string) => void;
  }>({
    isOpen: false,
    title: '',
    initialValue: '',
    onConfirm: () => {},
  });

  const [deleteCatConfirm, setDeleteCatConfirm] = useState<{
    isOpen: boolean;
    catId: string | null;
    catName: string;
  }>({
    isOpen: false,
    catId: null,
    catName: '',
  });

  // Advanced category options (copy / paste / move / share)
  const [clipboard, setClipboard] = useState<CategoryClipboard | null>(null);
  const [categorySheet, setCategorySheet] = useState<Category | null>(null);
  const [paperSheet, setPaperSheet] = useState<Paper | null>(null);
  const [picker, setPicker] = useState<{ mode: 'move' | 'copy'; paper: Paper } | null>(null);
  const [deletePaperTarget, setDeletePaperTarget] = useState<Paper | null>(null);
  const importCategoryInputRef = useRef<HTMLInputElement>(null);

  // Multi-select of papers inside a category + batch PDF export
  const [selectMode, setSelectMode] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [movePickerOpen, setMovePickerOpen] = useState(false);
  const [deletePickedOpen, setDeletePickedOpen] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [batchResult, setBatchResult] = useState<BatchPdfResult | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);

  // Combined "backup / restore" and "import / export" choice sheets (keeps the profile list short)
  const [backupSheetOpen, setBackupSheetOpen] = useState(false);
  const [transferSheetOpen, setTransferSheetOpen] = useState(false);

  // Restore file input and confirm dialog
  const restoreFileInputRef = useRef<HTMLInputElement>(null);
  const [restoreJsonContent, setRestoreJsonContent] = useState<string | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Load statistical counts & categories
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [pCount, qCount, catList] = await Promise.all([
        getPaperCount(),
        getQuestionCount(),
        getCategories(),
      ]);
      setPaperCount(pCount);
      setQuestionCount(qCount);
      setCategories(catList);
      setClipboard(await getCategoryClipboard());

      // Compute stats for each category
      const statsMap: Record<string, { paperCount: number; questionCount: number }> = {};
      for (const cat of catList) {
        statsMap[cat.id] = await getCategoryStats(cat.id);
      }
      setCatStats(statsMap);

      if (viewMode === 'category-detail' && selectedCategory) {
        const papers = await getPapersByCategory(selectedCategory.id);
        setCategoryPapers(papers);
      }
    } catch (err) {
      console.error('Failed to load profile data:', err);
    } finally {
      setLoading(false);
    }
  }, [viewMode, selectedCategory]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Back button handling
  const handleGoBack = useCallback((): boolean => {
    if (selectMode) {
      setSelectMode(false);
      setPicked(new Set());
      return true;
    }
    if (viewMode === 'category-detail') {
      setViewMode('categories');
      return true;
    }
    if (viewMode === 'categories') {
      setViewMode('main');
      return true;
    }
    return false;
  }, [viewMode, selectMode]);

  useEffect(() => {
    const unregister = registerBackHandler(() => {
      return handleGoBack();
    });
    return unregister;
  }, [handleGoBack, registerBackHandler]);

  // Expand paper in category detail
  const togglePaperExpand = async (paper: Paper) => {
    const isOpen = expandedPaperIds[paper.id];
    setExpandedPaperIds((prev) => ({ ...prev, [paper.id]: !isOpen }));

    if (!isOpen && !paperDetailsMap[paper.id]) {
      // Load details for this paper
      const questionsList = await getQuestionsByIds(paper.questionIds || []);

      questionsList.sort((a, b) => {
        const idxA = paper.questionIds.indexOf(a.id);
        const idxB = paper.questionIds.indexOf(b.id);
        return idxA - idxB;
      });

      const stimulusIds = Array.from(
        new Set(questionsList.map((q) => q.stimulusId).filter(Boolean))
      ) as string[];

      const stimuliMap = new Map<string, Stimulus>();
      if (stimulusIds.length > 0) {
        const stims = await getStimuliByIds(stimulusIds);
        stims.forEach((s) => stimuliMap.set(s.id, s));
      }

      const groups: Array<{ stimulus?: Stimulus; questions: Question[] }> = [];
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

      stimGroupMap.forEach((qList, stimId) => {
        groups.push({
          stimulus: stimuliMap.get(stimId),
          questions: qList,
        });
      });

      for (const q of noStimQuestions) {
        groups.push({ questions: [q] });
      }

      setPaperDetailsMap((prev) => ({ ...prev, [paper.id]: groups }));
    }
  };

  // Open in Create tab
  const handleOpenInCreate = async (paper: Paper) => {
    try {
      await setSelectionFromPaperIds(paper.questionIds || []);
      showToast('প্রশ্নপত্রটি Create ট্যাবে লোড করা হয়েছে');
      switchTab('create');
    } catch {
      showToast('লোড করতে সমস্যা হয়েছে');
    }
  };

  // Export paper to PDF directly from Category detail list
  const handleExportPaperPdf = async (paper: Paper) => {
    setExportingPaperId(paper.id);
    showToast('PDF বানানো হচ্ছে…');
    try {
      const savedPath = await exportPaperById(paper.id);
      if (!(savedPath && showPdfSavedDialog(savedPath))) {
        showToast(savedPath ? `PDF সেভ হয়েছে: ${savedPath}` : 'PDF তৈরি সম্পন্ন হয়েছে', savedPath ? 4500 : 2000);
      }
    } catch (err: any) {
      console.error('PDF export failed:', err);
      setPdfErrorMessage(err?.message || 'পিডিএফ তৈরিতে অপ্রত্যাশিত সমস্যা হয়েছে।');
    } finally {
      setExportingPaperId(null);
    }
  };

  // ---------- Select mode + batch PDF export ----------

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

  const selectAllPapers = () => setPicked(new Set(categoryPapers.map((p) => p.id)));

  /** Create a NEW folder (named after the category) in the default PDF folder and save the PDFs there */
  const runBatchExport = async (ids: string[], folderName: string) => {
    if (ids.length === 0 || batchProgress) return;
    setBatchResult(null);
    setBatchError(null);
    setBatchProgress({ done: 0, total: ids.length });
    try {
      const result = await exportPapersToNewFolder(
        ids,
        (done, total) => setBatchProgress({ done, total }),
        { folderName }
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

  const handleExportCategoryPdfs = async (cat: Category) => {
    try {
      const papers = await getPapersByCategory(cat.id);
      if (papers.length === 0) {
        showToast('এই ক্যাটেগরিতে কোনো প্রশ্নপত্র নেই');
        return;
      }
      await runBatchExport(
        papers.map((p) => p.id),
        cat.name
      );
    } catch (err: any) {
      setBatchError(err?.message || 'পিডিএফ তৈরিতে অপ্রত্যাশিত সমস্যা হয়েছে।');
    }
  };

  const handleExportPickedPdfs = () => {
    if (!selectedCategory) return;
    runBatchExport([...picked], selectedCategory.name);
  };

  const handleMovePicked = async (target: Category) => {
    setMovePickerOpen(false);
    try {
      const n = await movePapersToCategory([...picked], target.id);
      showToast(`${toBn(n)}টি প্রশ্নপত্র "${target.name}" ক্যাটেগরিতে সরানো হয়েছে`);
      exitSelectMode();
      await loadData();
    } catch (err: any) {
      showToast(err?.message || 'সরানো যায়নি');
    }
  };

  const handleDeletePicked = async () => {
    setDeletePickedOpen(false);
    try {
      await deletePapers([...picked]);
      showToast(`${toBn(picked.size)}টি প্রশ্নপত্র মুছে ফেলা হয়েছে`);
      exitSelectMode();
      await loadData();
    } catch {
      showToast('মুছতে সমস্যা হয়েছে');
    }
  };

  // Add category dialog
  const handleOpenAddCategory = () => {
    setCategoryPrompt({
      isOpen: true,
      title: 'নতুন ক্যাটেগরি',
      initialValue: '',
      onConfirm: async (name) => {
        try {
          await saveCategory(name);
          showToast('নতুন ক্যাটেগরি তৈরি হয়েছে');
          setCategoryPrompt((prev) => ({ ...prev, isOpen: false }));
          loadData();
        } catch (err: any) {
          showToast(err.message || 'ক্যাটেগরি তৈরিতে সমস্যা');
        }
      },
    });
  };

  // Rename category
  const handleRenameCategory = (cat: Category) => {
    setCategoryPrompt({
      isOpen: true,
      title: 'ক্যাটেগরি সম্পাদনা',
      initialValue: cat.name,
      onConfirm: async (newName) => {
        try {
          await updateCategory(cat.id, newName);
          setSelectedCategory((cur) => (cur && cur.id === cat.id ? { ...cur, name: newName.trim() } : cur));
          showToast('ক্যাটেগরির নাম পরিবর্তন হয়েছে');
          setCategoryPrompt((prev) => ({ ...prev, isOpen: false }));
          loadData();
        } catch (err: any) {
          showToast(err.message || 'সম্পাদনা ব্যর্থ');
        }
      },
    });
  };

  // Delete category
  const handleConfirmDeleteCategory = async () => {
    if (!deleteCatConfirm.catId) return;
    try {
      await deleteCategory(deleteCatConfirm.catId);
      showToast('ক্যাটেগরি মুছে ফেলা হয়েছে (প্রশ্নপত্র সংরক্ষিত আছে)');
      setDeleteCatConfirm({ isOpen: false, catId: null, catName: '' });
      loadData();
    } catch (err) {
      console.error(err);
      showToast('ক্যাটেগরি মুছতে ব্যর্থ');
    }
  };

  // ---------- Advanced category options ----------

  const handleCopyCategory = async (cat: Category) => {
    await setCategoryClipboard({ type: 'category', id: cat.id, name: cat.name });
    setClipboard({ type: 'category', id: cat.id, name: cat.name });
    showToast('ক্যাটেগরি কপি হয়েছে — "পেস্ট" চাপলে নতুন কপি তৈরি হবে', 3000);
  };

  const handleCopyPaper = async (paper: Paper) => {
    const name = paper.title || paper.shortName;
    await setCategoryClipboard({ type: 'paper', id: paper.id, name });
    setClipboard({ type: 'paper', id: paper.id, name });
    showToast('প্রশ্নপত্র কপি হয়েছে — যেকোনো ক্যাটেগরিতে "পেস্ট" করুন', 3000);
  };

  const handleClearClipboard = async () => {
    await setCategoryClipboard(null);
    setClipboard(null);
  };

  // Paste: category -> duplicates the category, paper -> copies the paper into target category
  const handlePaste = async (targetCategory?: Category | null) => {
    if (!clipboard) return;
    try {
      if (clipboard.type === 'category') {
        await duplicateCategory(clipboard.id);
        showToast('ক্যাটেগরি পেস্ট হয়েছে');
      } else {
        if (!targetCategory) {
          showToast('যে ক্যাটেগরিতে পেস্ট করবেন সেটি খুলুন বা তার মেনু থেকে পেস্ট করুন', 3000);
          return;
        }
        await duplicatePaper(clipboard.id, targetCategory.id);
        showToast(`"${targetCategory.name}" ক্যাটেগরিতে প্রশ্নপত্র পেস্ট হয়েছে`);
      }
      await loadData();
    } catch (err: any) {
      console.error('Paste failed:', err);
      showToast(err?.message || 'পেস্ট করতে সমস্যা হয়েছে');
    }
  };

  const handleShareCategory = async (cat: Category) => {
    try {
      const ok = await exportCategoryShare(cat.id);
      if (!ok) showToast('ক্যাটেগরি শেয়ার করা সম্ভব হয়নি');
    } catch (err: any) {
      console.error('Share category failed:', err);
      showToast(err?.message || 'ক্যাটেগরি শেয়ার ব্যর্থ হয়েছে');
    }
  };

  const handleSharePaper = async (paper: Paper) => {
    try {
      const ok = await exportPaperShare(paper.id);
      if (!ok) showToast('প্রশ্নপত্র শেয়ার করা সম্ভব হয়নি');
    } catch (err: any) {
      console.error('Share paper failed:', err);
      showToast(err?.message || 'প্রশ্নপত্র শেয়ার ব্যর্থ হয়েছে');
    }
  };

  const handleImportCategoryFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const payload = parseCategoryShare(text);
      const result = await importCategoryShare(payload);
      showToast(
        `"${result.categoryName}" ক্যাটেগরিতে ${toBn(result.papersAdded)}টি প্রশ্নপত্র যুক্ত হয়েছে` +
          (result.papersSkipped ? ` (${toBn(result.papersSkipped)}টি আগে থেকেই ছিল)` : ''),
        3500
      );
      await loadData();
    } catch (err: any) {
      console.error('Import category failed:', err);
      showToast(err?.message || 'ইমপোর্ট ব্যর্থ হয়েছে', 3000);
    }
  };

  const handlePickDestination = async (target: Category) => {
    if (!picker) return;
    const { mode, paper } = picker;
    setPicker(null);
    try {
      if (mode === 'move') {
        await movePaperToCategory(paper.id, target.id);
        showToast(`প্রশ্নপত্র "${target.name}" ক্যাটেগরিতে সরানো হয়েছে`);
      } else {
        await duplicatePaper(paper.id, target.id);
        showToast(`প্রশ্নপত্র "${target.name}" ক্যাটেগরিতে কপি হয়েছে`);
      }
      await loadData();
    } catch (err: any) {
      console.error('Move/copy paper failed:', err);
      showToast(err?.message || 'কাজটি সম্পন্ন করা যায়নি');
    }
  };

  const handleConfirmDeletePaper = async () => {
    if (!deletePaperTarget) return;
    try {
      await deletePaper(deletePaperTarget.id);
      showToast('প্রশ্নপত্র মুছে ফেলা হয়েছে');
      setDeletePaperTarget(null);
      await loadData();
    } catch (err) {
      console.error(err);
      showToast('মুছতে সমস্যা হয়েছে');
    }
  };

  // Clipboard banner (shown in categories list & category detail)
  const renderClipboardBanner = (target?: Category | null) => {
    if (!clipboard) return null;
    const isPaper = clipboard.type === 'paper';
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-[#3B4FD8] dark:border-indigo-500 bg-[#EEF2FF] dark:bg-indigo-950/60 px-3 py-2">
        <ClipboardPaste className="w-4 h-4 text-[#3B4FD8] dark:text-indigo-300 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[0.6875rem] font-bold text-[#2A3BB0] dark:text-indigo-200 truncate">
            {isPaper ? 'কপি করা প্রশ্নপত্র' : 'কপি করা ক্যাটেগরি'}: {clipboard.name}
          </p>
          {isPaper && !target && (
            <p className="text-[0.625rem] text-[#64748B] dark:text-slate-400">
              ক্যাটেগরির মেনু থেকে "এখানে পেস্ট করুন" চাপুন
            </p>
          )}
        </div>
        {(!isPaper || target) && (
          <button
            type="button"
            onClick={() => handlePaste(target)}
            className="min-h-[36px] px-3 py-1 rounded-lg bg-[#3B4FD8] text-white text-xs font-bold"
          >
            পেস্ট
          </button>
        )}
        <button
          type="button"
          aria-label="কপি বাতিল"
          onClick={handleClearClipboard}
          className="min-h-[36px] w-8 flex items-center justify-center text-[#64748B] dark:text-slate-400"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  };

  // Share App
  const handleShareApp = async () => {
    try {
      await Share.share({
        title: 'Qb Collection & Exam',
        text: 'Qb Collection & Exam - অফলাইন প্রশ্ন ব্যাংক তৈরি ও পরীক্ষা ব্যবস্থাপনা অ্যাপ',
        dialogTitle: 'অ্যাপটি শেয়ার করুন',
      });
    } catch {
      showToast('শেয়ার সম্পন্ন বা সমর্থিত নয়');
    }
  };

  // Export Question Collection
  const handleExportCollection = async (scope: CqScope = 'type') => {
    setIsExporting(true);
    try {
      const ok = await exportQuestionCollection(scope);
      if (ok) {
        showToast('প্রশ্ন কালেকশন সফলভাবে এক্সপোর্ট হয়েছে');
      } else {
        showToast('কালেকশন এক্সপোর্ট করা সম্ভব হয়নি');
      }
    } catch (err) {
      console.error('Export collection failed:', err);
      showToast('কালেকশন এক্সপোর্ট ব্যর্থ হয়েছে');
    } finally {
      setIsExporting(false);
    }
  };

  // Full System Backup
  const handleFullBackup = async (scope: CqScope = 'type') => {
    setIsExporting(true);
    try {
      const ok = await exportFullBackup(scope);
      if (ok) {
        showToast('সম্পূর্ণ ডাটাবেস ব্যাকআপ সম্পন্ন হয়েছে');
      } else {
        showToast('ব্যাকআপ ফাইল সংরক্ষণ করা যায়নি');
      }
    } catch (err) {
      console.error('Backup failed:', err);
      showToast('ব্যাকআপ নিতে সমস্যা হয়েছে');
    } finally {
      setIsExporting(false);
    }
  };

  // Restore file
  const handleRestoreFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setRestoreJsonContent(text);
      setShowRestoreConfirm(true);
    } catch (err) {
      console.error('Failed to read restore file:', err);
      showToast('ফাইল পড়তে ব্যর্থ হয়েছে');
    }
    e.target.value = '';
  };

  const handleConfirmRestore = async () => {
    if (!restoreJsonContent) return;
    try {
      await restoreFullBackup(restoreJsonContent);
      showToast('ডাটাবেস সফলভাবে রিস্টোর হয়েছে। অ্যাপ রিলোড হচ্ছে...');
      setShowRestoreConfirm(false);
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err: any) {
      console.error('Restore failed:', err);
      showToast(`রিস্টোর ব্যর্থ: ${err.message || 'ভুল ফরম্যাট'}`);
      setShowRestoreConfirm(false);
    }
  };

  const menuItems = [
    {
      id: 'share',
      label: 'অ্যাপ শেয়ার করুন',
      icon: <Share2 className="w-4 h-4 text-[#3B4FD8]" />,
      onClick: handleShareApp,
    },
    {
      id: 'about',
      label: 'অ্যাপ পরিচিতি',
      icon: <Info className="w-4 h-4 text-[#64748B]" />,
      onClick: () =>
        showToast(`Qb Collection & Exam • অফলাইন মোড • ভার্সন ${toBn('1.0')}`, 3000),
    },
  ];

  const profileRows = [
    {
      id: 'categories',
      title: 'ক্যাটেগরি',
      description: 'প্রশ্নপত্রের ক্যাটেগরি, সংরক্ষিত প্রশ্নপত্র ও PDF এক্সপোর্ট',
      icon: <FolderKanban className="w-5 h-5 text-[#3B4FD8]" />,
      action: () => setViewMode('categories'),
    },
    {
      id: 'backup',
      title: 'ব্যাকআপ ও রিস্টোর',
      description: 'Type CQ / Chapter CQ এর সম্পূর্ণ ব্যাকআপ নিন বা ফিরিয়ে আনুন',
      icon: <HardDriveDownload className="w-5 h-5 text-[#3B4FD8]" />,
      action: () => setBackupSheetOpen(true),
    },
    {
      id: 'transfer',
      title: 'ইমপোর্ট / এক্সপোর্ট',
      description: 'প্রশ্ন কালেকশন (JSON) অন্য ডিভাইস থেকে আনুন বা অন্য ডিভাইসে পাঠান',
      icon: <Download className="w-5 h-5 text-indigo-600" />,
      action: () => setTransferSheetOpen(true),
    },
    {
      id: 'settings',
      title: 'Settings (সেটিংস)',
      description: 'থিম (লাইট/ডার্ক), লেখার সাইজ ও ডিফল্ট শিরোনাম পরিবর্তন',
      icon: <Settings className="w-5 h-5 text-[#2A3BB0]" />,
      action: () => setShowSettingsModal(true),
    },
  ];

  // Three-dot menu of the category LIST screen
  const categoryListMenu = [
    {
      id: 'new-category',
      label: 'নতুন ক্যাটেগরি',
      icon: <Plus className="w-4 h-4 text-[#3B4FD8]" />,
      onClick: handleOpenAddCategory,
    },
    {
      id: 'import-category',
      label: 'ফাইল ইমপোর্ট (ক্যাটেগরি/প্রশ্নপত্র)',
      icon: <Upload className="w-4 h-4 text-emerald-600" />,
      onClick: () => importCategoryInputRef.current?.click(),
    },
    ...(clipboard?.type === 'category'
      ? [
          {
            id: 'paste-category',
            label: 'ক্যাটেগরি পেস্ট করুন',
            icon: <ClipboardPaste className="w-4 h-4 text-emerald-600" />,
            onClick: () => handlePaste(null),
          },
        ]
      : []),
  ];

  // Three-dot menu of ONE category (its papers)
  const categoryDetailMenu = selectedCategory
    ? selectMode
      ? [
          {
            id: 'select-all',
            label: 'সব নির্বাচন করুন',
            icon: <CheckSquare className="w-4 h-4 text-[#3B4FD8]" />,
            onClick: selectAllPapers,
          },
          {
            id: 'clear',
            label: 'নির্বাচন বাতিল',
            icon: <X className="w-4 h-4 text-[#64748B]" />,
            onClick: exitSelectMode,
          },
        ]
      : [
          {
            id: 'select-papers',
            label: 'প্রশ্নপত্র নির্বাচন করুন',
            icon: <CheckSquare className="w-4 h-4 text-[#3B4FD8]" />,
            onClick: () => setSelectMode(true),
          },
          {
            id: 'export-all',
            label: 'সব প্রশ্নপত্র PDF এক্সপোর্ট',
            icon: <FolderDown className="w-4 h-4 text-[#3B4FD8]" />,
            onClick: () => handleExportCategoryPdfs(selectedCategory),
          },
          ...(clipboard?.type === 'paper'
            ? [
                {
                  id: 'paste-paper',
                  label: 'এখানে প্রশ্নপত্র পেস্ট করুন',
                  icon: <ClipboardPaste className="w-4 h-4 text-emerald-600" />,
                  onClick: () => handlePaste(selectedCategory),
                },
              ]
            : []),
          {
            id: 'share-category',
            label: 'ক্যাটেগরি শেয়ার (ফাইল)',
            icon: <Share2 className="w-4 h-4 text-[#3B4FD8]" />,
            onClick: () => handleShareCategory(selectedCategory),
          },
          ...(isUncategorizedName(selectedCategory.name)
            ? []
            : [
                {
                  id: 'rename-category',
                  label: 'নাম সম্পাদনা',
                  icon: <Edit2 className="w-4 h-4 text-[#3B4FD8]" />,
                  onClick: () => handleRenameCategory(selectedCategory),
                },
              ]),
        ]
    : [];

  return (
    <div className="flex-1 flex flex-col min-h-full pb-20 bg-[#F2F4F8] dark:bg-slate-900 transition-colors">
      {/* ----------------- SUB-VIEW: CATEGORY DETAIL ----------------- */}
      {viewMode === 'category-detail' && selectedCategory && (
        <>
          <Header
            title={selectMode ? `${toBn(picked.size)}টি নির্বাচিত` : selectedCategory.name}
            subtitle={selectMode ? 'প্রশ্নপত্র নির্বাচন মোড' : 'ক্যাটেগরির প্রশ্নপত্রসমূহ'}
            showBack={true}
            onBack={() => (selectMode ? exitSelectMode() : setViewMode('categories'))}
            menuItems={categoryDetailMenu}
          />

          <main className={`flex-1 p-3.5 space-y-3 ${selectMode ? 'pb-20' : ''}`}>
            {renderClipboardBanner(selectedCategory)}
            {categoryPapers.length === 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-3xl p-7 text-center border border-[#D5D9E2] dark:border-slate-700 space-y-3">
                <p className="text-sm font-semibold text-[#1B1F2A] dark:text-slate-100">
                  এই ক্যাটেগরিতে কোনো প্রশ্নপত্র নেই
                </p>
                <p className="text-xs text-[#64748B] dark:text-slate-400">
                  Create ট্যাব থেকে নতুন প্রশ্নপত্র তৈরি করার সময় এই ক্যাটেগরি নির্বাচন করুন।
                </p>
                <button
                  type="button"
                  onClick={() => switchTab('create')}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#3B4FD8] text-white text-xs font-bold"
                >
                  Create ট্যাবে যান
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {categoryPapers.map((paper) => {
                  const isExpanded = expandedPaperIds[paper.id];
                  const details = paperDetailsMap[paper.id] || [];
                  const dateStr = new Date(paper.createdAt || Date.now()).toLocaleDateString('bn-BD', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  });

                  return (
                    <div
                      key={paper.id}
                      className="bg-white dark:bg-slate-800 rounded-2xl border border-[#D5D9E2] dark:border-slate-700 shadow-xs overflow-hidden"
                    >
                      {/* Paper Top Card Summary */}
                      <div
                        onClick={() => (selectMode ? togglePicked(paper.id) : togglePaperExpand(paper))}
                        className={`p-3.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-[#F8FAFC] dark:hover:bg-slate-750 transition-colors ${
                          selectMode && picked.has(paper.id) ? 'bg-[#EEF2FF] dark:bg-indigo-950/50' : ''
                        }`}
                      >
                        {selectMode && (
                          <span className="shrink-0 text-[#3B4FD8] dark:text-indigo-300">
                            {picked.has(paper.id) ? (
                              <CheckSquare className="w-5 h-5" />
                            ) : (
                              <Square className="w-5 h-5 text-[#94A3B8]" />
                            )}
                          </span>
                        )}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-[#3B4FD8] dark:text-indigo-400 bg-[#EEF2FF] dark:bg-indigo-950 px-2 py-0.5 rounded-md border border-[#D5D9E2] dark:border-indigo-900 truncate">
                              {paper.shortName}
                            </span>
                            <span className="text-[0.6875rem] text-[#64748B] dark:text-slate-400">
                              {dateStr}
                            </span>
                          </div>
                          <h3 className="text-sm font-bold text-[#1B1F2A] dark:text-slate-100 truncate">
                            {paper.title}
                          </h3>
                          <p className="text-[0.6875rem] text-[#64748B] dark:text-slate-400 font-medium">
                            {toBn(paper.questionIds?.length || 0)}টি প্রশ্ন · পূর্ণমান {toBn(paper.totalMarks || 50)}
                          </p>
                        </div>

                        {!selectMode && (
                        <button
                          type="button"
                          aria-label="আরও অপশন"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPaperSheet(paper);
                          }}
                          className="shrink-0 min-h-[40px] min-w-[36px] flex items-center justify-center rounded-full text-[#64748B] dark:text-slate-400 hover:bg-[#F2F4F8] dark:hover:bg-slate-700"
                        >
                          <MoreVertical className="w-5 h-5" />
                        </button>
                        )}

                        {!selectMode && (
                          <div className="text-[#64748B] shrink-0 p-1">
                            {isExpanded ? (
                              <ChevronDown className="w-5 h-5 text-[#3B4FD8]" />
                            ) : (
                              <ChevronRight className="w-5 h-5" />
                            )}
                          </div>
                        )}
                      </div>

                      {/* Expanded Questions preview & Actions */}
                      {isExpanded && !selectMode && (
                        <div className="px-3.5 pb-3.5 pt-1 border-t border-[#F2F4F8] dark:border-slate-700 space-y-3 bg-[#FAFCFF] dark:bg-slate-850">
                          {/* Questions summary */}
                          <div className="space-y-2.5 pt-2">
                            {details.length === 0 ? (
                              <p className="text-xs text-[#64748B] italic">প্রশ্ন লোড হচ্ছে...</p>
                            ) : (
                              details.map((group, gIdx) => (
                                <div
                                  key={gIdx}
                                  className="text-xs p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 space-y-1.5"
                                >
                                  {group.stimulus && (
                                    <div className="space-y-1">
                                      <span className="font-bold text-[#3B4FD8] text-[0.6875rem] block">
                                        উদ্দীপক {toBn(gIdx + 1)}:
                                      </span>
                                      <RichText
                                        text={group.stimulus.text}
                                        className="text-xs text-[#1B1F2A] dark:text-slate-200 line-clamp-2 leading-relaxed"
                                      />
                                    </div>
                                  )}
                                  <div className="space-y-1 pt-1">
                                    {group.questions.map((q) => (
                                      <div
                                        key={q.id}
                                        className="text-[0.6875rem] text-[#334155] dark:text-slate-300 flex items-start gap-1"
                                      >
                                        <span className="font-bold shrink-0">{q.type || 'গ'}.</span>
                                        <RichText text={q.questionText} className="flex-1 truncate" />
                                        <span className="font-semibold text-[#64748B] shrink-0">
                                          ({toBn(q.marks)})
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>

                          {/* Action Buttons: "Create-এ খোলো" and "PDF" */}
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => handleOpenInCreate(paper)}
                              className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-[#3B4FD8] hover:bg-[#2A3BB0] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                            >
                              <ExternalLink className="w-4 h-4" />
                              <span>Create-এ খোলো</span>
                            </button>
                            <button
                              type="button"
                              disabled={exportingPaperId === paper.id}
                              onClick={() => handleExportPaperPdf(paper)}
                              className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-[#3B4FD8] text-[#3B4FD8] dark:text-indigo-400 hover:bg-[#EEF2FF] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                            >
                              <FileDown className="w-4 h-4" />
                              <span>{exportingPaperId === paper.id ? 'তৈরি হচ্ছে...' : 'PDF'}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        </>
      )}

      {/* ----------------- SUB-VIEW: CATEGORIES LIST ----------------- */}
      {viewMode === 'categories' && (
        <>
          <Header
            title="ক্যাটেগরি"
            subtitle="প্রশ্নপত্রের বিভাগ ও ক্যাটেগরি"
            showBack={true}
            onBack={() => setViewMode('main')}
            menuItems={categoryListMenu}
          />

          <main className="flex-1 p-3.5 space-y-3.5">
            {renderClipboardBanner(null)}

            {/* Top Bar with + New Category Button */}
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-[#1B1F2A] dark:text-slate-300">
                সকল ক্যাটেগরি ({toBn(categories.length)}টি)
              </span>
              <button
                type="button"
                onClick={handleOpenAddCategory}
                className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-[#3B4FD8] hover:bg-[#2A3BB0] text-white text-xs font-bold flex items-center gap-1 shadow-2xs"
              >
                <Plus className="w-4 h-4" />
                <span>নতুন ক্যাটেগরি</span>
              </button>
            </div>

            {/* Import a shared category / paper file */}
            <button
              type="button"
              onClick={() => importCategoryInputRef.current?.click()}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-dashed border-[#3B4FD8] dark:border-indigo-500 text-[#3B4FD8] dark:text-indigo-300 text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <Upload className="w-4 h-4" />
              <span>শেয়ার করা ক্যাটেগরি/প্রশ্নপত্র ফাইল ইমপোর্ট করুন</span>
            </button>
            <input
              ref={importCategoryInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportCategoryFile}
              className="hidden"
            />

            {/* List of Category Cards */}
            {categories.length === 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-3xl p-7 text-center border border-[#D5D9E2] dark:border-slate-700 space-y-3">
                <p className="text-sm font-semibold text-[#1B1F2A] dark:text-slate-100">
                  কোনো ক্যাটেগরি নেই
                </p>
                <button
                  type="button"
                  onClick={handleOpenAddCategory}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#3B4FD8] text-white text-xs font-bold"
                >
                  + ক্যাটেগরি তৈরি করুন
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {categories.map((cat) => {
                  const stats = catStats[cat.id] || { paperCount: 0, questionCount: 0 };

                  return (
                    <div
                      key={cat.id}
                      onClick={() => {
                        setSelectedCategory(cat);
                        setViewMode('category-detail');
                      }}
                      className="bg-white dark:bg-slate-800 hover:border-[#3B4FD8] dark:hover:border-indigo-500 rounded-2xl p-4 border border-[#D5D9E2] dark:border-slate-700 shadow-xs flex items-center justify-between gap-3 cursor-pointer transition-all group"
                    >
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-[#1B1F2A] dark:text-slate-100 group-hover:text-[#3B4FD8] transition-colors truncate flex items-center gap-1.5">
                          {isUncategorizedName(cat.name) && (
                            <Pin className="w-3.5 h-3.5 text-[#3B4FD8] dark:text-indigo-300 shrink-0" />
                          )}
                          <span className="truncate">{cat.name}</span>
                        </h3>
                        <p className="text-[0.6875rem] text-[#64748B] dark:text-slate-400 font-medium mt-0.5">
                          {toBn(stats.paperCount)}টি প্রশ্নপত্র · {toBn(stats.questionCount)}টি প্রশ্ন
                        </p>
                      </div>

                      {/* Right: Kebab Menu & Chevron */}
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          aria-label="আরও অপশন"
                          onClick={() => setCategorySheet(cat)}
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-[#64748B] dark:text-slate-400 hover:bg-[#F2F4F8] dark:hover:bg-slate-700"
                        >
                          <MoreVertical className="w-5 h-5" />
                        </button>
                        <ChevronRight className="w-5 h-5 text-[#94A3B8] group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        </>
      )}

      {/* ----------------- SUB-VIEW: MAIN PROFILE ----------------- */}
      {viewMode === 'main' && (
        <>
          <Header
            title="প্রোফাইল (Profile)"
            subtitle="পরিসংখ্যান, ব্যাকআপ ও সেটিংস"
            menuItems={menuItems}
          />

          <main className="flex-1 p-4 space-y-4">
            {/* Top Two Statistics Cards Side by Side */}
            <section className="grid grid-cols-2 gap-3">
              {/* Card 1: তৈরি প্রশ্নপত্র */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-[#D5D9E2] dark:border-slate-700 shadow-xs flex flex-col justify-between">
                <div className="w-9 h-9 rounded-xl bg-[#EEF2FF] dark:bg-indigo-950 flex items-center justify-center text-[#3B4FD8] dark:text-indigo-400 mb-2">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-2xl font-black text-[#1B1F2A] dark:text-slate-100 tracking-tight">
                    {loading ? '...' : toBn(paperCount)}
                  </span>
                  <p className="text-xs font-semibold text-[#64748B] dark:text-slate-400 mt-0.5">
                    তৈরি প্রশ্নপত্র
                  </p>
                </div>
              </div>

              {/* Card 2: মোট প্রশ্ন */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-[#D5D9E2] dark:border-slate-700 shadow-xs flex flex-col justify-between">
                <div className="w-9 h-9 rounded-xl bg-[#EEF2FF] dark:bg-indigo-950 flex items-center justify-center text-[#3B4FD8] dark:text-indigo-400 mb-2">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-2xl font-black text-[#2A3BB0] dark:text-indigo-300 tracking-tight">
                    {loading ? '...' : toBn(questionCount)}
                  </span>
                  <p className="text-xs font-semibold text-[#64748B] dark:text-slate-400 mt-0.5">
                    মোট প্রশ্ন
                  </p>
                </div>
              </div>
            </section>

            {/* Action List Section */}
            <section className="space-y-2.5">
              <h2 className="text-xs font-bold text-[#64748B] dark:text-slate-400 uppercase tracking-wider px-1">
                ডাটা ব্যবস্থাপনা ও সেটিংস
              </h2>

              <div className="space-y-2">
                {profileRows.map((row) => (
                  <div
                    key={row.id}
                    onClick={row.action}
                    className="bg-white dark:bg-slate-800 hover:border-[#3B4FD8] dark:hover:border-indigo-500 rounded-2xl p-3.5 border border-[#D5D9E2] dark:border-slate-700 shadow-2xs flex items-center justify-between gap-3 cursor-pointer transition-all active:scale-[0.99] select-none group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#F2F4F8] dark:bg-slate-700/60 flex items-center justify-center shrink-0 group-hover:bg-[#EEF2FF] dark:group-hover:bg-indigo-950/60 transition-colors">
                        {row.icon}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-xs font-bold text-[#1B1F2A] dark:text-slate-100 group-hover:text-[#3B4FD8] dark:group-hover:text-indigo-400 transition-colors truncate">
                          {row.title}
                        </h3>
                        <p className="text-[0.6875rem] text-[#64748B] dark:text-slate-400 leading-snug line-clamp-1 mt-0.5">
                          {row.description}
                        </p>
                      </div>
                    </div>

                    <div className="min-h-[44px] min-w-[32px] flex items-center justify-end text-[#94A3B8] group-hover:text-[#3B4FD8] transition-colors shrink-0">
                      <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Hidden File Input for Database Restore */}
            <input
              ref={restoreFileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleRestoreFileSelected}
              className="hidden"
            />
          </main>
        </>
      )}

      {/* Category options (edit / copy / paste / share / delete) */}
      <ActionSheet
        isOpen={Boolean(categorySheet)}
        title={categorySheet?.name}
        subtitle="ক্যাটেগরি অপশন"
        onClose={() => setCategorySheet(null)}
        items={
          categorySheet
            ? [
                {
                  id: 'export-pdf',
                  label: 'PDF এক্সপোর্ট (নতুন ফোল্ডারে)',
                  icon: <FolderDown className="w-5 h-5 text-[#3B4FD8]" />,
                  onClick: () => handleExportCategoryPdfs(categorySheet),
                },
                ...(isUncategorizedName(categorySheet.name)
                  ? []
                  : [
                      {
                        id: 'rename',
                        label: 'নাম সম্পাদনা (Edit)',
                        icon: <Edit2 className="w-5 h-5 text-[#3B4FD8]" />,
                        onClick: () => handleRenameCategory(categorySheet),
                      },
                    ]),
                {
                  id: 'copy',
                  label: 'ক্যাটেগরি কপি করুন',
                  icon: <Copy className="w-5 h-5 text-[#3B4FD8]" />,
                  onClick: () => handleCopyCategory(categorySheet),
                },
                ...(clipboard?.type === 'paper'
                  ? [
                      {
                        id: 'paste-paper',
                        label: 'এখানে প্রশ্নপত্র পেস্ট করুন',
                        icon: <ClipboardPaste className="w-5 h-5 text-emerald-600" />,
                        onClick: () => handlePaste(categorySheet),
                      },
                    ]
                  : []),
                {
                  id: 'share',
                  label: 'শেয়ার করুন (ফাইল)',
                  icon: <Share2 className="w-5 h-5 text-[#3B4FD8]" />,
                  onClick: () => handleShareCategory(categorySheet),
                },
                ...(isUncategorizedName(categorySheet.name)
                  ? []
                  : [
                      {
                        id: 'delete',
                        label: 'মুছে ফেলুন',
                        icon: <Trash2 className="w-5 h-5 text-red-500" />,
                        isDestructive: true,
                        onClick: () =>
                          setDeleteCatConfirm({
                            isOpen: true,
                            catId: categorySheet.id,
                            catName: categorySheet.name,
                          }),
                      },
                    ]),
              ]
            : []
        }
      />

      {/* Paper options (edit / move / copy / share / delete) */}
      <ActionSheet
        isOpen={Boolean(paperSheet)}
        title={paperSheet?.title || paperSheet?.shortName}
        subtitle="প্রশ্নপত্র অপশন"
        onClose={() => setPaperSheet(null)}
        items={
          paperSheet
            ? [
                {
                  id: 'edit',
                  label: 'সম্পাদনা (Create-এ খুলুন)',
                  icon: <Edit2 className="w-5 h-5 text-[#3B4FD8]" />,
                  onClick: () => handleOpenInCreate(paperSheet),
                },
                {
                  id: 'move',
                  label: 'অন্য ক্যাটেগরিতে সরান (Move)',
                  icon: <FolderInput className="w-5 h-5 text-[#3B4FD8]" />,
                  onClick: () => setPicker({ mode: 'move', paper: paperSheet }),
                },
                {
                  id: 'copy-to',
                  label: 'অন্য ক্যাটেগরিতে কপি করুন',
                  icon: <Layers className="w-5 h-5 text-[#3B4FD8]" />,
                  onClick: () => setPicker({ mode: 'copy', paper: paperSheet }),
                },
                {
                  id: 'copy',
                  label: 'কপি করুন (পরে পেস্ট করতে)',
                  icon: <Copy className="w-5 h-5 text-[#3B4FD8]" />,
                  onClick: () => handleCopyPaper(paperSheet),
                },
                {
                  id: 'share',
                  label: 'শেয়ার করুন (ফাইল)',
                  icon: <Share2 className="w-5 h-5 text-[#3B4FD8]" />,
                  onClick: () => handleSharePaper(paperSheet),
                },
                {
                  id: 'delete',
                  label: 'মুছে ফেলুন',
                  icon: <Trash2 className="w-5 h-5 text-red-500" />,
                  isDestructive: true,
                  onClick: () => setDeletePaperTarget(paperSheet),
                },
              ]
            : []
        }
      />

      {/* Destination picker for Move / Copy */}
      <CategoryPickerDialog
        isOpen={Boolean(picker)}
        title={picker?.mode === 'move' ? 'কোন ক্যাটেগরিতে সরাবেন?' : 'কোন ক্যাটেগরিতে কপি করবেন?'}
        categories={categories}
        excludeId={picker?.mode === 'move' ? picker.paper.categoryId : null}
        stats={catStats}
        onPick={handlePickDestination}
        onCancel={() => setPicker(null)}
      />

      {/* Delete Paper Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deletePaperTarget)}
        title="প্রশ্নপত্র মুছবেন?"
        message={`"${deletePaperTarget?.title || deletePaperTarget?.shortName || ''}" প্রশ্নপত্রটি মুছে যাবে (কালেকশনের প্রশ্নগুলো মুছবে না)।`}
        confirmText="হ্যাঁ, মুছে ফেলুন"
        cancelText="না"
        isDestructive={true}
        onConfirm={handleConfirmDeletePaper}
        onCancel={() => setDeletePaperTarget(null)}
      />

      {/* Category Add / Rename Prompt */}
      <PromptDialog
        isOpen={categoryPrompt.isOpen}
        title={categoryPrompt.title}
        initialValue={categoryPrompt.initialValue}
        onConfirm={categoryPrompt.onConfirm}
        onCancel={() => setCategoryPrompt((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Delete Category Confirmation */}
      <ConfirmDialog
        isOpen={deleteCatConfirm.isOpen}
        title="ক্যাটেগরি মুছবেন?"
        message={`"${deleteCatConfirm.catName}" ক্যাটেগরি মুছলে এর অন্তর্গত প্রশ্নপত্রগুলো 'অশ্রেণিবদ্ধ' ক্যাটেগরিতে চলে যাবে (কোনো প্রশ্নপত্র মুছে যাবে না)।`}
        confirmText="হ্যাঁ, মুছে ফেলুন"
        cancelText="না"
        isDestructive={true}
        onConfirm={handleConfirmDeleteCategory}
        onCancel={() => setDeleteCatConfirm({ isOpen: false, catId: null, catName: '' })}
      />

      {/* Restore Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showRestoreConfirm}
        title="ডাটাবেস রিস্টোর করবেন?"
        message="সতর্কতা: এটি পূর্বের সকল প্রশ্নপত্র ও তথ্য পরিবর্তন করে ব্যাকআপ ফাইলের ডাটা স্থাপন করবে।"
        confirmText="হ্যাঁ, রিস্টোর করুন"
        cancelText="বাতিল"
        isDestructive={true}
        onConfirm={handleConfirmRestore}
        onCancel={() => setShowRestoreConfirm(false)}
      />

      {/* Backup / Restore choices */}
      <ActionSheet
        isOpen={backupSheetOpen}
        title="ব্যাকআপ ও রিস্টোর"
        subtitle="সম্পূর্ণ ডাটাবেস (প্রশ্ন, ছবি, প্রশ্নপত্র, সেটিংস)"
        onClose={() => setBackupSheetOpen(false)}
        items={[
          {
            id: 'backup-type',
            label: 'Type CQ ব্যাকআপ নিন',
            icon: <HardDriveDownload className="w-5 h-5 text-[#3B4FD8]" />,
            onClick: () => handleFullBackup('type'),
          },
          {
            id: 'backup-chapter',
            label: 'Chapter CQ ব্যাকআপ নিন',
            icon: <HardDriveDownload className="w-5 h-5 text-emerald-600" />,
            onClick: () => handleFullBackup('chapter'),
          },
          {
            id: 'restore',
            label: 'ব্যাকআপ ফাইল থেকে রিস্টোর',
            icon: <HardDriveUpload className="w-5 h-5 text-amber-600" />,
            onClick: () => restoreFileInputRef.current?.click(),
          },
        ]}
      />

      {/* Import / Export choices */}
      <ActionSheet
        isOpen={transferSheetOpen}
        title="ইমপোর্ট / এক্সপোর্ট"
        subtitle="প্রশ্ন কালেকশন (JSON ফাইল)"
        onClose={() => setTransferSheetOpen(false)}
        items={[
          {
            id: 'import-type',
            label: 'Type CQ ইমপোর্ট',
            icon: <Upload className="w-5 h-5 text-emerald-600" />,
            onClick: () => setShowImportModal(true),
          },
          {
            id: 'export-type',
            label: 'Type CQ এক্সপোর্ট',
            icon: <Download className="w-5 h-5 text-indigo-600" />,
            onClick: () => handleExportCollection('type'),
          },
          {
            id: 'import-chapter',
            label: 'Chapter CQ ইমপোর্ট',
            icon: <Upload className="w-5 h-5 text-emerald-600" />,
            onClick: () => setShowImportChapterModal(true),
          },
          {
            id: 'export-chapter',
            label: 'Chapter CQ এক্সপোর্ট',
            icon: <Download className="w-5 h-5 text-indigo-600" />,
            onClick: () => handleExportCollection('chapter'),
          },
        ]}
      />

      {/* Multi-select action bar (inside a category) */}
      {selectMode && viewMode === 'category-detail' && (
        <div
          className="fixed left-0 right-0 z-40"
          style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="max-w-[390px] mx-auto bg-white dark:bg-slate-900 border-t border-[#D5D9E2] dark:border-slate-700 shadow-[0_-4px_14px_rgba(0,0,0,0.08)] px-2 py-1.5 grid grid-cols-3 gap-1">
            {[
              { id: 'pdf', label: 'PDF', icon: <FileDown className="w-5 h-5" />, onClick: handleExportPickedPdfs, danger: false },
              { id: 'move', label: 'ক্যাটেগরি', icon: <FolderInput className="w-5 h-5" />, onClick: () => setMovePickerOpen(true), danger: false },
              { id: 'delete', label: 'ডিলিট', icon: <Trash2 className="w-5 h-5" />, onClick: () => setDeletePickedOpen(true), danger: true },
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

      <CategoryPickerDialog
        isOpen={movePickerOpen}
        title={`${toBn(picked.size)}টি প্রশ্নপত্র কোন ক্যাটেগরিতে নেবেন?`}
        categories={categories}
        excludeId={selectedCategory?.id ?? null}
        stats={catStats}
        onPick={handleMovePicked}
        onCancel={() => setMovePickerOpen(false)}
      />

      <ConfirmDialog
        isOpen={deletePickedOpen}
        title="প্রশ্নপত্র মুছবেন?"
        message={`নির্বাচিত ${toBn(picked.size)}টি প্রশ্নপত্র স্থায়ীভাবে মুছে ফেলতে চান? (কালেকশনের প্রশ্নগুলো মুছবে না)`}
        confirmText="হ্যাঁ, মুছে ফেলুন"
        cancelText="না"
        isDestructive={true}
        onConfirm={handleDeletePicked}
        onCancel={() => setDeletePickedOpen(false)}
      />

      {/* Batch PDF export progress */}
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
                    {batchResult.folder ? (
                      <>
                        নতুন ফোল্ডার: <span className="font-semibold">{batchResult.folder}</span>
                      </>
                    ) : (
                      'ব্রাউজারের ডাউনলোড ফোল্ডারে সেভ হয়েছে'
                    )}
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

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />

      {/* Import Collection Modal */}
      <ImportCollectionModal
        isOpen={showImportModal}
        scope="type"
        onClose={() => setShowImportModal(false)}
        onSuccess={() => {
          loadData();
          showToast('কালেকশন সফলভাবে ইমপোর্ট সম্পন্ন হয়েছে');
        }}
      />

      <ImportCollectionModal
        isOpen={showImportChapterModal}
        scope="chapter"
        onClose={() => setShowImportChapterModal(false)}
        onSuccess={() => {
          loadData();
          showToast('কালেকশন সফলভাবে ইমপোর্ট সম্পন্ন হয়েছে');
        }}
      />

      {/* Paper View Modal (from Category Detail view) */}
      <PaperViewModal
        paperId={viewPaperId}
        isOpen={Boolean(viewPaperId)}
        onClose={() => setViewPaperId(null)}
        onEdit={(paper) => {
          setViewPaperId(null);
          switchTab('create');
        }}
        onDeleted={loadData}
      />

      {/* PDF Failure Error Modal showing real error.message */}
      {pdfErrorMessage && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in"
        >
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl p-5 border border-red-200 dark:border-red-900 shadow-2xl space-y-3">
            <div className="flex items-center gap-2 text-red-600 font-bold text-sm">
              <AlertTriangle className="w-5 h-5" />
              <span>PDF তৈরিতে ত্রুটি</span>
            </div>
            <p className="text-xs text-[#1B1F2A] dark:text-slate-200 bg-red-50 dark:bg-red-950/40 p-3 rounded-xl border border-red-100 dark:border-red-900 font-mono break-all leading-relaxed">
              {pdfErrorMessage}
            </p>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setPdfErrorMessage(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#3B4FD8] text-white text-xs font-bold"
              >
                ঠিক আছে
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileScreen;
