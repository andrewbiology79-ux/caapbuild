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
import { PopupMenu } from '../components/PopupMenu';
import { TransferChoiceDialog } from '../components/TransferChoiceDialog';
import { RestoreModeDialog } from '../components/RestoreModeDialog';
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
  deleteCategories,
  reorderCategories,
  isUncategorizedCategory,
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
  exportAppFullBackup,
  restoreAppBackup,
  inspectBackupFile,
  exportQuestionCollection,
  type RestoreMode,
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
  FolderDown,
  FileArchive,
  Pin,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ListOrdered,
  Check,
} from 'lucide-react';
import { Share } from '@capacitor/share';
import { exportPaperById, exportCategoriesToFolders, type CategoriesPdfResult } from '../utils/pdfGenerator';
import { showPdfSavedDialog, openSavedFolder, PDF_SAVE_FOLDER } from '../utils/storageAccess';
import { Capacitor } from '@capacitor/core';
import {
  exportCategoryShare,
  exportCategoriesBackup,
  exportPaperShare,
  parseCategoryShare,
  importCategoryShare,
} from '../utils/categoryTransfer';

type CategorySortMode = 'custom' | 'name-asc' | 'name-desc' | 'newest' | 'oldest' | 'papers-desc' | 'papers-asc';

const SORT_OPTIONS: Array<{ id: CategorySortMode; label: string }> = [
  { id: 'custom', label: 'আমার সাজানো ক্রম (রি-অর্ডার)' },
  { id: 'name-asc', label: 'নাম (অ → হ)' },
  { id: 'name-desc', label: 'নাম (হ → অ)' },
  { id: 'newest', label: 'নতুন আগে' },
  { id: 'oldest', label: 'পুরোনো আগে' },
  { id: 'papers-desc', label: 'বেশি প্রশ্নপত্র আগে' },
  { id: 'papers-asc', label: 'কম প্রশ্নপত্র আগে' },
];

