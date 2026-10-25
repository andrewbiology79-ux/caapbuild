import React from 'react';
import { ArrowDown, ArrowUp, ChevronRight } from 'lucide-react';
import { KebabMenu } from '../../components/KebabMenu';
import { toBn, toBnPad2 } from '../../utils/toBn';
import { EmptyState } from '../../ui/EmptyState';
import { Button } from '../../ui/Button';

export interface HierarchyItem {
  id: string;
  name: string;
  order?: number;
}

export interface HierarchyListProps<T extends HierarchyItem> {
  items: T[];
  stats: Record<string, { total: number; selected: number }>;
  isReordering: boolean;
  emptyText: string;
  addLabel: string;
  onAdd: () => void;
  onOpen: (item: T) => void;
  onRename: (item: T) => void;
  onDelete: (item: T) => void;
  onMove: (index: number, dir: 'up' | 'down') => void;
}

/** One list for subjects, chapters and topics (they all look and behave the same). */
export function HierarchyList<T extends HierarchyItem>({
  items,
  stats,
  isReordering,
  emptyText,
  addLabel,
  onAdd,
  onOpen,
  onRename,
  onDelete,
  onMove,
}: HierarchyListProps<T>) {
  if (items.length === 0) {
    return (
      <EmptyState
        title={emptyText}
        action={
          <Button size="sm" onClick={onAdd}>
            {addLabel}
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-2.5">
      {items.map((item, index) => {
        const st = stats[item.id] || { total: 0, selected: 0 };
        return (
          <div
            key={item.id}
            className="bg-surface rounded-2xl p-3.5 border border-line shadow-card flex items-center justify-between gap-3 hover:border-brand transition-all cursor-pointer select-none"
            onClick={() => {
              if (!isReordering) onOpen(item);
            }}
          >
            <div className="w-10 h-10 rounded-xl bg-brand text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-2xs">
              {toBnPad2(item.order || index + 1)}
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-bold text-ink truncate leading-snug">{item.name}</h2>
              <p className="text-[0.6875rem] text-ink-muted font-medium mt-0.5">
                {toBn(st.total)}টি প্রশ্ন · {toBn(st.selected)} নির্বাচিত
              </p>
            </div>

            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              {isReordering ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="উপরে সরান"
                    disabled={index === 0}
                    onClick={() => onMove(index, 'up')}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-app hover:bg-brand-soft text-ink disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="নিচে সরান"
                    disabled={index === items.length - 1}
                    onClick={() => onMove(index, 'down')}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-app hover:bg-brand-soft text-ink disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <KebabMenu
                    items={[
                      { id: 'rename', label: 'নাম পরিবর্তন', onClick: () => onRename(item) },
                      { id: 'delete', label: 'মুছে ফেলুন', isDestructive: true, onClick: () => onDelete(item) },
                    ]}
                  />
                  <ChevronRight className="w-5 h-5 text-ink-muted" />
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default HierarchyList;
