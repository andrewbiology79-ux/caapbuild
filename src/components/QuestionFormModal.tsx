import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LatexEditor } from './LatexEditor';
import { RichText } from './RichText';
import { SolutionView } from './SolutionView';
import {
  parseSolution,
  serializeSolution,
  splitStimulusImages,
  type SolutionPart,
} from '../utils/solutionParts';
import { ImageViewerModal } from './ImageViewerModal';
import { ConfirmDialog } from './ConfirmDialog';
import { useToast } from './Toast';
import { toBn, toEn } from '../utils/toBn';
import { useNavigation } from '../utils/navigation';
import { compressImageToWebP } from '../utils/imageCompressor';
import { exportImageFromUrl } from '../utils/imageExport';
import { loadCustomBoards, saveCustomBoards, customBoardToOption, type CustomBoard } from '../utils/boards';
import {
  getApi,
  type Subject,
  type Chapter,
  type Topic,
  type QuestionType,
  type BoardUsage,
  type QuestionBlockInput,
} from '../db/api';
import type { CqScope } from '../db/db';
import {
  X,
  Plus,
  ImagePlus,
  SquarePlus,
  Image as ImageIcon,
  Trash2,
  Eye,
  EyeOff,
  RefreshCw,
  Maximize2,
  BookMarked,
  Layers,
  HelpCircle,
  Undo2,
  Redo2,
  Check,
  AlertCircle,
  ChevronDown,
  Download,
  ArrowUpDown,
} from 'lucide-react';

export interface QuestionFormModalProps {
  /** which collection (database) to work on — default Type CQ */
  scope?: CqScope;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialTopicId?: string;
  editQuestionId?: string | null;
}

const BOARD_OPTIONS = [
  { value: 'DB', label: 'DB (ঢাকা বোর্ড)' },
  { value: 'RB', label: 'RB (রাজশাহী বোর্ড)' },
  { value: 'CB', label: 'CB (কুমিল্লা বোর্ড)' },
  { value: 'SB', label: 'SB (সিলেট বোর্ড)' },
  { value: 'JB', label: 'JB (যশোর বোর্ড)' },
  { value: 'BB', label: 'BB (বরিশাল বোর্ড)' },
  { value: 'MB', label: 'MB (ময়মনসিংহ বোর্ড)' },
  { value: 'DJB', label: 'DJB (দিনাজপুর বোর্ড)' },
  { value: 'অন্যান্য', label: 'অন্যান্য' },
];

const DEFAULT_MARKS_BY_TYPE: Record<QuestionType, number> = {
  ক: 1,
  খ: 2,
  গ: 3,
  ঘ: 4,
};

const RATING_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: 'সহজ' },
  { value: 2, label: 'মোটামুটি' },
  { value: 3, label: 'মাঝারি' },
  { value: 4, label: 'ভালো' },
  { value: 5, label: 'চ্যালেঞ্জিং' },
];

type EditorMode = 'minimum' | 'full';

/** Height shared by the small controls (board / eye / rating) so they line up on one row */
const CTRL_H = 32;

/**
 * Compact rating dropdown (1-5). Closed: only "৩★". Opened: the full list ("৩★ মাঝারি" …).
 */
