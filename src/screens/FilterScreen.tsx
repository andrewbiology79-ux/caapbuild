import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState } from '../ui/EmptyState';
import {
  Search,
  SlidersHorizontal,
  X,
  RefreshCw,
  Check,
  Trash2,
  Layers,
  BookOpen,
  ListChecks,
  FlipHorizontal,
  XCircle,
  Star,
  Copy,
  FileText,
  ChevronDown,
  Eye,
  EyeOff,
  Tag,
  Award,
  FolderOpen,
  Scissors,
  BookMarked,
} from 'lucide-react';
import { Header } from '../components/Header';
import { KebabMenu, type MenuItem } from '../components/KebabMenu';
import { RichText } from '../components/RichText';
import { QuestionBoardTags } from '../components/QuestionBoardTags';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ActionSheet } from '../components/ActionSheet';
import { ImageViewerModal } from '../components/ImageViewerModal';
import { ReferenceDialog } from '../components/ReferenceDialog';
import { useToast } from '../components/Toast';
import { FilterPdfDialog, type FilterPdfValues } from '../components/FilterPdfDialog';
import { exportRowsToPdf } from '../utils/filterPdf';
import { showPdfSavedDialog } from '../utils/storageAccess';
import { getRatingStarsText, getApi } from '../db/api';
import { getSelectedIdsAll, setMultiClipboard, type MultiClipGroup } from '../db/crossDb';
import { getDb } from '../db/db';
import { openCollectionAtQuestion } from './CollectionScreen';
import type { CqScope, QuestionType } from '../db/db';
import { toBn } from '../utils/toBn';
import { useNavigation } from '../utils/navigation';
import {
  EMPTY_CRITERIA,
  applyFilters,
  countActiveFilters,
  loadFilterDataset,
  type FilterCriteria,
  type FilterDataset,
  type FilterRow,
  type SortMode,
} from '../utils/filterEngine';
import { filterTabState, persistDropdownOrder, type DropdownKey } from '../utils/filterStore';

import { SORT_LABELS, TYPE_OPTIONS, NO_SCROLLBAR, toggleIn } from '../features/filter/FilterUi';
import { ResultCard } from '../features/filter/ResultCard';
import { FilterSheet } from '../features/filter/FilterSheet';

const PAGE_SIZE = 30;


const EMPTY_DATASET: FilterDataset = {
  rows: [],
  loadedAt: 0,
  facets: { subjects: [], chapters: [], topics: [], marks: [], boards: [], years: [], categories: [] },
};

/* ------------------------------------------------------------------ */
/* Draggable dropdown chips                                            */
/* ------------------------------------------------------------------ */

interface DropdownDef {
  key: DropdownKey;
  label: string;
  options: Array<{ value: string; label: string }>;
  selected: string[];
  /** single-choice dropdowns (sort) close after a pick */
  single?: boolean;
  /** shown instead of the list when there is nothing to pick */
  emptyHint?: string;
  onToggle: (value: string) => void;
  onClear?: () => void;
}

/**
 * Long-press a chip, then drag left/right to reorder. A plain tap still opens the dropdown.
 */
