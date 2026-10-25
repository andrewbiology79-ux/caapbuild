import React from 'react';
import type { Paper } from '../../db/db';
import { toBn } from '../../utils/toBn';
import { FileText, Calendar, Award, ChevronRight, Check } from 'lucide-react';

export interface PaperListItemProps {
  paper: Paper;
  selectMode: boolean;
  picked: Set<string>;
  togglePicked: (id: string) => void;
  setViewPaperId: (id: string | null) => void;
}

/** One created paper (প্রশ্নপত্র) row in the Create tab list. */
export const PaperListItem: React.FC<PaperListItemProps> = ({
  paper,
  selectMode,
  picked,
  togglePicked,
  setViewPaperId,
}) => {
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
          className={`bg-surface hover:border-brand dark:hover:border-indigo-500 rounded-2xl p-4 border shadow-xs flex items-center justify-between gap-3 cursor-pointer transition-all group ${
            selectMode && picked.has(paper.id)
              ? 'border-brand dark:border-indigo-500 ring-1 ring-brand'
              : 'border-line'
          }`}
        >
          {selectMode && (
            <span
              aria-hidden="true"
              className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 ${
                picked.has(paper.id)
                  ? 'bg-brand border-brand text-white'
                  : 'border-[#94A3B8] dark:border-slate-500 bg-surface'
              }`}
            >
              {picked.has(paper.id) && <Check className="w-4 h-4 stroke-[3]" />}
            </span>
          )}
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-brand-soft text-brand font-bold text-[0.6875rem] border border-line dark:border-indigo-900 truncate">
                {paper.shortName}
              </span>
            </div>

            <h3 className="text-sm font-bold text-ink truncate group-hover:text-brand-fg dark:group-hover:text-indigo-400 transition-colors">
              {paper.title}
            </h3>

            <div className="flex flex-wrap items-center gap-3 text-[0.6875rem] text-ink-muted">
              <span className="flex items-center gap-1 font-medium">
                <Award className="w-3.5 h-3.5 text-brand-fg" />
                <span>{toBn(paper.totalMarks || 50)} নম্বর</span>
              </span>

              <span className="flex items-center gap-1 font-medium">
                <FileText className="w-3.5 h-3.5 text-brand-ink" />
                <span>{toBn(qCount)}টি প্রশ্ন</span>
              </span>

              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>{dateStr}</span>
              </span>
            </div>
          </div>

          {!selectMode && (
            <div className="flex items-center gap-1 text-brand shrink-0">
              <span className="text-xs font-semibold hidden sm:inline">দেখুন</span>
              <ChevronRight className="w-5 h-5 text-[#94A3B8] group-hover:translate-x-0.5 transition-transform" />
            </div>
          )}
        </div>
      );
};

export default PaperListItem;