const CATEGORY_SORT_META_KEY = 'category_sort_mode';

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
  const [picker, setPicker] = useState<{ mode: 'move' | 'copy'; paper: Paper } | null>(null);
  const [deletePaperTarget, setDeletePaperTarget] = useState<Paper | null>(null);
  const importCategoryInputRef = useRef<HTMLInputElement>(null);

  // Full backup restore (file -> choose replace / merge)
  const restoreFileInputRef = useRef<HTMLInputElement>(null);
  const [restoreJsonContent, setRestoreJsonContent] = useState<string | null>(null);
  const [restoreInfo, setRestoreInfo] = useState<{ fileName: string; questions: number; papers: number } | null>(null);
  const [restoring, setRestoring] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Import / Export choice popups (Type CQ, Chapter CQ, Full backup)
  const [transferChoice, setTransferChoice] = useState<'type' | 'chapter' | 'full' | null>(null);

  // Multi-select of categories (ribbon menu: select / backup export / PDF export)
  const [selectMode, setSelectMode] = useState<boolean>(false);
  const [selectPurpose, setSelectPurpose] = useState<'backup' | 'pdf' | 'delete' | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState<boolean>(false);

  // Sort / manual re-order of categories
  const [sortMode, setSortMode] = useState<CategorySortMode>('custom');
  const [showSortDialog, setShowSortDialog] = useState<boolean>(false);
  const [reorderMode, setReorderMode] = useState<boolean>(false);
  const [selectedCatIds, setSelectedCatIds] = useState<string[]>([]);
  const [pdfProgress, setPdfProgress] = useState<{ done: number; total: number } | null>(null);
  const [pdfResult, setPdfResult] = useState<CategoriesPdfResult | null>(null);

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

  // remembered sort mode
  useEffect(() => {
    db.meta
      .get(CATEGORY_SORT_META_KEY)
      .then((rec) => {
        const v = rec?.value as CategorySortMode | undefined;
        if (v && SORT_OPTIONS.some((o) => o.id === v)) setSortMode(v);
      })
      .catch(() => {});
  }, []);

  const changeSortMode = async (mode: CategorySortMode) => {
    setSortMode(mode);
    try {
      await db.meta.put({ key: CATEGORY_SORT_META_KEY, value: mode });
    } catch (err) {
      console.warn('Could not save sort mode', err);
    }
  };

  // "অশ্রেণিবদ্ধ" (uncategorized) is always pinned on top, the rest follows the chosen sort
  const visibleCategories = React.useMemo(() => {
    const pinned = categories.filter((c) => isUncategorizedCategory(c));
    const rest = categories.filter((c) => !isUncategorizedCategory(c));
    const papersOf = (c: Category) => catStats[c.id]?.paperCount || 0;
    const collator = new Intl.Collator('bn');
    const sorted = [...rest].sort((a, b) => {
      switch (sortMode) {
        case 'name-asc':
          return collator.compare(a.name, b.name);
        case 'name-desc':
          return collator.compare(b.name, a.name);
        case 'newest':
          return (b.createdAt || 0) - (a.createdAt || 0);
        case 'oldest':
          return (a.createdAt || 0) - (b.createdAt || 0);
        case 'papers-desc':
          return papersOf(b) - papersOf(a);
        case 'papers-asc':
          return papersOf(a) - papersOf(b);
        default:
          return (a.order || 0) - (b.order || 0);
      }
    });
    return [...pinned, ...sorted];
  }, [categories, catStats, sortMode]);

  const enterReorderMode = async () => {
    // manual order starts from what is currently shown
    await reorderCategories(visibleCategories.filter((c) => !isUncategorizedCategory(c)).map((c) => c.id));
    await changeSortMode('custom');
    await loadData();
    setReorderMode(true);
  };

  const moveCategory = async (id: string, dir: -1 | 1) => {
    const ids = visibleCategories.filter((c) => !isUncategorizedCategory(c)).map((c) => c.id);
    const idx = ids.indexOf(id);
    const to = idx + dir;
    if (idx < 0 || to < 0 || to >= ids.length) return;
    [ids[idx], ids[to]] = [ids[to], ids[idx]];
    try {
      await reorderCategories(ids);
      await loadData();
    } catch (err) {
      console.error('Reorder failed:', err);
      showToast('ক্রম বদলানো যায়নি');
    }
  };

  // Back button handling
  const handleGoBack = useCallback((): boolean => {
    if (reorderMode) {
      setReorderMode(false);
      return true;
    }
    if (selectMode) {
      setSelectMode(false);
      setSelectPurpose(null);
      setSelectedCatIds([]);
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
  }, [viewMode, selectMode, reorderMode]);

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

  // ---------- Multi-select of categories ----------

  const enterSelectMode = (purpose: 'backup' | 'pdf' | 'delete' | null) => {
    setSelectMode(true);
    setSelectPurpose(purpose);
    setSelectedCatIds([]);
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectPurpose(null);
    setSelectedCatIds([]);
  };

  const toggleCatSelected = (id: string) =>
    setSelectedCatIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const selectAllCategories = () => setSelectedCatIds(visibleCategories.map((c) => c.id));

  // Backup file of the selected categories
  const handleExportSelectedBackup = async () => {
    if (selectedCatIds.length === 0) {
      showToast('কমপক্ষে একটি ক্যাটেগরি নির্বাচন করুন');
      return;
    }
    setIsExporting(true);
    try {
      const ok = await exportCategoriesBackup(selectedCatIds);
      showToast(ok ? 'ক্যাটেগরি ব্যাকআপ ফাইল তৈরি হয়েছে' : 'ব্যাকআপ ফাইল তৈরি করা যায়নি');
      if (ok) exitSelectMode();
    } catch (err: any) {
      console.error('Category backup failed:', err);
      showToast(err?.message || 'ব্যাকআপ ব্যর্থ হয়েছে');
    } finally {
      setIsExporting(false);
    }
  };

  // PDFs of the given categories: one new folder per category (named after the category)
  const runCategoriesPdfExport = async (cats: Category[]) => {
    if (cats.length === 0 || pdfProgress) return;
    setPdfProgress({ done: 0, total: 1 });
    try {
      const groups: Array<{ name: string; paperIds: string[] }> = [];
      for (const cat of cats) {
        const papers = await getPapersByCategory(cat.id);
        groups.push({ name: cat.name, paperIds: papers.map((p) => p.id) });
      }
      if (groups.every((g) => g.paperIds.length === 0)) {
        showToast(cats.length === 1 ? 'এই ক্যাটেগরিতে কোনো প্রশ্নপত্র নেই' : 'নির্বাচিত ক্যাটেগরিগুলোতে কোনো প্রশ্নপত্র নেই');
        return;
      }
      const result = await exportCategoriesToFolders(groups, (done, total) => setPdfProgress({ done, total }));
      setPdfResult(result);
      exitSelectMode();
    } catch (err: any) {
      console.error('Category PDF export failed:', err);
      setPdfErrorMessage(err?.message || 'পিডিএফ তৈরিতে অপ্রত্যাশিত সমস্যা হয়েছে।');
    } finally {
      setPdfProgress(null);
    }
  };

  const handleExportSelectedPdf = () => {
    if (selectedCatIds.length === 0) {
      showToast('কমপক্ষে একটি ক্যাটেগরি নির্বাচন করুন');
      return;
    }
    runCategoriesPdfExport(categories.filter((c) => selectedCatIds.includes(c.id)));
  };

  const handleBulkDeleteClick = () => {
    const deletable = categories.filter((c) => selectedCatIds.includes(c.id) && !isUncategorizedCategory(c));
    if (deletable.length === 0) {
      showToast(
        selectedCatIds.length === 0
          ? 'কমপক্ষে একটি ক্যাটেগরি নির্বাচন করুন'
          : '"অশ্রেণিবদ্ধ" ক্যাটেগরি মোছা যায় না'
      );
      return;
    }
    setBulkDeleteConfirm(true);
  };

  const handleConfirmBulkDelete = async () => {
    setBulkDeleteConfirm(false);
    try {
      const ids = categories
        .filter((c) => selectedCatIds.includes(c.id) && !isUncategorizedCategory(c))
        .map((c) => c.id);
      const n = await deleteCategories(ids);
      showToast(`${toBn(n)}টি ক্যাটেগরি মুছে ফেলা হয়েছে (প্রশ্নপত্র "অশ্রেণিবদ্ধ" এ গেছে)`, 3500);
      exitSelectMode();
      await loadData();
    } catch (err: any) {
      console.error('Bulk delete failed:', err);
      showToast(err?.message || 'ক্যাটেগরি মুছতে ব্যর্থ');
    }
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

  // Full app backup (everything)
  const handleFullBackup = async () => {
    setIsExporting(true);
    try {
      const ok = await exportAppFullBackup();
      showToast(ok ? 'সম্পূর্ণ অ্যাপ ব্যাকআপ সম্পন্ন হয়েছে' : 'ব্যাকআপ ফাইল সংরক্ষণ করা যায়নি');
    } catch (err) {
      console.error('Backup failed:', err);
      showToast('ব্যাকআপ নিতে সমস্যা হয়েছে');
    } finally {
      setIsExporting(false);
    }
  };

  // Restore file picked -> ask replace / merge
  const handleRestoreFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const info = inspectBackupFile(text);
      setRestoreJsonContent(text);
      setRestoreInfo({ fileName: file.name, questions: info.questions, papers: info.papers });
    } catch (err: any) {
      console.error('Failed to read restore file:', err);
      showToast(err?.message || 'ফাইল পড়তে ব্যর্থ হয়েছে', 3500);
    }
  };

  const handleRunRestore = async (mode: RestoreMode) => {
    if (!restoreJsonContent) return;
    setRestoring(true);
    try {
      await restoreAppBackup(restoreJsonContent, mode);
      showToast(
        mode === 'replace'
          ? 'ডাটাবেস রিপ্লেস সম্পন্ন। অ্যাপ রিলোড হচ্ছে...'
          : 'ব্যাকআপের ডাটা যুক্ত হয়েছে। অ্যাপ রিলোড হচ্ছে...'
      );
      setRestoreJsonContent(null);
      setRestoreInfo(null);
      setTimeout(() => window.location.reload(), 1000);
    } catch (err: any) {
      console.error('Restore failed:', err);
      showToast(`ইমপোর্ট ব্যর্থ: ${err.message || 'ভুল ফরম্যাট'}`, 3500);
    } finally {
      setRestoring(false);
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
      description: 'প্রশ্নপত্রের ক্যাটেগরি তৈরি, সম্পাদনা ও সংরক্ষিত প্রশ্নপত্র',
      icon: <FolderKanban className="w-5 h-5 text-[#3B4FD8]" />,
      action: () => setViewMode('categories'),
    },
    {
      id: 'type-cq-transfer',
      title: 'Type CQ ইমপোর্ট / এক্সপোর্ট',
      description: 'Type CQ এর প্রশ্ন, উদ্দীপক ও চিত্র ফাইলে নামান বা ফাইল থেকে যুক্ত করুন',
      icon: <Upload className="w-5 h-5 text-emerald-600" />,
      action: () => setTransferChoice('type'),
    },
    {
      id: 'chapter-cq-transfer',
      title: 'Chapter CQ ইমপোর্ট / এক্সপোর্ট',
      description: 'Chapter CQ এর প্রশ্ন, উদ্দীপক ও চিত্র ফাইলে নামান বা ফাইল থেকে যুক্ত করুন',
      icon: <Download className="w-5 h-5 text-indigo-600" />,
      action: () => setTransferChoice('chapter'),
    },
    {
      id: 'full-backup-transfer',
      title: 'ফুল ব্যাকআপ ইমপোর্ট / এক্সপোর্ট',
      description: 'সম্পূর্ণ অ্যাপের সব ডাটা (প্রশ্ন, ক্যাটেগরি, প্রশ্নপত্র, ছবি) ব্যাকআপ ও পুনরুদ্ধার',
      icon: <HardDriveDownload className="w-5 h-5 text-amber-600" />,
      action: () => setTransferChoice('full'),
    },
    {
      id: 'settings',
      title: 'Settings (সেটিংস)',
      description: 'থিম (লাইট/ডার্ক), লেখার সাইজ ও ডিফল্ট শিরোনাম পরিবর্তন',
      icon: <Settings className="w-5 h-5 text-[#2A3BB0]" />,
      action: () => setShowSettingsModal(true),
    },
  ];

  // Ribbon (header) 3-dot menu of the Categories screen
  const categoryMenuItems = reorderMode
    ? [
        {
          id: 'reorder-done',
          label: 'সম্পন্ন',
          icon: <Check className="w-4 h-4 text-emerald-600" />,
          onClick: () => setReorderMode(false),
        },
      ]
    : selectMode
    ? [
        {
          id: 'select-all',
          label: 'সব নির্বাচন করুন',
          icon: <CheckSquare className="w-4 h-4 text-[#3B4FD8]" />,
          onClick: selectAllCategories,
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
          id: 'new-category',
          label: 'নতুন ক্যাটেগরি',
          icon: <Plus className="w-4 h-4 text-[#3B4FD8]" />,
          onClick: handleOpenAddCategory,
        },
        {
          id: 'sort',
          label: 'সর্ট করুন',
          icon: <ArrowUpDown className="w-4 h-4 text-[#3B4FD8]" />,
          onClick: () => setShowSortDialog(true),
        },
        {
          id: 'reorder',
          label: 'রি-অর্ডার (ক্রম বদলান)',
          icon: <ListOrdered className="w-4 h-4 text-[#3B4FD8]" />,
          onClick: enterReorderMode,
        },
        {
          id: 'select',
          label: 'সিলেক্ট',
          icon: <CheckSquare className="w-4 h-4 text-[#3B4FD8]" />,
          onClick: () => enterSelectMode(null),
        },
        {
          id: 'import-categories',
          label: 'ইমপোর্ট (ব্যাকআপ ফাইল)',
          icon: <Upload className="w-4 h-4 text-emerald-600" />,
          onClick: () => importCategoryInputRef.current?.click(),
        },
        {
          id: 'export-categories',
          label: 'এক্সপোর্ট (ব্যাকআপ ফাইল)',
          icon: <Download className="w-4 h-4 text-indigo-600" />,
          onClick: () => enterSelectMode('backup'),
        },
        {
          id: 'export-pdf',
          label: 'Export PDF',
          icon: <FileDown className="w-4 h-4 text-[#3B4FD8]" />,
          onClick: () => enterSelectMode('pdf'),
        },
        {
          id: 'delete-categories',
          label: 'ক্যাটেগরি ডিলিট (সিলেক্ট করে)',
          icon: <Trash2 className="w-4 h-4 text-red-500" />,
          isDestructive: true,
          onClick: () => enterSelectMode('delete'),
        },
      ];

  // Popup menu (3 dots) of one category card
  const categoryPopupItems = (cat: Category) => isUncategorizedCategory(cat) ? [
    {
      id: 'pdf',
      label: 'PDF এক্সপোর্ট (নতুন ফোল্ডারে)',
      icon: <FolderDown className="w-5 h-5 text-[#3B4FD8]" />,
      onClick: () => runCategoriesPdfExport([cat]),
    },
    ...(clipboard?.type === 'paper'
      ? [
          {
            id: 'paste-paper',
            label: 'এখানে প্রশ্নপত্র পেস্ট করুন',
            icon: <ClipboardPaste className="w-5 h-5 text-emerald-600" />,
            onClick: () => handlePaste(cat),
          },
        ]
      : []),
    {
      id: 'share',
      label: 'শেয়ার করুন (ফাইল)',
      icon: <Share2 className="w-5 h-5 text-[#3B4FD8]" />,
      onClick: () => handleShareCategory(cat),
    },
  ] : [
    {
      id: 'pdf',
      label: 'PDF এক্সপোর্ট (নতুন ফোল্ডারে)',
      icon: <FolderDown className="w-5 h-5 text-[#3B4FD8]" />,
      onClick: () => runCategoriesPdfExport([cat]),
    },
    {
      id: 'rename',
      label: 'নাম সম্পাদনা (Edit)',
      icon: <Edit2 className="w-5 h-5 text-[#3B4FD8]" />,
      onClick: () => handleRenameCategory(cat),
    },
    {
      id: 'copy',
      label: 'ক্যাটেগরি কপি করুন',
      icon: <Copy className="w-5 h-5 text-[#3B4FD8]" />,
      onClick: () => handleCopyCategory(cat),
    },
    ...(clipboard?.type === 'paper'
      ? [
          {
            id: 'paste-paper',
            label: 'এখানে প্রশ্নপত্র পেস্ট করুন',
            icon: <ClipboardPaste className="w-5 h-5 text-emerald-600" />,
            onClick: () => handlePaste(cat),
          },
        ]
      : []),
    {
      id: 'share',
      label: 'শেয়ার করুন (ফাইল)',
      icon: <Share2 className="w-5 h-5 text-[#3B4FD8]" />,
      onClick: () => handleShareCategory(cat),
    },
    {
      id: 'delete',
      label: 'মুছে ফেলুন',
      icon: <Trash2 className="w-5 h-5 text-red-500" />,
      isDestructive: true,
      onClick: () => setDeleteCatConfirm({ isOpen: true, catId: cat.id, catName: cat.name }),
    },
  ];

  // Popup menu (3 dots) of one paper card
  const paperPopupItems = (paper: Paper) => [
    {
      id: 'edit',
      label: 'সম্পাদনা (Create-এ খুলুন)',
      icon: <Edit2 className="w-5 h-5 text-[#3B4FD8]" />,
      onClick: () => handleOpenInCreate(paper),
    },
    {
      id: 'move',
      label: 'অন্য ক্যাটেগরিতে সরান (Move)',
      icon: <FolderInput className="w-5 h-5 text-[#3B4FD8]" />,
      onClick: () => setPicker({ mode: 'move', paper }),
    },
    {
      id: 'copy-to',
      label: 'অন্য ক্যাটেগরিতে কপি করুন',
      icon: <Layers className="w-5 h-5 text-[#3B4FD8]" />,
      onClick: () => setPicker({ mode: 'copy', paper }),
    },
    {
      id: 'copy',
      label: 'কপি করুন (পরে পেস্ট করতে)',
      icon: <Copy className="w-5 h-5 text-[#3B4FD8]" />,
      onClick: () => handleCopyPaper(paper),
    },
    {
      id: 'share',
      label: 'শেয়ার করুন (ফাইল)',
      icon: <Share2 className="w-5 h-5 text-[#3B4FD8]" />,
      onClick: () => handleSharePaper(paper),
    },
    {
      id: 'delete',
      label: 'মুছে ফেলুন',
      icon: <Trash2 className="w-5 h-5 text-red-500" />,
      isDestructive: true,
      onClick: () => setDeletePaperTarget(paper),
    },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-full pb-20 bg-[#F2F4F8] dark:bg-slate-900 transition-colors">
      {/* ----------------- SUB-VIEW: CATEGORY DETAIL ----------------- */}
      {viewMode === 'category-detail' && selectedCategory && (
        <>
          <Header
            title={selectedCategory.name}
            subtitle="ক্যাটেগরির প্রশ্নপত্রসমূহ"
            showBack={true}
            onBack={() => setViewMode('categories')}
          />

          <main className="flex-1 p-3.5 space-y-3">
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
                        onClick={() => togglePaperExpand(paper)}
                        className="p-3.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-[#F8FAFC] dark:hover:bg-slate-750 transition-colors"
                      >
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

                        <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                          <PopupMenu items={paperPopupItems(paper)} />
                        </div>

                        <div className="text-[#64748B] shrink-0 p-1">
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-[#3B4FD8]" />
                          ) : (
                            <ChevronRight className="w-5 h-5" />
                          )}
                        </div>
                      </div>

                      {/* Expanded Questions preview & Actions */}
                      {isExpanded && (
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
            title={
              reorderMode ? 'ক্যাটেগরি রি-অর্ডার' : selectMode ? `${toBn(selectedCatIds.length)}টি নির্বাচিত` : 'ক্যাটেগরি'
            }
            subtitle={
              reorderMode
                ? 'তীর চেপে ক্রম বদলান'
                : selectMode
                  ? selectPurpose === 'pdf'
                    ? 'PDF এক্সপোর্টের জন্য ক্যাটেগরি বাছুন'
                    : selectPurpose === 'backup'
                      ? 'ব্যাকআপের জন্য ক্যাটেগরি বাছুন'
                      : selectPurpose === 'delete'
                        ? 'মোছার জন্য ক্যাটেগরি বাছুন'
                        : 'ক্যাটেগরি নির্বাচন'
                  : 'প্রশ্নপত্রের বিভাগ ও ক্যাটেগরি'
            }
            showBack={true}
            onBack={reorderMode ? () => setReorderMode(false) : selectMode ? exitSelectMode : () => setViewMode('main')}
            menuItems={categoryMenuItems}
          />

          <main className="flex-1 p-3.5 space-y-3.5">
            {renderClipboardBanner(null)}

            {/* Top Bar with + New Category Button */}
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-[#1B1F2A] dark:text-slate-300">
                সকল ক্যাটেগরি ({toBn(categories.length)}টি)
              </span>
              {reorderMode ? (
                <button
                  type="button"
                  onClick={() => setReorderMode(false)}
                  className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1"
                >
                  <Check className="w-4 h-4" />
                  <span>সম্পন্ন</span>
                </button>
              ) : selectMode ? (
                <button
                  type="button"
                  onClick={selectedCatIds.length === visibleCategories.length ? () => setSelectedCatIds([]) : selectAllCategories}
                  className="min-h-[44px] px-3.5 py-1.5 rounded-xl border border-[#3B4FD8] text-[#3B4FD8] dark:text-indigo-300 text-xs font-bold flex items-center gap-1"
                >
                  <CheckSquare className="w-4 h-4" />
                  <span>{selectedCatIds.length === visibleCategories.length ? 'সব বাদ দিন' : 'সব নির্বাচন'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleOpenAddCategory}
                  className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-[#3B4FD8] hover:bg-[#2A3BB0] text-white text-xs font-bold flex items-center gap-1 shadow-2xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>নতুন ক্যাটেগরি</span>
                </button>
              )}
            </div>

            {/* Import a shared category / paper file */}
            {!selectMode && !reorderMode && (
            <button
              type="button"
              onClick={() => importCategoryInputRef.current?.click()}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-dashed border-[#3B4FD8] dark:border-indigo-500 text-[#3B4FD8] dark:text-indigo-300 text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <Upload className="w-4 h-4" />
              <span>শেয়ার করা ক্যাটেগরি/প্রশ্নপত্র ফাইল ইমপোর্ট করুন</span>
            </button>
            )}
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
                {visibleCategories.map((cat, listIdx) => {
                  const stats = catStats[cat.id] || { paperCount: 0, questionCount: 0 };
                  const pinned = isUncategorizedCategory(cat);
                  const movable = visibleCategories.filter((c) => !isUncategorizedCategory(c));
                  const movIdx = movable.findIndex((c) => c.id === cat.id);

                  const isSelected = selectedCatIds.includes(cat.id);

                  return (
                    <div
                      key={cat.id}
                      onClick={() => {
                        if (reorderMode) return;
                        if (selectMode) {
                          toggleCatSelected(cat.id);
                          return;
                        }
                        setSelectedCategory(cat);
                        setViewMode('category-detail');
                      }}
                      className={`bg-white dark:bg-slate-800 rounded-2xl p-4 border shadow-xs flex items-center justify-between gap-3 cursor-pointer transition-all group ${
                        isSelected
                          ? 'border-[#3B4FD8] dark:border-indigo-500 bg-[#EEF2FF] dark:bg-indigo-950/40'
                          : 'border-[#D5D9E2] dark:border-slate-700 hover:border-[#3B4FD8] dark:hover:border-indigo-500'
                      }`}
                    >
                      {selectMode && (
                        <span className="shrink-0 text-[#3B4FD8] dark:text-indigo-300">
                          {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-[#94A3B8]" />}
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-[#1B1F2A] dark:text-slate-100 group-hover:text-[#3B4FD8] transition-colors truncate flex items-center gap-1.5">
                          {pinned && <Pin className="w-4 h-4 text-[#3B4FD8] shrink-0" />}
                          <span className="truncate">{cat.name}</span>
                        </h3>
                        <p className="text-[0.6875rem] text-[#64748B] dark:text-slate-400 font-medium mt-0.5">
                          {toBn(stats.paperCount)}টি প্রশ্নপত্র · {toBn(stats.questionCount)}টি প্রশ্ন
                        </p>
                      </div>

                      {reorderMode && !pinned && (
                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            aria-label="উপরে নিন"
                            disabled={movIdx <= 0}
                            onClick={() => moveCategory(cat.id, -1)}
                            className="w-10 h-10 rounded-full flex items-center justify-center bg-[#EEF2FF] dark:bg-indigo-950/60 text-[#3B4FD8] dark:text-indigo-300 disabled:opacity-30"
                          >
                            <ArrowUp className="w-5 h-5" />
                          </button>
                          <button
                            type="button"
                            aria-label="নিচে নিন"
                            disabled={movIdx < 0 || movIdx >= movable.length - 1}
                            onClick={() => moveCategory(cat.id, 1)}
                            className="w-10 h-10 rounded-full flex items-center justify-center bg-[#EEF2FF] dark:bg-indigo-950/60 text-[#3B4FD8] dark:text-indigo-300 disabled:opacity-30"
                          >
                            <ArrowDown className="w-5 h-5" />
                          </button>
                        </div>
                      )}

                      {!selectMode && !reorderMode && (
                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <PopupMenu items={categoryPopupItems(cat)} />
                          <ChevronRight className="w-5 h-5 text-[#94A3B8] group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </main>

          {selectMode && (
            <div
              className="fixed left-0 right-0 bottom-16 z-40 px-3.5 pb-2 pt-2 bg-[#F2F4F8]/95 dark:bg-slate-900/95 border-t border-[#D5D9E2] dark:border-slate-700"
              style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px) * 0)' }}
            >
              <div className="max-w-[390px] mx-auto flex gap-2">
                {(selectPurpose === null || selectPurpose === 'backup') && (
                  <button
                    type="button"
                    disabled={selectedCatIds.length === 0 || isExporting}
                    onClick={handleExportSelectedBackup}
                    className="flex-1 min-h-[46px] rounded-xl bg-[#3B4FD8] text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
                  >
                    <FileArchive className="w-4 h-4" />
                    <span>{isExporting ? 'তৈরি হচ্ছে...' : 'ব্যাকআপ'}</span>
                  </button>
                )}
                {(selectPurpose === null || selectPurpose === 'pdf') && (
                  <button
                    type="button"
                    disabled={selectedCatIds.length === 0 || Boolean(pdfProgress)}
                    onClick={handleExportSelectedPdf}
                    className={`flex-1 min-h-[46px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40 ${
                      selectPurpose === 'pdf'
                        ? 'bg-[#3B4FD8] text-white'
                        : 'bg-white dark:bg-slate-800 border border-[#3B4FD8] text-[#3B4FD8] dark:text-indigo-300'
                    }`}
                  >
                    <FileDown className="w-4 h-4" />
                    <span>PDF</span>
                  </button>
                )}
                {(selectPurpose === null || selectPurpose === 'delete') && (
                  <button
                    type="button"
                    disabled={selectedCatIds.length === 0}
                    onClick={handleBulkDeleteClick}
                    className={`flex-1 min-h-[46px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40 ${
                      selectPurpose === 'delete'
                        ? 'bg-red-600 text-white'
                        : 'bg-white dark:bg-slate-800 border border-red-500 text-red-600'
                    }`}
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>ডিলিট</span>
                  </button>
                )}
              </div>
            </div>
          )}
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

      {/* Bulk delete confirmation */}
      <ConfirmDialog
        isOpen={bulkDeleteConfirm}
        title="নির্বাচিত ক্যাটেগরি মুছবেন?"
        message={`${toBn(
          categories.filter((c) => selectedCatIds.includes(c.id) && !isUncategorizedCategory(c)).length
        )}টি ক্যাটেগরি মুছে যাবে। এদের প্রশ্নপত্রগুলো 'অশ্রেণিবদ্ধ' ক্যাটেগরিতে চলে যাবে (কোনো প্রশ্নপত্র মুছবে না)।`}
        confirmText="হ্যাঁ, মুছে ফেলুন"
        cancelText="না"
        isDestructive={true}
        onConfirm={handleConfirmBulkDelete}
        onCancel={() => setBulkDeleteConfirm(false)}
      />

      {/* Sort dialog */}
      {showSortDialog && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-150"
          onClick={() => setShowSortDialog(false)}
        >
          <div
            className="w-full max-w-[340px] bg-white dark:bg-slate-900 rounded-3xl border border-[#D5D9E2] dark:border-slate-700 shadow-2xl p-4 space-y-1"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-[#1B1F2A] dark:text-slate-100 px-2 pb-2">ক্যাটেগরি সর্ট করুন</h3>
            {SORT_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  changeSortMode(o.id);
                  setShowSortDialog(false);
                }}
                className={`w-full min-h-[46px] px-3 rounded-xl text-left text-sm font-medium flex items-center justify-between ${
                  sortMode === o.id
                    ? 'bg-[#EEF2FF] dark:bg-indigo-950/60 text-[#3B4FD8] dark:text-indigo-300 font-bold'
                    : 'text-[#1B1F2A] dark:text-slate-100 hover:bg-[#F2F4F8] dark:hover:bg-slate-800'
                }`}
              >
                <span>{o.label}</span>
                {sortMode === o.id && <Check className="w-4 h-4" />}
              </button>
            ))}
            <p className="text-[0.6875rem] text-[#64748B] dark:text-slate-400 px-2 pt-2 leading-snug">
              "অশ্রেণিবদ্ধ" ক্যাটেগরি সবসময় সবার উপরে থাকে।
            </p>
          </div>
        </div>
      )}

      {/* Import / Export choice (Type CQ, Chapter CQ, Full backup) */}
      <TransferChoiceDialog
        isOpen={transferChoice !== null}
        title={
          transferChoice === 'type'
            ? 'Type CQ ইমপোর্ট / এক্সপোর্ট'
            : transferChoice === 'chapter'
              ? 'Chapter CQ ইমপোর্ট / এক্সপোর্ট'
              : 'ফুল ব্যাকআপ ইমপোর্ট / এক্সপোর্ট'
        }
        description={
          transferChoice === 'full'
            ? 'সম্পূর্ণ অ্যাপের সব ডাটা (Type CQ, Chapter CQ, ক্যাটেগরি, প্রশ্নপত্র, ছবি)।'
            : 'প্রশ্ন, উদ্দীপক ও চিত্রসহ JSON ফাইল।'
        }
        onClose={() => setTransferChoice(null)}
        onImport={() => {
          if (transferChoice === 'type') setShowImportModal(true);
          else if (transferChoice === 'chapter') setShowImportChapterModal(true);
          else restoreFileInputRef.current?.click();
        }}
        onExport={() => {
          if (transferChoice === 'type') handleExportCollection('type');
          else if (transferChoice === 'chapter') handleExportCollection('chapter');
          else handleFullBackup();
        }}
      />

      {/* Full backup import: replace or merge? */}
      <RestoreModeDialog
        isOpen={Boolean(restoreInfo)}
        fileName={restoreInfo?.fileName}
        questions={restoreInfo?.questions || 0}
        papers={restoreInfo?.papers || 0}
        busy={restoring}
        onReplace={() => handleRunRestore('replace')}
        onMerge={() => handleRunRestore('merge')}
        onCancel={() => {
          setRestoreInfo(null);
          setRestoreJsonContent(null);
        }}
      />

      {/* PDF export progress */}
      {pdfProgress && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-[300px] bg-white dark:bg-slate-900 rounded-2xl p-5 text-center space-y-2 shadow-2xl">
            <p className="text-sm font-bold text-[#1B1F2A] dark:text-slate-100">PDF বানানো হচ্ছে…</p>
            <p className="text-xs text-[#64748B] dark:text-slate-400">
              {toBn(Math.min(pdfProgress.done + 1, pdfProgress.total))} / {toBn(pdfProgress.total)} — অনুগ্রহ করে অপেক্ষা করুন
            </p>
          </div>
        </div>
      )}

      {/* PDF export result */}
      {pdfResult && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-[340px] bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-2xl space-y-3">
            <p className="text-sm font-bold text-[#1B1F2A] dark:text-slate-100">
              {toBn(pdfResult.saved)}টি PDF সেভ হয়েছে
            </p>
            {pdfResult.folders.length > 0 && Capacitor.isNativePlatform() && (
              <div className="text-xs text-[#334155] dark:text-slate-300 space-y-1 max-h-40 overflow-y-auto">
                {pdfResult.folders.map((f) => (
                  <p key={f.folder} className="break-all">
                    <span className="font-semibold">{f.folder}</span> ({toBn(f.saved)}টি)
                  </p>
                ))}
              </div>
            )}
            {pdfResult.emptyCategories.length > 0 && (
              <p className="text-[0.6875rem] text-amber-600">
                প্রশ্নপত্র না থাকায় বাদ: {pdfResult.emptyCategories.join(', ')}
              </p>
            )}
            {pdfResult.failed.length > 0 && (
              <p className="text-[0.6875rem] text-red-600 break-words">তৈরি করা যায়নি: {pdfResult.failed.join(', ')}</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              {Capacitor.isNativePlatform() && pdfResult.folders.length > 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    const target = pdfResult.folders.length === 1 ? pdfResult.folders[0].folder : PDF_SAVE_FOLDER;
                    await openSavedFolder(`${target}/x.pdf`);
                  }}
                  className="min-h-[44px] px-4 rounded-xl border border-[#3B4FD8] text-[#3B4FD8] text-xs font-bold"
                >
                  ফোল্ডার খুলুন
                </button>
              )}
              <button
                type="button"
                onClick={() => setPdfResult(null)}
                className="min-h-[44px] px-4 rounded-xl bg-[#3B4FD8] text-white text-xs font-bold"
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
