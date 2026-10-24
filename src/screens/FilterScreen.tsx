import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  SlidersHorizontal,
  X,
  RefreshCw,
  ArrowUpDown,
  Bookmark,
  BookmarkPlus,
  Trash2,
  Check,
  Layers,
  BookOpen,
  CheckSquare,
  Square,
  ListChecks,
  FlipHorizontal,
  XCircle,
  Star,
  Copy,
  FileText,
} from 'lucide-react';
import { Header } from '../components/Header';
import { RichText } from '../components/RichText';
import { PromptDialog } from '../components/PromptDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ActionSheet } from '../components/ActionSheet';
import { useToast } from '../components/Toast';
import { FilterPdfDialog, type FilterPdfValues } from '../components/FilterPdfDialog';
import { exportRowsToPdf } from '../utils/filterPdf';
import { showPdfSavedDialog } from '../utils/storageAccess';
import type { MenuItem } from '../components/KebabMenu';
import { getRatingStarsText, getApi } from '../db/api';
import type { QuestionType } from '../db/db';
import { toBn } from '../utils/toBn';
import {
  EMPTY_CRITERIA,
  applyFilters,
  countActiveFilters,
  loadFilterDataset,
  loadSavedFilters,
  persistSavedFilters,
  type FilterCriteria,
  type FilterDataset,
  type FilterRow,
  type SavedFilter,
  type SortMode,
} from '../utils/filterEngine';

const PAGE_SIZE = 30;

const SORT_LABELS: Record<SortMode, string> = {
  default: 'স্বাভাবিক ক্রম',
  'rating-desc': 'রেটিং: বেশি → কম',
  'rating-asc': 'রেটিং: কম → বেশি',
  'marks-desc': 'নম্বর: বেশি → কম',
  type: 'টাইপ (ক → ঘ)',
};

const TYPE_OPTIONS: QuestionType[] = ['ক', 'খ', 'গ', 'ঘ'];

const EMPTY_DATASET: FilterDataset = {
  rows: [],
  loadedAt: 0,
  facets: { subjects: [], chapters: [], topics: [], marks: [], boards: [], years: [] },
};

/** hides the scrollbar on the horizontal chip rows */
const NO_SCROLLBAR: React.CSSProperties = { scrollbarWidth: 'none' };

function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

const Chip: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}> = ({ active, onClick, children, className = '' }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`min-h-[36px] px-3 py-1.5 rounded-full border text-xs font-semibold transition-all active:scale-95 ${
      active
        ? 'bg-[#3B4FD8] border-[#3B4FD8] text-white shadow-sm'
        : 'bg-white border-[#D5D9E2] text-[#1B1F2A] hover:bg-[#EEF2FF]'
    } ${className}`}
  >
    {children}
  </button>
);

const Section: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({
  title,
  hint,
  children,
}) => (
  <div className="space-y-2">
    <div className="flex items-baseline justify-between">
      <h4 className="text-xs font-bold text-[#1B1F2A]">{title}</h4>
      {hint && <span className="text-[0.6875rem] text-[#64748B]">{hint}</span>}
    </div>
    <div className="flex flex-wrap gap-2">{children}</div>
  </div>
);

