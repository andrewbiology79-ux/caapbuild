import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LatexEditor } from './LatexEditor';
import { RichText } from './RichText';
import { ImageViewerModal } from './ImageViewerModal';
import { ConfirmDialog } from './ConfirmDialog';
import { useToast } from './Toast';
import { toBn, toEn } from '../utils/toBn';
import { useNavigation } from '../utils/navigation';
import { compressImageToWebP } from '../utils/imageCompressor';
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
  Image as ImageIcon,
  Trash2,
  Tag,
  Eye,
  EyeOff,
  RefreshCw,
  Maximize2,
  BookMarked,
  Layers,
  HelpCircle,
  Save,
  Check,
  AlertCircle,
  ChevronDown,
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

/** Small rating dropdown (1-5) placed next to the eye (live preview) button */
const RatingSelect: React.FC<{ value: number; onChange: (v: number) => void; ariaLabel: string }> = ({
  value,
  onChange,
  ariaLabel,
}) => (
  <select
    aria-label={ariaLabel}
    value={value || 3}
    onChange={(e) => onChange(parseInt(e.target.value, 10))}
    className="min-h-[40px] max-w-[116px] px-2 py-1 rounded-lg border border-[#FDE047] bg-[#FEF9C3] text-[#713F12] text-[0.6875rem] font-bold focus:outline-none focus:ring-2 focus:ring-[#3B4FD8]"
  >
    {RATING_OPTIONS.map((r) => (
      <option key={r.value} value={r.value}>
        {toBn(r.value)}★ {r.label}
      </option>
    ))}
  </select>
);

