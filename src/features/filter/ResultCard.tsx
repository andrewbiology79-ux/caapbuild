import React, { useEffect, useState } from 'react';
import { Check, Layers, BookOpen, Eye, EyeOff, Tag, Award, FolderOpen, BookMarked } from 'lucide-react';
import { KebabMenu } from '../../components/KebabMenu';
import { RichText } from '../../components/RichText';
import { QuestionBoardTags } from '../../components/QuestionBoardTags';
import { ReferenceDialog } from '../../components/ReferenceDialog';
import { getRatingStarsText, getApi } from '../../db/api';
import type { CqScope } from '../../db/db';
import { toBn } from '../../utils/toBn';
import { type FilterRow } from '../../utils/filterEngine';

/* ------------------------------------------------------------------ */
/* Result card (same look as the Type CQ / Chapter CQ question cards)  */
/* ------------------------------------------------------------------ */

const imageUrlCache = new Map<string, string>();

async function loadImageUrl(source: CqScope, imageId: string): Promise<string | null> {
  const key = `${source}:${imageId}`;
  const cached = imageUrlCache.get(key);
  if (cached) return cached;
  try {
    const url = await getApi(source).getImageBlobUrl(imageId);
    if (url) imageUrlCache.set(key, url);
    return url;
  } catch {
    return null;
  }
}

export interface ResultCardProps {
  row: FilterRow;
  index: number;
  selected: boolean;
  onToggle: (row: FilterRow) => void;
  onLocate: (row: FilterRow) => void;
  onOpenImages: (urls: string[], index: number) => void;
}

