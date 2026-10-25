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
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { ProfileHome } from '../features/profile/ProfileHome';
import { SortDialog } from '../features/profile/SortDialog';
import { BackupHistoryDialog } from '../features/profile/BackupHistoryDialog';
import { getBackupReminderState, snoozeReminder } from '../utils/backupHistory';
import { PdfProgressDialog, PdfResultDialog } from '../features/profile/PdfDialogs';
import {
  SORT_OPTIONS,
  PAPER_SORT_OPTIONS,
  CATEGORY_SORT_META_KEY,
  PAPER_SORT_META_KEY,
  type CategorySortMode,
  type PaperSortMode,
  type PaperSelectPurpose,
  type ProfileViewMode,
} from '../features/profile/profileConstants';
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
  deletePaper,
  movePaperToCategory,
  duplicatePaper,
  duplicatePapers,
  movePapersToCategory,
  deletePapers,
  reorderPapers,
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
  getApi,
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
  Upload,
  Download,
  Settings,
  ChevronRight,
  ChevronDown,
  Share2,
  Info,
  HardDriveDownload,
  History,
  FolderKanban,
  Plus,
  Edit2,
  Trash2,
  ExternalLink,
  FileDown,
  Layers,
  AlertTriangle,
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
  Scissors,
} from 'lucide-react';
import { Share } from '@capacitor/share';
import { exportPaperById, exportCategoriesToFolders, type CategoriesPdfResult } from '../utils/pdfGenerator';
import { showPdfSavedDialog } from '../utils/storageAccess';
import {
  exportCategoryShare,
  exportCategoriesBackup,
  exportPaperShare,
  exportPapersShare,
  parseCategoryShare,
  importCategoryShare,
} from '../utils/categoryTransfer';

/** Used by the global search: open this paper the next time the Profile tab shows. */
let pendingOpenPaperId: string | null = null;
export function openPaperOnProfile(paperId: string): void {
  pendingOpenPaperId = paperId;
  // If the Profile tab is already mounted, tell it directly
  window.dispatchEvent(new CustomEvent('qb:open-paper', { detail: paperId }));
}

export const ProfileScreen: React.FC = () => {
  const { showToast } = useToast();
  const { switchTab, registerBackHandler } = useNavigation();

  const [viewMode, setViewMode] = useState<ProfileViewMode>('main');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

  const [paperCount, setPaperCount] = useState<number>(0);
  const [questionCount, setQuestionCount] = useState<number>(0);
  const [chapterQuestionCount, setChapterQuestionCount] = useState<number>(0);
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
  const [viewPaperId, setViewPaperId] = useState<string | null>(() => {
    const id = pendingOpenPaperId;
    pendingOpenPaperId = null;
    return id;
  });
  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      pendingOpenPaperId = null;
      if (id) setViewPaperId(id);
    };
    window.addEventListener('qb:open-paper', onOpen);
    return () => window.removeEventListener('qb:open-paper', onOpen);
  }, []);
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
  const [showBackupHistory, setShowBackupHistory] = useState<boolean>(false);
  const [backupTick, setBackupTick] = useState<number>(0);
  const [reorderMode, setReorderMode] = useState<boolean>(false);
  const [selectedCatIds, setSelectedCatIds] = useState<string[]>([]);
  // Multi-select / sort / re-order of the papers INSIDE a category
  const [paperSortMode, setPaperSortMode] = useState<PaperSortMode>('custom');
  const [showPaperSortDialog, setShowPaperSortDialog] = useState<boolean>(false);
  const [paperReorderMode, setPaperReorderMode] = useState<boolean>(false);
  const [paperSelectMode, setPaperSelectMode] = useState<boolean>(false);
  const [paperSelectPurpose, setPaperSelectPurpose] = useState<PaperSelectPurpose>(null);
  const [selectedPaperIds, setSelectedPaperIds] = useState<string[]>([]);
  const [paperBulkDeleteConfirm, setPaperBulkDeleteConfirm] = useState<boolean>(false);
  const [paperClip, setPaperClip] = useState<{ mode: 'copy' | 'cut'; ids: string[] } | null>(null);
  const [pdfProgress, setPdfProgress] = useState<{ done: number; total: number } | null>(null);
  const [pdfResult, setPdfResult] = useState<CategoriesPdfResult | null>(null);

  // Load statistical counts & categories
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [pCount, qCount, cqCount, catList] = await Promise.all([
        getPaperCount(),
        getQuestionCount(),
        getApi('chapter').getQuestionCount(),
        getCategories(),
      ]);
      setPaperCount(pCount);
      setQuestionCount(qCount);
      setChapterQuestionCount(cqCount);
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
    if (paperReorderMode) {
      setPaperReorderMode(false);
      return true;
    }
    if (paperSelectMode) {
      setPaperSelectMode(false);
      setPaperSelectPurpose(null);
      setSelectedPaperIds([]);
      return true;
    }
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
  }, [viewMode, selectMode, reorderMode, paperReorderMode, paperSelectMode]);

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
    setPaperClip(null);
    await setCategoryClipboard({ type: 'category', id: cat.id, name: cat.name });
    setClipboard({ type: 'category', id: cat.id, name: cat.name });
    showToast('ক্যাটেগরি কপি হয়েছে — "পেস্ট" চাপলে নতুন কপি তৈরি হবে', 3000);
  };

  const handleCopyPaper = async (paper: Paper) => {
    const name = paper.title || paper.shortName;
    setPaperClip(null);
    await setCategoryClipboard({ type: 'paper', id: paper.id, name });
    setClipboard({ type: 'paper', id: paper.id, name });
    showToast('প্রশ্নপত্র কপি হয়েছে — যেকোনো ক্যাটেগরিতে "পেস্ট" করুন', 3000);
  };

  const handleClearClipboard = async () => {
    await setCategoryClipboard(null);
    setClipboard(null);
    setPaperClip(null);
  };

  // Paste: category -> duplicates the category, paper -> copies the paper into target category
  const handlePaste = async (targetCategory?: Category | null) => {
    if (paperClip && targetCategory) {
      await handlePastePapers(targetCategory);
      return;
    }
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
      <div className="flex items-center gap-2 rounded-2xl border border-brand dark:border-indigo-500 bg-brand-soft px-3 py-2">
        <ClipboardPaste className="w-4 h-4 text-brand shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[0.6875rem] font-bold text-brand-ink dark:text-indigo-200 truncate">
            {isPaper ? 'কপি করা প্রশ্নপত্র' : 'কপি করা ক্যাটেগরি'}: {clipboard.name}
          </p>
          {isPaper && !target && (
            <p className="text-[0.625rem] text-ink-muted">
              ক্যাটেগরির মেনু থেকে "এখানে পেস্ট করুন" চাপুন
            </p>
          )}
        </div>
        {(!isPaper || target) && (
          <button
            type="button"
            onClick={() => handlePaste(target)}
            className="min-h-[36px] px-3 py-1 rounded-lg bg-brand text-white text-xs font-bold"
          >
            পেস্ট
          </button>
        )}
        <button
          type="button"
          aria-label="কপি বাতিল"
          onClick={handleClearClipboard}
          className="min-h-[36px] w-8 flex items-center justify-center text-ink-muted"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  };