const Segmented: React.FC<{
  title?: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}> = ({ title, value, options, onChange }) => (
  <div className="space-y-2">
    {title && <h4 className="text-xs font-bold text-[#1B1F2A]">{title}</h4>}
    <div className="flex w-full rounded-xl bg-[#F2F4F8] p-1 border border-[#D5D9E2]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 min-h-[34px] rounded-lg text-xs font-semibold transition-all ${
            value === o.value ? 'bg-white text-[#2A3BB0] shadow-sm' : 'text-[#64748B]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Result card                                                         */
/* ------------------------------------------------------------------ */

interface ResultCardProps {
  row: FilterRow;
  selectMode: boolean;
  selected: boolean;
  onToggle: (key: string) => void;
}

const ResultCard: React.FC<ResultCardProps> = React.memo(({ row, selectMode, selected, onToggle }) => {
  const q = row.question;
  const path = [row.subjectName, row.chapterName, row.topicName].filter(Boolean).join(' › ');
  const boards = (q.usedInBoards || []).slice(0, 4);

  return (
    <article
      onClick={selectMode ? () => onToggle(row.key) : undefined}
      aria-selected={selectMode ? selected : undefined}
      className={`rounded-2xl border shadow-2xs p-3.5 space-y-2.5 transition-colors ${
        selected ? 'bg-[#EEF2FF] border-[#3B4FD8] ring-1 ring-[#3B4FD8]' : 'bg-white border-[#D5D9E2]'
      } ${selectMode ? 'cursor-pointer select-none' : ''}`}
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        {selectMode &&
          (selected ? (
            <CheckSquare className="w-5 h-5 text-[#3B4FD8] shrink-0" />
          ) : (
            <Square className="w-5 h-5 text-[#94A3B8] shrink-0" />
          ))}
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.6875rem] font-bold ${
            row.source === 'chapter' ? 'bg-emerald-50 text-emerald-700' : 'bg-[#EEF2FF] text-[#2A3BB0]'
          }`}
        >
          {row.source === 'chapter' ? <BookOpen className="w-3 h-3" /> : <Layers className="w-3 h-3" />}
          {row.source === 'chapter' ? 'Chapter CQ' : 'Type CQ'}
        </span>
        <span className="px-2 py-0.5 rounded-full bg-[#1B1F2A] text-white text-[0.6875rem] font-bold">
          {q.type}
        </span>
        <span className="px-2 py-0.5 rounded-full bg-[#F2F4F8] text-[#1B1F2A] text-[0.6875rem] font-bold border border-[#D5D9E2]">
          {toBn(q.marks)} নম্বর
        </span>
        <span className="ml-auto text-[0.6875rem] text-amber-600 font-semibold">
          {getRatingStarsText(q.rating)}
        </span>
      </div>

      <p className="text-[0.6875rem] text-[#64748B] leading-snug">{path}</p>

      {row.stimulus?.text && (
        <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2 text-xs text-[#334155] line-clamp-3">
          <RichText text={row.stimulus.text} />
        </div>
      )}

      <div className="text-sm text-[#1B1F2A] leading-relaxed line-clamp-4">
        <RichText text={q.questionText} />
      </div>

      {boards.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {boards.map((b) => (
            <span
              key={b.board}
              className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 text-[0.6875rem] font-semibold border border-amber-200"
            >
              {b.board}
              {b.years?.length ? ` · ${b.years.map((y) => toBn(y)).join(', ')}` : ''}
            </span>
          ))}
        </div>
      )}
    </article>
  );
});
ResultCard.displayName = 'ResultCard';

/* ------------------------------------------------------------------ */
/* Filter sheet                                                        */
/* ------------------------------------------------------------------ */

interface SheetProps {
  isOpen: boolean;
  dataset: FilterDataset;
  criteria: FilterCriteria;
  resultCount: number;
  onChange: (c: FilterCriteria) => void;
  onClose: () => void;
}

const FilterSheet: React.FC<SheetProps> = ({ isOpen, dataset, criteria, resultCount, onChange, onClose }) => {
  if (!isOpen) return null;
  const f = dataset.facets;
  const set = (patch: Partial<FilterCriteria>) => onChange({ ...criteria, ...patch });

  // Chapters narrow down to the chosen subjects
  const chapters = f.chapters.filter((c) => criteria.subjects.length === 0 || criteria.subjects.includes(c.subject));
  const active = countActiveFilters(criteria);
  const plainChapterNames = f.subjects.length === 1 || criteria.subjects.length === 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ফিল্টার"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[390px] h-[88vh] bg-white rounded-t-3xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-3 pb-3 border-b border-[#E2E8F0]">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#D5D9E2]" />
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-[#1B1F2A]">ফিল্টার</h3>
            <button
              type="button"
              onClick={() => onChange({ ...EMPTY_CRITERIA, text: criteria.text })}
              disabled={active === 0}
              className="min-h-[36px] px-3 text-xs font-bold text-[#3B4FD8] disabled:text-[#94A3B8]"
            >
              সব মুছুন
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <Segmented
            title="উৎস"
            value={criteria.sources.length === 1 ? criteria.sources[0] : 'all'}
            onChange={(v) => set({ sources: v === 'all' ? [] : [v as 'type' | 'chapter'] })}
            options={[
              { value: 'all', label: 'সব' },
              { value: 'type', label: 'Type CQ' },
              { value: 'chapter', label: 'Chapter CQ' },
            ]}
          />

          {f.subjects.length > 0 && (
            <Section title="বিষয়">
              {f.subjects.map((s) => (
                <Chip
                  key={s}
                  active={criteria.subjects.includes(s)}
                  onClick={() => set({ subjects: toggleIn(criteria.subjects, s), chapters: [] })}
                >
                  {s}
                </Chip>
              ))}
            </Section>
          )}

          {chapters.length > 0 && (
            <Section title="অধ্যায়" hint={`${toBn(chapters.length)}টি`}>
              {chapters.map((c) => (
                <Chip
                  key={c.key}
                  active={criteria.chapters.includes(c.key)}
                  onClick={() => set({ chapters: toggleIn(criteria.chapters, c.key) })}
                >
                  {plainChapterNames ? c.name : `${c.subject} · ${c.name}`}
                </Chip>
              ))}
            </Section>
          )}

          {f.topics.length > 0 && (
            <Section title="টাইপ / টপিক (Type CQ)">
              {f.topics.map((t) => (
                <Chip key={t} active={criteria.topics.includes(t)} onClick={() => set({ topics: toggleIn(criteria.topics, t) })}>
                  {t}
                </Chip>
              ))}
            </Section>
          )}

          <Section title="প্রশ্নের ধরন">
            {TYPE_OPTIONS.map((t) => (
              <Chip key={t} active={criteria.types.includes(t)} onClick={() => set({ types: toggleIn(criteria.types, t) })}>
                {t}
              </Chip>
            ))}
          </Section>

          <Section title="রেটিং">
            {[5, 4, 3, 2, 1].map((r) => (
              <Chip key={r} active={criteria.ratings.includes(r)} onClick={() => set({ ratings: toggleIn(criteria.ratings, r) })}>
                {'★'.repeat(r)}
              </Chip>
            ))}
          </Section>

          {f.marks.length > 0 && (
            <Section title="নম্বর">
              {f.marks.map((m) => (
                <Chip key={m} active={criteria.marks.includes(m)} onClick={() => set({ marks: toggleIn(criteria.marks, m) })}>
                  {toBn(m)}
                </Chip>
              ))}
            </Section>
          )}

          {f.boards.length > 0 && (
            <Section title="বোর্ড">
              {f.boards.map((b) => (
                <Chip key={b} active={criteria.boards.includes(b)} onClick={() => set({ boards: toggleIn(criteria.boards, b) })}>
                  {b}
                </Chip>
              ))}
            </Section>
          )}

          {f.years.length > 0 && (
            <Section title="সাল">
              {f.years.map((y) => (
                <Chip key={y} active={criteria.years.includes(y)} onClick={() => set({ years: toggleIn(criteria.years, y) })}>
                  {toBn(y)}
                </Chip>
              ))}
            </Section>
          )}

          <Segmented
            title="বোর্ডে এসেছে কিনা"
            value={criteria.usage}
            onChange={(v) => set({ usage: v as FilterCriteria['usage'] })}
            options={[
              { value: 'any', label: 'সব' },
              { value: 'used', label: 'এসেছে' },
              { value: 'unused', label: 'আসেনি' },
            ]}
          />

          <Segmented
            title="উদ্দীপক"
            value={criteria.stimulus}
            onChange={(v) => set({ stimulus: v as FilterCriteria['stimulus'] })}
            options={[
              { value: 'any', label: 'সব' },
              { value: 'with', label: 'আছে' },
              { value: 'without', label: 'নেই' },
            ]}
          />

          <Segmented
            title="সমাধান"
            value={criteria.solution}
            onChange={(v) => set({ solution: v as FilterCriteria['solution'] })}
            options={[
              { value: 'any', label: 'সব' },
              { value: 'with', label: 'আছে' },
              { value: 'without', label: 'নেই' },
            ]}
          />
        </div>

        <div className="px-5 py-3 border-t border-[#E2E8F0] bg-white">
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[48px] rounded-xl bg-[#3B4FD8] text-white text-sm font-bold active:scale-[0.98] transition-transform"
          >
            {toBn(resultCount)}টি প্রশ্ন দেখুন
          </button>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export const FilterScreen: React.FC = () => {
  const [dataset, setDataset] = useState<FilterDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [criteria, setCriteria] = useState<FilterCriteria>(EMPTY_CRITERIA);
  const [searchInput, setSearchInput] = useState('');
  const [sort, setSort] = useState<SortMode>('default');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saved, setSaved] = useState<SavedFilter[]>(() => loadSavedFilters());
  const [visible, setVisible] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  // Multi-select (entered from the header ⋮ menu)
  const [selectMode, setSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [ratingSheetOpen, setRatingSheetOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setDataset(await loadFilterDataset());
    } catch (err) {
      console.error('Failed to load filter dataset:', err);
    } finally {
      setLoading(false);
    }
  }, []);

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

  const results = useMemo(
    () => (dataset ? applyFilters(dataset.rows, criteria, sort) : []),
    [dataset, criteria, sort]
  );

  // Reset paging whenever the result set changes
  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [results]);

  // Infinite scroll
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
  const hasAnyFilter = activeCount > 0 || criteria.text.trim().length > 0;

  const applyCriteria = (c: FilterCriteria) => {
    setCriteria(c);
    setSearchInput(c.text);
  };

  /* Removable chips summarising what is active */
  const activeChips = useMemo(() => {
    const chips: Array<{ id: string; label: string; remove: () => void }> = [];
    const patch = (p: (c: FilterCriteria) => Partial<FilterCriteria>) => () =>
      setCriteria((c) => ({ ...c, ...p(c) }));

    criteria.sources.forEach((s) =>
      chips.push({
        id: `src:${s}`,
        label: s === 'chapter' ? 'Chapter CQ' : 'Type CQ',
        remove: patch((c) => ({ sources: c.sources.filter((x) => x !== s) })),
      })
    );
    criteria.subjects.forEach((s) =>
      chips.push({ id: `sub:${s}`, label: s, remove: patch((c) => ({ subjects: c.subjects.filter((x) => x !== s) })) })
    );
    criteria.chapters.forEach((k) =>
      chips.push({
        id: `ch:${k}`,
        label: k.split('||')[1],
        remove: patch((c) => ({ chapters: c.chapters.filter((x) => x !== k) })),
      })
    );
    criteria.topics.forEach((t) =>
      chips.push({ id: `top:${t}`, label: t, remove: patch((c) => ({ topics: c.topics.filter((x) => x !== t) })) })
    );
    criteria.types.forEach((t) =>
      chips.push({
        id: `type:${t}`,
        label: `ধরন ${t}`,
        remove: patch((c) => ({ types: c.types.filter((x) => x !== t) })),
      })
    );
    criteria.ratings.forEach((r) =>
      chips.push({ id: `rate:${r}`, label: '★'.repeat(r), remove: patch((c) => ({ ratings: c.ratings.filter((x) => x !== r) })) })
    );
    criteria.marks.forEach((m) =>
      chips.push({
        id: `marks:${m}`,
        label: `${toBn(m)} নম্বর`,
        remove: patch((c) => ({ marks: c.marks.filter((x) => x !== m) })),
      })
    );
    criteria.boards.forEach((b) =>
      chips.push({ id: `board:${b}`, label: b, remove: patch((c) => ({ boards: c.boards.filter((x) => x !== b) })) })
    );
    criteria.years.forEach((y) =>
      chips.push({ id: `year:${y}`, label: toBn(y), remove: patch((c) => ({ years: c.years.filter((x) => x !== y) })) })
    );
    if (criteria.usage !== 'any')
      chips.push({
        id: 'usage',
        label: criteria.usage === 'used' ? 'বোর্ডে এসেছে' : 'বোর্ডে আসেনি',
        remove: patch(() => ({ usage: 'any' })),
      });
    if (criteria.stimulus !== 'any')
      chips.push({
        id: 'stim',
        label: criteria.stimulus === 'with' ? 'উদ্দীপকসহ' : 'উদ্দীপক ছাড়া',
        remove: patch(() => ({ stimulus: 'any' })),
      });
    if (criteria.solution !== 'any')
      chips.push({
        id: 'sol',
        label: criteria.solution === 'with' ? 'সমাধানসহ' : 'সমাধান ছাড়া',
        remove: patch(() => ({ solution: 'any' })),
      });
    return chips;
  }, [criteria]);

  const toggleKey = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedKeys(new Set());
  }, []);

  const selectAllResults = () => setSelectedKeys(new Set(results.map((r) => r.key)));

  const invertSelection = () =>
    setSelectedKeys((prev) => {
      const next = new Set<string>();
      results.forEach((r) => {
        if (!prev.has(r.key)) next.add(r.key);
      });
      // keep selections that are hidden by the current filter
      prev.forEach((k) => {
        if (!results.some((r) => r.key === k)) next.add(k);
      });
      return next;
    });

  const selectedRows = useMemo(
    () => (dataset ? dataset.rows.filter((r) => selectedKeys.has(r.key)) : []),
    [dataset, selectedKeys]
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

  const handleBulkCopy = async () => {
    const n = await runBulk((api, row) => api.copyQuestion(row.question.id));
    await reload();
    showToast(`${toBn(n)}টি প্রশ্ন কপি হয়েছে`);
  };

  const handleBulkDelete = async () => {
    setConfirmDelete(false);
    const n = await runBulk((api, row) => api.deleteQuestion(row.question.id));
    setSelectedKeys(new Set());
    await reload();
    showToast(`${toBn(n)}টি প্রশ্ন মুছে ফেলা হয়েছে`);
  };

  const headerMenuItems = useMemo((): MenuItem[] => {
    if (!selectMode) {
      return [
        {
          id: 'select-mode',
          label: 'সিলেক্ট করুন',
          icon: <CheckSquare className="w-4 h-4 text-[#3B4FD8]" />,
          onClick: () => setSelectMode(true),
        },
      ];
    }
    const items: MenuItem[] = [
      {
        id: 'select-all',
        label: `সব সিলেক্ট করুন (${toBn(results.length)})`,
        icon: <ListChecks className="w-4 h-4 text-[#3B4FD8]" />,
        onClick: selectAllResults,
      },
      {
        id: 'invert',
        label: 'উল্টো সিলেক্ট',
        icon: <FlipHorizontal className="w-4 h-4 text-[#3B4FD8]" />,
        onClick: invertSelection,
      },
    ];
    if (selectedKeys.size > 0) {
      items.push(
        {
          id: 'clear',
          label: 'সিলেকশন মুছুন',
          icon: <XCircle className="w-4 h-4 text-[#1B1F2A]" />,
          onClick: () => setSelectedKeys(new Set()),
        },
        {
          id: 'pdf',
          label: 'PDF বানান',
          icon: <FileText className="w-4 h-4 text-[#3B4FD8]" />,
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
          icon: <Copy className="w-4 h-4 text-[#1B1F2A]" />,
          onClick: handleBulkCopy,
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
    items.push({
      id: 'exit-select',
      label: 'সিলেক্ট মোড বন্ধ করুন',
      icon: <X className="w-4 h-4 text-[#1B1F2A]" />,
      onClick: exitSelectMode,
    });
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectMode, selectedKeys, results, selectedRows]);

  const handleSaveFilter = (name: string) => {
    const trimmed = name.trim();
    setSaveDialogOpen(false);
    if (!trimmed) return;
    const next = [...saved, { id: `sf_${Date.now()}`, name: trimmed, criteria, sort }];
    setSaved(next);
    persistSavedFilters(next);
  };

  const handleDeleteSaved = (id: string) => {
    const next = saved.filter((s) => s.id !== id);
    setSaved(next);
    persistSavedFilters(next);
  };

  return (
    <div className="flex-1 flex flex-col min-h-full pb-20 bg-[#F2F4F8]">
      <Header
        title={selectMode ? `${toBn(selectedKeys.size)}টি সিলেক্টেড` : 'Filter'}
        subtitle={
          selectMode
            ? 'কার্ডে ট্যাপ করে সিলেক্ট করুন'
            : dataset
              ? `মোট ${toBn(dataset.rows.length)}টি প্রশ্ন`
              : undefined
        }
        showBack={selectMode}
        onBack={exitSelectMode}
        menuItems={headerMenuItems}
      />

      {/* Sticky control bar */}
      <div className="sticky top-14 z-30 bg-white/95 backdrop-blur border-b border-[#D5D9E2] px-3.5 pt-2.5 pb-2.5 space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="প্রশ্ন, উদ্দীপক বা সমাধান খুঁজুন..."
              className="w-full min-h-[44px] pl-9 pr-8 py-2 rounded-xl bg-[#F2F4F8] border border-[#D5D9E2] text-xs text-[#1B1F2A] focus:outline-none focus:ring-2 focus:ring-[#3B4FD8] focus:bg-white transition-all"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                aria-label="সার্চ মুছুন"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#64748B]"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label="ফিল্টার খুলুন"
            className="relative w-11 h-11 shrink-0 flex items-center justify-center rounded-xl bg-[#3B4FD8] text-white active:scale-95 transition-transform"
          >
            <SlidersHorizontal className="w-5 h-5" />
            {activeCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[0.625rem] font-bold flex items-center justify-center border-2 border-white">
                {toBn(activeCount)}
              </span>
            )}
          </button>
        </div>

        {/* Quick filters: source + type */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={NO_SCROLLBAR}>
          {(
            [
              ['type', 'Type CQ'],
              ['chapter', 'Chapter CQ'],
            ] as const
          ).map(([v, label]) => (
            <Chip
              key={v}
              active={criteria.sources.includes(v)}
              onClick={() => setCriteria((c) => ({ ...c, sources: toggleIn(c.sources, v) }))}
              className="shrink-0"
            >
              {label}
            </Chip>
          ))}
          <span className="w-px bg-[#D5D9E2] my-1 shrink-0" />
          {TYPE_OPTIONS.map((t) => (
            <Chip
              key={t}
              active={criteria.types.includes(t)}
              onClick={() => setCriteria((c) => ({ ...c, types: toggleIn(c.types, t) }))}
              className="shrink-0 min-w-[40px]"
            >
              {t}
            </Chip>
          ))}
        </div>

        {/* Result count + sort + saved */}
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-[#1B1F2A]">
            {toBn(results.length)}টি ফলাফল
            {hasAnyFilter && dataset && (
              <span className="font-medium text-[#64748B]"> / {toBn(dataset.rows.length)}</span>
            )}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSortOpen((o) => !o)}
              className="min-h-[36px] px-2.5 rounded-lg text-[0.6875rem] font-semibold text-[#2A3BB0] hover:bg-[#EEF2FF] flex items-center gap-1"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              সাজান
            </button>
            <button
              type="button"
              onClick={() => setSavedOpen(true)}
              className="min-h-[36px] px-2.5 rounded-lg text-[0.6875rem] font-semibold text-[#2A3BB0] hover:bg-[#EEF2FF] flex items-center gap-1"
            >
              <Bookmark className="w-3.5 h-3.5" />
              সেভড{saved.length > 0 ? ` (${toBn(saved.length)})` : ''}
            </button>
          </div>
        </div>

        {sortOpen && (
          <div className="rounded-xl border border-[#D5D9E2] bg-white shadow-lg overflow-hidden">
            {(Object.keys(SORT_LABELS) as SortMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setSort(m);
                  setSortOpen(false);
                }}
                className="w-full min-h-[42px] px-3.5 text-left text-xs font-medium flex items-center justify-between hover:bg-[#F2F4F8]"
              >
                {SORT_LABELS[m]}
                {sort === m && <Check className="w-4 h-4 text-[#3B4FD8]" />}
              </button>
            ))}
          </div>
        )}

        {activeChips.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={NO_SCROLLBAR}>
            {activeChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={chip.remove}
                className="shrink-0 min-h-[30px] pl-2.5 pr-1.5 rounded-full bg-[#EEF2FF] border border-[#C7D2FE] text-[#2A3BB0] text-[0.6875rem] font-semibold flex items-center gap-1 active:scale-95"
              >
                {chip.label}
                <X className="w-3 h-3" />
              </button>
            ))}
            <button
              type="button"
              onClick={() => applyCriteria(EMPTY_CRITERIA)}
              className="shrink-0 min-h-[30px] px-2.5 text-[0.6875rem] font-bold text-rose-600"
            >
              সব মুছুন
            </button>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 px-3.5 py-3 space-y-3">
        {loading && !dataset ? (
          <div className="py-16 text-center text-xs text-[#64748B] flex flex-col items-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-[#3B4FD8]" />
            লোড হচ্ছে...
          </div>
        ) : results.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-[#D5D9E2] space-y-3">
            <Search className="w-8 h-8 mx-auto text-[#94A3B8]" />
            <p className="text-sm text-[#64748B]">
              {dataset && dataset.rows.length === 0
                ? 'এখনো কোনো প্রশ্ন যুক্ত করা হয়নি'
                : 'এই ফিল্টারে কোনো প্রশ্ন পাওয়া যায়নি'}
            </p>
            {hasAnyFilter && (
              <button
                type="button"
                onClick={() => applyCriteria(EMPTY_CRITERIA)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#3B4FD8] text-white text-xs font-semibold"
              >
                ফিল্টার মুছুন
              </button>
            )}
          </div>
        ) : (
          <>
            {results.slice(0, visible).map((row) => (
              <ResultCard
                key={row.key}
                row={row}
                selectMode={selectMode}
                selected={selectedKeys.has(row.key)}
                onToggle={toggleKey}
              />
            ))}
            {visible < results.length && (
              <div ref={sentinelRef} className="py-4 text-center text-xs text-[#64748B]">
                আরও লোড হচ্ছে...
              </div>
            )}
          </>
        )}
      </div>

      <FilterSheet
        isOpen={sheetOpen}
        dataset={dataset ?? EMPTY_DATASET}
        criteria={criteria}
        resultCount={results.length}
        onChange={applyCriteria}
        onClose={() => setSheetOpen(false)}
      />

      {/* Saved filters sheet */}
      {savedOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
          onClick={() => setSavedOpen(false)}
        >
          <div
            className="w-full max-w-[390px] bg-white rounded-t-3xl shadow-2xl pb-3 max-h-[75vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-3 pb-2">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#D5D9E2]" />
              <h3 className="text-sm font-bold text-[#1B1F2A]">সেভ করা ফিল্টার</h3>
            </div>
            <div className="px-3 overflow-y-auto flex-1">
              <button
                type="button"
                disabled={!hasAnyFilter}
                onClick={() => {
                  setSavedOpen(false);
                  setSaveDialogOpen(true);
                }}
                className="w-full min-h-[48px] px-3.5 rounded-xl text-left text-sm font-semibold text-[#3B4FD8] disabled:text-[#94A3B8] flex items-center gap-3 hover:bg-[#F2F4F8]"
              >
                <BookmarkPlus className="w-4 h-4" />
                বর্তমান ফিল্টার সেভ করুন
              </button>
              {saved.length === 0 && (
                <p className="px-3.5 py-6 text-center text-xs text-[#64748B]">
                  এখনো কোনো ফিল্টার সেভ করা হয়নি
                </p>
              )}
              {saved.map((s) => (
                <div key={s.id} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => {
                      applyCriteria(s.criteria);
                      setSort(s.sort);
                      setSavedOpen(false);
                    }}
                    className="flex-1 min-h-[48px] px-3.5 rounded-xl text-left text-sm font-medium text-[#1B1F2A] flex items-center gap-3 hover:bg-[#F2F4F8]"
                  >
                    <Bookmark className="w-4 h-4 text-[#64748B]" />
                    <span className="truncate">{s.name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteSaved(s.id)}
                    aria-label="মুছুন"
                    className="w-11 h-11 flex items-center justify-center text-rose-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
        subtitle={`${toBn(selectedKeys.size)}টি প্রশ্ন`}
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
        message={`সিলেক্ট করা ${toBn(selectedKeys.size)}টি প্রশ্ন (সমাধানের ছবিসহ) স্থায়ীভাবে মুছে যাবে।`}
        confirmText="মুছুন"
        isDestructive
        onConfirm={handleBulkDelete}
        onCancel={() => setConfirmDelete(false)}
      />

      <PromptDialog
        isOpen={saveDialogOpen}
        title="ফিল্টারের নাম"
        placeholder="যেমন: ঢাকা বোর্ড ৫ স্টার গ"
        onConfirm={handleSaveFilter}
        onCancel={() => setSaveDialogOpen(false)}
      />
    </div>
  );
};

export default FilterScreen;