/** Eye button that toggles the live KaTeX preview */
const EyeToggle: React.FC<{ open: boolean; onClick: () => void }> = ({ open, onClick }) => (
  <button
    type="button"
    aria-label={open ? 'লাইভ প্রিভিউ বন্ধ করুন' : 'লাইভ প্রিভিউ দেখুন'}
    aria-pressed={open}
    onClick={onClick}
    className={`min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border transition-colors ${
      open
        ? 'bg-[#3B4FD8] border-[#3B4FD8] text-white'
        : 'bg-[#EEF2FF] border-[#D5D9E2] text-[#3B4FD8] hover:bg-[#E0E7FF]'
    }`}
  >
    {open ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
  </button>
);

/** Live KaTeX preview card shown when the eye button is on */
const LivePreview: React.FC<{ text: string }> = ({ text }) => (
  <div className="rounded-xl border border-[#D5D9E2] bg-[#F8FAFF] p-3.5 animate-in fade-in duration-150">
    <div className="flex items-center gap-1.5 text-[0.6875rem] font-semibold text-[#2A3BB0] pb-1.5 mb-2 border-b border-[#E2E8F0]">
      <Eye className="w-3.5 h-3.5" />
      <span>লাইভ প্রিভিউ (KaTeX)</span>
    </div>
    {text.trim() ? (
      <RichText text={text} className="text-sm" />
    ) : (
      <div className="text-xs text-[#64748B] italic">উপরে লিখলে এখানে প্রিভিউ দেখা যাবে।</div>
    )}
  </div>
);

interface BoardTagEditorProps {
  title: string;
  chips: BoardUsage[];
  onChange: (next: BoardUsage[]) => void;
  options: Array<{ value: string; label: string }>;
  customCodes: string[];
  onRequestAddBoard: () => void;
  onDeleteCustomBoard: (code: string) => void;
  onInvalidYear: () => void;
}

/** "কোন বোর্ডে এসেছে" — board + year chips for ONE section (উদ্দীপক / গ / ঘ …) */
const BoardTagEditor: React.FC<BoardTagEditorProps> = ({
  title,
  chips,
  onChange,
  options,
  customCodes,
  onRequestAddBoard,
  onDeleteCustomBoard,
  onInvalidYear,
}) => {
  const [board, setBoard] = useState<string>('DB');
  const [yearInput, setYearInput] = useState<string>('2025');

  const addChip = () => {
    const yearNum = parseInt(toEn(yearInput).trim(), 10);
    if (isNaN(yearNum) || yearNum < 1990 || yearNum > 2099) {
      onInvalidYear();
      return;
    }
    const existing = chips.find((c) => c.board === board);
    if (existing) {
      if (existing.years.includes(yearNum)) return;
      onChange(
        chips.map((c) => (c.board === board ? { ...c, years: [...c.years, yearNum].sort((a, b) => a - b) } : c))
      );
    } else {
      onChange([...chips, { board, years: [yearNum] }]);
    }
  };

  const removeChip = (b: string, y: number) => {
    onChange(
      chips
        .map((c) => (c.board === b ? { ...c, years: c.years.filter((x) => x !== y) } : c))
        .filter((c) => c.years.length > 0)
    );
  };

  return (
    <div className="pt-2.5 border-t border-[#F2F4F8] space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1B1F2A]">
        <Tag className="w-3.5 h-3.5 text-[#3B4FD8]" />
        <span>{title}</span>
      </div>
      <div className="flex items-center gap-2">
        <select
          aria-label="বোর্ড বাছুন"
          value={board}
          onChange={(e) => {
            if (e.target.value === '__add_new_board__') {
              onRequestAddBoard();
              return;
            }
            setBoard(e.target.value);
          }}
          className="flex-1 min-w-0 min-h-[44px] px-2.5 py-2 rounded-xl border border-[#D5D9E2] bg-white text-xs font-medium text-[#1B1F2A] focus:outline-none focus:ring-2 focus:ring-[#3B4FD8]"
        >
          {options.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
          <option value="__add_new_board__">+ নতুন বোর্ড যুক্ত করুন</option>
        </select>
        <input
          type="text"
          inputMode="numeric"
          aria-label="সাল"
          value={yearInput}
          onChange={(e) => setYearInput(e.target.value)}
          className="w-16 min-h-[44px] px-2 py-2 rounded-xl border border-[#D5D9E2] bg-white text-xs text-[#1B1F2A] text-center font-medium focus:outline-none focus:ring-2 focus:ring-[#3B4FD8]"
        />
        <button
          type="button"
          aria-label="বোর্ড যোগ করুন"
          onClick={addChip}
          className="min-h-[44px] px-3 py-2 rounded-xl bg-[#3B4FD8] hover:bg-[#2A3BB0] active:bg-[#202E91] text-white text-xs font-semibold shrink-0"
        >
          + যোগ
        </button>
      </div>

      {customCodes.includes(board) && (
        <button
          type="button"
          onClick={() => {
            onDeleteCustomBoard(board);
            setBoard('DB');
          }}
          className="text-[0.6875rem] font-medium text-red-600 underline"
        >
          এই বোর্ডটি তালিকা থেকে মুছুন ({board})
        </button>
      )}

      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {chips.length === 0 ? (
          <span className="text-xs text-[#64748B] italic">কোনো বোর্ড ট্যাগ যোগ করা হয়নি</span>
        ) : (
          chips.map((c) =>
            c.years.map((y) => (
              <span
                key={`${c.board}-${y}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#EEF2FF] text-[#2A3BB0] border border-[#D5D9E2] text-xs font-semibold"
              >
                <span>
                  {c.board}'{toBn(String(y).slice(-2))}
                </span>
                <button
                  type="button"
                  aria-label={`${c.board} ${y} ট্যাগ মুছুন`}
                  onClick={() => removeChip(c.board, y)}
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[#64748B] hover:text-red-600 hover:bg-white transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))
          )
        )}
      </div>
    </div>
  );
};

interface ImageStripProps {
  title: string;
  ids: string[];
  urls: Record<string, string>;
  /** Full Editor only: replace a picture / open a big preview */
  fullFeatures: boolean;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onReplace: (id: string) => void;
  onOpenViewer: (index: number) => void;
  addAriaLabel: string;
}

/** Picture upload row. Minimum = add / remove. Full Editor = also replace + big preview */
const ImageStrip: React.FC<ImageStripProps> = ({
  title,
  ids,
  urls,
  fullFeatures,
  onAdd,
  onRemove,
  onReplace,
  onOpenViewer,
  addAriaLabel,
}) => (
  <div className="pt-2.5 border-t border-[#F2F4F8] space-y-2.5">
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold text-[#1B1F2A]">{title}</span>
      <button
        type="button"
        aria-label={addAriaLabel}
        onClick={onAdd}
        className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-[#EEF2FF] hover:bg-[#E0E7FF] text-[#2A3BB0] text-xs font-semibold flex items-center gap-1.5 transition-colors"
      >
        <ImageIcon className="w-4 h-4 text-[#3B4FD8]" />
        <span>ছবি যোগ করো</span>
      </button>
    </div>

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
                    onClick={() => onReplace(imgId)}
                    className="flex-1 min-h-[36px] rounded-lg border border-[#D5D9E2] bg-white hover:bg-[#EEF2FF] text-[#2A3BB0] text-[0.6875rem] font-semibold flex items-center justify-center gap-1"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>বদলান</span>
                  </button>
                  <button
                    type="button"
                    aria-label="বড় প্রিভিউ দেখুন"
                    onClick={() => onOpenViewer(idx)}
                    className="flex-1 min-h-[36px] rounded-lg border border-[#D5D9E2] bg-white hover:bg-[#EEF2FF] text-[#2A3BB0] text-[0.6875rem] font-semibold flex items-center justify-center gap-1"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>বড় দেখুন</span>
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

interface QuestionFormBlock extends QuestionBlockInput {
  tempId: string; // Internal unique key for React lists
}

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

  // Full Editor: big image preview + replace
  const [viewer, setViewer] = useState<{ images: Array<{ url: string; alt?: string }>; index: number } | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceTarget, setReplaceTarget] = useState<
    { kind: 'stimulus'; imageId: string } | { kind: 'solution'; blockIndex: number; imageId: string } | null
  >(null);

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

  // Questions blocks state
  const [questionBlocks, setQuestionBlocks] = useState<QuestionFormBlock[]>([
    {
      tempId: 'initial-ga',
      type: 'গ',
      marks: 3,
      questionText: '',
      solutionText: '',
      solutionImageIds: [],
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
    setStimulusRating(3);
    setStimulusBoards([]);
    setReference('');
    setViewer(null);
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
        if (isMounted) setLoading(false);
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

  // Upload Stimulus Images with WebP 800px Canvas compression
  const handleUploadStimulusImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsDirty(true);
    for (let i = 0; i < files.length; i++) {
      try {
        const { blob, fileName } = await compressImageToWebP(files[i], 800, 0.8);
        const imageId = await saveImageBlob(blob, fileName);
        const previewUrl = URL.createObjectURL(blob);

        setStimulusImageIds((prev) => [...prev, imageId]);
        setStimulusImageUrls((prev) => ({ ...prev, [imageId]: previewUrl }));
      } catch (err) {
        console.error('Image upload failed:', err);
        showToast('ছবি আপলোড করতে সমস্যা হয়েছে');
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
        setQuestionBlocks((prev) => {
          const next = [...prev];
          const cur = next[target.blockIndex];
          if (!cur) return prev;
          next[target.blockIndex] = {
            ...cur,
            solutionImageIds: (cur.solutionImageIds || []).map((id) => (id === target.imageId ? newId : id)),
          };
          return next;
        });
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

  const handleRemoveStimulusImage = (imageId: string) => {
    setIsDirty(true);
    setStimulusImageIds((prev) => prev.filter((id) => id !== imageId));
  };

  // Upload Question Solution Images with WebP 800px Canvas compression
  const handleUploadSolutionImages = async (blockIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsDirty(true);
    const newImageIds: string[] = [];

    for (let i = 0; i < files.length; i++) {
      try {
        const { blob, fileName } = await compressImageToWebP(files[i], 800, 0.8);
        const imageId = await saveImageBlob(blob, fileName);
        const previewUrl = URL.createObjectURL(blob);

        newImageIds.push(imageId);
        setSolutionImageUrls((prev) => ({ ...prev, [imageId]: previewUrl }));
      } catch (err) {
        console.error('Solution image upload failed:', err);
        showToast('ছবি আপলোড করতে সমস্যা হয়েছে');
      }
    }

    setQuestionBlocks((prev) => {
      const next = [...prev];
      next[blockIndex] = {
        ...next[blockIndex],
        solutionImageIds: [...(next[blockIndex].solutionImageIds || []), ...newImageIds],
      };
      return next;
    });

    e.target.value = '';
  };

  const handleRemoveSolutionImage = (blockIndex: number, imageId: string) => {
    setIsDirty(true);
    setQuestionBlocks((prev) => {
      const next = [...prev];
      next[blockIndex] = {
        ...next[blockIndex],
        solutionImageIds: (next[blockIndex].solutionImageIds || []).filter((id) => id !== imageId),
      };
      return next;
    });
  };

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
      const questionsWithBoards: QuestionBlockInput[] = questionBlocks.map((q) => ({
        id: q.id,
        type: q.type,
        marks: Number(q.marks) || 1,
        questionText: q.questionText.trim(),
        solutionText: q.solutionText.trim(),
        solutionImageIds: q.solutionImageIds || [],
        answerText: q.answerText?.trim() || '',
        rating: q.rating || 3,
        usedInBoards: q.usedInBoards || [],
      }));

      await saveQuestionGroup({
        stimulusId,
        topicId: selectedTopicId,
        stimulusText: stimulusText.trim(),
        stimulusImageIds,
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="বন্ধ করুন"
              onClick={handleAttemptClose}
              className="min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center rounded-full hover:bg-white/10 active:bg-white/20 transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
            <h2 id="question-modal-title" className="text-base font-bold text-white truncate">
              {editQuestionId ? 'প্রশ্ন সম্পাদনা' : 'প্রশ্ন যোগ করো'}
            </h2>
          </div>

          <div className="flex items-center">
            {isDirty && (
              <span className="text-[0.6875rem] bg-amber-400 text-amber-950 font-bold px-2 py-0.5 rounded-full shadow-2xs">
                অসংরক্ষিত
              </span>
            )}
          </div>
        </header>

        {/* Mode switch: Minimum (default) | Full Editor */}
        <div className="shrink-0 bg-white border-b border-[#D5D9E2] px-4 py-2">
          <div
            role="tablist"
            aria-label="এডিটর মোড"
            className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#F2F4F8] border border-[#D5D9E2]"
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
                  className={`min-h-[40px] rounded-lg text-xs font-bold transition-colors ${
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
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 pb-28">
          {/* Hidden file input shared by "ছবি বদলান" (Full Editor) */}
          <input ref={replaceInputRef} type="file" accept="image/*" onChange={handleReplaceFile} className="hidden" />

          {/* Section 1: Subject, Chapter, Topic Selection — Full Editor only */}
          {isFull && (
            <section className="bg-white rounded-2xl p-4 border border-[#D5D9E2] shadow-xs space-y-3.5">
              <div className="flex items-center gap-2 pb-2 border-b border-[#F2F4F8] text-xs font-bold text-[#2A3BB0]">
                <Layers className="w-4 h-4 text-[#3B4FD8]" />
                <span>বিষয়, অধ্যায় ও টপিক নির্বাচন</span>
              </div>

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
            </section>
          )}

          {/* Section 2: Stimulus (উদ্দীপক) — text, eye preview, rating, images, board */}
          <section className="bg-white rounded-2xl p-4 border border-[#D5D9E2] shadow-xs space-y-3">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#F2F4F8]">
              <span className="flex items-center gap-1.5 text-xs font-bold text-[#2A3BB0] min-w-0">
                <HelpCircle className="w-4 h-4 text-[#3B4FD8] shrink-0" />
                <span className="truncate">উদ্দীপক *</span>
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <EyeToggle open={stimulusPreviewOpen} onClick={() => setStimulusPreviewOpen((v) => !v)} />
                <RatingSelect
                  value={stimulusRating}
                  ariaLabel="উদ্দীপকের রেটিং"
                  onChange={(v) => {
                    setIsDirty(true);
                    setStimulusRating(v);
                  }}
                />
              </div>
            </div>

            <LatexEditor
              value={stimulusText}
              onChange={(val) => {
                setIsDirty(true);
                setStimulusText(val);
                if (errors.stimulus) setErrors((prev) => ({ ...prev, stimulus: undefined }));
              }}
              rows={4}
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

            {/* Stimulus pictures */}
            <ImageStrip
              title="উদ্দীপকের ছবি"
              ids={stimulusImageIds}
              urls={stimulusImageUrls}
              fullFeatures={isFull}
              addAriaLabel="উদ্দীপকে ছবি যোগ করুন"
              onAdd={() => stimulusFileInputRef.current?.click()}
              onRemove={handleRemoveStimulusImage}
              onReplace={(id) => startReplace({ kind: 'stimulus', imageId: id })}
              onOpenViewer={(i) => openViewer(stimulusImageIds, stimulusImageUrls, i)}
            />
            <input
              ref={stimulusFileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleUploadStimulusImages}
              className="hidden"
            />

            {/* Which board did the stimulus come in? */}
            <BoardTagEditor
              title="উদ্দীপকটি কোন বোর্ডে এসেছে"
              chips={stimulusBoards}
              onChange={(next) => {
                setIsDirty(true);
                setStimulusBoards(next);
              }}
              options={allBoardOptions}
              customCodes={customBoards.map((b) => b.code)}
              onRequestAddBoard={() => setShowAddBoard(true)}
              onDeleteCustomBoard={handleDeleteCustomBoard}
              onInvalidYear={() => showToast('সঠিক সাল লিখুন (যেমন: ২০২৫)')}
            />
          </section>

          {/* Reference (Full Editor only) */}
          {isFull && (
            <section className="bg-white rounded-2xl p-4 border border-[#D5D9E2] shadow-xs space-y-2.5">
              <div className="flex items-center gap-2 pb-2 border-b border-[#F2F4F8] text-xs font-bold text-[#2A3BB0]">
                <BookMarked className="w-4 h-4 text-[#3B4FD8]" />
                <span>রেফারেন্স (প্রশ্নটি কোথা থেকে সংগ্রহ)</span>
              </div>
              <input
                type="text"
                value={reference}
                onChange={(e) => {
                  setIsDirty(true);
                  setReference(e.target.value);
                }}
                placeholder="যেমন: মেরি জি প্রশ্ন ব্যাংক"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[#D5D9E2] bg-white text-xs text-[#1B1F2A] focus:outline-none focus:ring-2 focus:ring-[#3B4FD8]"
              />
              <p className="text-[0.6875rem] text-[#64748B]">
                প্রশ্ন কার্ডের থ্রি ডট মেনুর "রেফারেন্স দেখুন" অপশনে এটি দেখা যাবে।
              </p>
            </section>
          )}

          {/* Section 3: Question Blocks (গ, ঘ …) */}
          <section className="space-y-4">
            {isFull && (
              <div className="flex items-center justify-between text-xs font-bold text-[#1B1F2A] px-1">
                <span>প্রশ্ন তালিকা ({toBn(questionBlocks.length)}টি প্রশ্ন)</span>
                <span className="text-[#64748B] text-[0.6875rem] font-normal">গ ও ঘ বা অন্য প্রকার</span>
              </div>
            )}

            {questionBlocks.map((block, index) => {
              const solInputId = `sol-file-${block.tempId}`;
              const qError = errors.questions?.[block.tempId];
              const solPreviewOpen = !!solutionPreviewOpen[block.tempId];

              return (
                <div
                  key={block.tempId}
                  className="bg-white rounded-2xl p-4 border border-[#D5D9E2] shadow-xs space-y-3"
                >
                  {/* Block Header */}
                  <div className="flex items-center justify-between pb-2.5 border-b border-[#F2F4F8]">
                    {isFull ? (
                      <div className="flex items-center gap-2">
                        {/* Type Dropdown */}
                        <select
                          value={block.type}
                          onChange={(e) => updateQuestionBlock(index, 'type', e.target.value as QuestionType)}
                          className="min-h-[44px] px-3 py-1.5 rounded-xl bg-[#3B4FD8] text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-white"
                        >
                          <option value="ক">ক</option>
                          <option value="খ">খ</option>
                          <option value="গ">গ</option>
                          <option value="ঘ">ঘ</option>
                        </select>

                        {/* Marks Input */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-[#1B1F2A]">নম্বর:</span>
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={block.marks}
                            onChange={(e) =>
                              updateQuestionBlock(index, 'marks', Math.max(1, parseInt(e.target.value, 10) || 1))
                            }
                            className="w-14 min-h-[44px] px-2 py-1 text-center font-bold text-xs rounded-xl border border-[#D5D9E2] bg-white text-[#1B1F2A] focus:outline-none focus:ring-2 focus:ring-[#3B4FD8]"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="min-h-[32px] min-w-[32px] px-3 rounded-lg bg-[#3B4FD8] text-white text-xs font-bold flex items-center justify-center">
                          {block.type}
                        </span>
                        <span className="text-[0.6875rem] font-semibold text-[#64748B]">
                          {toBn(block.marks)} নম্বর
                        </span>
                      </div>
                    )}

                    {/* Delete Block Button — Full Editor only */}
                    {isFull && (
                      <button
                        type="button"
                        aria-label="এই প্রশ্ন ব্লকটি মুছে ফেলুন"
                        disabled={questionBlocks.length <= 1}
                        onClick={() => handleRemoveQuestionBlock(index)}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Question Text (no live preview here) */}
                  <div className="space-y-1">
                    <LatexEditor
                      label={`প্রশ্ন (${block.type}) *`}
                      value={block.questionText}
                      onChange={(val) => updateQuestionBlock(index, 'questionText', val)}
                      rows={3}
                      showPreview={false}
                      placeholder="প্রশ্নের মূল বক্তব্য লিখুন..."
                    />
                    {qError && (
                      <p className="text-xs text-red-600 font-semibold flex items-center gap-1 pt-0.5">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>{qError}</span>
                      </p>
                    )}
                  </div>

                  {/* Solution: label + eye + rating */}
                  <div className="space-y-2.5 pt-2.5 border-t border-[#F2F4F8]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#2A3BB0]">সমাধান</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <EyeToggle
                          open={solPreviewOpen}
                          onClick={() =>
                            setSolutionPreviewOpen((prev) => ({ ...prev, [block.tempId]: !solPreviewOpen }))
                          }
                        />
                        <RatingSelect
                          value={block.rating || 3}
                          ariaLabel={`প্রশ্ন (${block.type}) এর রেটিং`}
                          onChange={(v) => updateQuestionBlock(index, 'rating', v)}
                        />
                      </div>
                    </div>

                    <LatexEditor
                      value={block.solutionText}
                      onChange={(val) => updateQuestionBlock(index, 'solutionText', val)}
                      rows={3}
                      showPreview={false}
                      placeholder="ধাপে ধাপে সমাধান লিখুন..."
                    />

                    {solPreviewOpen && <LivePreview text={block.solutionText} />}
                  </div>

                  {/* Solution pictures */}
                  <ImageStrip
                    title="সমাধানের ছবি"
                    ids={block.solutionImageIds || []}
                    urls={solutionImageUrls}
                    fullFeatures={isFull}
                    addAriaLabel="সমাধানের ছবি যোগ করুন"
                    onAdd={() => document.getElementById(solInputId)?.click()}
                    onRemove={(id) => handleRemoveSolutionImage(index, id)}
                    onReplace={(id) => startReplace({ kind: 'solution', blockIndex: index, imageId: id })}
                    onOpenViewer={(i) => openViewer(block.solutionImageIds || [], solutionImageUrls, i)}
                  />
                  <input
                    id={solInputId}
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => handleUploadSolutionImages(index, e)}
                    className="hidden"
                  />

                  {/* Which board did this question come in? */}
                  <BoardTagEditor
                    title={`প্রশ্ন (${block.type}) কোন বোর্ডে এসেছে`}
                    chips={block.usedInBoards || []}
                    onChange={(next) => updateQuestionBlock(index, 'usedInBoards', next)}
                    options={allBoardOptions}
                    customCodes={customBoards.map((b) => b.code)}
                    onRequestAddBoard={() => setShowAddBoard(true)}
                    onDeleteCustomBoard={handleDeleteCustomBoard}
                    onInvalidYear={() => showToast('সঠিক সাল লিখুন (যেমন: ২০২৫)')}
                  />

                  {/* Short Answer — Full Editor only */}
                  {isFull && (
                    <div className="space-y-1 pt-2.5 border-t border-[#F2F4F8]">
                      <label className="block text-xs font-semibold text-[#1B1F2A]">সংক্ষিপ্ত উত্তর (ঐচ্ছিক)</label>
                      <input
                        type="text"
                        value={block.answerText || ''}
                        onChange={(e) => updateQuestionBlock(index, 'answerText', e.target.value)}
                        placeholder="যেমন: -5.78 × 10⁻¹⁰ J kg⁻¹"
                        className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[#D5D9E2] bg-[#F2F4F8]/40 text-xs text-[#1B1F2A] focus:outline-none focus:ring-2 focus:ring-[#3B4FD8]"
                      />
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

        {/* Fixed Bottom Action Bar (Cancel & Save) */}
        <footer className="absolute bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#D5D9E2] px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
          <div className="grid grid-cols-2 gap-3 max-w-[360px] mx-auto">
            <button
              type="button"
              onClick={handleAttemptClose}
              disabled={loading}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-[#D5D9E2] bg-white hover:bg-[#F2F4F8] active:bg-[#E5E9F0] text-sm font-semibold text-[#1B1F2A] transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#3B4FD8] hover:bg-[#2A3BB0] active:bg-[#202E91] text-sm font-bold text-white shadow-md flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <span>সংরক্ষণ হচ্ছে...</span>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save</span>
                </>
              )}
            </button>
          </div>
        </footer>

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

        {/* Full-screen zoomable preview of a picture (Full Editor) */}
        <ImageViewerModal
          isOpen={!!viewer}
          images={viewer?.images || []}
          initialIndex={viewer?.index || 0}
          onClose={() => setViewer(null)}
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