function useChipDrag(
  order: DropdownKey[],
  setOrder: (o: DropdownKey[]) => void,
  containerRef: React.RefObject<HTMLDivElement | null>
) {
  const [draggingKey, setDraggingKey] = useState<DropdownKey | null>(null);
  const justDragged = useRef(false);
  const orderRef = useRef(order);
  orderRef.current = order;

  const onPointerDown = (key: DropdownKey) => (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const container = containerRef.current;
    if (!container) return;

    const startX = e.clientX;
    const startY = e.clientY;
    let active = false;

    const timer = window.setTimeout(() => {
      active = true;
      setDraggingKey(key);
      try {
        navigator.vibrate?.(15);
      } catch {
        /* ignore */
      }
    }, 280);

    const blockScroll = (ev: TouchEvent) => {
      if (active && ev.cancelable) ev.preventDefault();
    };

    const reorderAt = (x: number) => {
      const cur = orderRef.current;
      const from = cur.indexOf(key);
      let to = from;
      container.querySelectorAll<HTMLElement>('[data-dd]').forEach((el) => {
        const k = el.dataset.dd as DropdownKey;
        if (k === key) return;
        const r = el.getBoundingClientRect();
        const mid = r.left + r.width / 2;
        const idx = cur.indexOf(k);
        if (idx > from && x > mid) to = Math.max(to, idx);
        if (idx < from && x < mid) to = Math.min(to, idx);
      });
      if (to !== from) {
        const next = [...cur];
        next.splice(from, 1);
        next.splice(to, 0, key);
        orderRef.current = next;
        setOrder(next);
      }
      // edge auto-scroll
      const cr = container.getBoundingClientRect();
      if (x > cr.right - 32) container.scrollLeft += 14;
      else if (x < cr.left + 32) container.scrollLeft -= 14;
    };

    const onMove = (ev: PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 8) finish(false);
        return;
      }
      reorderAt(ev.clientX);
    };
    const onUp = () => finish(active);
    const onCancel = () => finish(false);

    function finish(wasDragging: boolean) {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      document.removeEventListener('touchmove', blockScroll);
      if (wasDragging) {
        justDragged.current = true;
        window.setTimeout(() => (justDragged.current = false), 80);
        persistDropdownOrder(orderRef.current);
      }
      setDraggingKey(null);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    document.addEventListener('touchmove', blockScroll, { passive: false });
  };

  return { draggingKey, justDragged, onPointerDown };
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export const FilterScreen: React.FC = () => {
  const [dataset, setDataset] = useState<FilterDataset | null>(null);
  const [loading, setLoading] = useState(true);

  // Restored from the module store so filters survive switching tabs
  const [criteria, setCriteria] = useState<FilterCriteria>(filterTabState.criteria);
  const [searchInput, setSearchInput] = useState(filterTabState.searchInput);
  const [searchOpen, setSearchOpen] = useState(filterTabState.searchOpen);
  const [sort, setSort] = useState<SortMode>(filterTabState.sort);
  const [order, setOrder] = useState<DropdownKey[]>(filterTabState.order);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<DropdownKey | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const chipRowRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();
  const { registerBackHandler, switchTab } = useNavigation();
  const [viewer, setViewer] = useState<{ isOpen: boolean; images: Array<{ url: string }>; initialIndex: number }>({
    isOpen: false,
    images: [],
    initialIndex: 0,
  });

  // Selection lives in the same database selection list the Type CQ / Chapter CQ tabs use,
  // so the Create tab picks it up automatically.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [ratingSheetOpen, setRatingSheetOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  // mirror state into the store
  useEffect(() => {
    filterTabState.criteria = criteria;
    filterTabState.searchInput = searchInput;
    filterTabState.searchOpen = searchOpen;
    filterTabState.sort = sort;
    filterTabState.order = order;
  }, [criteria, searchInput, searchOpen, sort, order]);

  const refreshSelection = useCallback(async () => {
    try {
      setSelectedIds(new Set(await getSelectedIdsAll()));
    } catch (err) {
      console.error('Failed to load selection:', err);
    }
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setDataset(await loadFilterDataset());
      await refreshSelection();
    } catch (err) {
      console.error('Failed to load filter dataset:', err);
    } finally {
      setLoading(false);
    }
  }, [refreshSelection]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Debounce the search box so typing stays smooth with thousands of questions
  useEffect(() => {
    const t = setTimeout(
      () => setCriteria((c) => (c.text === searchInput ? c : { ...c, text: searchInput })),
      250
    );
    return () => clearTimeout(t);
  }, [searchInput]);

  // Hardware back closes an open dropdown first
  useEffect(() => {
    if (!openDropdown) return;
    return registerBackHandler(() => {
      setOpenDropdown(null);
      return true;
    });
  }, [openDropdown, registerBackHandler]);

  const results = useMemo(
    () => (dataset ? applyFilters(dataset.rows, criteria, sort) : []),
    [dataset, criteria, sort]
  );

  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [results]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisible((v) => v + PAGE_SIZE);
      },
      { rootMargin: '400px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [results.length, visible, loading]);

  const activeCount = countActiveFilters(criteria);
  const hasAnyFilter = activeCount > 0 || criteria.text.trim().length > 0 || sort !== 'default';

  const applyCriteria = (c: FilterCriteria) => {
    setCriteria(c);
    setSearchInput(c.text);
  };

  const clearAllFilters = () => {
    applyCriteria(EMPTY_CRITERIA);
    setSort('default');
  };

  /* ---------- dropdown definitions ---------- */

  const chapterOnly = criteria.sources.length === 1 && criteria.sources[0] === 'chapter';

  // facets narrowed by the chosen source (Type CQ / Chapter CQ) and subject
  const scoped = useMemo(() => {
    const rows = (dataset?.rows ?? []).filter(
      (r) => criteria.sources.length === 0 || criteria.sources.includes(r.source)
    );
    const chapters = new Map<string, { key: string; subject: string; name: string }>();
    const topics = new Set<string>();
    const subjects = new Set<string>();
    for (const r of rows) {
      subjects.add(r.subjectName);
      if (criteria.subjects.length === 0 || criteria.subjects.includes(r.subjectName)) {
        const k = `${r.subjectName}||${r.chapterName}`;
        if (!chapters.has(k)) chapters.set(k, { key: k, subject: r.subjectName, name: r.chapterName });
      }
      if (r.topicName) topics.add(r.topicName);
    }
    return { chapters: [...chapters.values()], topics: [...topics], multiSubject: subjects.size > 1 };
  }, [dataset, criteria.sources, criteria.subjects]);

  const dropdowns = useMemo((): Record<DropdownKey, DropdownDef> => {
    const f = (dataset ?? EMPTY_DATASET).facets;
    const patch = (p: Partial<FilterCriteria>) => setCriteria((c) => ({ ...c, ...p }));
    return {
      source: {
        key: 'source',
        label: 'Type CQ / Chapter CQ',
        options: [
          { value: 'type', label: 'Type CQ' },
          { value: 'chapter', label: 'Chapter CQ' },
        ],
        selected: criteria.sources,
        onToggle: (v) =>
          setCriteria((c) => {
            const sources = toggleIn(c.sources, v as CqScope);
            const onlyChapter = sources.length === 1 && sources[0] === 'chapter';
            // Chapter CQ has no type level → drop any topic filter
            return { ...c, sources, topics: onlyChapter ? [] : c.topics };
          }),
        onClear: () => patch({ sources: [] }),
      },
      chapter: {
        key: 'chapter',
        label: 'অধ্যায়',
        options: scoped.chapters.map((c) => ({
          value: c.key,
          label: scoped.multiSubject && criteria.subjects.length !== 1 ? `${c.subject} · ${c.name}` : c.name,
        })),
        selected: criteria.chapters,
        emptyHint: 'কোনো অধ্যায় নেই',
        onToggle: (v) => patch({ chapters: toggleIn(criteria.chapters, v) }),
        onClear: () => patch({ chapters: [] }),
      },
      topic: {
        key: 'topic',
        label: 'টাইপ',
        options: chapterOnly ? [] : scoped.topics.map((t) => ({ value: t, label: t })),
        selected: chapterOnly ? [] : criteria.topics,
        emptyHint: chapterOnly ? 'Chapter CQ-তে টাইপ নেই' : 'কোনো টাইপ নেই',
        onToggle: (v) => patch({ topics: toggleIn(criteria.topics, v) }),
        onClear: () => patch({ topics: [] }),
      },
      board: {
        key: 'board',
        label: 'বোর্ড',
        options: f.boards.map((b) => ({ value: b, label: b })),
        selected: criteria.boards,
        emptyHint: 'কোনো বোর্ড নেই',
        onToggle: (v) => patch({ boards: toggleIn(criteria.boards, v) }),
        onClear: () => patch({ boards: [] }),
      },
      year: {
        key: 'year',
        label: 'সাল',
        options: f.years.map((y) => ({ value: String(y), label: toBn(y) })),
        selected: criteria.years.map(String),
        emptyHint: 'কোনো সাল নেই',
        onToggle: (v) => patch({ years: toggleIn(criteria.years, Number(v)) }),
        onClear: () => patch({ years: [] }),
      },
      rating: {
        key: 'rating',
        label: 'রেটিং',
        options: [5, 4, 3, 2, 1].map((r) => ({ value: String(r), label: '★'.repeat(r) + '☆'.repeat(5 - r) })),
        selected: criteria.ratings.map(String),
        onToggle: (v) => patch({ ratings: toggleIn(criteria.ratings, Number(v)) }),
        onClear: () => patch({ ratings: [] }),
      },
      category: {
        key: 'category',
        label: 'ক্যাটেগরি',
        options: f.categories.map((c) => ({ value: c.id, label: c.name })),
        selected: criteria.categories,
        emptyHint: 'কোনো প্রশ্ন এখনো প্রশ্নপত্রে ব্যবহৃত হয়নি',
        onToggle: (v) => patch({ categories: toggleIn(criteria.categories, v) }),
        onClear: () => patch({ categories: [] }),
      },
      type: {
        key: 'type',
        label: 'ধরন (ক–ঘ)',
        options: TYPE_OPTIONS.map((t) => ({ value: t, label: t })),
        selected: criteria.types,
        onToggle: (v) => patch({ types: toggleIn(criteria.types, v as QuestionType) }),
        onClear: () => patch({ types: [] }),
      },
      sort: {
        key: 'sort',
        label: 'সাজান',
        single: true,
        options: (Object.keys(SORT_LABELS) as SortMode[]).map((m) => ({ value: m, label: SORT_LABELS[m] })),
        selected: sort === 'default' ? [] : [sort],
        onToggle: (v) => setSort(v as SortMode),
        onClear: () => setSort('default'),
      },
    };
  }, [dataset, criteria, scoped, chapterOnly, sort]);

  const handleOrderChange = useCallback((o: DropdownKey[]) => setOrder(o), []);
  const { draggingKey, justDragged, onPointerDown } = useChipDrag(order, handleOrderChange, chipRowRef);

  /* ---------- selection ---------- */

  const toggleRow = useCallback(
    async (row: FilterRow) => {
      const id = row.question.id;
      // optimistic UI
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      try {
        await getApi(row.source).toggleSelected(id);
      } catch (err) {
        console.error('Toggle selection failed:', err);
        await refreshSelection();
      }
    },
    [refreshSelection]
  );

  /**
   * "Select all" / "Invert" act on the current filter result only. Questions selected earlier
   * that are not part of the result are dropped from the selection.
   */
  const rewriteSelection = async (mode: 'all' | 'invert') => {
    for (const scope of ['type', 'chapter'] as CqScope[]) {
      const api = getApi(scope);
      const current = await api.getSelectedIds();
      const ids = results.filter((r) => r.source === scope).map((r) => r.question.id);
      const next = mode === 'all' ? ids : ids.filter((id) => !current.includes(id));
      await api.reorderSelected(next);
    }
    await refreshSelection();
  };

  const handleLocate = useCallback(
    async (row: FilterRow) => {
      try {
        const database = getDb(row.source);
        const topic = await database.topics.get(row.question.topicId);
        const chapter = topic ? await database.chapters.get(topic.chapterId) : undefined;
        const subject = chapter ? await database.subjects.get(chapter.subjectId) : undefined;
        if (!topic || !chapter || !subject) {
          showToast('প্রশ্নটির অবস্থান পাওয়া যায়নি');
          return;
        }
        openCollectionAtQuestion(row.source, { subject, chapter, topic }, row.question.id);
        switchTab(row.source === 'chapter' ? 'chapterCq' : 'typeCq');
      } catch (err) {
        console.error('Open question location failed:', err);
        showToast('প্রশ্নটি খুলতে সমস্যা হয়েছে');
      }
    },
    [showToast, switchTab]
  );

  const openImageViewer = useCallback((urls: string[], index: number) => {
    setViewer({ isOpen: true, images: urls.map((url) => ({ url })), initialIndex: index });
  }, []);

  const clearSelectionAll = async () => {
    await Promise.all([getApi('type').clearSelection(), getApi('chapter').clearSelection()]);
    setSelectedIds(new Set());
  };

  const selectedRows = useMemo(
    () => (dataset ? dataset.rows.filter((r) => selectedIds.has(r.question.id)) : []),
    [dataset, selectedIds]
  );

  /** Run a per-question action against the right database (Type CQ / Chapter CQ) */
  const runBulk = async (fn: (api: ReturnType<typeof getApi>, row: FilterRow) => Promise<void>): Promise<number> => {
    let done = 0;
    for (const row of selectedRows) {
      try {
        await fn(getApi(row.source), row);
        done += 1;
      } catch (err) {
        console.error('Bulk action failed for', row.key, err);
      }
    }
    return done;
  };

  const handleBulkPdf = async (values: FilterPdfValues) => {
    setPdfBusy(true);
    try {
      const savedPath = await exportRowsToPdf(selectedRows, values);
      setPdfOpen(false);
      if (!(savedPath && showPdfSavedDialog(savedPath))) {
        showToast(savedPath ? `PDF সেভ হয়েছে: ${savedPath}` : 'PDF তৈরি সম্পন্ন হয়েছে', savedPath ? 4500 : 2000);
      }
    } catch (err: any) {
      console.error('Filter PDF export failed:', err);
      showToast(err?.message || 'PDF তৈরিতে সমস্যা হয়েছে');
    } finally {
      setPdfBusy(false);
    }
  };

  const handleBulkRating = async (rating: number) => {
    const n = await runBulk((api, row) => api.updateQuestion(row.question.id, { rating }));
    await reload();
    showToast(`${toBn(n)}টি প্রশ্নের রেটিং বদলানো হয়েছে`);
  };

  // Copy the selected questions (stimulus included) to the shared clipboard.
  // They can then be pasted into any Type CQ type / Chapter CQ chapter (Paste before / after / end).
  const handleBulkClip = async (mode: 'copy' | 'cut') => {
    if (selectedRows.length === 0) return;
    try {
      const groups: MultiClipGroup[] = [];
      const byStimulus = new Map<string, MultiClipGroup>();
      for (const row of selectedRows) {
        if (row.stimulus) {
          const key = `${row.source}:${row.stimulus.id}`;
          let g = byStimulus.get(key);
          if (!g) {
            g = { source: row.source, stimulus: row.stimulus, questions: [] };
            byStimulus.set(key, g);
            groups.push(g);
          }
          g.questions.push(row.question);
        } else {
          groups.push({ source: row.source, questions: [row.question] });
        }
      }
      groups.forEach((g) => g.questions.sort((a, b) => a.order - b.order));
      await setMultiClipboard(groups, mode);
      showToast(
        mode === 'cut'
          ? `${toBn(selectedRows.length)}টি প্রশ্ন কাট হয়েছে — Type CQ / Chapter CQ তে গিয়ে পেস্ট করলে সেখানে সরে যাবে`
          : `${toBn(selectedRows.length)}টি প্রশ্ন কপি হয়েছে — Type CQ / Chapter CQ তে গিয়ে পেস্ট করুন`,
        3500
      );
    } catch (err) {
      console.error('Bulk clipboard failed:', err);
      showToast(mode === 'cut' ? 'কাট করা যায়নি' : 'কপি করা যায়নি');
    }
  };
  const handleBulkCopy = () => handleBulkClip('copy');
  const handleBulkCut = () => handleBulkClip('cut');

  const handleBulkDelete = async () => {
    setConfirmDelete(false);
    const n = await runBulk((api, row) => api.deleteQuestion(row.question.id));
    await reload();
    showToast(`${toBn(n)}টি প্রশ্ন মুছে ফেলা হয়েছে`);
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchInput('');
  };

  const headerMenuItems = useMemo((): MenuItem[] => {
    const items: MenuItem[] = [
      {
        id: 'search',
        label: searchOpen ? 'সার্চ বন্ধ করুন' : 'প্রশ্ন সার্চ',
        icon: <Search className="w-4 h-4 text-brand-fg" />,
        onClick: () => (searchOpen ? closeSearch() : setSearchOpen(true)),
      },
      {
        id: 'select-all',
        label: `সব সিলেক্ট করুন (${toBn(results.length)})`,
        icon: <ListChecks className="w-4 h-4 text-brand-fg" />,
        onClick: () => rewriteSelection('all'),
      },
      {
        id: 'invert',
        label: 'উল্টো সিলেক্ট',
        icon: <FlipHorizontal className="w-4 h-4 text-brand-fg" />,
        onClick: () => rewriteSelection('invert'),
      },
    ];
    if (selectedIds.size > 0) {
      items.push(
        {
          id: 'clear',
          label: 'সিলেকশন মুছুন',
          icon: <XCircle className="w-4 h-4 text-ink" />,
          onClick: clearSelectionAll,
        },
        {
          id: 'pdf',
          label: 'PDF বানান',
          icon: <FileText className="w-4 h-4 text-brand-fg" />,
          onClick: () => setPdfOpen(true),
        },
        {
          id: 'rating',
          label: 'রেটিং বদলান',
          icon: <Star className="w-4 h-4 text-amber-500" />,
          onClick: () => setRatingSheetOpen(true),
        },
        {
          id: 'copy',
          label: 'কপি করুন',
          icon: <Copy className="w-4 h-4 text-ink" />,
          onClick: handleBulkCopy,
        },
        {
          id: 'cut',
          label: 'কাট করুন',
          icon: <Scissors className="w-4 h-4 text-amber-600" />,
          onClick: handleBulkCut,
        },
        {
          id: 'delete',
          label: 'মুছে ফেলুন',
          icon: <Trash2 className="w-4 h-4" />,
          isDestructive: true,
          onClick: () => setConfirmDelete(true),
        }
      );
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchOpen, selectedIds, results, selectedRows]);

  const resultIdSet = useMemo(() => new Set(results.map((r) => r.question.id)), [results]);
  const hiddenSelected = useMemo(
    () => [...selectedIds].filter((id) => !resultIdSet.has(id)).length,
    [selectedIds, resultIdSet]
  );

  const openDef = openDropdown ? dropdowns[openDropdown] : null;

  return (
    <div className="flex-1 flex flex-col min-h-full pb-20 bg-app">
      <Header
        title="Filter"
        subtitle={
          selectedIds.size > 0
            ? `${toBn(selectedIds.size)}টি নির্বাচিত`
            : dataset
              ? `মোট ${toBn(dataset.rows.length)}টি প্রশ্ন`
              : undefined
        }
        rightAction={
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              aria-label="ফিল্টার খুলুন"
              className="relative min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-white/90 hover:text-white hover:bg-white/10 active:bg-white/20 transition-colors"
            >
              <SlidersHorizontal className="w-5 h-5" />
              {activeCount > 0 && (
                <span className="absolute top-1 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[0.625rem] font-bold flex items-center justify-center border-2 border-brand">
                  {toBn(activeCount)}
                </span>
              )}
            </button>
            <KebabMenu items={headerMenuItems} buttonAriaLabel="মেনু" align="right" />
          </div>
        }
      />

      {/* Sticky control bar */}
      <div className="sticky top-14 z-30 bg-surface border-b border-line px-3.5 pt-2.5 pb-2.5 space-y-2.5">
        {searchOpen && (
          <div className="relative">
            <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              autoFocus
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="প্রশ্ন, উদ্দীপক বা সমাধান খুঁজুন..."
              className="w-full min-h-[44px] pl-9 pr-9 py-2 rounded-xl bg-app border border-line text-xs text-ink focus:outline-none focus:ring-2 focus:ring-brand focus:bg-surface transition-all"
            />
            <button
              type="button"
              onClick={closeSearch}
              aria-label="সার্চ বন্ধ করুন"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-muted"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Dropdown filters — long-press and drag to reorder */}
        <div ref={chipRowRef} className="flex gap-1.5 overflow-x-auto pb-0.5" style={NO_SCROLLBAR}>
          {order.map((key) => {
            const def = dropdowns[key];
            const count = def.selected.length;
            const isOpen = openDropdown === key;
            const isDragging = draggingKey === key;
            return (
              <button
                key={key}
                type="button"
                data-dd={key}
                onPointerDown={onPointerDown(key)}
                onContextMenu={(e) => e.preventDefault()}
                onClick={() => {
                  if (justDragged.current) return;
                  setOpenDropdown((cur) => (cur === key ? null : key));
                }}
                aria-expanded={isOpen}
                className={`shrink-0 min-h-[36px] pl-3 pr-2 rounded-full border text-xs font-semibold flex items-center gap-1 select-none transition-all ${
                  isDragging
                    ? 'scale-110 shadow-lg ring-2 ring-brand z-10'
                    : 'active:scale-95'
                } ${
                  count > 0
                    ? 'bg-brand border-brand text-white'
                    : isOpen
                      ? 'bg-brand-soft border-brand text-brand-ink'
                      : 'bg-surface border-line text-ink'
                }`}
                style={{ WebkitUserSelect: 'none' }}
              >
                {def.label}
                {count > 0 && key !== 'sort' && <span className="opacity-90">· {toBn(count)}</span>}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
            );
          })}
        </div>

        {/* Open dropdown panel */}
        {openDef && (
          <div className="rounded-xl border border-line bg-surface shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-3.5 py-2 bg-surface-2 border-b border-line">
              <span className="text-xs font-bold text-ink">{openDef.label}</span>
              <div className="flex items-center gap-1">
                {openDef.selected.length > 0 && openDef.onClear && (
                  <button
                    type="button"
                    onClick={openDef.onClear}
                    className="min-h-[30px] px-2 text-[0.6875rem] font-bold text-rose-600"
                  >
                    মুছুন
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpenDropdown(null)}
                  aria-label="বন্ধ করুন"
                  className="w-8 h-8 flex items-center justify-center text-ink-muted"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="max-h-[45vh] overflow-y-auto">
              {openDef.options.length === 0 ? (
                <p className="px-3.5 py-4 text-center text-xs text-ink-muted">{openDef.emptyHint ?? 'কোনো অপশন নেই'}</p>
              ) : (
                openDef.options.map((o) => {
                  const on = openDef.selected.includes(o.value) || (openDef.single && openDef.key === 'sort' && o.value === 'default' && sort === 'default');
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => {
                        openDef.onToggle(o.value);
                        if (openDef.single) setOpenDropdown(null);
                      }}
                      className="w-full min-h-[42px] px-3.5 text-left text-xs font-medium text-ink flex items-center justify-between gap-2 hover:bg-hover border-b border-line-soft last:border-b-0"
                    >
                      <span className="min-w-0">{o.label}</span>
                      {on && <Check className="w-4 h-4 text-brand-fg shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Result count + selection */}
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-ink">
            {toBn(results.length)}টি ফলাফল
            {hasAnyFilter && dataset && (
              <span className="font-medium text-ink-muted"> / {toBn(dataset.rows.length)}</span>
            )}
          </p>
          <div className="flex items-center gap-1">
            {hasAnyFilter && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="min-h-[32px] px-2.5 rounded-lg text-[0.6875rem] font-bold text-rose-600 hover:bg-rose-50"
              >
                ফিল্টার মুছুন
              </button>
            )}
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={clearSelectionAll}
                className="min-h-[32px] px-2.5 rounded-lg text-[0.6875rem] font-bold text-brand-ink bg-brand-soft flex items-center gap-1"
              >
                {hiddenSelected > 0
                  ? `${toBn(selectedIds.size - hiddenSelected)} এখানে · ${toBn(selectedIds.size)} মোট`
                  : `${toBn(selectedIds.size)} নির্বাচিত`}
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 px-3.5 py-3 space-y-3">
        {loading && !dataset ? (
          <div className="py-16 text-center text-xs text-ink-muted flex flex-col items-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-brand-fg" />
            লোড হচ্ছে...
          </div>
        ) : results.length === 0 ? (
          <EmptyState
            title={
              dataset && dataset.rows.length === 0
                ? 'এখনো কোনো প্রশ্ন যুক্ত করা হয়নি'
                : 'এই ফিল্টারে কোনো প্রশ্ন পাওয়া যায়নি'
            }
            action={
              hasAnyFilter ? (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-brand text-white text-xs font-semibold"
                >
                  ফিল্টার মুছুন
                </button>
              ) : undefined
            }
          />
        ) : (
          <>
            {results.slice(0, visible).map((row, i) => (
              <ResultCard
                key={row.key}
                row={row}
                index={i}
                selected={selectedIds.has(row.question.id)}
                onToggle={toggleRow}
                onLocate={handleLocate}
                onOpenImages={openImageViewer}
              />
            ))}
            {visible < results.length && (
              <div ref={sentinelRef} className="py-4 text-center text-xs text-ink-muted">
                আরও লোড হচ্ছে...
              </div>
            )}
          </>
        )}
      </div>

      <ImageViewerModal
        isOpen={viewer.isOpen}
        images={viewer.images}
        initialIndex={viewer.initialIndex}
        onClose={() => setViewer((v) => ({ ...v, isOpen: false }))}
      />

      <FilterSheet
        isOpen={sheetOpen}
        dataset={dataset ?? EMPTY_DATASET}
        criteria={criteria}
        sort={sort}
        resultCount={results.length}
        onChange={applyCriteria}
        onSortChange={setSort}
        onClose={() => setSheetOpen(false)}
      />

      <FilterPdfDialog
        isOpen={pdfOpen}
        questionCount={selectedRows.length}
        totalMarks={selectedRows.reduce((sum, r) => sum + (r.question.marks || 0), 0)}
        defaultSubjectLine={[...new Set(selectedRows.map((r) => r.subjectName))].join(', ')}
        busy={pdfBusy}
        onConfirm={handleBulkPdf}
        onCancel={() => setPdfOpen(false)}
      />

      <ActionSheet
        isOpen={ratingSheetOpen}
        title="রেটিং বদলান"
        subtitle={`${toBn(selectedIds.size)}টি প্রশ্ন`}
        onClose={() => setRatingSheetOpen(false)}
        items={[5, 4, 3, 2, 1].map((r) => ({
          id: `rate-${r}`,
          label: `${'★'.repeat(r)}${'☆'.repeat(5 - r)}  ${getRatingStarsText(r).split(' ').slice(1).join(' ')}`,
          onClick: () => handleBulkRating(r),
        }))}
      />

      <ConfirmDialog
        isOpen={confirmDelete}
        title="প্রশ্ন মুছে ফেলবেন?"
        message={`সিলেক্ট করা ${toBn(selectedIds.size)}টি প্রশ্ন (সমাধানের ছবিসহ) স্থায়ীভাবে মুছে যাবে।`}
        confirmText="মুছুন"
        isDestructive
        onConfirm={handleBulkDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
};

export default FilterScreen;
