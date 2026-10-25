import React from 'react';
import { Header } from '../../components/Header';
import { useToast } from '../../components/Toast';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PromptDialog } from '../../components/PromptDialog';
import { QuestionFormModal } from '../../components/QuestionFormModal';
import { ImportCollectionModal } from '../../components/ImportCollectionModal';
import {
  getMultiClipboard,
  getMultiClipboardMode,
  clearMultiClipboard,
  pasteMultiClipboard,
  countMultiClipboard,
} from '../../db/crossDb';
import { PasteQuestionsModal } from '../../components/PasteQuestionsModal';
import { ImageViewerModal } from '../../components/ImageViewerModal';
import { ReferenceDialog } from '../../components/ReferenceDialog';
import { exportQuestionCollection } from '../../utils/collectionTransfer';
import { RichText } from '../../components/RichText';
import { QuestionBoardTags } from '../../components/QuestionBoardTags';
import { KebabMenu, type MenuItem } from '../../components/KebabMenu';
import { HierarchyList } from '../../features/collection/HierarchyList';
import { toBn, toBnPad2 } from '../../utils/toBn';
import { useNavigation } from '../../utils/navigation';
import { getDb, type CqScope } from '../../db/db';
import {
  getApi,
  getRatingStarsText,
  type Subject,
  type Chapter,
  type Topic,
  type StimulusWithQuestions,
  type HierarchyStats,
  type QuestionPaperUsage,
  type GroupClipboardData,
} from '../../db/api';
import {
  Check,
  Search,
  Plus,
  RefreshCw,
  Eye,
  EyeOff,
  Copy,
  Scissors,
  PlusCircle,
  FileEdit,
  Trash2,
  Tag,
  Award,
  Layers,
  Upload,
  ClipboardPaste,
  Download,
  Square,
  CheckSquare,
  BookMarked,
} from 'lucide-react';

export interface QuestionGroupCardProps {
  grp: StimulusWithQuestions;
  grpIdx: number;
  selectedIds: string[];
  questionUsages: Record<string, QuestionPaperUsage[]>;
  imageUrls: Record<string, string>;
  expandedSolutions: Record<string, boolean>;
  setExpandedSolutions: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setReferenceView: (v: { isOpen: boolean; text: string }) => void;
  handleToggleStimulusGroup: (grp: StimulusWithQuestions) => void | Promise<void>;
  handleCopyOrCutGroup: (grp: StimulusWithQuestions, mode: 'copy' | 'cut') => void | Promise<void>;
  handlePasteGroup: (grp: StimulusWithQuestions, position: 'before' | 'after') => void | Promise<void>;
  handleDeleteGroupPrompt: (grp: StimulusWithQuestions) => void;
  handleEditGroup: (grp: StimulusWithQuestions) => void;
  handleOpenImageViewer: (urls: string[], initialIdx: number) => void;
}

