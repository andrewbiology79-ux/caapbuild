import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import type { CqScope } from '../../db/db';
import { toBn } from '../../utils/toBn';
import { useNavigation } from '../../utils/navigation';
import { EMPTY_CRITERIA, countActiveFilters, type FilterCriteria, type FilterDataset, type SortMode } from '../../utils/filterEngine';
import { SORT_LABELS, TYPE_OPTIONS, toggleIn, Chip, Section, Segmented } from './FilterUi';

/* ------------------------------------------------------------------ */
/* Filter sheet (bottom window)                                        */
/* ------------------------------------------------------------------ */

export interface SheetProps {
  isOpen: boolean;
  dataset: FilterDataset;
  criteria: FilterCriteria;
  sort: SortMode;
  resultCount: number;
  onChange: (c: FilterCriteria) => void;
  onSortChange: (s: SortMode) => void;
  onClose: () => void;
}

export const FilterSheet: React.FC<SheetProps> = ({
  isOpen,
  dataset,
  criteria,
  sort,
  resultCount,
  onChange,
  onSortChange,
  onClose,
}) => {
  const { registerBackHandler } = useNavigation();

  // Hardware back button closes this window instead of leaving the app
  useEffect(() => {
    if (!isOpen) return;
    return registerBackHandler(() => {
      onClose();
      return true;
    });
  }, [isOpen, onClose, registerBackHandler]);

  if (!isOpen) return null;
  const f = dataset.facets;
  const set = (patch: Partial<FilterCriteria>) => onChange({ ...criteria, ...patch });

  const chapters = f.chapters.filter((c) => criteria.subjects.length === 0 || criteria.subjects.includes(c.subject));
  const active = countActiveFilters(criteria);
  const plainChapterNames = f.subjects.length === 1 || criteria.subjects.length === 1;
  const chapterOnly = criteria.sources.length === 1 && criteria.sources[0] === 'chapter';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ফিল্টার"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[390px] h-[88vh] bg-surface rounded-t-3xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-3 pb-3 border-b border-line">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-ink">ফিল্টার</h3>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onChange({ ...EMPTY_CRITERIA, text: criteria.text })}
                disabled={active === 0}
                className="min-h-[36px] px-3 text-xs font-bold text-brand-fg disabled:text-[#94A3B8]"
              >
                সব মুছুন
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="ফিল্টার বন্ধ করুন"
                className="w-10 h-10 flex items-center justify-center rounded-full text-ink hover:bg-hover active:bg-hover"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <Segmented
            title="উৎস"
            value={criteria.sources.length === 1 ? criteria.sources[0] : 'all'}
            onChange={(v) =>
              set({
                sources: v === 'all' ? [] : [v as CqScope],
                // Chapter CQ has no type/topic level
                topics: v === 'chapter' ? [] : criteria.topics,
              })
            }
            options={[
              { value: 'all', label: 'সব' },
              { value: 'type', label: 'Type CQ' },
              { value: 'chapter', label: 'Chapter CQ' },
            ]}
          />

          <Section title="সাজান">
            {(Object.keys(SORT_LABELS) as SortMode[]).map((m) => (
              <Chip key={m} active={sort === m} onClick={() => onSortChange(m)}>
                {SORT_LABELS[m]}
              </Chip>
            ))}
          </Section>

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

          {!chapterOnly && f.topics.length > 0 && (
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

          {f.categories.length > 0 && (
            <Section title="যে ক্যাটেগরিতে ব্যবহৃত হয়েছে">
              {f.categories.map((c) => (
                <Chip
                  key={c.id}
                  active={criteria.categories.includes(c.id)}
                  onClick={() => set({ categories: toggleIn(criteria.categories, c.id) })}
                >
                  {c.name}
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

        <div className="px-5 py-3 border-t border-line bg-surface">
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[48px] rounded-xl bg-brand text-white text-sm font-bold active:scale-[0.98] transition-transform"
          >
            {toBn(resultCount)}টি প্রশ্ন দেখুন
          </button>
        </div>
      </div>
    </div>
  );
};

