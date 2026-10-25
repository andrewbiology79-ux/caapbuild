import React from 'react';
import { Tag } from 'lucide-react';
import { toBn } from '../utils/toBn';

export interface QuestionBoardTagsProps {
  /** boards (with years) in which THIS question (গ / ঘ …) came */
  boards?: Array<{ board: string; years: number[] }>;
}

/**
 * Small board + year chips (e.g. DB'২৫) shown beside a question's "সমাধান দেখো" button
 * on the collection / filter cards. They are NOT used by the paper builder or the PDF export.
 */
export const QuestionBoardTags: React.FC<QuestionBoardTagsProps> = ({ boards }) => {
  const list = (boards || []).filter((b) => b && b.board && (b.years || []).length > 0);
  if (list.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 min-w-0">
      {list.map((b) => (
        <span
          key={b.board}
          className="px-1.5 py-0.5 rounded bg-surface text-ink text-[0.625rem] font-semibold border border-line flex items-center gap-1"
        >
          <Tag className="w-3 h-3 text-ink-muted" />
          <span>
            {b.board}'{b.years.map((y) => toBn(String(y).slice(-2))).join(',')}
          </span>
        </span>
      ))}
    </div>
  );
};

export default QuestionBoardTags;