/** One stimulus group (উদ্দীপক + its questions) in a topic's question list. */
export const QuestionGroupCard: React.FC<QuestionGroupCardProps> = ({
  grp,
  grpIdx,
  selectedIds,
  questionUsages,
  imageUrls,
  expandedSolutions,
  setExpandedSolutions,
  setReferenceView,
  handleToggleStimulusGroup,
  handleCopyOrCutGroup,
  handlePasteGroup,
  handleDeleteGroupPrompt,
  handleEditGroup,
  handleOpenImageViewer,
}) => {
  const groupQuestionIds = grp.questions.map((q) => q.id);
  const allGroupSelected =
    groupQuestionIds.length > 0 &&
    groupQuestionIds.every((id) => selectedIds.includes(id));

  // Calculate average rating of questions in group
  const avgRating =
    grp.questions.length > 0
      ? Math.round(
          grp.questions.reduce((sum, q) => sum + (q.rating || 3), 0) /
            grp.questions.length
        )
      : 3;
  const starsText = getRatingStarsText(avgRating);

  // Collect usage chips & board chips for group
  const allBoards: Array<{ board: string; years: number[] }> = [];
  const allUsages: QuestionPaperUsage[] = [];

  // boards of the stimulus + of every question, same board merged (years combined)
  const addBoardUsage = (b: { board: string; years: number[] }) => {
    const ex = allBoards.find((x) => x.board === b.board);
    if (ex) {
      ex.years = Array.from(new Set([...ex.years, ...(b.years || [])])).sort((x, y) => x - y);
    } else {
      allBoards.push({ board: b.board, years: [...(b.years || [])] });
    }
  };
  (grp.stimulus?.usedInBoards || []).forEach(addBoardUsage);

  grp.questions.forEach((q) => {
    (q.usedInBoards || []).forEach(addBoardUsage);
    const usages = questionUsages[q.id] || [];
    usages.forEach((u) => {
      if (!allUsages.some((ex) => ex.paperId === u.paperId)) {
        allUsages.push(u);
      }
    });
  });

  return (
    <article
      key={grp.stimulus?.id || `group-${grpIdx}`}
      data-qids={groupQuestionIds.join(' ')}
      className="bg-surface rounded-2xl border-[1.5px] border-brand shadow-xs overflow-hidden mb-4"
    >
      {/* Top Ribbon (Full width, bg #3B4FD8, rounded-t-2xl, white text & icons) */}
      <div className="bg-brand text-white px-3.5 py-2.5 flex items-center justify-between gap-2 rounded-t-2xl">
        {/* Left side: Serial, Checkbox, Rating Badge */}
        <div className="flex items-center gap-2.5">
          {/* 1. Serial: "প্রশ্ন ১" */}
          <span className="font-bold text-xs text-white tracking-tight shrink-0">
            প্রশ্ন {toBn(grpIdx + 1)}
          </span>

          {/* 2. Checkbox: White border, checkmark when selected */}
          <button
            type="button"
            aria-label={
              allGroupSelected
                ? 'এই উদ্দীপকের সব প্রশ্ন বাতিল করুন'
                : 'এই উদ্দীপকের সব প্রশ্ন নির্বাচন করুন'
            }
            onClick={() => handleToggleStimulusGroup(grp)}
            className="min-h-[44px] min-w-[44px] -my-2 flex items-center justify-center rounded-lg text-white hover:bg-white/10 active:bg-white/20 transition-colors"
          >
            <div
              className={`w-5 h-5 rounded border-2 border-white flex items-center justify-center transition-colors ${
                allGroupSelected ? 'bg-surface text-brand-fg' : 'bg-transparent text-transparent'
              }`}
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
            </div>
          </button>

          {/* 3. Rating Badge: Yellowish bg with dark brownish text */}
          <span className="px-2 py-0.5 rounded-md bg-[#FEF9C3] dark:bg-[#422006] text-[#713F12] dark:text-amber-200 text-[0.625rem] font-bold border border-[#FDE047] dark:border-[#854D0E] whitespace-nowrap shadow-2xs">
            {starsText}
          </span>
        </div>

        {/* 4. Right side: Three-dot Kebab Menu (44px touch area, white icon) */}
        <KebabMenu
          buttonAriaLabel="মেনু"
          buttonClassName="text-white hover:bg-white/20 active:bg-white/30"
          items={[
            {
              id: 'edit',
              label: 'Edit this Q&A',
              icon: <FileEdit className="w-4 h-4 text-brand-fg" />,
              onClick: () => handleEditGroup(grp),
            },
            {
              id: 'reference',
              label: 'রেফারেন্স দেখুন',
              icon: <BookMarked className="w-4 h-4 text-brand-fg" />,
              onClick: () =>
                setReferenceView({ isOpen: true, text: grp.stimulus?.reference || '' }),
            },
            {
              id: 'copy',
              label: 'Copy',
              icon: <Copy className="w-4 h-4 text-brand-fg" />,
              onClick: () => handleCopyOrCutGroup(grp, 'copy'),
            },
            {
              id: 'cut',
              label: 'Cut',
              icon: <Scissors className="w-4 h-4 text-amber-600" />,
              onClick: () => handleCopyOrCutGroup(grp, 'cut'),
            },
            {
              id: 'paste-after',
              label: 'Paste after',
              icon: <Plus className="w-4 h-4 text-brand-ink" />,
              onClick: () => handlePasteGroup(grp, 'after'),
            },
            {
              id: 'paste-before',
              label: 'Paste before',
              icon: <Plus className="w-4 h-4 text-brand-ink" />,
              onClick: () => handlePasteGroup(grp, 'before'),
            },
            {
              id: 'delete',
              label: 'Delete',
              icon: <Trash2 className="w-4 h-4 text-red-500" />,
              isDestructive: true,
              onClick: () => handleDeleteGroupPrompt(grp),
            },
          ]}
        />
      </div>

      {/* Chips Row: Board Tags & Paper Usages (light gray background) */}
      <div className="bg-surface-2 border-b border-line px-3.5 py-2 flex flex-wrap items-center gap-1.5">
        {/* Board Tag Chips */}
        {allBoards.length > 0 ? (
          allBoards.map((b, bIdx) => (
            <span
              key={bIdx}
              className="px-2 py-0.5 rounded bg-surface text-ink text-[0.625rem] font-semibold border border-line flex items-center gap-1 shadow-2xs"
            >
              <Tag className="w-3 h-3 text-ink-muted" />
              <span>
                {b.board}'{b.years.map((y) => toBn(String(y).slice(-2))).join(',')}
              </span>
            </span>
          ))
        ) : grp.stimulus?.boardTag ? (
          <span className="px-2 py-0.5 rounded bg-surface text-ink text-[0.625rem] font-semibold border border-line flex items-center gap-1 shadow-2xs">
            <Tag className="w-3 h-3 text-ink-muted" />
            <span>{grp.stimulus.boardTag}</span>
          </span>
        ) : null}

        {/* Paper Usages Chips */}
        {allUsages.map((u) => (
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

        {allBoards.length === 0 && !grp.stimulus?.boardTag && allUsages.length === 0 && (
          <span className="text-[0.625rem] text-[#94A3B8] italic">ট্যাগ নেই</span>
        )}
      </div>

      {/* Card Content Area: Stimulus -> Image -> Sub-questions */}
      <div className="p-3.5 space-y-3.5">
        {/* Stimulus Text & Image */}
        {grp.stimulus && (
          <div className="space-y-2">
            <RichText
              text={grp.stimulus.text}
              className="text-xs font-medium text-ink leading-relaxed"
            />

            {grp.stimulus.imageIds?.map((imgId) => {
              const url = imageUrls[imgId];
              if (!url) return null;
              return (
                <div
                  key={imgId}
                  className="w-full my-2 overflow-hidden rounded-xl border border-line bg-surface text-center"
                >
                  <img
                    src={url}
                    alt="উদ্দীপকের চিত্র"
                    className="w-full h-auto object-contain max-h-60 mx-auto"
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Sub-questions (গ, ঘ, etc.) */}
        <div className="space-y-3 pt-1 border-t border-line-soft">
          {grp.questions.map((question) => {
            const isSolutionOpen = expandedSolutions[question.id] || false;
            const solutionUrls = (question.solutionImageIds || [])
              .map((id) => imageUrls[id])
              .filter(Boolean) as string[];

            return (
              <div key={question.id} className="space-y-2">
                {/* Question line: plain "গ." or "ঘ." in front */}
                <div className="flex items-start gap-1.5 text-xs text-ink">
                  <span className="font-bold shrink-0 text-ink">
                    {question.type ? `${question.type}.` : ''}
                  </span>
                  <RichText
                    text={question.questionText}
                    className="text-xs text-ink leading-relaxed flex-1 font-medium"
                  />
                </div>

                {/* "সমাধান দেখো" button + the boards this question (গ / ঘ) came in */}
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      aria-label={isSolutionOpen ? 'সমাধান লুকান' : 'সমাধান দেখুন'}
                      onClick={() =>
                        setExpandedSolutions((prev) => ({
                          ...prev,
                          [question.id]: !isSolutionOpen,
                        }))
                      }
                      className="min-h-[34px] px-2.5 py-1 rounded-lg border border-line bg-surface hover:bg-hover text-[0.6875rem] font-semibold text-brand-ink flex items-center gap-1 transition-colors shrink-0"
                    >
                      {isSolutionOpen ? (
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
                    <QuestionBoardTags boards={question.usedInBoards} />
                  </div>

                  {/* Solution expansion */}
                  {isSolutionOpen && (
                    <div className="mt-2.5 p-3.5 rounded-xl bg-surface-2 border border-line space-y-2 animate-in fade-in duration-150">
                      <div className="text-[0.6875rem] font-bold text-brand-ink uppercase tracking-wider">
                        সমাধান:
                      </div>
                      <RichText
                        text={question.solutionText}
                        className="text-xs text-ink leading-relaxed"
                      />

                      {/* Solution images - Tapping opens full-screen zoomable viewer (Requirement 4) */}
                      {solutionUrls.length > 0 && (
                        <div className="space-y-2 pt-1">
                          {solutionUrls.map((url, imgIdx) => (
                            <div
                              key={imgIdx}
                              onClick={() =>
                                handleOpenImageViewer(solutionUrls, imgIdx)
                              }
                              className="w-full overflow-hidden rounded-xl border border-line bg-surface cursor-pointer hover:opacity-95 transition-opacity"
                              title="পূর্ণ স্ক্রিনে দেখতে ট্যাপ করুন"
                            >
                              <img
                                src={url}
                                alt="সমাধান চিত্র"
                                className="w-full h-auto object-contain max-h-56 mx-auto"
                              />
                            </div>
                          ))}
                          <p className="text-[0.625rem] text-ink-muted text-center italic">
                            (ছবিতে ট্যাপ করে বড় ও জুম করে দেখুন)
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </article>
  );
};

export default QuestionGroupCard;