const RatingSelect: React.FC<{ value: number; onChange: (v: number) => void; ariaLabel: string }> = ({
  value,
  onChange,
  ariaLabel,
}) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const current = value || 3;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={wrapRef}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{ minHeight: 0, height: CTRL_H }}
        className="px-1.5 rounded-md border border-[#FDE047] bg-[#FEF9C3] text-[#713F12] text-[0.6875rem] font-bold flex items-center gap-0.5 focus:outline-none focus:ring-2 focus:ring-[#3B4FD8]"
      >
        <span>{toBn(current)}★</span>
        <ChevronDown className="w-3 h-3 opacity-70" />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className="absolute right-0 top-full mt-1 z-30 w-36 rounded-lg border border-[#FDE047] bg-white shadow-xl py-1"
        >
          {RATING_OPTIONS.map((r) => (
            <button
              key={r.value}
              type="button"
              role="option"
              aria-selected={r.value === current}
              onClick={() => {
                setOpen(false);
                onChange(r.value);
              }}
              style={{ minHeight: 36 }}
              className={`w-full px-3 text-left text-xs font-semibold flex items-center justify-between ${
                r.value === current ? 'bg-[#FEF9C3] text-[#713F12]' : 'text-[#1B1F2A] hover:bg-[#FEFCE8]'
              }`}
            >
              <span>
                {toBn(r.value)}★ {r.label}
              </span>
              {r.value === current && <Check className="w-3.5 h-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/** Eye button that toggles the live KaTeX preview */
const EyeToggle: React.FC<{ open: boolean; onClick: () => void }> = ({ open, onClick }) => (
  <button
    type="button"
    aria-label={open ? 'লাইভ প্রিভিউ বন্ধ করুন' : 'লাইভ প্রিভিউ দেখুন'}
    aria-pressed={open}
    onClick={onClick}
    style={{ minHeight: 0, height: CTRL_H, width: CTRL_H }}
    className={`shrink-0 flex items-center justify-center rounded-md border transition-colors ${
      open
        ? 'bg-[#3B4FD8] border-[#3B4FD8] text-white'
        : 'bg-[#EEF2FF] border-[#D5D9E2] text-[#3B4FD8] hover:bg-[#E0E7FF]'
    }`}
  >
    {open ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
  </button>
);

/** Live KaTeX preview card shown when the eye button is on (readable in light AND dark mode) */
const LivePreview: React.FC<{ text?: string; title?: string; children?: React.ReactNode }> = ({
  text = '',
  title = 'লাইভ প্রিভিউ (KaTeX)',
  children,
}) => (
  <div className="live-preview rounded-xl border border-[#D5D9E2] dark:border-slate-700 bg-[#F8FAFF] dark:bg-slate-800/70 p-3.5 animate-in fade-in duration-150">
    <div className="flex items-center gap-1.5 text-[0.6875rem] font-semibold text-[#2A3BB0] dark:text-indigo-300 pb-1.5 mb-2 border-b border-[#E2E8F0] dark:border-slate-700">
      <Eye className="w-3.5 h-3.5" />
      <span>{title}</span>
    </div>
    {children ? (
      children
    ) : text.trim() ? (
      <RichText text={text} className="text-sm text-[#1B1F2A] dark:text-slate-100" />
    ) : (
      <div className="text-xs text-[#64748B] dark:text-slate-400 italic">উপরে লিখলে এখানে প্রিভিউ দেখা যাবে।</div>
    )}
  </div>
);

/** Small square "add picture" button — only an icon, no text */
const AddImageButton: React.FC<{ onClick: () => void; ariaLabel: string; title?: string }> = ({
  onClick,
  ariaLabel,
  title = 'ছবি যোগ করুন',
}) => (
  <button
    type="button"
    aria-label={ariaLabel}
    title={title}
    onClick={onClick}
    style={{ minHeight: 0, height: CTRL_H, width: CTRL_H }}
    className="shrink-0 flex items-center justify-center rounded-md border border-dashed border-[#3B4FD8] bg-[#EEF2FF] hover:bg-[#E0E7FF] active:bg-[#C7D2FE] text-[#3B4FD8] transition-colors"
  >
    <ImagePlus className="w-4 h-4" />
  </button>
);

/** Compact board dropdown — picking a board opens the year window (see BoardYearWindow) */
const BoardSelect: React.FC<{
  options: Array<{ value: string; label: string }>;
  onPick: (board: string) => void;
  onAddBoard: () => void;
  ariaLabel: string;
}> = ({ options, onPick, onAddBoard, ariaLabel }) => (
  <select
    aria-label={ariaLabel}
    value=""
    onChange={(e) => {
      const v = e.target.value;
      if (!v) return;
      if (v === '__add_new_board__') {
        onAddBoard();
        return;
      }
      onPick(v);
    }}
    style={{ height: CTRL_H }}
    className="w-[54px] shrink-0 px-1 py-0 rounded-md border border-[#D5D9E2] bg-white text-[#2A3BB0] text-[0.625rem] font-bold focus:outline-none focus:ring-2 focus:ring-[#3B4FD8]"
  >
    <option value="" disabled>
      বোর্ড
    </option>
    {options.map((b) => (
      <option key={b.value} value={b.value}>
        {b.label}
      </option>
    ))}
    <option value="__add_new_board__">+ নতুন বোর্ড যুক্ত করুন</option>
  </select>
);

/** Board + year tags already added to one section (উদ্দীপক / গ / ঘ …) — small chips. Nothing is shown when empty. */
const BoardChips: React.FC<{ chips: BoardUsage[]; onRemove: (board: string, year: number) => void }> = ({
  chips,
  onRemove,
}) => {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {chips.map((c) =>
        c.years.map((y) => (
          <span
            key={`${c.board}-${y}`}
            className="inline-flex items-center gap-1 pl-1.5 pr-0.5 h-5 rounded-md bg-[#EEF2FF] text-[#2A3BB0] border border-[#D5D9E2] text-[0.625rem] font-semibold leading-none"
          >
            <span>
              {c.board}'{toBn(String(y).slice(-2))}
            </span>
            <button
              type="button"
              aria-label={`${c.board} ${y} ট্যাগ মুছুন`}
              onClick={() => onRemove(c.board, y)}
              style={{ minHeight: 0 }}
              className="w-4 h-4 rounded flex items-center justify-center text-[#64748B] hover:text-red-600 hover:bg-white transition-colors"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))
      )}
    </div>
  );
};

interface BoardYearWindowProps {
  board: string;
  boardLabel: string;
  addedYears: number[];
  isCustom: boolean;
  onPickYear: (year: number) => void;
  onInvalidYear: () => void;
  onDeleteBoard: () => void;
  onClose: () => void;
}

/** Window that opens after a board is picked: tap a year to add the board + year tag */
const BoardYearWindow: React.FC<BoardYearWindowProps> = ({
  board,
  boardLabel,
  addedYears,
  isCustom,
  onPickYear,
  onInvalidYear,
  onDeleteBoard,
  onClose,
}) => {
  const { registerBackHandler } = useNavigation();
  const [manualYear, setManualYear] = useState('');

  // Android back button closes this window first
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    return registerBackHandler(() => {
      closeRef.current();
      return true;
    });
  }, [registerBackHandler]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: Math.max(1, currentYear - 2010 + 1) }, (_, i) => currentYear - i);

  const submitManual = () => {
    const yearNum = parseInt(toEn(manualYear).trim(), 10);
    if (isNaN(yearNum) || yearNum < 1990 || yearNum > 2099) {
      onInvalidYear();
      return;
    }
    onPickYear(yearNum);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="সাল বাছুন"
      onClick={onClose}
      className="absolute inset-0 z-[55] bg-black/50 flex items-center justify-center px-5"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded-2xl bg-white p-4 space-y-3 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-bold text-[#2A3BB0]">সাল বাছুন</div>
            <div className="text-[0.6875rem] font-medium text-[#64748B] truncate">{boardLabel}</div>
          </div>
          <button
            type="button"
            aria-label="বন্ধ করুন"
            onClick={onClose}
            className="min-h-[36px] min-w-[36px] -mt-1 -mr-1.5 flex items-center justify-center rounded-full text-[#64748B] hover:bg-[#F2F4F8]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-4 gap-1.5 max-h-[224px] overflow-y-auto pr-0.5">
          {years.map((y) => {
            const added = addedYears.includes(y);
            return (
              <button
                key={y}
                type="button"
                disabled={added}
                aria-label={`${board} ${y}`}
                onClick={() => onPickYear(y)}
                className={`min-h-[44px] rounded-xl border text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${
                  added
                    ? 'bg-[#EEF2FF] border-[#C7D2FE] text-[#94A3B8]'
                    : 'bg-white border-[#D5D9E2] text-[#1B1F2A] hover:bg-[#EEF2FF] active:bg-[#E0E7FF]'
                }`}
              >
                {added && <Check className="w-3.5 h-3.5 text-[#3B4FD8]" />}
                <span>{toBn(y)}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 pt-2.5 border-t border-[#F2F4F8]">
          <input
            type="text"
            inputMode="numeric"
            aria-label="অন্য সাল লিখুন"
            value={manualYear}
            onChange={(e) => setManualYear(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitManual();
              }
            }}
            placeholder="অন্য সাল (যেমন: ২০০৯)"
            className="flex-1 min-w-0 min-h-[44px] px-3 py-2 rounded-xl border border-[#D5D9E2] bg-white text-xs text-[#1B1F2A] font-medium focus:outline-none focus:ring-2 focus:ring-[#3B4FD8]"
          />
          <button
            type="button"
            onClick={submitManual}
            className="min-h-[44px] px-3.5 rounded-xl bg-[#3B4FD8] hover:bg-[#2A3BB0] active:bg-[#202E91] text-white text-xs font-semibold shrink-0"
          >
            + যোগ
          </button>
        </div>

        {isCustom && (
          <button
            type="button"
            onClick={onDeleteBoard}
            className="text-[0.6875rem] font-medium text-red-600 underline"
          >
            এই বোর্ডটি তালিকা থেকে মুছুন ({board})
          </button>
        )}
      </div>
    </div>
  );
};

interface ImageStripProps {
  /** optional heading — the stimulus picture row shows only a "+" button, no text */
  title?: string;
  /** hide the "+" button (used for গ / ঘ: no new pictures, only already-saved ones stay manageable) */
  hideAdd?: boolean;
  ids: string[];
  urls: Record<string, string>;
  /** Full Editor only: replace a picture / open a big preview */
  fullFeatures: boolean;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onReplace: (id: string) => void;
  /** Full Editor only: export (download) the picture to the phone */
  onExport: (id: string) => void;
  onOpenViewer: (index: number) => void;
  addAriaLabel: string;
}

/** Picture upload row. Minimum = add / remove. Full Editor = also replace + big preview */
const ImageStrip: React.FC<ImageStripProps> = ({
  title,
  hideAdd = false,
  ids,
  urls,
  fullFeatures,
  onAdd,
  onRemove,
  onReplace,
  onExport,
  onOpenViewer,
  addAriaLabel,
}) => (
  <div className="space-y-2">
    {(!hideAdd || title) && (
      <div className="flex items-center justify-end gap-2">
        {title && <span className="mr-auto text-xs font-semibold text-[#1B1F2A]">{title}</span>}
        {!hideAdd && (
          <button
            type="button"
            aria-label={addAriaLabel}
            title="ছবি যোগ করুন"
            onClick={onAdd}
            style={{ minHeight: 0, height: CTRL_H, width: CTRL_H }}
            className="rounded-md border border-dashed border-[#3B4FD8] bg-[#EEF2FF] hover:bg-[#E0E7FF] active:bg-[#C7D2FE] text-[#3B4FD8] flex items-center justify-center transition-colors"
          >
            <ImagePlus className="w-4 h-4" />
          </button>
        )}
      </div>
    )}

    {ids.length > 0 && (
      <div className={fullFeatures ? 'grid grid-cols-2 gap-2.5' : 'grid grid-cols-3 gap-2.5'}>
        {ids.map((imgId, idx) => {
          const url = urls[imgId];
          return (
            <div key={imgId} className="space-y-1.5">
              <div className="relative rounded-xl overflow-hidden border border-[#D5D9E2] aspect-video bg-[#F8FAFC]">
                {url ? (
                  <img
                    src={url}
                    alt="ছবি"
                    onClick={fullFeatures ? () => onOpenViewer(idx) : undefined}
                    className={`w-full h-full object-cover ${fullFeatures ? 'cursor-zoom-in' : ''}`}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[0.625rem] text-[#64748B]">
                    লোড হচ্ছে...
                  </div>
                )}
                <button
                  type="button"
                  aria-label="ছবি মুছে ফেলুন"
                  onClick={() => onRemove(imgId)}
                  style={{ minHeight: 0 }}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center shadow-md hover:bg-red-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {fullFeatures && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label="ছবি বদলান"
                    title="বদলান"
                    onClick={() => onReplace(imgId)}
                    className="flex-1 min-h-[36px] rounded-lg border border-[#D5D9E2] bg-white hover:bg-[#EEF2FF] active:bg-[#E0E7FF] text-[#2A3BB0] flex items-center justify-center"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="ছবি এক্সপোর্ট করুন"
                    title="এক্সপোর্ট (ডাউনলোড)"
                    disabled={!url}
                    onClick={() => onExport(imgId)}
                    className="flex-1 min-h-[36px] rounded-lg border border-[#D5D9E2] bg-white hover:bg-[#EEF2FF] active:bg-[#E0E7FF] text-[#2A3BB0] flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="বড় প্রিভিউ দেখুন"
                    title="বড় দেখুন"
                    onClick={() => onOpenViewer(idx)}
                    className="flex-1 min-h-[36px] rounded-lg border border-[#D5D9E2] bg-white hover:bg-[#EEF2FF] active:bg-[#E0E7FF] text-[#2A3BB0] flex items-center justify-center"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    )}
  </div>
);

/** One picture inside a solution. Minimum = remove only. Full Editor = replace / export / big preview too */
const PartImage: React.FC<{
  id: string;
  url?: string;
  fullFeatures: boolean;
  onRemove: () => void;
  onReplace: () => void;
  onExport: () => void;
  onOpenViewer: () => void;
}> = ({ url, fullFeatures, onRemove, onReplace, onExport, onOpenViewer }) => (
  <div className="space-y-1.5">
    <div className="relative rounded-xl overflow-hidden border border-[#D5D9E2] bg-[#F8FAFC] max-w-[220px]">
      {url ? (
        <img
          src={url}
          alt="সমাধানের ছবি"
          onClick={fullFeatures ? onOpenViewer : undefined}
          className={`w-full h-auto max-h-40 object-contain ${fullFeatures ? 'cursor-zoom-in' : ''}`}
        />
      ) : (
        <div className="w-full h-20 flex items-center justify-center text-[0.625rem] text-[#64748B]">লোড হচ্ছে...</div>
      )}
      <button
        type="button"
        aria-label="ছবি মুছে ফেলুন"
        onClick={onRemove}
        style={{ minHeight: 0 }}
        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center shadow-md hover:bg-red-700"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
    {fullFeatures && (
      <div className="flex items-center gap-1.5 max-w-[220px]">
        <button
          type="button"
          aria-label="ছবি বদলান"
          title="বদলান"
          onClick={onReplace}
          className="flex-1 min-h-[36px] rounded-lg border border-[#D5D9E2] bg-white hover:bg-[#EEF2FF] active:bg-[#E0E7FF] text-[#2A3BB0] flex items-center justify-center"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
        <button
          type="button"
          aria-label="ছবি এক্সপোর্ট করুন"
          title="এক্সপোর্ট (ডাউনলোড)"
          disabled={!url}
          onClick={onExport}
          className="flex-1 min-h-[36px] rounded-lg border border-[#D5D9E2] bg-white hover:bg-[#EEF2FF] active:bg-[#E0E7FF] text-[#2A3BB0] flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none"
        >
          <Download className="w-4 h-4" />
        </button>
        <button
          type="button"
          aria-label="বড় প্রিভিউ দেখুন"
          title="বড় দেখুন"
          disabled={!url}
          onClick={onOpenViewer}
          className="flex-1 min-h-[36px] rounded-lg border border-[#D5D9E2] bg-white hover:bg-[#EEF2FF] active:bg-[#E0E7FF] text-[#2A3BB0] flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    )}
  </div>
);

interface QuestionFormBlock extends QuestionBlockInput {
  tempId: string; // Internal unique key for React lists
  /** the solution as an ordered list of text boxes and pictures (see utils/solutionParts) */
  solutionParts: SolutionPart[];
}

const emptyParts = (): SolutionPart[] => [{ kind: 'text', text: '' }];

/** a solution always ends with a text box to type in */
const withTrailingText = (parts: SolutionPart[]): SolutionPart[] =>
  parts.length === 0 || parts[parts.length - 1].kind !== 'text' ? [...parts, { kind: 'text', text: '' }] : parts;

/** put the serialised text / picture list back into the block so it can be saved */
const applyParts = (b: QuestionFormBlock, parts: SolutionPart[]): QuestionFormBlock => {
  const ser = serializeSolution(parts);
  return { ...b, solutionParts: parts, solutionText: ser.text, solutionImageIds: ser.imageIds };
};

export const QuestionFormModal: React.FC<QuestionFormModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  initialTopicId,
  editQuestionId,
  scope = 'type' as CqScope,
}) => {
  const { getSubjects, getChapters, getTopics, saveImageBlob, getImageBlobUrl, getQuestionGroupForEdit, saveQuestionGroup } = getApi(scope);
  const { showToast } = useToast();
  const { registerBackHandler } = useNavigation();

  // Loading
  const [loading, setLoading] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  // Full Editor: the subject / chapter / topic card can be minimised to save space
  const [hierarchyOpen, setHierarchyOpen] = useState(false);
  // Full Editor: which question block is waiting for the delete confirmation
  const [deleteBlockIndex, setDeleteBlockIndex] = useState<number | null>(null);

  // Subjects / Chapters / Topics lists
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [filteredChapters, setFilteredChapters] = useState<Chapter[]>([]);
  const [filteredTopics, setFilteredTopics] = useState<Topic[]>([]);

  // Selected hierarchy
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [selectedChapterId, setSelectedChapterId] = useState<string>('');
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');

  // Stimulus states
  const [stimulusId, setStimulusId] = useState<string | undefined>(undefined);
  const [stimulusText, setStimulusText] = useState<string>('');
  const [stimulusImageIds, setStimulusImageIds] = useState<string[]>([]);
  const [stimulusImageUrls, setStimulusImageUrls] = useState<Record<string, string>>({});
  // how many of the first stimulus pictures sit ABOVE the stimulus text
  const [stimulusTopCount, setStimulusTopCount] = useState<number>(0);

  // Stimulus-level extras (Minimum + Full Editor)
  const [stimulusRating, setStimulusRating] = useState<number>(3);
  const [stimulusBoards, setStimulusBoards] = useState<BoardUsage[]>([]);
  // Full Editor only: where the question was collected from
  const [reference, setReference] = useState<string>('');

  // Editor mode — "Minimum" is ALWAYS the default when the form opens
  const [editorMode, setEditorMode] = useState<EditorMode>('minimum');
  const isFull = editorMode === 'full';

  // Live-preview (eye button) toggles
  const [stimulusPreviewOpen, setStimulusPreviewOpen] = useState(false);
  const [solutionPreviewOpen, setSolutionPreviewOpen] = useState<Record<string, boolean>>({});
  const [questionPreviewOpen, setQuestionPreviewOpen] = useState<Record<string, boolean>>({});
  const [answerPreviewOpen, setAnswerPreviewOpen] = useState<Record<string, boolean>>({});

  // Full Editor: big image preview + replace
  const [viewer, setViewer] = useState<{ images: Array<{ url: string; alt?: string }>; index: number } | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceTarget, setReplaceTarget] = useState<
    { kind: 'stimulus'; imageId: string } | { kind: 'solution'; tempId: string; imageId: string } | null
  >(null);

  // Board → year window: which section (উদ্দীপক / a question block) and which board is being tagged
  type BoardTarget = { kind: 'stimulus' } | { kind: 'question'; index: number };
  const [yearPicker, setYearPicker] = useState<{ target: BoardTarget; board: string } | null>(null);

  // Custom boards (user-added)
  const [customBoards, setCustomBoards] = useState<CustomBoard[]>(() => loadCustomBoards());
  const [showAddBoard, setShowAddBoard] = useState(false);
  const [newBoardCode, setNewBoardCode] = useState('');
  const [newBoardName, setNewBoardName] = useState('');

  const allBoardOptions = useMemo(() => {
    const base = BOARD_OPTIONS.filter((b) => b.value !== 'অন্যান্য');
    const other = BOARD_OPTIONS.filter((b) => b.value === 'অন্যান্য');
    const builtInCodes = new Set(BOARD_OPTIONS.map((b) => b.value));
    const extra = customBoards.filter((b) => !builtInCodes.has(b.code)).map(customBoardToOption);
    return [...base, ...extra, ...other];
  }, [customBoards]);

  const handleSaveNewBoard = () => {
    const code = newBoardCode.trim().toUpperCase();
    const name = newBoardName.trim();
    if (!code) {
      showToast('বোর্ডের সংক্ষিপ্ত কোড লিখুন (যেমন: CTB)');
      return;
    }
    if (allBoardOptions.some((b) => b.value.toUpperCase() === code)) {
      showToast('এই কোডের বোর্ড আগে থেকেই আছে');
      return;
    }
    const next = [...customBoards, { code, name }];
    setCustomBoards(next);
    saveCustomBoards(next);
    setNewBoardCode('');
    setNewBoardName('');
    setShowAddBoard(false);
  };

  const handleDeleteCustomBoard = (code: string) => {
    const next = customBoards.filter((b) => b.code !== code);
    setCustomBoards(next);
    saveCustomBoards(next);
  };

  // ---- Board + year tags (board dropdown → year window) ----
  const getBoardChips = (target: BoardTarget): BoardUsage[] =>
    target.kind === 'stimulus' ? stimulusBoards : questionBlocks[target.index]?.usedInBoards || [];

  const setBoardChips = (target: BoardTarget, next: BoardUsage[]) => {
    if (target.kind === 'stimulus') {
      setIsDirty(true);
      setStimulusBoards(next);
    } else {
      updateQuestionBlock(target.index, 'usedInBoards', next);
    }
  };

  const addBoardYear = (target: BoardTarget, board: string, year: number) => {
    const chips = getBoardChips(target);
    const existing = chips.find((c) => c.board === board);
    if (existing) {
      if (existing.years.includes(year)) return;
      setBoardChips(
        target,
        chips.map((c) => (c.board === board ? { ...c, years: [...c.years, year].sort((a, b) => a - b) } : c))
      );
    } else {
      setBoardChips(target, [...chips, { board, years: [year] }]);
    }
  };

  const removeBoardYear = (target: BoardTarget, board: string, year: number) => {
    setBoardChips(
      target,
      getBoardChips(target)
        .map((c) => (c.board === board ? { ...c, years: c.years.filter((x) => x !== year) } : c))
        .filter((c) => c.years.length > 0)
    );
  };

  // Questions blocks state
  const [questionBlocks, setQuestionBlocks] = useState<QuestionFormBlock[]>([
    {
      tempId: 'initial-ga',
      type: 'গ',
      marks: 3,
      questionText: '',
      solutionText: '',
      solutionImageIds: [],
      solutionParts: emptyParts(),
      answerText: '',
      rating: 3,
      usedInBoards: [],
    },
    {
      tempId: 'initial-gha',
      type: 'ঘ',
      marks: 4,
      questionText: '',
      solutionText: '',
      solutionImageIds: [],
      solutionParts: emptyParts(),
      answerText: '',
      rating: 4,
      usedInBoards: [],
    },
  ]);
  const [deletedQuestionIds, setDeletedQuestionIds] = useState<string[]>([]);
  const [solutionImageUrls, setSolutionImageUrls] = useState<Record<string, string>>({});

  // Validation errors
  const [errors, setErrors] = useState<{
    topic?: string;
    stimulus?: string;
    questions?: Record<string, string>;
  }>({});

  const stimulusFileInputRef = useRef<HTMLInputElement>(null);

  // ---- Undo / Redo (snapshots of everything typed or changed in the form) ----
  interface FormSnapshot {
    stimulusText: string;
    stimulusImageIds: string[];
    stimulusTopCount: number;
    stimulusRating: number;
    stimulusBoards: BoardUsage[];
    reference: string;
    questionBlocks: QuestionFormBlock[];
    deletedQuestionIds: string[];
  }
  const currentSnap: FormSnapshot = {
    stimulusText,
    stimulusImageIds,
    stimulusTopCount,
    stimulusRating,
    stimulusBoards,
    reference,
    questionBlocks,
    deletedQuestionIds,
  };
  const currentSnapKey = JSON.stringify(currentSnap);
  const snapRef = useRef<{ snap: FormSnapshot; key: string }>({ snap: currentSnap, key: currentSnapKey });
  snapRef.current = { snap: currentSnap, key: currentSnapKey };
  const historyRef = useRef<{ stack: Array<{ snap: FormSnapshot; key: string }>; index: number }>({
    stack: [],
    index: -1,
  });
  const historyReadyRef = useRef(false);
  const [historyEpoch, setHistoryEpoch] = useState(0);
  const [, setHistoryTick] = useState(0);

  const commitHistory = () => {
    if (!historyReadyRef.current) return;
    const h = historyRef.current;
    const latest = snapRef.current;
    const top = h.stack[h.index];
    if (top && top.key === latest.key) return;
    h.stack = h.stack.slice(0, h.index + 1);
    h.stack.push(latest);
    if (h.stack.length > 100) h.stack.shift();
    h.index = h.stack.length - 1;
    setHistoryTick((t) => t + 1);
  };

  // Form finished loading → this is the starting point of the history
  useEffect(() => {
    if (!isOpen || historyEpoch === 0) return;
    historyRef.current = { stack: [snapRef.current], index: 0 };
    historyReadyRef.current = true;
    setHistoryTick((t) => t + 1);
  }, [historyEpoch, isOpen]);

  // Typing is grouped: one history step per short pause
  useEffect(() => {
    if (!isOpen || !historyReadyRef.current) return;
    const timer = setTimeout(commitHistory, 600);
    return () => clearTimeout(timer);
  }, [currentSnapKey, isOpen]);

  const applySnapshot = (snap: FormSnapshot) => {
    setStimulusText(snap.stimulusText);
    setStimulusImageIds(snap.stimulusImageIds);
    setStimulusTopCount(snap.stimulusTopCount ?? 0);
    setStimulusRating(snap.stimulusRating);
    setStimulusBoards(snap.stimulusBoards);
    setReference(snap.reference);
    setQuestionBlocks(snap.questionBlocks);
    setDeletedQuestionIds(snap.deletedQuestionIds);
    setIsDirty(true);
    setErrors({});
  };

  const historyTop = historyRef.current.stack[historyRef.current.index];
  const hasPendingChange = historyReadyRef.current && !!historyTop && historyTop.key !== currentSnapKey;
  const canUndo = historyReadyRef.current && (historyRef.current.index > 0 || hasPendingChange);
  const canRedo =
    historyReadyRef.current && !hasPendingChange && historyRef.current.index < historyRef.current.stack.length - 1;

  const handleUndo = () => {
    commitHistory(); // keep what was typed just now as a step too
    const h = historyRef.current;
    if (h.index <= 0) return;
    h.index -= 1;
    applySnapshot(h.stack[h.index].snap);
    setHistoryTick((t) => t + 1);
  };

  const handleRedo = () => {
    const h = historyRef.current;
    if (h.index >= h.stack.length - 1) return;
    h.index += 1;
    applySnapshot(h.stack[h.index].snap);
    setHistoryTick((t) => t + 1);
  };

  // Hardware Back Button interception
  useEffect(() => {
    if (!isOpen) return;

    const unregister = registerBackHandler(() => {
      if (isDirty) {
        setShowExitConfirm(true);
        return true;
      }
      onClose();
      return true;
    });

    return unregister;
  }, [isOpen, isDirty, onClose, registerBackHandler]);

  // Every time the form opens: Minimum mode, closed previews
  useEffect(() => {
    if (!isOpen) return;
    setEditorMode('minimum');
    setStimulusPreviewOpen(false);
    setSolutionPreviewOpen({});
    setQuestionPreviewOpen({});
    setAnswerPreviewOpen({});
    setStimulusTopCount(0);
    setStimulusRating(3);
    setStimulusBoards([]);
    setReference('');
    setViewer(null);
    setHierarchyOpen(false);
    setDeleteBlockIndex(null);
    historyReadyRef.current = false;
  }, [isOpen, editQuestionId]);

  // Load Initial Hierarchy & Edit Data
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    const initializeForm = async () => {
      setLoading(true);
      try {
        const subList = await getSubjects();
        if (!isMounted) return;
        setAllSubjects(subList);

        if (editQuestionId) {
          // Edit Mode: Load question group data
          const editData = await getQuestionGroupForEdit(editQuestionId);
          if (editData && isMounted) {
            setStimulusId(editData.stimulus?.id);
            setStimulusText(editData.stimulus?.text || '');
            setStimulusRating(editData.stimulus?.rating || 3);
            setStimulusBoards(editData.stimulus?.usedInBoards || []);
            setReference(editData.stimulus?.reference || '');
            const stimImgIds = editData.stimulus?.imageIds || [];
            setStimulusImageIds(stimImgIds);
            setStimulusTopCount(Math.min(stimImgIds.length, editData.stimulus?.imageTopCount || 0));

            // Load stimulus image preview URLs
            for (const imgId of stimImgIds) {
              const url = await getImageBlobUrl(imgId);
              if (url && isMounted) {
                setStimulusImageUrls((prev) => ({ ...prev, [imgId]: url }));
              }
            }

            // Hierarchy setup
            setSelectedSubjectId(editData.subjectId || '');
            if (editData.subjectId) {
              const chList = await getChapters(editData.subjectId);
              if (isMounted) setFilteredChapters(chList);
            }
            setSelectedChapterId(editData.chapterId || '');
            if (editData.chapterId) {
              const topList = await getTopics(editData.chapterId);
              if (isMounted) setFilteredTopics(topList);
            }
            setSelectedTopicId(editData.topicId);

            // Populate Questions blocks
            const blocks: QuestionFormBlock[] = [];

            for (const q of editData.questions) {
              blocks.push({
                id: q.id,
                tempId: q.id,
                type: q.type,
                marks: q.marks,
                questionText: q.questionText,
                solutionText: q.solutionText || '',
                solutionImageIds: q.solutionImageIds || [],
                solutionParts: withTrailingText(parseSolution(q.solutionText || '', q.solutionImageIds || [])),
                answerText: q.answerText || '',
                rating: q.rating || 3,
                usedInBoards: q.usedInBoards || [],
              });

              // Load solution images URLs
              if (q.solutionImageIds) {
                for (const imgId of q.solutionImageIds) {
                  const url = await getImageBlobUrl(imgId);
                  if (url && isMounted) {
                    setSolutionImageUrls((prev) => ({ ...prev, [imgId]: url }));
                  }
                }
              }
            }

            setQuestionBlocks(blocks);
          }
        } else {
          // Add Mode: Pre-fill hierarchy if initialTopicId provided
          if (initialTopicId) {
            const allTopics = await Promise.all(
              subList.map(async (s) => {
                const chs = await getChapters(s.id);
                const tops = await Promise.all(chs.map((c) => getTopics(c.id)));
                return { s, chs, tops: tops.flat() };
              })
            );

            for (const entry of allTopics) {
              const matchedTopic = entry.tops.find((t) => t.id === initialTopicId);
              if (matchedTopic) {
                const matchedChapter = entry.chs.find((c) => c.id === matchedTopic.chapterId);
                if (matchedChapter && isMounted) {
                  setSelectedSubjectId(entry.s.id);
                  setFilteredChapters(entry.chs);
                  setSelectedChapterId(matchedChapter.id);

                  const chTopics = await getTopics(matchedChapter.id);
                  if (isMounted) {
                    setFilteredTopics(chTopics);
                    setSelectedTopicId(matchedTopic.id);
                  }
                }
                break;
              }
            }
          } else if (subList.length > 0) {
            setSelectedSubjectId(subList[0].id);
            const chList = await getChapters(subList[0].id);
            if (isMounted) {
              setFilteredChapters(chList);
              if (chList.length > 0) {
                setSelectedChapterId(chList[0].id);
                const topList = await getTopics(chList[0].id);
                if (isMounted) {
                  setFilteredTopics(topList);
                  if (topList.length > 0) {
                    setSelectedTopicId(topList[0].id);
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to init question form:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
          setHistoryEpoch((n) => n + 1);
        }
      }
    };

    initializeForm();

    return () => {
      isMounted = false;
    };
  }, [isOpen, initialTopicId, editQuestionId]);

  // Handle Subject Change
  const handleSubjectChange = async (subjectId: string) => {
    setIsDirty(true);
    setSelectedSubjectId(subjectId);
    setSelectedChapterId('');
    setSelectedTopicId('');
    setFilteredTopics([]);

    if (subjectId) {
      const chList = await getChapters(subjectId);
      setFilteredChapters(chList);
    } else {
      setFilteredChapters([]);
    }
  };

  // Handle Chapter Change
  const handleChapterChange = async (chapterId: string) => {
    setIsDirty(true);
    setSelectedChapterId(chapterId);
    setSelectedTopicId('');

    if (chapterId) {
      const topList = await getTopics(chapterId);
      setFilteredTopics(topList);
    } else {
      setFilteredTopics([]);
    }
  };

  // Handle Topic Change
  const handleTopicChange = (topicId: string) => {
    setIsDirty(true);
    setSelectedTopicId(topicId);
    if (errors.topic) {
      setErrors((prev) => ({ ...prev, topic: undefined }));
    }
  };

  // Upload Stimulus Images with WebP 800px Canvas compression.
  // position 'top' = before the stimulus text, 'bottom' = after it (the old place)
  const stimulusTopInputRef = useRef<HTMLInputElement>(null);
  const handleUploadStimulusImages = async (
    e: React.ChangeEvent<HTMLInputElement>,
    position: 'top' | 'bottom' = 'bottom'
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsDirty(true);
    const added: string[] = [];
    for (let i = 0; i < files.length; i++) {
      try {
        const { blob, fileName } = await compressImageToWebP(files[i], 800, 0.8);
        const imageId = await saveImageBlob(blob, fileName);
        const previewUrl = URL.createObjectURL(blob);
        added.push(imageId);
        setStimulusImageUrls((prev) => ({ ...prev, [imageId]: previewUrl }));
      } catch (err) {
        console.error('Image upload failed:', err);
        showToast('ছবি আপলোড করতে সমস্যা হয়েছে');
      }
    }
    if (added.length > 0) {
      if (position === 'top') {
        setStimulusImageIds((prev) => [...added, ...prev]);
        setStimulusTopCount((n) => n + added.length);
      } else {
        setStimulusImageIds((prev) => [...prev, ...added]);
      }
    }
    e.target.value = '';
  };

  // Full Editor: replace one picture with another file from the phone
  const startReplace = (target: NonNullable<typeof replaceTarget>) => {
    setReplaceTarget(target);
    replaceInputRef.current?.click();
  };

  const handleReplaceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = replaceTarget;
    e.target.value = '';
    if (!file || !target) return;
    try {
      const { blob, fileName } = await compressImageToWebP(file, 800, 0.8);
      const newId = await saveImageBlob(blob, fileName);
      const previewUrl = URL.createObjectURL(blob);
      setIsDirty(true);
      if (target.kind === 'stimulus') {
        setStimulusImageIds((prev) => prev.map((id) => (id === target.imageId ? newId : id)));
        setStimulusImageUrls((prev) => ({ ...prev, [newId]: previewUrl }));
      } else {
        setSolutionImageUrls((prev) => ({ ...prev, [newId]: previewUrl }));
        setQuestionBlocks((prev) =>
          prev.map((b) =>
            b.tempId === target.tempId
              ? applyParts(
                  b,
                  b.solutionParts.map<SolutionPart>((p) =>
                    p.kind === 'image' && p.id === target.imageId ? { kind: 'image', id: newId } : p
                  )
                )
              : b
          )
        );
      }
      showToast('ছবি বদলানো হয়েছে');
    } catch (err) {
      console.error('Image replace failed:', err);
      showToast('ছবি বদলাতে সমস্যা হয়েছে');
    } finally {
      setReplaceTarget(null);
    }
  };

  const openViewer = (ids: string[], urls: Record<string, string>, index: number) => {
    const images = ids.map((id) => ({ url: urls[id], alt: 'ছবি' })).filter((i) => !!i.url);
    if (images.length === 0) return;
    setViewer({ images, index: Math.min(index, images.length - 1) });
  };

  // Full Editor: export a picture to the phone (Download/QbCollection/Images) or download it in the browser
  const handleExportImage = async (imageId: string, urls: Record<string, string>) => {
    const url = urls[imageId];
    if (!url) {
      showToast('ছবিটি এখনো লোড হয়নি');
      return;
    }
    try {
      const result = await exportImageFromUrl(url, 'qb-image');
      if (!result) {
        showToast('ছবি সেভ করতে স্টোরেজের অনুমতি লাগবে');
        return;
      }
      showToast(result.native ? `ছবি সেভ হয়েছে: ${result.savedPath}` : 'ছবি ডাউনলোড হয়েছে', 3000);
    } catch (err) {
      console.error('Image export failed:', err);
      showToast('ছবি এক্সপোর্ট করতে সমস্যা হয়েছে');
    }
  };

  const handleRemoveStimulusImage = (imageId: string) => {
    setIsDirty(true);
    const pos = stimulusImageIds.indexOf(imageId);
    if (pos >= 0 && pos < stimulusTopCount) setStimulusTopCount((n) => Math.max(0, n - 1));
    setStimulusImageIds((prev) => prev.filter((id) => id !== imageId));
  };

  // ---- Solution = ordered list of text boxes and pictures ----
  const changeSolutionParts = (tempId: string, fn: (parts: SolutionPart[]) => SolutionPart[]) => {
    setIsDirty(true);
    setQuestionBlocks((prev) =>
      prev.map((b) => (b.tempId === tempId ? applyParts(b, withTrailingText(fn(b.solutionParts))) : b))
    );
  };

  const solutionPickRef = useRef<{ tempId: string; position: 'start' | 'end' } | null>(null);
  const solutionFileInputRef = useRef<HTMLInputElement>(null);

  const pickSolutionImages = (tempId: string, position: 'start' | 'end') => {
    solutionPickRef.current = { tempId, position };
    solutionFileInputRef.current?.click();
  };

  const handleSolutionFilesChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    const target = solutionPickRef.current;
    if (!files || files.length === 0 || !target) return;
    const picked = Array.from(files);
    e.target.value = '';

    const newParts: SolutionPart[] = [];
    for (const file of picked) {
      try {
        const { blob, fileName } = await compressImageToWebP(file, 800, 0.8);
        const imageId = await saveImageBlob(blob, fileName);
        const previewUrl = URL.createObjectURL(blob);
        newParts.push({ kind: 'image', id: imageId });
        setSolutionImageUrls((prev) => ({ ...prev, [imageId]: previewUrl }));
      } catch (err) {
        console.error('Solution image upload failed:', err);
        showToast('ছবি আপলোড করতে সমস্যা হয়েছে');
      }
    }
    if (newParts.length === 0) return;

    changeSolutionParts(target.tempId, (parts) => {
      if (target.position === 'start') return [...newParts, ...parts];
      // end: go in front of the empty last box so a fresh box stays ready below the picture
      const last = parts[parts.length - 1];
      if (last && last.kind === 'text' && last.text === '') {
        return [...parts.slice(0, -1), ...newParts, last];
      }
      return [...parts, ...newParts, { kind: 'text', text: '' }];
    });
  };

  const handleRemoveSolutionImage = (tempId: string, imageId: string) =>
    changeSolutionParts(tempId, (parts) => parts.filter((p) => !(p.kind === 'image' && p.id === imageId)));

  const handleSolutionTextChange = (tempId: string, partIndex: number, text: string) =>
    changeSolutionParts(tempId, (parts) =>
      parts.map<SolutionPart>((p, i) => (i === partIndex && p.kind === 'text' ? { kind: 'text', text } : p))
    );

  const handleAddSolutionBox = (tempId: string) =>
    changeSolutionParts(tempId, (parts) => [...parts, { kind: 'text', text: '' }]);

  const handleRemoveSolutionBox = (tempId: string, partIndex: number) =>
    changeSolutionParts(tempId, (parts) => parts.filter((_, i) => i !== partIndex));

  // BoardTag string saved on the stimulus (union of the stimulus + every question's boards)
  const computedBoardTag = useMemo(() => {
    const merged: BoardUsage[] = [];
    const all = [stimulusBoards, ...questionBlocks.map((b) => b.usedInBoards || [])];
    all.forEach((list) =>
      list.forEach((u) => {
        const ex = merged.find((m) => m.board === u.board);
        if (ex) ex.years = Array.from(new Set([...ex.years, ...u.years])).sort((x, y) => x - y);
        else merged.push({ board: u.board, years: [...u.years] });
      })
    );
    if (merged.length === 0) return '';
    return merged
      .map((b) => `${b.board}'${b.years.map((y: number) => String(y).slice(-2)).join(',')}`)
      .join(', ');
  }, [stimulusBoards, questionBlocks]);

  // Add Question Block
  const handleAddQuestionBlock = () => {
    setIsDirty(true);
    const existingTypes = questionBlocks.map((b) => b.type);
    let defaultType: QuestionType = 'ক';
    if (!existingTypes.includes('ক')) defaultType = 'ক';
    else if (!existingTypes.includes('খ')) defaultType = 'খ';
    else if (!existingTypes.includes('গ')) defaultType = 'গ';
    else if (!existingTypes.includes('ঘ')) defaultType = 'ঘ';

    const newBlock: QuestionFormBlock = {
      tempId: `new-block-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type: defaultType,
      marks: DEFAULT_MARKS_BY_TYPE[defaultType] || 2,
      questionText: '',
      solutionText: '',
      solutionImageIds: [],
      solutionParts: emptyParts(),
      answerText: '',
      rating: 3,
      usedInBoards: [],
    };

    setQuestionBlocks((prev) => [...prev, newBlock]);
  };

  // Remove Question Block
  const handleRemoveQuestionBlock = (index: number) => {
    if (questionBlocks.length <= 1) {
      showToast('কমপক্ষে ১টি প্রশ্ন ব্লক থাকতে হবে');
      return;
    }

    setIsDirty(true);
    const targetBlock = questionBlocks[index];
    if (targetBlock.id) {
      setDeletedQuestionIds((prev) => [...prev, targetBlock.id!]);
    }

    setQuestionBlocks((prev) => prev.filter((_, i) => i !== index));
  };

  // Auto-arrange blocks in ক → খ → গ → ঘ order (stable: same type keeps its current order)
  const handleSortBlocksByType = () => {
    const rank: Record<string, number> = { ক: 0, খ: 1, গ: 2, ঘ: 3 };
    const sorted = [...questionBlocks].sort((a, b) => (rank[a.type] ?? 9) - (rank[b.type] ?? 9));
    if (sorted.every((b, i) => b.tempId === questionBlocks[i].tempId)) {
      showToast('প্রশ্নগুলো আগে থেকেই ক-খ-গ-ঘ ক্রমে আছে');
      return;
    }
    setIsDirty(true);
    setQuestionBlocks(sorted);
    showToast('ক-খ-গ-ঘ ক্রমে সাজানো হয়েছে');
  };

  // Update Question Block Field
  const updateQuestionBlock = <K extends keyof QuestionBlockInput>(
    index: number,
    field: K,
    val: QuestionBlockInput[K]
  ) => {
    setIsDirty(true);
    setQuestionBlocks((prev) => {
      const next = [...prev];
      const current = next[index];

      // Auto update marks when type changes if marks was at default
      if (field === 'type') {
        const newType = val as QuestionType;
        const prevDefault = DEFAULT_MARKS_BY_TYPE[current.type];
        if (current.marks === prevDefault) {
          next[index] = {
            ...current,
            type: newType,
            marks: DEFAULT_MARKS_BY_TYPE[newType] || current.marks,
          };
          return next;
        }
      }

      next[index] = { ...current, [field]: val };
      return next;
    });

    if (field === 'questionText') {
      const targetId = questionBlocks[index].tempId;
      if (errors.questions?.[targetId]) {
        setErrors((prev) => ({
          ...prev,
          questions: { ...prev.questions, [targetId]: '' },
        }));
      }
    }
  };

  // Save Validation & Action
  const handleSave = async () => {
    const newErrors: {
      topic?: string;
      stimulus?: string;
      questions?: Record<string, string>;
    } = {};

    if (!selectedTopicId) {
      newErrors.topic = 'টপিক বাছুন';
      // The hierarchy card is hidden in Minimum mode — show it so the topic can be picked
      if (!isFull) setEditorMode('full');
      setHierarchyOpen(true);
    }

    if (!stimulusText.trim()) {
      newErrors.stimulus = 'উদ্দীপক লিখুন';
    }

    const questionErrors: Record<string, string> = {};
    questionBlocks.forEach((q) => {
      if (!q.questionText.trim()) {
        questionErrors[q.tempId] = 'প্রশ্নের লেখা দিন';
      }
    });

    if (Object.keys(questionErrors).length > 0) {
      newErrors.questions = questionErrors;
    }

    if (newErrors.topic || newErrors.stimulus || newErrors.questions) {
      setErrors(newErrors);
      showToast('অনুগ্রহ করে প্রয়োজনীয় ঘরগুলো পূরণ করুন');
      return;
    }

    setLoading(true);
    try {
      // Synchronize usedInBoards with chips for each question
      const questionsWithBoards: QuestionBlockInput[] = questionBlocks.map((q) => {
        const sol = serializeSolution(q.solutionParts);
        return {
        id: q.id,
        type: q.type,
        marks: Number(q.marks) || 1,
        questionText: q.questionText.trim(),
        solutionText: sol.text,
        solutionImageIds: sol.imageIds,
        answerText: q.answerText?.trim() || '',
        rating: q.rating || 3,
        usedInBoards: q.usedInBoards || [],
        };
      });

      await saveQuestionGroup({
        stimulusId,
        topicId: selectedTopicId,
        stimulusText: stimulusText.trim(),
        stimulusImageIds,
        stimulusImageTopCount: Math.min(stimulusTopCount, stimulusImageIds.length),
        boardTag: computedBoardTag,
        stimulusUsedInBoards: stimulusBoards,
        stimulusRating,
        reference: reference.trim(),
        questions: questionsWithBoards,
        deletedQuestionIds,
      });

      showToast('প্রশ্ন সেভ হয়েছে');
      setIsDirty(false);
      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Error saving question:', err);
      showToast('সংরক্ষণ ব্যর্থ হয়েছে');
    } finally {
      setLoading(false);
    }
  };

  // Close with Dirty Check
  const handleAttemptClose = () => {
    if (isDirty) {
      setShowExitConfirm(true);
    } else {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="question-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      {/* 390px Mobile Viewport Frame */}
      <div className="w-full max-w-[390px] h-full sm:h-[844px] bg-[#F2F4F8] text-[#1B1F2A] flex flex-col relative overflow-hidden shadow-2xl sm:rounded-[32px] border border-[#D5D9E2]">
        
        {/* Header */}
        <header className="sticky top-0 z-30 bg-[#3B4FD8] text-white px-4 h-14 flex items-center justify-between shadow-md shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              aria-label="বন্ধ করুন"
              onClick={handleAttemptClose}
              className="min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center rounded-full hover:bg-white/10 active:bg-white/20 transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
            <h2 id="question-modal-title" className="text-[0.9375rem] font-bold text-white truncate">
              {editQuestionId ? 'প্রশ্ন সম্পাদনা' : 'প্রশ্ন যোগ করো'}
            </h2>
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            {isDirty && (
              <span className="mr-1 text-[0.625rem] bg-amber-400 text-amber-950 font-bold px-1.5 py-0.5 rounded-full shadow-2xs">
                অসংরক্ষিত
              </span>
            )}
            <button
              type="button"
              aria-label="আনডু (পূর্বাবস্থায়)"
              title="আনডু"
              disabled={!canUndo || loading}
              onClick={handleUndo}
              style={{ minHeight: 0, height: 36, width: 36 }}
              className="flex items-center justify-center rounded-full text-white hover:bg-white/10 active:bg-white/20 disabled:opacity-35 disabled:pointer-events-none transition-colors"
            >
              <Undo2 className="w-[18px] h-[18px]" />
            </button>
            <button
              type="button"
              aria-label="রিডু (আবার করুন)"
              title="রিডু"
              disabled={!canRedo || loading}
              onClick={handleRedo}
              style={{ minHeight: 0, height: 36, width: 36 }}
              className="flex items-center justify-center rounded-full text-white hover:bg-white/10 active:bg-white/20 disabled:opacity-35 disabled:pointer-events-none transition-colors"
            >
              <Redo2 className="w-[18px] h-[18px]" />
            </button>
            <button
              type="button"
              aria-label="প্রশ্ন সেভ করুন"
              title="সেভ"
              disabled={loading}
              onClick={handleSave}
              style={{ minHeight: 0, height: 36, width: 36 }}
              className="ml-0.5 flex items-center justify-center rounded-full bg-white text-[#3B4FD8] shadow-sm hover:bg-[#EEF2FF] active:bg-[#E0E7FF] disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <span className="w-4 h-4 rounded-full border-2 border-[#3B4FD8]/30 border-t-[#3B4FD8] animate-spin" />
              ) : (
                <Check className="w-5 h-5" strokeWidth={3} />
              )}
            </button>
          </div>
        </header>

        {/* Mode switch: Minimum (default) | Full Editor */}
        <div className="shrink-0 bg-white border-b border-[#D5D9E2] px-4 py-1.5">
          <div
            role="tablist"
            aria-label="এডিটর মোড"
            className="grid grid-cols-2 gap-0.5 p-0.5 rounded-lg bg-[#F2F4F8] border border-[#D5D9E2]"
          >
            {(['minimum', 'full'] as EditorMode[]).map((m) => {
              const active = editorMode === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setEditorMode(m)}
                  style={{ minHeight: 0, height: 26 }}
                  className={`rounded-md text-[0.6875rem] font-bold transition-colors ${
                    active ? 'bg-[#3B4FD8] text-white shadow-sm' : 'text-[#2A3BB0] hover:bg-white'
                  }`}
                >
                  {m === 'minimum' ? 'Minimum' : 'Full Editor'}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Form Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 pb-6">
          {/* Hidden file input shared by "ছবি বদলান" (Full Editor) */}
          <input ref={replaceInputRef} type="file" accept="image/*" onChange={handleReplaceFile} className="hidden" />
          {/* Hidden picker for the solution pictures (start / end of a solution) */}
          <input
            ref={solutionFileInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={handleSolutionFilesChosen}
            className="hidden"
          />

          {/* Section 1: Subject, Chapter, Topic Selection — Full Editor only */}
          {isFull && (
            <section
              className={`bg-white rounded-2xl px-4 border shadow-xs ${
                errors.topic ? 'border-red-400' : 'border-[#D5D9E2]'
              } ${hierarchyOpen ? 'py-3 space-y-3.5' : 'py-1'}`}
            >
              <button
                type="button"
                aria-expanded={hierarchyOpen}
                aria-label={hierarchyOpen ? 'বিষয়, অধ্যায় ও টপিক বন্ধ করুন' : 'বিষয়, অধ্যায় ও টপিক খুলুন'}
                onClick={() => setHierarchyOpen((v) => !v)}
                style={{ minHeight: 0, height: hierarchyOpen ? 30 : 34 }}
                className={`w-full flex items-center gap-2 text-xs font-bold text-[#2A3BB0] ${
                  hierarchyOpen ? 'border-b border-[#F2F4F8]' : ''
                }`}
              >
                <Layers className="w-4 h-4 text-[#3B4FD8] shrink-0" />
                <span className="shrink-0">বিষয়, অধ্যায় ও টপিক নির্বাচন</span>
                <span className="flex-1" />
                <ChevronDown
                  className={`w-4 h-4 text-[#64748B] shrink-0 transition-transform ${hierarchyOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {hierarchyOpen && (<>
              {/* Subject Select */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[#1B1F2A]">বিষয়</label>
                <div className="relative">
                  <select
                    value={selectedSubjectId}
                    onChange={(e) => handleSubjectChange(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 pr-8 py-2.5 rounded-xl border border-[#D5D9E2] bg-white text-xs font-medium text-[#1B1F2A] appearance-none focus:outline-none focus:ring-2 focus:ring-[#3B4FD8]"
                  >
                    <option value="">-- বিষয় নির্বাচন করুন --</option>
                    {allSubjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {toBn(s.order)}. {s.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-[#64748B] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Chapter Select */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[#1B1F2A]">অধ্যায়</label>
                <div className="relative">
                  <select
                    value={selectedChapterId}
                    disabled={!selectedSubjectId}
                    onChange={(e) => handleChapterChange(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 pr-8 py-2.5 rounded-xl border border-[#D5D9E2] bg-white text-xs font-medium text-[#1B1F2A] appearance-none focus:outline-none focus:ring-2 focus:ring-[#3B4FD8] disabled:bg-[#F2F4F8] disabled:text-[#94A3B8]"
                  >
                    <option value="">-- অধ্যায় নির্বাচন করুন --</option>
                    {filteredChapters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {toBn(c.order)}. {c.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-[#64748B] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Topic Select */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[#1B1F2A]">টপিক *</label>
                <div className="relative">
                  <select
                    value={selectedTopicId}
                    disabled={!selectedChapterId}
                    onChange={(e) => handleTopicChange(e.target.value)}
                    className={`w-full min-h-[44px] px-3.5 pr-8 py-2.5 rounded-xl border text-xs font-medium appearance-none focus:outline-none focus:ring-2 ${
                      errors.topic
                        ? 'border-red-500 bg-red-50/30 focus:ring-red-400 text-red-900'
                        : 'border-[#D5D9E2] bg-white text-[#1B1F2A] focus:ring-[#3B4FD8]'
                    } disabled:bg-[#F2F4F8] disabled:text-[#94A3B8]`}
                  >
                    <option value="">-- টপিক নির্বাচন করুন --</option>
                    {filteredTopics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {toBn(t.order)}. {t.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-[#64748B] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                {errors.topic && (
                  <p className="text-xs text-red-600 font-semibold flex items-center gap-1 pt-0.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{errors.topic}</span>
                  </p>
                )}
              </div>
              </>)}
            </section>
          )}

          {/* Section 2: Stimulus (উদ্দীপক) — controls row, board chips, text, picture "+", reference */}
          <section className="bg-white rounded-2xl p-4 border border-[#D5D9E2] shadow-xs space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-bold text-[#2A3BB0] min-w-0">
                <HelpCircle className="w-4 h-4 text-[#3B4FD8] shrink-0" />
                <span className="truncate">উদ্দীপক *</span>
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <BoardSelect
                  ariaLabel="উদ্দীপকটি কোন বোর্ডে এসেছে"
                  options={allBoardOptions}
                  onPick={(board) => setYearPicker({ target: { kind: 'stimulus' }, board })}
                  onAddBoard={() => setShowAddBoard(true)}
                />
                <EyeToggle open={stimulusPreviewOpen} onClick={() => setStimulusPreviewOpen((v) => !v)} />
                <RatingSelect
                  value={stimulusRating}
                  ariaLabel="উদ্দীপকের রেটিং"
                  onChange={(v) => {
                    setIsDirty(true);
                    setStimulusRating(v);
                  }}
                />
                {/* picture at the START of the stimulus (above the text) */}
                <AddImageButton
                  ariaLabel="উদ্দীপকের শুরুতে ছবি যোগ করুন"
                  title="উদ্দীপকের শুরুতে ছবি"
                  onClick={() => stimulusTopInputRef.current?.click()}
                />
              </div>
            </div>

            {/* Boards this stimulus came in — the line right under board / eye / rating */}
            <BoardChips
              chips={stimulusBoards}
              onRemove={(board, year) => removeBoardYear({ kind: 'stimulus' }, board, year)}
            />

            {/* pictures that sit above the stimulus text */}
            {splitStimulusImages(stimulusImageIds, stimulusTopCount).top.length > 0 && (
              <ImageStrip
                hideAdd
                ids={splitStimulusImages(stimulusImageIds, stimulusTopCount).top}
                urls={stimulusImageUrls}
                fullFeatures={isFull}
                addAriaLabel="উদ্দীপকের শুরুতে ছবি যোগ করুন"
                onAdd={() => {}}
                onRemove={handleRemoveStimulusImage}
                onReplace={(id) => startReplace({ kind: 'stimulus', imageId: id })}
                onExport={(id) => handleExportImage(id, stimulusImageUrls)}
                onOpenViewer={(i) => openViewer(splitStimulusImages(stimulusImageIds, stimulusTopCount).top, stimulusImageUrls, i)}
              />
            )}

            <LatexEditor
              value={stimulusText}
              onChange={(val) => {
                setIsDirty(true);
                setStimulusText(val);
                if (errors.stimulus) setErrors((prev) => ({ ...prev, stimulus: undefined }));
              }}
              rows={isFull ? 4 : 2}
              showToolbar={isFull}
              showPreview={false}
              placeholder="এখানে উদ্দীপকের বিবরণ ও গাণিতিক সূত্র লিখুন..."
            />
            {errors.stimulus && (
              <p className="text-xs text-red-600 font-semibold flex items-center gap-1 pt-0.5">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{errors.stimulus}</span>
              </p>
            )}

            {stimulusPreviewOpen && <LivePreview text={stimulusText} />}

            {/* Stimulus pictures below the text: just an add-picture icon (no text) */}
            <ImageStrip
              ids={splitStimulusImages(stimulusImageIds, stimulusTopCount).bottom}
              urls={stimulusImageUrls}
              fullFeatures={isFull}
              addAriaLabel="উদ্দীপকে ছবি যোগ করুন"
              onAdd={() => stimulusFileInputRef.current?.click()}
              onRemove={handleRemoveStimulusImage}
              onReplace={(id) => startReplace({ kind: 'stimulus', imageId: id })}
              onExport={(id) => handleExportImage(id, stimulusImageUrls)}
              onOpenViewer={(i) => openViewer(splitStimulusImages(stimulusImageIds, stimulusTopCount).bottom, stimulusImageUrls, i)}
            />
            <input
              ref={stimulusFileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => handleUploadStimulusImages(e, 'bottom')}
              className="hidden"
            />
            <input
              ref={stimulusTopInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => handleUploadStimulusImages(e, 'top')}
              className="hidden"
            />

            {/* Reference: only the small box (Minimum + Full Editor) */}
            <input
              type="text"
              aria-label="রেফারেন্স"
              value={reference}
              onChange={(e) => {
                setIsDirty(true);
                setReference(e.target.value);
              }}
              placeholder="যেমন: রেফারেন্স লিখুন"
              style={{ height: 36 }}
              className="w-full px-3 rounded-lg border border-[#D5D9E2] bg-white text-xs text-[#1B1F2A] focus:outline-none focus:ring-2 focus:ring-[#3B4FD8]"
            />
          </section>

          {/* Section 3: Question Blocks (গ, ঘ …) */}
          <section className="space-y-4">
            {isFull && (
              <div className="flex items-center justify-between text-xs font-bold text-[#1B1F2A] px-1">
                <span>প্রশ্ন তালিকা ({toBn(questionBlocks.length)}টি প্রশ্ন)</span>
                {questionBlocks.length > 1 ? (
                  <button
                    type="button"
                    aria-label="ক খ গ ঘ ক্রমে সাজাও"
                    onClick={handleSortBlocksByType}
                    className="min-h-[36px] px-3 rounded-lg border border-[#D5D9E2] bg-white hover:bg-[#EEF2FF] active:bg-[#E0E7FF] text-[#2A3BB0] text-[0.6875rem] font-bold flex items-center gap-1.5"
                  >
                    <ArrowUpDown className="w-3.5 h-3.5" />
                    <span>ক-খ-গ-ঘ সাজাও</span>
                  </button>
                ) : (
                  <span className="text-[#64748B] text-[0.6875rem] font-normal">গ ও ঘ বা অন্য প্রকার</span>
                )}
              </div>
            )}

            {questionBlocks.map((block, index) => {
              const qError = errors.questions?.[block.tempId];
              const solPreviewOpen = !!solutionPreviewOpen[block.tempId];
              const qPreviewOpen = !!questionPreviewOpen[block.tempId];
              const aPreviewOpen = !!answerPreviewOpen[block.tempId];
              const solutionImageList = block.solutionParts.flatMap((p) => (p.kind === 'image' ? [p.id] : []));

              // board picker + eye (solution live preview) + rating of this question (গ / ঘ …)
              const questionControls = (
                <div className="flex items-center gap-1 shrink-0">
                  <BoardSelect
                    ariaLabel={`প্রশ্ন (${block.type}) কোন বোর্ডে এসেছে`}
                    options={allBoardOptions}
                    onPick={(board) => setYearPicker({ target: { kind: 'question', index }, board })}
                    onAddBoard={() => setShowAddBoard(true)}
                  />
                  <EyeToggle
                    open={qPreviewOpen}
                    onClick={() => setQuestionPreviewOpen((prev) => ({ ...prev, [block.tempId]: !qPreviewOpen }))}
                  />
                  <RatingSelect
                    value={block.rating || 3}
                    ariaLabel={`প্রশ্ন (${block.type}) এর রেটিং`}
                    onChange={(v) => updateQuestionBlock(index, 'rating', v)}
                  />
                </div>
              );
              const blockBoardChips = (
                <BoardChips
                  chips={block.usedInBoards || []}
                  onRemove={(board, year) => removeBoardYear({ kind: 'question', index }, board, year)}
                />
              );

              return (
                <div
                  key={block.tempId}
                  id={`qblock-${block.tempId}`}
                  className="bg-white rounded-2xl p-4 border border-[#D5D9E2] shadow-xs space-y-3"
                >
                  {/* Block Header */}
                  <div className="flex items-center justify-between pb-2.5 border-b border-[#F2F4F8]">
                    {isFull ? (
                      <div className="flex items-center justify-between gap-1.5 w-full">
                        <div className="flex items-center gap-1 min-w-0">
                          {/* Type Dropdown */}
                          <select
                            aria-label="প্রশ্নের ধরন"
                            value={block.type}
                            onChange={(e) => updateQuestionBlock(index, 'type', e.target.value as QuestionType)}
                            style={{ height: CTRL_H, minHeight: 0 }}
                            className="px-1.5 rounded-md bg-[#3B4FD8] text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#3B4FD8]/50"
                          >
                            <option value="ক">ক</option>
                            <option value="খ">খ</option>
                            <option value="গ">গ</option>
                            <option value="ঘ">ঘ</option>
                          </select>

                          {/* Marks: just the number */}
                          <input
                            type="number"
                            min={1}
                            max={20}
                            aria-label="প্রশ্নের নম্বর"
                            title="নম্বর"
                            value={block.marks}
                            onChange={(e) =>
                              updateQuestionBlock(index, 'marks', Math.max(1, parseInt(e.target.value, 10) || 1))
                            }
                            style={{ height: CTRL_H, minHeight: 0 }}
                            className="w-9 px-0.5 text-center font-bold text-xs rounded-md border border-[#D5D9E2] bg-white text-[#1B1F2A] focus:outline-none focus:ring-2 focus:ring-[#3B4FD8] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          />
                        </div>

                        {/* board / eye / rating / delete — icons only */}
                        <div className="flex items-center gap-1 shrink-0">
                          {questionControls}
                          <button
                            type="button"
                            aria-label="এই প্রশ্ন ব্লকটি মুছে ফেলুন"
                            title="মুছুন"
                            disabled={questionBlocks.length <= 1}
                            onClick={() => setDeleteBlockIndex(index)}
                            style={{ minHeight: 0, height: CTRL_H, width: CTRL_H }}
                            className="shrink-0 flex items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 active:bg-red-200 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2 w-full">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="min-h-[32px] min-w-[32px] px-3 rounded-lg bg-[#3B4FD8] text-white text-xs font-bold flex items-center justify-center">
                            {block.type}
                          </span>
                          <span className="text-[0.6875rem] font-semibold text-[#64748B] whitespace-nowrap">
                            {toBn(block.marks)} নম্বর
                          </span>
                        </div>
                        {/* board / eye (question preview) / rating — on the same line as গ / ঘ */}
                        {questionControls}
                      </div>
                    )}

                  </div>

                  {/* Question text — no title / hint text; board chips (newest on the right) sit right above the box */}
                  <div className="space-y-1.5">
                    {blockBoardChips}
                    <LatexEditor
                      value={block.questionText}
                      onChange={(val) => updateQuestionBlock(index, 'questionText', val)}
                      rows={isFull ? 3 : 2}
                      showToolbar={isFull}
                      showHint={false}
                      showPreview={false}
                      placeholder="প্রশ্নের মূল বক্তব্য লিখুন..."
                    />
                    {qError && (
                      <p className="text-xs text-red-600 font-semibold flex items-center gap-1 pt-0.5">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>{qError}</span>
                      </p>
                    )}
                    {qPreviewOpen && <LivePreview text={block.questionText} title="প্রশ্নের প্রিভিউ" />}
                  </div>

                  {/* Solution: header (preview eye + picture at the start), ordered text boxes / pictures, add buttons */}
                  <div className="space-y-2 pt-2.5 border-t border-[#F2F4F8]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="block text-xs font-bold text-[#2A3BB0]">সমাধান</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <EyeToggle
                          open={solPreviewOpen}
                          onClick={() => setSolutionPreviewOpen((prev) => ({ ...prev, [block.tempId]: !solPreviewOpen }))}
                        />
                        <AddImageButton
                          ariaLabel={`সমাধানের শুরুতে ছবি যোগ করুন (${block.type})`}
                          title="সমাধানের শুরুতে ছবি"
                          onClick={() => pickSolutionImages(block.tempId, 'start')}
                        />
                      </div>
                    </div>

                    {block.solutionParts.map((part, pIdx) => {
                      if (part.kind === 'image') {
                        return (
                          <PartImage
                            key={`img-${part.id}`}
                            id={part.id}
                            url={solutionImageUrls[part.id]}
                            fullFeatures={isFull}
                            onRemove={() => handleRemoveSolutionImage(block.tempId, part.id)}
                            onReplace={() => startReplace({ kind: 'solution', tempId: block.tempId, imageId: part.id })}
                            onExport={() => handleExportImage(part.id, solutionImageUrls)}
                            onOpenViewer={() =>
                              openViewer(solutionImageList, solutionImageUrls, Math.max(0, solutionImageList.indexOf(part.id)))
                            }
                          />
                        );
                      }
                      const textBoxCount = block.solutionParts.filter((p) => p.kind === 'text').length;
                      return (
                        <div key={`txt-${pIdx}`} className="relative">
                          <LatexEditor
                            value={part.text}
                            onChange={(val) => handleSolutionTextChange(block.tempId, pIdx, val)}
                            rows={isFull ? 3 : 2}
                            showToolbar={isFull}
                            showPreview={false}
                            placeholder={pIdx === 0 ? 'ধাপে ধাপে সমাধান লিখুন...' : 'সমাধানের পরের অংশ লিখুন...'}
                          />
                          {textBoxCount > 1 && (
                            <button
                              type="button"
                              aria-label="এই সমাধান বক্সটি মুছুন"
                              title="বক্স মুছুন"
                              onClick={() => handleRemoveSolutionBox(block.tempId, pIdx)}
                              style={{ minHeight: 0 }}
                              className="absolute -top-2 -right-1 z-10 w-6 h-6 rounded-full bg-white border border-red-200 text-red-500 flex items-center justify-center shadow-sm hover:bg-red-50"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}

                    {/* picture at the end + one more solution box */}
                    <div className="flex items-center gap-1.5">
                      <AddImageButton
                        ariaLabel={`সমাধানে ছবি যোগ করুন (${block.type})`}
                        title="সমাধানে ছবি যোগ"
                        onClick={() => pickSolutionImages(block.tempId, 'end')}
                      />
                      <button
                        type="button"
                        aria-label={`নতুন সমাধান বক্স যোগ করুন (${block.type})`}
                        title="নতুন সমাধান বক্স"
                        onClick={() => handleAddSolutionBox(block.tempId)}
                        style={{ minHeight: 0, height: CTRL_H, width: CTRL_H }}
                        className="shrink-0 flex items-center justify-center rounded-md border border-dashed border-[#3B4FD8] bg-[#EEF2FF] hover:bg-[#E0E7FF] active:bg-[#C7D2FE] text-[#3B4FD8] transition-colors"
                      >
                        <SquarePlus className="w-4 h-4" />
                      </button>
                    </div>

                    {solPreviewOpen && (
                      <LivePreview title="সমাধানের প্রিভিউ">
                        {block.solutionText.trim() || block.solutionImageIds.length > 0 ? (
                          <SolutionView
                            text={block.solutionText}
                            imageIds={block.solutionImageIds}
                            imageUrls={solutionImageUrls}
                            textClassName="text-sm text-[#1B1F2A] dark:text-slate-100 leading-relaxed"
                          />
                        ) : (
                          <div className="text-xs text-[#64748B] dark:text-slate-400 italic">
                            উপরে লিখলে এখানে প্রিভিউ দেখা যাবে।
                          </div>
                        )}
                      </LivePreview>
                    )}
                  </div>

                  {/* Short Answer — Full Editor only */}
                  {isFull && (
                    <div className="space-y-1 pt-2.5 border-t border-[#F2F4F8]">
                      <div className="flex items-center justify-between gap-2">
                        <label className="block text-xs font-semibold text-[#1B1F2A]">সংক্ষিপ্ত উত্তর (ঐচ্ছিক)</label>
                        <EyeToggle
                          open={aPreviewOpen}
                          onClick={() => setAnswerPreviewOpen((prev) => ({ ...prev, [block.tempId]: !aPreviewOpen }))}
                        />
                      </div>
                      <input
                        type="text"
                        value={block.answerText || ''}
                        onChange={(e) => updateQuestionBlock(index, 'answerText', e.target.value)}
                        placeholder="যেমন: -5.78 × 10⁻¹⁰ J kg⁻¹"
                        className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[#D5D9E2] bg-[#F2F4F8]/40 text-xs text-[#1B1F2A] focus:outline-none focus:ring-2 focus:ring-[#3B4FD8]"
                      />
                      {aPreviewOpen && <LivePreview text={block.answerText || ''} title="সংক্ষিপ্ত উত্তরের প্রিভিউ" />}
                    </div>
                  )}
                </div>
              );
            })}

            {/* "+ আরও প্রশ্ন যোগ করো" — Full Editor only */}
            {isFull && (
              <button
                type="button"
                aria-label="আরও প্রশ্ন যোগ করো"
                onClick={handleAddQuestionBlock}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl border-2 border-dashed border-[#3B4FD8] bg-[#EEF2FF]/50 hover:bg-[#EEF2FF] text-[#2A3BB0] text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-2xs"
              >
                <Plus className="w-4 h-4 text-[#3B4FD8]" />
                <span>+ আরও প্রশ্ন যোগ করো</span>
              </button>
            )}
          </section>
        </div>

        {/* Add a new custom board */}
        {showAddBoard && (
          <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center px-5">
            <div className="w-full rounded-2xl bg-white p-4 space-y-3 shadow-2xl">
              <div className="text-sm font-bold text-[#2A3BB0]">নতুন বোর্ড যুক্ত করুন</div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newBoardCode}
                  onChange={(e) => setNewBoardCode(e.target.value)}
                  placeholder="কোড (যেমন: CTB)"
                  className="w-28 min-h-[44px] px-3 py-2 rounded-xl border border-[#D5D9E2] bg-white text-xs text-[#1B1F2A] font-medium focus:outline-none focus:ring-2 focus:ring-[#3B4FD8]"
                />
                <input
                  type="text"
                  value={newBoardName}
                  onChange={(e) => setNewBoardName(e.target.value)}
                  placeholder="নাম (যেমন: চট্টগ্রাম বোর্ড)"
                  className="flex-1 min-w-0 min-h-[44px] px-3 py-2 rounded-xl border border-[#D5D9E2] bg-white text-xs text-[#1B1F2A] font-medium focus:outline-none focus:ring-2 focus:ring-[#3B4FD8]"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveNewBoard}
                  className="flex-1 min-h-[44px] rounded-xl bg-[#3B4FD8] hover:bg-[#2A3BB0] text-white text-xs font-semibold"
                >
                  সংরক্ষণ
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddBoard(false);
                    setNewBoardCode('');
                    setNewBoardName('');
                  }}
                  className="flex-1 min-h-[44px] rounded-xl border border-[#D5D9E2] bg-white text-[#1B1F2A] text-xs font-semibold"
                >
                  বাতিল
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Year window — opens after a board is picked from the dropdown */}
        {yearPicker && (
          <BoardYearWindow
            board={yearPicker.board}
            boardLabel={allBoardOptions.find((b) => b.value === yearPicker.board)?.label || yearPicker.board}
            addedYears={getBoardChips(yearPicker.target).find((c) => c.board === yearPicker.board)?.years || []}
            isCustom={customBoards.some((b) => b.code === yearPicker.board)}
            onPickYear={(year) => {
              addBoardYear(yearPicker.target, yearPicker.board, year);
              setYearPicker(null);
            }}
            onInvalidYear={() => showToast('সঠিক সাল লিখুন (যেমন: ২০২৫)')}
            onDeleteBoard={() => {
              handleDeleteCustomBoard(yearPicker.board);
              setYearPicker(null);
            }}
            onClose={() => setYearPicker(null)}
          />
        )}

        {/* Full-screen zoomable preview of a picture (Full Editor) */}
        <ImageViewerModal
          isOpen={!!viewer}
          images={viewer?.images || []}
          initialIndex={viewer?.index || 0}
          onClose={() => setViewer(null)}
        />

        {/* Small confirmation before a question block is deleted */}
        <ConfirmDialog
          isOpen={deleteBlockIndex !== null}
          title="প্রশ্নটি মুছবেন?"
          message={deleteBlockIndex !== null ? `(${questionBlocks[deleteBlockIndex]?.type || ''}) প্রশ্নটি মুছে ফেলা হবে।` : ''}
          confirmText="মুছুন"
          cancelText="না"
          isDestructive={true}
          onConfirm={() => {
            if (deleteBlockIndex !== null) handleRemoveQuestionBlock(deleteBlockIndex);
            setDeleteBlockIndex(null);
          }}
          onCancel={() => setDeleteBlockIndex(null)}
        />

        {/* Confirm Dialog for Unsaved Changes on Exit */}
        <ConfirmDialog
          isOpen={showExitConfirm}
          title="পরিবর্তন সংরক্ষিত হয়নি"
          message="আপনার করা পরিবর্তনগুলো সংরক্ষিত হয়নি। আপনি কি নিশ্চিত যে ফরম বন্ধ করে বের হতে চান?"
          confirmText="হ্যাঁ, বের হব"
          cancelText="না, থাকুন"
          isDestructive={true}
          onConfirm={() => {
            setShowExitConfirm(false);
            setIsDirty(false);
            onClose();
          }}
          onCancel={() => setShowExitConfirm(false)}
        />
      </div>
    </div>
  );
};

export default QuestionFormModal;