export const ResultCard: React.FC<ResultCardProps> = React.memo(
  ({ row, index, selected, onToggle, onLocate, onOpenImages }) => {
    const q = row.question;
    const isChapter = row.source === 'chapter';
    const [solutionOpen, setSolutionOpen] = useState(false);
    const [referenceOpen, setReferenceOpen] = useState(false);
    const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

    // Load the images this card needs (stimulus always, solution when it is opened)
    useEffect(() => {
      let cancelled = false;
      const ids = [...(row.stimulus?.imageIds ?? []), ...(solutionOpen ? q.solutionImageIds ?? [] : [])];
      (async () => {
        const found: Record<string, string> = {};
        for (const id of ids) {
          const url = await loadImageUrl(row.source, id);
          if (url) found[id] = url;
        }
        if (!cancelled) setImageUrls((prev) => ({ ...prev, ...found }));
      })();
      return () => {
        cancelled = true;
      };
    }, [row.source, row.stimulus, q.solutionImageIds, solutionOpen]);

    const solutionUrls = (q.solutionImageIds || []).map((id) => imageUrls[id]).filter(Boolean) as string[];
    // boards of the stimulus + of this question (same board merged, years combined)
    const boards = (() => {
      const merged: Array<{ board: string; years: number[] }> = [];
      [...(row.stimulus?.usedInBoards || []), ...(q.usedInBoards || [])].forEach((b) => {
        const ex = merged.find((m) => m.board === b.board);
        if (ex) ex.years = Array.from(new Set([...ex.years, ...(b.years || [])])).sort((x, y) => x - y);
        else merged.push({ board: b.board, years: [...(b.years || [])] });
      });
      return merged;
    })();
    const hasTags = boards.length > 0 || !!row.stimulus?.boardTag || row.usages.length > 0;

    return (
      <article
        className={`bg-surface rounded-2xl border-[1.5px] shadow-xs overflow-hidden ${
          selected ? 'border-brand ring-2 ring-brand/40' : 'border-brand'
        }`}
      >
        {/* Ribbon: serial, checkbox, rating, menu */}
        <div className="bg-brand text-white px-3.5 py-2.5 flex items-center justify-between gap-2 rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <span className="font-bold text-xs text-white tracking-tight shrink-0">প্রশ্ন {toBn(index + 1)}</span>
            <button
              type="button"
              aria-label={selected ? 'নির্বাচন বাতিল করুন' : 'নির্বাচন করুন'}
              onClick={() => onToggle(row)}
              className="min-h-[44px] min-w-[44px] -my-2 flex items-center justify-center rounded-lg text-white hover:bg-white/10 active:bg-white/20 transition-colors"
            >
              <div
                className={`w-5 h-5 rounded border-2 border-white flex items-center justify-center transition-colors ${
                  selected ? 'bg-surface text-brand-fg' : 'bg-transparent text-transparent'
                }`}
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </div>
            </button>
            <span className="px-2 py-0.5 rounded-md bg-[#FEF9C3] dark:bg-[#422006] text-[#713F12] dark:text-amber-200 text-[0.625rem] font-bold border border-[#FDE047] dark:border-[#854D0E] whitespace-nowrap shadow-2xs">
              {getRatingStarsText(q.rating)}
            </span>
          </div>
          <KebabMenu
            buttonAriaLabel="মেনু"
            buttonClassName="text-white hover:bg-white/20 active:bg-white/30"
            items={[
              {
                id: 'reference',
                label: 'রেফারেন্স দেখুন',
                icon: <BookMarked className="w-4 h-4 text-brand-fg" />,
                onClick: () => setReferenceOpen(true),
              },
              {
                id: 'locate',
                label: isChapter ? 'Chapter CQ-তে খুলুন' : 'Type CQ-তে খুলুন',
                icon: <FolderOpen className="w-4 h-4 text-brand-fg" />,
                onClick: () => onLocate(row),
              },
            ]}
          />
        </div>

        {/* Where this question lives: source tag + type (Type CQ) or chapter (Chapter CQ) */}
        <div className="bg-surface-2 border-b border-line px-3.5 py-2 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.6875rem] font-bold ${
                isChapter ? 'bg-success-soft text-emerald-700' : 'bg-brand-soft text-brand-ink'
              }`}
            >
              {isChapter ? <BookOpen className="w-3 h-3" /> : <Layers className="w-3 h-3" />}
              {isChapter ? 'Chapter CQ' : 'Type CQ'}
            </span>
            {!isChapter && row.topicName && (
              <span className="px-2 py-0.5 rounded-full bg-surface text-ink text-[0.6875rem] font-bold border border-line">
                টাইপ: {row.topicName}
              </span>
            )}
            <span className="px-2 py-0.5 rounded-full bg-surface text-ink text-[0.6875rem] font-bold border border-line">
              অধ্যায়: {row.chapterName}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-surface text-ink text-[0.6875rem] font-bold border border-line">
              {toBn(q.marks)} নম্বর
            </span>
          </div>
          <p className="text-[0.625rem] text-ink-muted leading-snug">{row.subjectName}</p>
        </div>

        {/* Board tags & paper usages */}
        <div className="bg-surface-2 border-b border-line px-3.5 py-2 flex flex-wrap items-center gap-1.5">
          {boards.length > 0 ? (
            boards.map((b, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded bg-surface text-ink text-[0.625rem] font-semibold border border-line flex items-center gap-1 shadow-2xs"
              >
                <Tag className="w-3 h-3 text-ink-muted" />
                <span>
                  {b.board}'{(b.years || []).map((y) => toBn(String(y).slice(-2))).join(',')}
                </span>
              </span>
            ))
          ) : row.stimulus?.boardTag ? (
            <span className="px-2 py-0.5 rounded bg-surface text-ink text-[0.625rem] font-semibold border border-line flex items-center gap-1 shadow-2xs">
              <Tag className="w-3 h-3 text-ink-muted" />
              <span>{row.stimulus.boardTag}</span>
            </span>
          ) : null}

          {row.usages.map((u) => (
            <span
              key={u.paperId}
              className="px-2 py-0.5 rounded bg-success-soft text-emerald-800 dark:text-emerald-300 text-[0.625rem] font-bold border border-emerald-200 dark:border-emerald-800 flex items-center gap-1"
            >
              <Award className="w-3 h-3 text-emerald-600" />
              <span>
                {u.shortName} ×{toBn(u.count)}
              </span>
            </span>
          ))}

          {!hasTags && <span className="text-[0.625rem] text-[#94A3B8] italic">ট্যাগ নেই</span>}
        </div>

        {/* Content */}
        <div className="p-3.5 space-y-3.5">
          {row.stimulus && (
            <div className="space-y-2">
              <RichText text={row.stimulus.text} className="text-xs font-medium text-ink leading-relaxed" />
              {row.stimulus.imageIds?.map((imgId) => {
                const url = imageUrls[imgId];
                if (!url) return null;
                return (
                  <div
                    key={imgId}
                    className="w-full my-2 overflow-hidden rounded-xl border border-line bg-surface text-center"
                  >
                    <img src={url} alt="উদ্দীপকের চিত্র" className="w-full h-auto object-contain max-h-60 mx-auto" />
                  </div>
                );
              })}
            </div>
          )}

          <div className="space-y-2 pt-1 border-t border-line-soft">
            <div className="flex items-start gap-1.5 text-xs text-ink">
              <span className="font-bold shrink-0 text-ink">{q.type ? `${q.type}.` : ''}</span>
              <RichText
                text={q.questionText}
                className="text-xs text-ink leading-relaxed flex-1 font-medium"
              />
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  aria-label={solutionOpen ? 'সমাধান লুকান' : 'সমাধান দেখুন'}
                  onClick={() => setSolutionOpen((o) => !o)}
                  className="min-h-[34px] px-2.5 py-1 rounded-lg border border-line bg-surface hover:bg-hover text-[0.6875rem] font-semibold text-brand-ink flex items-center gap-1 transition-colors shrink-0"
                >
                  {solutionOpen ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>সমাধান লুকাও</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5" />
                      <span>সমাধান দেখো</span>
                    </>
                  )}
                </button>
                <QuestionBoardTags boards={q.usedInBoards} />
              </div>

              {solutionOpen && (
                <div className="mt-2.5 p-3.5 rounded-xl bg-surface-2 border border-line space-y-2">
                  <div className="text-[0.6875rem] font-bold text-brand-ink uppercase tracking-wider">সমাধান:</div>
                  <RichText text={q.solutionText} className="text-xs text-ink leading-relaxed" />
                  {solutionUrls.length > 0 && (
                    <div className="space-y-2 pt-1">
                      {solutionUrls.map((url, i) => (
                        <div
                          key={i}
                          onClick={() => onOpenImages(solutionUrls, i)}
                          className="w-full overflow-hidden rounded-xl border border-line bg-surface cursor-pointer hover:opacity-95 transition-opacity"
                        >
                          <img src={url} alt="সমাধান চিত্র" className="w-full h-auto object-contain max-h-56 mx-auto" />
                        </div>
                      ))}
                      <p className="text-[0.625rem] text-ink-muted text-center italic">
                        (ছবিতে ট্যাপ করে বড় ও জুম করে দেখুন)
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <ReferenceDialog
          isOpen={referenceOpen}
          reference={row.stimulus?.reference}
          onClose={() => setReferenceOpen(false)}
        />
      </article>
    );
  }
);
ResultCard.displayName = 'ResultCard';