// ---------- Papers inside a category: sort / re-order / multi-select ----------

  // remembered paper sort mode
  useEffect(() => {
    db.meta
      .get(PAPER_SORT_META_KEY)
      .then((rec) => {
        const v = rec?.value as PaperSortMode | undefined;
        if (v && PAPER_SORT_OPTIONS.some((o) => o.id === v)) setPaperSortMode(v);
      })
      .catch(() => {});
  }, []);

  const changePaperSortMode = async (mode: PaperSortMode) => {
    setPaperSortMode(mode);
    try {
      await db.meta.put({ key: PAPER_SORT_META_KEY, value: mode });
    } catch (err) {
      console.warn('Could not save paper sort mode', err);
    }
  };

  // papers in the order the user wants to see them ('custom' = the saved manual order)
  const visiblePapers = React.useMemo(() => {
    const collator = new Intl.Collator('bn', { numeric: true });
    const label = (p: Paper) => p.title || p.shortName || '';
    const qCount = (p: Paper) => p.questionIds?.length || 0;
    if (paperSortMode === 'custom') return categoryPapers;
    return [...categoryPapers].sort((a, b) => {
      switch (paperSortMode) {
        case 'newest':
          return (b.createdAt || 0) - (a.createdAt || 0);
        case 'oldest':
          return (a.createdAt || 0) - (b.createdAt || 0);
        case 'name-asc':
          return collator.compare(label(a), label(b));
        case 'name-desc':
          return collator.compare(label(b), label(a));
        case 'questions-desc':
          return qCount(b) - qCount(a);
        case 'questions-asc':
          return qCount(a) - qCount(b);
        default:
          return 0;
      }
    });
  }, [categoryPapers, paperSortMode]);

  const enterPaperReorderMode = async () => {
    // the manual order starts from what is currently shown
    await reorderPapers(visiblePapers.map((p) => p.id));
    await changePaperSortMode('custom');
    await loadData();
    setPaperReorderMode(true);
  };

  const movePaperInList = async (id: string, dir: -1 | 1) => {
    const ids = visiblePapers.map((p) => p.id);
    const idx = ids.indexOf(id);
    const to = idx + dir;
    if (idx < 0 || to < 0 || to >= ids.length) return;
    [ids[idx], ids[to]] = [ids[to], ids[idx]];
    try {
      await reorderPapers(ids);
      await loadData();
    } catch (err) {
      console.error('Paper reorder failed:', err);
      showToast('ক্রম বদলানো যায়নি');
    }
  };

  const enterPaperSelectMode = (purpose: PaperSelectPurpose) => {
    setPaperSelectMode(true);
    setPaperSelectPurpose(purpose);
    setSelectedPaperIds([]);
  };

  const exitPaperSelectMode = () => {
    setPaperSelectMode(false);
    setPaperSelectPurpose(null);
    setSelectedPaperIds([]);
  };

  const togglePaperSelected = (id: string) =>
    setSelectedPaperIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const selectAllPapers = () => setSelectedPaperIds(visiblePapers.map((p) => p.id));

  // selected ids in the order they are shown on screen
  const orderedSelectedPaperIds = () => visiblePapers.filter((p) => selectedPaperIds.includes(p.id)).map((p) => p.id);

  const requirePaperSelection = (): string[] | null => {
    const ids = orderedSelectedPaperIds();
    if (ids.length === 0) {
      showToast('কমপক্ষে একটি প্রশ্নপত্র নির্বাচন করুন');
      return null;
    }
    return ids;
  };

  const handleCopyOrCutSelectedPapers = async (mode: 'copy' | 'cut') => {
    const ids = requirePaperSelection();
    if (!ids) return;
    // only one clipboard is active at a time
    await setCategoryClipboard(null);
    setClipboard(null);
    setPaperClip({ mode, ids });
    exitPaperSelectMode();
    showToast(
      mode === 'cut'
        ? `${toBn(ids.length)}টি প্রশ্নপত্র কাট হয়েছে — যেকোনো ক্যাটেগরিতে "পেস্ট" করলে সরে যাবে`
        : `${toBn(ids.length)}টি প্রশ্নপত্র কপি হয়েছে — যেকোনো ক্যাটেগরিতে "পেস্ট" করুন`,
      3500
    );
  };

  const handlePastePapers = async (target: Category) => {
    if (!paperClip) return;
    try {
      if (paperClip.mode === 'cut') {
        const n = await movePapersToCategory(paperClip.ids, target.id);
        setPaperClip(null);
        showToast(`${toBn(n)}টি প্রশ্নপত্র "${target.name}" ক্যাটেগরিতে সরানো হয়েছে`);
      } else {
        const n = await duplicatePapers(paperClip.ids, target.id);
        showToast(`${toBn(n)}টি প্রশ্নপত্র "${target.name}" ক্যাটেগরিতে পেস্ট হয়েছে`);
      }
      await loadData();
    } catch (err: any) {
      console.error('Paper paste failed:', err);
      showToast(err?.message || 'পেস্ট করতে সমস্যা হয়েছে');
    }
  };

  const handleExportSelectedPapers = async () => {
    const ids = requirePaperSelection();
    if (!ids) return;
    setIsExporting(true);
    try {
      const ok = await exportPapersShare(ids, selectedCategory?.name);
      showToast(ok ? 'প্রশ্নপত্রের এক্সপোর্ট ফাইল তৈরি হয়েছে' : 'এক্সপোর্ট ফাইল তৈরি করা যায়নি');
      if (ok) exitPaperSelectMode();
    } catch (err: any) {
      console.error('Paper export failed:', err);
      showToast(err?.message || 'এক্সপোর্ট ব্যর্থ হয়েছে');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportSelectedPapersPdf = async () => {
    const ids = requirePaperSelection();
    if (!ids || !selectedCategory || pdfProgress) return;
    setPdfProgress({ done: 0, total: ids.length });
    try {
      const result = await exportCategoriesToFolders(
        [{ name: selectedCategory.name, paperIds: ids }],
        (done, total) => setPdfProgress({ done, total })
      );
      setPdfResult(result);
      exitPaperSelectMode();
    } catch (err: any) {
      console.error('Paper PDF export failed:', err);
      setPdfErrorMessage(err?.message || 'পিডিএফ তৈরিতে অপ্রত্যাশিত সমস্যা হয়েছে।');
    } finally {
      setPdfProgress(null);
    }
  };

  const handleConfirmBulkDeletePapers = async () => {
    setPaperBulkDeleteConfirm(false);
    const ids = orderedSelectedPaperIds();
    try {
      await deletePapers(ids);
      // a deleted paper can no longer be pasted
      setPaperClip((prev) => {
        if (!prev) return prev;
        const left = prev.ids.filter((id) => !ids.includes(id));
        return left.length > 0 ? { ...prev, ids: left } : null;
      });
      showToast(`${toBn(ids.length)}টি প্রশ্নপত্র মুছে ফেলা হয়েছে`);
      exitPaperSelectMode();
      await loadData();
    } catch (err: any) {
      console.error('Paper bulk delete failed:', err);
      showToast(err?.message || 'মুছতে সমস্যা হয়েছে');
    }
  };

  // Paste banner for the papers that were copied / cut with the multi-select
  const renderPaperClipBanner = (target?: Category | null) => {
    if (!paperClip) return null;
    const isCut = paperClip.mode === 'cut';
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-brand dark:border-indigo-500 bg-brand-soft px-3 py-2">
        {isCut ? (
          <Scissors className="w-4 h-4 text-amber-600 shrink-0" />
        ) : (
          <ClipboardPaste className="w-4 h-4 text-brand shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[0.6875rem] font-bold text-brand-ink dark:text-indigo-200 truncate">
            {toBn(paperClip.ids.length)}টি প্রশ্নপত্র {isCut ? 'কাট' : 'কপি'} করা আছে
          </p>
          {!target && (
            <p className="text-[0.625rem] text-ink-muted">
              ক্যাটেগরির মেনু থেকে "এখানে প্রশ্নপত্র পেস্ট করুন" চাপুন
            </p>
          )}
        </div>
        {target && (
          <button
            type="button"
            onClick={() => handlePastePapers(target)}
            className="min-h-[36px] px-3 py-1 rounded-lg bg-brand text-white text-xs font-bold"
          >
            পেস্ট
          </button>
        )}
        <button
          type="button"
          aria-label="ক্লিপবোর্ড বাতিল"
          onClick={() => setPaperClip(null)}
          className="min-h-[36px] w-8 flex items-center justify-center text-ink-muted"
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
      if (ok) setBackupTick((n) => n + 1);
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

  // Backup reminder (recomputed whenever data finishes loading or a backup/snooze happens)
  const backupReminder = React.useMemo(() => {
    void backupTick;
    if (loading) return null;
    const s = getBackupReminderState(questionCount + chapterQuestionCount + paperCount > 0);
    return s.due ? { daysSince: s.daysSince } : null;
  }, [loading, questionCount, chapterQuestionCount, paperCount, backupTick]);

  const menuItems = [
    {
      id: 'share',
      label: 'অ্যাপ শেয়ার করুন',
      icon: <Share2 className="w-4 h-4 text-brand-fg" />,
      onClick: handleShareApp,
    },
    {
      id: 'about',
      label: 'অ্যাপ পরিচিতি',
      icon: <Info className="w-4 h-4 text-ink-muted" />,
      onClick: () =>
        showToast(`Qb Collection & Exam • অফলাইন মোড • ভার্সন ${toBn('1.0')}`, 3000),
    },
  ];

  const profileRows = [
    {
      id: 'categories',
      title: 'ক্যাটেগরি',
      description: 'প্রশ্নপত্রের ক্যাটেগরি তৈরি, সম্পাদনা ও সংরক্ষিত প্রশ্নপত্র',
      icon: <FolderKanban className="w-5 h-5 text-brand-fg" />,
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
      id: 'backup-history',
      title: 'ব্যাকআপ ইতিহাস ও রিমাইন্ডার',
      description: 'কবে কবে ব্যাকআপ নেওয়া হয়েছে দেখুন এবং স্বয়ংক্রিয় রিমাইন্ডার ঠিক করুন',
      icon: <History className="w-5 h-5 text-brand-fg" />,
      action: () => setShowBackupHistory(true),
    },
    {
      id: 'settings',
      title: 'Settings (সেটিংস)',
      description: 'থিম (লাইট/ডার্ক), লেখার সাইজ ও ডিফল্ট শিরোনাম পরিবর্তন',
      icon: <Settings className="w-5 h-5 text-brand-ink" />,
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
          icon: <CheckSquare className="w-4 h-4 text-brand-fg" />,
          onClick: selectAllCategories,
        },
        {
          id: 'clear-selection',
          label: 'নির্বাচন বাতিল',
          icon: <X className="w-4 h-4 text-ink-muted" />,
          onClick: exitSelectMode,
        },
      ]
    : [
        {
          id: 'new-category',
          label: 'নতুন ক্যাটেগরি',
          icon: <Plus className="w-4 h-4 text-brand-fg" />,
          onClick: handleOpenAddCategory,
        },
        {
          id: 'sort',
          label: 'সর্ট করুন',
          icon: <ArrowUpDown className="w-4 h-4 text-brand-fg" />,
          onClick: () => setShowSortDialog(true),
        },
        {
          id: 'reorder',
          label: 'রি-অর্ডার (ক্রম বদলান)',
          icon: <ListOrdered className="w-4 h-4 text-brand-fg" />,
          onClick: enterReorderMode,
        },
        {
          id: 'select',
          label: 'সিলেক্ট',
          icon: <CheckSquare className="w-4 h-4 text-brand-fg" />,
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
          icon: <FileDown className="w-4 h-4 text-brand-fg" />,
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
      icon: <FolderDown className="w-5 h-5 text-brand-fg" />,
      onClick: () => runCategoriesPdfExport([cat]),
    },
    ...(clipboard?.type === 'paper' || paperClip
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
      icon: <Share2 className="w-5 h-5 text-brand-fg" />,
      onClick: () => handleShareCategory(cat),
    },
  ] : [
    {
      id: 'pdf',
      label: 'PDF এক্সপোর্ট (নতুন ফোল্ডারে)',
      icon: <FolderDown className="w-5 h-5 text-brand-fg" />,
      onClick: () => runCategoriesPdfExport([cat]),
    },
    {
      id: 'rename',
      label: 'নাম সম্পাদনা (Edit)',
      icon: <Edit2 className="w-5 h-5 text-brand-fg" />,
      onClick: () => handleRenameCategory(cat),
    },
    {
      id: 'copy',
      label: 'ক্যাটেগরি কপি করুন',
      icon: <Copy className="w-5 h-5 text-brand-fg" />,
      onClick: () => handleCopyCategory(cat),
    },
    ...(clipboard?.type === 'paper' || paperClip
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
      icon: <Share2 className="w-5 h-5 text-brand-fg" />,
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

  // Ribbon (header) 3-dot menu of the category detail screen (the papers of one category)
  const paperMenuItems = paperReorderMode
    ? [
        {
          id: 'reorder-done',
          label: 'সম্পন্ন',
          icon: <Check className="w-4 h-4 text-emerald-600" />,
          onClick: () => setPaperReorderMode(false),
        },
      ]
    : paperSelectMode
    ? [
        {
          id: 'select-all',
          label: 'সব নির্বাচন করুন',
          icon: <CheckSquare className="w-4 h-4 text-brand-fg" />,
          onClick: selectAllPapers,
        },
        {
          id: 'clear-selection',
          label: 'নির্বাচন বাতিল',
          icon: <X className="w-4 h-4 text-ink-muted" />,
          onClick: exitPaperSelectMode,
        },
      ]
    : [
        {
          id: 'sort',
          label: 'সর্ট করুন',
          icon: <ArrowUpDown className="w-4 h-4 text-brand-fg" />,
          onClick: () => setShowPaperSortDialog(true),
        },
        {
          id: 'reorder',
          label: 'রি-অর্ডার (ক্রম বদলান)',
          icon: <ListOrdered className="w-4 h-4 text-brand-fg" />,
          onClick: enterPaperReorderMode,
        },
        {
          id: 'select',
          label: 'সিলেক্ট',
          icon: <CheckSquare className="w-4 h-4 text-brand-fg" />,
          onClick: () => enterPaperSelectMode(null),
        },
        {
          id: 'copy',
          label: 'কপি (সিলেক্ট করে)',
          icon: <Copy className="w-4 h-4 text-brand-fg" />,
          onClick: () => enterPaperSelectMode('copy'),
        },
        {
          id: 'cut',
          label: 'কাট (সিলেক্ট করে)',
          icon: <Scissors className="w-4 h-4 text-amber-600" />,
          onClick: () => enterPaperSelectMode('cut'),
        },
        ...(paperClip && selectedCategory
          ? [
              {
                id: 'paste',
                label: `পেস্ট (${toBn(paperClip.ids.length)}টি ${paperClip.mode === 'cut' ? 'কাট' : 'কপি'} করা)`,
                icon: <ClipboardPaste className="w-4 h-4 text-emerald-600" />,
                onClick: () => handlePastePapers(selectedCategory),
              },
            ]
          : []),
        {
          id: 'export',
          label: 'এক্সপোর্ট (ব্যাকআপ ফাইল)',
          icon: <Download className="w-4 h-4 text-indigo-600" />,
          onClick: () => enterPaperSelectMode('export'),
        },
        {
          id: 'export-pdf',
          label: 'Export PDF',
          icon: <FileDown className="w-4 h-4 text-brand-fg" />,
          onClick: () => enterPaperSelectMode('pdf'),
        },
        {
          id: 'delete-papers',
          label: 'ডিলিট (সিলেক্ট করে)',
          icon: <Trash2 className="w-4 h-4 text-red-500" />,
          isDestructive: true,
          onClick: () => enterPaperSelectMode('delete'),
        },
      ];

  // Popup menu (3 dots) of one paper card
  const paperPopupItems = (paper: Paper) => [
    {
      id: 'edit',
      label: 'সম্পাদনা (Create-এ খুলুন)',
      icon: <Edit2 className="w-5 h-5 text-brand-fg" />,
      onClick: () => handleOpenInCreate(paper),
    },
    {
      id: 'move',
      label: 'অন্য ক্যাটেগরিতে সরান (Move)',
      icon: <FolderInput className="w-5 h-5 text-brand-fg" />,
      onClick: () => setPicker({ mode: 'move', paper }),
    },
    {
      id: 'copy-to',
      label: 'অন্য ক্যাটেগরিতে কপি করুন',
      icon: <Layers className="w-5 h-5 text-brand-fg" />,
      onClick: () => setPicker({ mode: 'copy', paper }),
    },
    {
      id: 'copy',
      label: 'কপি করুন (পরে পেস্ট করতে)',
      icon: <Copy className="w-5 h-5 text-brand-fg" />,
      onClick: () => handleCopyPaper(paper),
    },
    {
      id: 'share',
      label: 'শেয়ার করুন (ফাইল)',
      icon: <Share2 className="w-5 h-5 text-brand-fg" />,
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
    <div className="flex-1 flex flex-col min-h-full pb-20 bg-app dark:bg-slate-900 transition-colors">
      {/* ----------------- SUB-VIEW: CATEGORY DETAIL ----------------- */}
      {viewMode === 'category-detail' && selectedCategory && (
        <>
          <Header
            title={
              paperReorderMode
                ? 'প্রশ্নপত্র রি-অর্ডার'
                : paperSelectMode
                  ? `${toBn(selectedPaperIds.length)}টি নির্বাচিত`
                  : selectedCategory.name
            }
            subtitle={
              paperReorderMode
                ? 'তীর চেপে ক্রম বদলান'
                : paperSelectMode
                  ? paperSelectPurpose === 'copy'
                    ? 'কপির জন্য প্রশ্নপত্র বাছুন'
                    : paperSelectPurpose === 'cut'
                      ? 'কাটের জন্য প্রশ্নপত্র বাছুন'
                      : paperSelectPurpose === 'export'
                        ? 'এক্সপোর্টের জন্য প্রশ্নপত্র বাছুন'
                        : paperSelectPurpose === 'pdf'
                          ? 'PDF এক্সপোর্টের জন্য প্রশ্নপত্র বাছুন'
                          : paperSelectPurpose === 'delete'
                            ? 'মোছার জন্য প্রশ্নপত্র বাছুন'
                            : 'প্রশ্নপত্র নির্বাচন'
                  : 'ক্যাটেগরির প্রশ্নপত্রসমূহ'
            }
            showBack={true}
            onBack={
              paperReorderMode
                ? () => setPaperReorderMode(false)
                : paperSelectMode
                  ? exitPaperSelectMode
                  : () => setViewMode('categories')
            }
            menuItems={paperMenuItems}
          />

          <main className={`flex-1 p-3.5 space-y-3 ${paperSelectMode ? 'pb-24' : ''}`}>
            {renderClipboardBanner(selectedCategory)}
            {renderPaperClipBanner(selectedCategory)}
            {categoryPapers.length === 0 ? (
              <EmptyState
                title="এই ক্যাটেগরিতে কোনো প্রশ্নপত্র নেই"
                description="Create ট্যাব থেকে নতুন প্রশ্নপত্র তৈরি করার সময় এই ক্যাটেগরি নির্বাচন করুন।"
                action={
                  <Button size="sm" onClick={() => switchTab('create')}>
                    Create ট্যাবে যান
                  </Button>
                }
              />
            ) : (
              <div className="space-y-3">
                {visiblePapers.map((paper, paperIdx) => {
                  const isExpanded = expandedPaperIds[paper.id] && !paperSelectMode && !paperReorderMode;
                  const isPaperSelected = selectedPaperIds.includes(paper.id);
                  const details = paperDetailsMap[paper.id] || [];
                  const dateStr = new Date(paper.createdAt || Date.now()).toLocaleDateString('bn-BD', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  });

                  return (
                    <div
                      key={paper.id}
                      className={`bg-surface rounded-2xl border shadow-xs overflow-hidden ${
                        isPaperSelected
                          ? 'border-brand dark:border-indigo-500 bg-brand-soft'
                          : 'border-line'
                      }`}
                    >
                      {/* Paper Top Card Summary */}
                      <div
                        onClick={() => {
                          if (paperReorderMode) return;
                          if (paperSelectMode) {
                            togglePaperSelected(paper.id);
                            return;
                          }
                          togglePaperExpand(paper);
                        }}
                        className="p-3.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-surface-2 dark:hover:bg-slate-750 transition-colors"
                      >
                        {paperSelectMode && (
                          <span className="shrink-0 text-brand">
                            {isPaperSelected ? (
                              <CheckSquare className="w-5 h-5" />
                            ) : (
                              <Square className="w-5 h-5 text-[#94A3B8]" />
                            )}
                          </span>
                        )}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-brand bg-brand-soft px-2 py-0.5 rounded-md border border-line dark:border-indigo-900 truncate">
                              {paper.shortName}
                            </span>
                            <span className="text-[0.6875rem] text-ink-muted">
                              {dateStr}
                            </span>
                          </div>
                          <h3 className="text-sm font-bold text-ink truncate">
                            {paper.title}
                          </h3>
                          <p className="text-[0.6875rem] text-ink-muted font-medium">
                            {toBn(paper.questionIds?.length || 0)}টি প্রশ্ন · পূর্ণমান {toBn(paper.totalMarks || 50)}
                          </p>
                        </div>

                        {paperReorderMode && (
                          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              aria-label="উপরে নিন"
                              disabled={paperIdx <= 0}
                              onClick={() => movePaperInList(paper.id, -1)}
                              className="w-10 h-10 rounded-full flex items-center justify-center bg-brand-soft text-brand disabled:opacity-30"
                            >
                              <ArrowUp className="w-5 h-5" />
                            </button>
                            <button
                              type="button"
                              aria-label="নিচে নিন"
                              disabled={paperIdx >= visiblePapers.length - 1}
                              onClick={() => movePaperInList(paper.id, 1)}
                              className="w-10 h-10 rounded-full flex items-center justify-center bg-brand-soft text-brand disabled:opacity-30"
                            >
                              <ArrowDown className="w-5 h-5" />
                            </button>
                          </div>
                        )}

                        {!paperSelectMode && !paperReorderMode && (
                          <>
                            <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                              <PopupMenu items={paperPopupItems(paper)} />
                            </div>

                            <div className="text-ink-muted shrink-0 p-1">
                              {isExpanded ? (
                                <ChevronDown className="w-5 h-5 text-brand-fg" />
                              ) : (
                                <ChevronRight className="w-5 h-5" />
                              )}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Expanded Questions preview & Actions */}
                      {isExpanded && (
                        <div className="px-3.5 pb-3.5 pt-1 border-t border-line-soft dark:border-slate-700 space-y-3 bg-[#FAFCFF] dark:bg-slate-850">
                          {/* Questions summary */}
                          <div className="space-y-2.5 pt-2">
                            {details.length === 0 ? (
                              <p className="text-xs text-ink-muted italic">প্রশ্ন লোড হচ্ছে...</p>
                            ) : (
                              details.map((group, gIdx) => (
                                <div
                                  key={gIdx}
                                  className="text-xs p-2.5 rounded-xl bg-surface border border-line dark:border-slate-700 space-y-1.5"
                                >
                                  {group.stimulus && (
                                    <div className="space-y-1">
                                      <span className="font-bold text-brand-fg text-[0.6875rem] block">
                                        উদ্দীপক {toBn(gIdx + 1)}:
                                      </span>
                                      <RichText
                                        text={group.stimulus.text}
                                        className="text-xs text-ink line-clamp-2 leading-relaxed"
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
                                        <span className="font-semibold text-ink-muted shrink-0">
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
                              className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-brand hover:bg-brand-strong text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                            >
                              <ExternalLink className="w-4 h-4" />
                              <span>Create-এ খোলো</span>
                            </button>
                            <button
                              type="button"
                              disabled={exportingPaperId === paper.id}
                              onClick={() => handleExportPaperPdf(paper)}
                              className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-surface border border-brand text-brand hover:bg-brand-hover text-xs font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
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

          {paperSelectMode && (
            <div
              className="fixed left-0 right-0 bottom-16 z-40 px-3.5 pb-2 pt-2 bg-app/95 dark:bg-slate-900/95 border-t border-line"
            >
              <div className="max-w-[390px] mx-auto flex gap-1.5">
                {(paperSelectPurpose === null || paperSelectPurpose === 'copy') && (
                  <button
                    type="button"
                    disabled={selectedPaperIds.length === 0}
                    onClick={() => handleCopyOrCutSelectedPapers('copy')}
                    className={`flex-1 min-w-0 min-h-[46px] rounded-xl text-[0.6875rem] font-bold flex items-center justify-center gap-1 disabled:opacity-40 ${
                      paperSelectPurpose === 'copy'
                        ? 'bg-brand text-white'
                        : 'bg-surface border border-brand text-brand'
                    }`}
                  >
                    <Copy className="w-4 h-4 shrink-0" />
                    <span>কপি</span>
                  </button>
                )}
                {(paperSelectPurpose === null || paperSelectPurpose === 'cut') && (
                  <button
                    type="button"
                    disabled={selectedPaperIds.length === 0}
                    onClick={() => handleCopyOrCutSelectedPapers('cut')}
                    className={`flex-1 min-w-0 min-h-[46px] rounded-xl text-[0.6875rem] font-bold flex items-center justify-center gap-1 disabled:opacity-40 ${
                      paperSelectPurpose === 'cut'
                        ? 'bg-amber-600 text-white'
                        : 'bg-surface border border-amber-500 text-amber-700'
                    }`}
                  >
                    <Scissors className="w-4 h-4 shrink-0" />
                    <span>কাট</span>
                  </button>
                )}
                {(paperSelectPurpose === null || paperSelectPurpose === 'export') && (
                  <button
                    type="button"
                    disabled={selectedPaperIds.length === 0 || isExporting}
                    onClick={handleExportSelectedPapers}
                    className={`flex-1 min-w-0 min-h-[46px] rounded-xl text-[0.6875rem] font-bold flex items-center justify-center gap-1 disabled:opacity-40 ${
                      paperSelectPurpose === 'export'
                        ? 'bg-brand text-white'
                        : 'bg-surface border border-brand text-brand'
                    }`}
                  >
                    <FileArchive className="w-4 h-4 shrink-0" />
                    <span>{isExporting ? 'তৈরি…' : 'এক্সপোর্ট'}</span>
                  </button>
                )}
                {(paperSelectPurpose === null || paperSelectPurpose === 'pdf') && (
                  <button
                    type="button"
                    disabled={selectedPaperIds.length === 0 || Boolean(pdfProgress)}
                    onClick={handleExportSelectedPapersPdf}
                    className={`flex-1 min-w-0 min-h-[46px] rounded-xl text-[0.6875rem] font-bold flex items-center justify-center gap-1 disabled:opacity-40 ${
                      paperSelectPurpose === 'pdf'
                        ? 'bg-brand text-white'
                        : 'bg-surface border border-brand text-brand'
                    }`}
                  >
                    <FileDown className="w-4 h-4 shrink-0" />
                    <span>PDF</span>
                  </button>
                )}
                {(paperSelectPurpose === null || paperSelectPurpose === 'delete') && (
                  <button
                    type="button"
                    disabled={selectedPaperIds.length === 0}
                    onClick={() => setPaperBulkDeleteConfirm(true)}
                    className={`flex-1 min-w-0 min-h-[46px] rounded-xl text-[0.6875rem] font-bold flex items-center justify-center gap-1 disabled:opacity-40 ${
                      paperSelectPurpose === 'delete'
                        ? 'bg-red-600 text-white'
                        : 'bg-surface border border-red-500 text-red-600'
                    }`}
                  >
                    <Trash2 className="w-4 h-4 shrink-0" />
                    <span>ডিলিট</span>
                  </button>
                )}
              </div>
            </div>
          )}
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
            {renderPaperClipBanner(null)}

            {/* Top Bar with + New Category Button */}
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-ink dark:text-slate-300">
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
                  className="min-h-[44px] px-3.5 py-1.5 rounded-xl border border-brand text-brand text-xs font-bold flex items-center gap-1"
                >
                  <CheckSquare className="w-4 h-4" />
                  <span>{selectedCatIds.length === visibleCategories.length ? 'সব বাদ দিন' : 'সব নির্বাচন'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleOpenAddCategory}
                  className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-brand hover:bg-brand-strong text-white text-xs font-bold flex items-center gap-1 shadow-2xs"
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
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-dashed border-brand dark:border-indigo-500 text-brand text-xs font-bold flex items-center justify-center gap-1.5"
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
              <div className="bg-surface rounded-3xl p-7 text-center border border-line space-y-3">
                <p className="text-sm font-semibold text-ink">
                  কোনো ক্যাটেগরি নেই
                </p>
                <button
                  type="button"
                  onClick={handleOpenAddCategory}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-brand text-white text-xs font-bold"
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
                      className={`bg-surface rounded-2xl p-4 border shadow-xs flex items-center justify-between gap-3 cursor-pointer transition-all group ${
                        isSelected
                          ? 'border-brand dark:border-indigo-500 bg-brand-soft'
                          : 'border-line hover:border-brand dark:hover:border-indigo-500'
                      }`}
                    >
                      {selectMode && (
                        <span className="shrink-0 text-brand">
                          {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-[#94A3B8]" />}
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-ink group-hover:text-brand-fg transition-colors truncate flex items-center gap-1.5">
                          {pinned && <Pin className="w-4 h-4 text-brand-fg shrink-0" />}
                          <span className="truncate">{cat.name}</span>
                        </h3>
                        <p className="text-[0.6875rem] text-ink-muted font-medium mt-0.5">
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
                            className="w-10 h-10 rounded-full flex items-center justify-center bg-brand-soft text-brand disabled:opacity-30"
                          >
                            <ArrowUp className="w-5 h-5" />
                          </button>
                          <button
                            type="button"
                            aria-label="নিচে নিন"
                            disabled={movIdx < 0 || movIdx >= movable.length - 1}
                            onClick={() => moveCategory(cat.id, 1)}
                            className="w-10 h-10 rounded-full flex items-center justify-center bg-brand-soft text-brand disabled:opacity-30"
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
              className="fixed left-0 right-0 bottom-16 z-40 px-3.5 pb-2 pt-2 bg-app/95 dark:bg-slate-900/95 border-t border-line"
              style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px) * 0)' }}
            >
              <div className="max-w-[390px] mx-auto flex gap-2">
                {(selectPurpose === null || selectPurpose === 'backup') && (
                  <button
                    type="button"
                    disabled={selectedCatIds.length === 0 || isExporting}
                    onClick={handleExportSelectedBackup}
                    className="flex-1 min-h-[46px] rounded-xl bg-brand text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
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
                        ? 'bg-brand text-white'
                        : 'bg-surface border border-brand text-brand'
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
                        : 'bg-surface border border-red-500 text-red-600'
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
        <ProfileHome
          menuItems={menuItems}
          rows={profileRows}
          loading={loading}
          paperCount={paperCount}
          questionCount={questionCount}
          chapterQuestionCount={chapterQuestionCount}
          categoryCount={categories.length}
          restoreFileInputRef={restoreFileInputRef}
          onRestoreFileSelected={handleRestoreFileSelected}
          backupReminder={backupReminder}
          onBackupReminderOpen={() => setShowBackupHistory(true)}
          onBackupReminderSnooze={() => {
            snoozeReminder(1);
            setBackupTick((n) => n + 1);
          }}
        />
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

      {/* Bulk delete of papers (inside a category) */}
      <ConfirmDialog
        isOpen={paperBulkDeleteConfirm}
        title="নির্বাচিত প্রশ্নপত্র মুছবেন?"
        message={`${toBn(selectedPaperIds.length)}টি প্রশ্নপত্র মুছে যাবে (কালেকশনের প্রশ্নগুলো মুছবে না)।`}
        confirmText="হ্যাঁ, মুছে ফেলুন"
        cancelText="না"
        isDestructive={true}
        onConfirm={handleConfirmBulkDeletePapers}
        onCancel={() => setPaperBulkDeleteConfirm(false)}
      />

      <BackupHistoryDialog
        isOpen={showBackupHistory}
        busy={isExporting}
        onBackupNow={handleFullBackup}
        onClose={() => {
          setShowBackupHistory(false);
          setBackupTick((n) => n + 1);
        }}
      />

      <SortDialog
        isOpen={showPaperSortDialog}
        title="প্রশ্নপত্র সর্ট করুন"
        options={PAPER_SORT_OPTIONS}
        value={paperSortMode}
        onSelect={changePaperSortMode}
        onClose={() => setShowPaperSortDialog(false)}
      />

      <SortDialog
        isOpen={showSortDialog}
        title="ক্যাটেগরি সর্ট করুন"
        options={SORT_OPTIONS}
        value={sortMode}
        footer={'"অশ্রেণিবদ্ধ" ক্যাটেগরি সবসময় সবার উপরে থাকে।'}
        onSelect={changeSortMode}
        onClose={() => setShowSortDialog(false)}
      />

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

      <PdfProgressDialog progress={pdfProgress} />
      <PdfResultDialog result={pdfResult} onClose={() => setPdfResult(null)} />

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
          <div className="w-full max-w-sm bg-surface rounded-2xl p-5 border border-red-200 dark:border-red-900 shadow-2xl space-y-3">
            <div className="flex items-center gap-2 text-red-600 font-bold text-sm">
              <AlertTriangle className="w-5 h-5" />
              <span>PDF তৈরিতে ত্রুটি</span>
            </div>
            <p className="text-xs text-ink bg-danger-soft dark:bg-red-950/40 p-3 rounded-xl border border-red-100 dark:border-red-900 font-mono break-all leading-relaxed">
              {pdfErrorMessage}
            </p>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setPdfErrorMessage(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-brand text-white text-xs font-bold"
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
