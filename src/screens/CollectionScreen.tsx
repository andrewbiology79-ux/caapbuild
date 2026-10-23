import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Header } from '../components/Header';
import { useToast } from '../components/Toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PromptDialog } from '../components/PromptDialog';
import { QuestionFormModal } from '../components/QuestionFormModal';
import { ImportCollectionModal } from '../components/ImportCollectionModal';
import { PasteQuestionsModal } from '../components/PasteQuestionsModal';
import { ImageViewerModal } from '../components/ImageViewerModal';
import { exportQuestionCollection } from '../utils/collectionTransfer';
import { RichText } from '../components/RichText';
import { KebabMenu, type MenuItem } from '../components/KebabMenu';
import { toBn, toBnPad2 } from '../utils/toBn';
import { useNavigation } from '../utils/navigation';
import { db } from '../db/db';
import {
  seedInitialDataIfNeeded,
  getSubjects,
  getChapters,
  getTopics,
  getQuestionsByTopicGrouped,
  getHierarchyStats,
  getSelectedIds,
  toggleStimulusSelect,
  getSelectedStimuliCount,
  clearSelection,
  copyStimulusGroup,
  getGroupClipboard,
  clearGroupClipboard,
  pasteStimulusGroup,
  deleteStimulusGroup,
  getRatingStarsText,
  getQuestionPaperUsage,
  getImageBlobUrl,
  addSubject,
  updateSubject,
  deleteSubject,
  reorderSubjects,
  addChapter,
  updateChapter,
  deleteChapter,
  reorderChapters,
  addTopic,
  updateTopic,
  deleteTopic,
  reorderTopics,
  type Subject,
  type Chapter,
  type Topic,
  type Question,
  type StimulusWithQuestions,
  type HierarchyStats,
  type QuestionPaperUsage,
  type GroupClipboardData,
} from '../db/api';
import {
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Check,
  Search,
  Plus,
  RefreshCw,
  FolderOpen,
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
  Download,
  Square,
} from 'lucide-react';

type DrillView =
  | { level: 'subjects' }
  | { level: 'chapters'; subject: Subject }
  | { level: 'topics'; subject: Subject; chapter: Chapter }
  | { level: 'questions'; subject: Subject; chapter: Chapter; topic: Topic };

// Remembers where the user was inside Collection, so switching tabs and coming back restores it
let lastDrillView: DrillView = { level: 'subjects' };

export const CollectionScreen: React.FC = () => {
  const { showToast } = useToast();
  const { registerBackHandler } = useNavigation();

  // Navigation Drill-down View State (restored from last visit)
  const [currentView, setCurrentView] = useState<DrillView>(lastDrillView);

  useEffect(() => {
    lastDrillView = currentView;
  }, [currentView]);

  // If the remembered chapter/topic no longer exists (deleted/imported elsewhere), fall back to subjects
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = lastDrillView;
        if (v.level === 'subjects') return;
        const subjectOk = !!(await db.subjects.get(v.subject.id));
        const chapterOk = v.level === 'chapters' ? true : !!(await db.chapters.get(v.chapter.id));
        const topicOk = v.level === 'questions' ? !!(await db.topics.get(v.topic.id)) : true;
        if (!cancelled && !(subjectOk && chapterOk && topicOk)) {
          setCurrentView({ level: 'subjects' });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Data states
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [questionGroups, setQuestionGroups] = useState<StimulusWithQuestions[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedStimuliCount, setSelectedStimuliCount] = useState<number>(0);
  const [stats, setStats] = useState<HierarchyStats>({
    subjectStats: {},
    chapterStats: {},
    topicStats: {},
  });
  const [questionUsages, setQuestionUsages] = useState<Record<string, QuestionPaperUsage[]>>({});
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [groupClipboard, setGroupClipboard] = useState<GroupClipboardData | null>(null);

  // Loading & Modes
  const [loading, setLoading] = useState(true);
  const [isReordering, setIsReordering] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSolutions, setExpandedSolutions] = useState<Record<string, boolean>>({});

  // Full screen image viewer
  const [imageViewerState, setImageViewerState] = useState<{
    isOpen: boolean;
    images: Array<{ url: string; alt?: string }>;
    initialIndex: number;
  }>({
    isOpen: false,
    images: [],
    initialIndex: 0,
  });

  // Breadcrumb horizontal scroll reference
  const breadcrumbContainerRef = useRef<HTMLDivElement>(null);

  // Dialog States
  const [promptDialog, setPromptDialog] = useState<{
    isOpen: boolean;
    title: string;
    initialValue: string;
    onConfirm: (val: string) => void;
  }>({
    isOpen: false,
    title: '',
    initialValue: '',
    onConfirm: () => {},
  });

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const [questionFormState, setQuestionFormState] = useState<{
    isOpen: boolean;
    initialTopicId?: string;
    editQuestionId?: string | null;
  }>({
    isOpen: false,
    initialTopicId: undefined,
    editQuestionId: null,
  });

  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [showPasteModal, setShowPasteModal] = useState<boolean>(false);

  // Load Hierarchy Data based on current view
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      await seedInitialDataIfNeeded();

      const [subList, statsData, selIds, clip] = await Promise.all([
        getSubjects(),
        getHierarchyStats(),
        getSelectedIds(),
        getGroupClipboard(),
      ]);

      setSubjects(subList);
      setStats(statsData);
      setSelectedIds(selIds);
      setGroupClipboard(clip);

      const sCount = await getSelectedStimuliCount(selIds);
      setSelectedStimuliCount(sCount);

      if (currentView.level === 'chapters') {
        const chList = await getChapters(currentView.subject.id);
        setChapters(chList);
      } else if (currentView.level === 'topics') {
        const topList = await getTopics(currentView.chapter.id);
        setTopics(topList);
      } else if (currentView.level === 'questions') {
        const grpList = await getQuestionsByTopicGrouped(currentView.topic.id);
        setQuestionGroups(grpList);

        // Fetch usages and image blobs for questions & stimuli
        const usages: Record<string, QuestionPaperUsage[]> = {};
        const urls: Record<string, string> = {};

        for (const grp of grpList) {
          if (grp.stimulus?.imageIds) {
            for (const imgId of grp.stimulus.imageIds) {
              const url = await getImageBlobUrl(imgId);
              if (url) urls[imgId] = url;
            }
          }
          for (const q of grp.questions) {
            usages[q.id] = await getQuestionPaperUsage(q.id);
            if (q.solutionImageIds) {
              for (const imgId of q.solutionImageIds) {
                const url = await getImageBlobUrl(imgId);
                if (url) urls[imgId] = url;
              }
            }
          }
        }
        setQuestionUsages(usages);
        setImageUrls(urls);
      }
    } catch (err: any) {
      console.error('Error loading collection data:', err);
      showToast('ডাটা লোড করতে সমস্যা হয়েছে');
    } finally {
      setLoading(false);
    }
  }, [currentView, showToast]);

  useEffect(() => {
    loadData();
    setIsReordering(false);
  }, [loadData]);

  // Handle hardware & UI Back Navigation
  const handleGoBack = useCallback((): boolean => {
    if (imageViewerState.isOpen) {
      setImageViewerState((prev) => ({ ...prev, isOpen: false }));
      return true;
    }

    if (isReordering) {
      setIsReordering(false);
      return true;
    }

    if (currentView.level === 'questions') {
      setCurrentView({
        level: 'topics',
        subject: currentView.subject,
        chapter: currentView.chapter,
      });
      return true;
    }

    if (currentView.level === 'topics') {
      setCurrentView({
        level: 'chapters',
        subject: currentView.subject,
      });
      return true;
    }

    if (currentView.level === 'chapters') {
      setCurrentView({ level: 'subjects' });
      return true;
    }

    return false; // Already at Subjects level
  }, [currentView, isReordering, imageViewerState.isOpen]);

  // Register with Capacitor Back Button listener
  useEffect(() => {
    const unregister = registerBackHandler(() => {
      return handleGoBack();
    });
    return unregister;
  }, [handleGoBack, registerBackHandler]);

  // Auto-scroll breadcrumb to the right end whenever currentView changes
  useEffect(() => {
    if (breadcrumbContainerRef.current) {
      breadcrumbContainerRef.current.scrollTo({
        left: breadcrumbContainerRef.current.scrollWidth,
        behavior: 'smooth',
      });
    }
  }, [currentView]);

  // Reorder Item Up / Down (for Subjects, Chapters, Topics)
  const handleMoveItem = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (currentView.level === 'subjects') {
      if (targetIndex < 0 || targetIndex >= subjects.length) return;
      const newList = [...subjects];
      const temp = newList[index];
      newList[index] = newList[targetIndex];
      newList[targetIndex] = temp;
      setSubjects(newList);
    } else if (currentView.level === 'chapters') {
      if (targetIndex < 0 || targetIndex >= chapters.length) return;
      const newList = [...chapters];
      const temp = newList[index];
      newList[index] = newList[targetIndex];
      newList[targetIndex] = temp;
      setChapters(newList);
    } else if (currentView.level === 'topics') {
      if (targetIndex < 0 || targetIndex >= topics.length) return;
      const newList = [...topics];
      const temp = newList[index];
      newList[index] = newList[targetIndex];
      newList[targetIndex] = temp;
      setTopics(newList);
    }
  };

  // Save new reorder order to DB
  const handleSaveReorder = async () => {
    try {
      if (currentView.level === 'subjects') {
        await reorderSubjects(subjects.map((s) => s.id));
      } else if (currentView.level === 'chapters') {
        await reorderChapters(chapters.map((c) => c.id));
      } else if (currentView.level === 'topics') {
        await reorderTopics(topics.map((t) => t.id));
      }
      setIsReordering(false);
      showToast('নতুন ক্রম সংরক্ষিত হয়েছে');
      loadData();
    } catch {
      showToast('ক্রম সংরক্ষণ ব্যর্থ হয়েছে');
    }
  };

  // Toggle stimulus selection (all its sub-questions)
  const handleToggleStimulusGroup = async (grp: StimulusWithQuestions) => {
    try {
      const qIds = grp.questions.map((q) => q.id);
      const next = await toggleStimulusSelect(grp.stimulus?.id, qIds);
      setSelectedIds(next);

      const sCount = await getSelectedStimuliCount(next);
      setSelectedStimuliCount(sCount);

      const allSelected = qIds.every((id) => next.includes(id));
      showToast(allSelected ? 'প্রশ্ন নির্বাচন করা হয়েছে' : 'নির্বাচন বাতিল করা হয়েছে');

      // refresh stats
      const statsData = await getHierarchyStats();
      setStats(statsData);
    } catch {
      showToast('নির্বাচন আপডেট করা যায়নি');
    }
  };

  // Clear all selections
  const handleClearAllSelection = async () => {
    setConfirmDialog({
      isOpen: true,
      title: 'সব নির্বাচন মুছবেন?',
      message: 'নির্বাচিত সকল প্রশ্নের তালিকা মুছে ফেলতে চান?',
      onConfirm: async () => {
        await clearSelection();
        setSelectedIds([]);
        setSelectedStimuliCount(0);
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        showToast('সব নির্বাচন সফলভাবে মোছা হয়েছে');
        const statsData = await getHierarchyStats();
        setStats(statsData);
      },
    });
  };

  // Copy / Cut Stimulus Group
  const handleCopyOrCutGroup = async (grp: StimulusWithQuestions, mode: 'copy' | 'cut') => {
    try {
      const sampleQId = grp.questions[0]?.id;
      if (!sampleQId) return;

      await copyStimulusGroup(grp.stimulus?.id, sampleQId, mode);
      const clip = await getGroupClipboard();
      setGroupClipboard(clip);
      showToast(mode === 'cut' ? 'কাট করা হয়েছে' : 'কপি করা হয়েছে');
    } catch (err: any) {
      console.error(err);
      showToast('কপি ব্যর্থ হয়েছে');
    }
  };

  // Paste Stimulus Group (before or after)
  const handlePasteGroup = async (
    targetGrp: StimulusWithQuestions,
    position: 'before' | 'after'
  ) => {
    try {
      const clip = await getGroupClipboard();
      if (!clip || clip.questions.length === 0) {
        showToast('আগে Copy বা Cut করুন');
        return;
      }

      if (currentView.level !== 'questions') return;

      const targetStimulusId = targetGrp.stimulus?.id;
      const targetQuestionId = targetGrp.questions[0]?.id;

      const success = await pasteStimulusGroup(
        currentView.topic.id,
        targetStimulusId,
        targetQuestionId,
        position
      );

      if (success) {
        showToast('পেস্ট সম্পন্ন হয়েছে');
        const updatedClip = await getGroupClipboard();
        setGroupClipboard(updatedClip);
        loadData();
      }
    } catch (err: any) {
      console.error(err);
      showToast('পেস্ট করতে ব্যর্থ হয়েছে');
    }
  };

  // Clear Group Clipboard
  const handleClearClipboard = async () => {
    await clearGroupClipboard();
    setGroupClipboard(null);
    showToast('ক্লিপবোর্ড খালি করা হয়েছে');
  };

  // Delete Stimulus Group
  const handleDeleteGroupPrompt = (grp: StimulusWithQuestions) => {
    setConfirmDialog({
      isOpen: true,
      title: 'প্রশ্ন মুছবেন?',
      message: 'এই উদ্দীপক এবং এর সাথে যুক্ত সকল প্রশ্ন স্থায়ীভাবে মুছে ফেলতে চান?',
      onConfirm: async () => {
        try {
          const qIds = grp.questions.map((q) => q.id);
          await deleteStimulusGroup(grp.stimulus?.id, qIds);
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
          showToast('প্রশ্নটি মুছে ফেলা হয়েছে');
          loadData();
        } catch {
          showToast('মুছতে সমস্যা হয়েছে');
        }
      },
    });
  };

  // Edit Stimulus Group (opens QuestionFormModal with stimulus and all questions)
  const handleEditGroup = (grp: StimulusWithQuestions) => {
    const sampleQId = grp.questions[0]?.id;
    if (!sampleQId) return;

    setQuestionFormState({
      isOpen: true,
      initialTopicId: currentView.level === 'questions' ? currentView.topic.id : undefined,
      editQuestionId: sampleQId,
    });
  };

  // Open Solution Image Viewer
  const handleOpenImageViewer = (urls: string[], initialIdx: number) => {
    setImageViewerState({
      isOpen: true,
      images: urls.map((u) => ({ url: u, alt: 'সমাধানের চিত্র' })),
      initialIndex: initialIdx,
    });
  };

  // Add Item Dialog (Subject, Chapter, Topic)
  const handleOpenAddDialog = () => {
    if (currentView.level === 'subjects') {
      setPromptDialog({
        isOpen: true,
        title: 'নতুন বিষয়',
        initialValue: '',
        onConfirm: async (val) => {
          if (!val.trim()) return;
          await addSubject(val.trim());
          setPromptDialog((prev) => ({ ...prev, isOpen: false }));
          showToast('নতুন বিষয় যুক্ত হয়েছে');
          loadData();
        },
      });
    } else if (currentView.level === 'chapters') {
      setPromptDialog({
        isOpen: true,
        title: 'নতুন অধ্যায়',
        initialValue: '',
        onConfirm: async (val) => {
          if (!val.trim()) return;
          await addChapter(currentView.subject.id, val.trim());
          setPromptDialog((prev) => ({ ...prev, isOpen: false }));
          showToast('নতুন অধ্যায় যুক্ত হয়েছে');
          loadData();
        },
      });
    } else if (currentView.level === 'topics') {
      setPromptDialog({
        isOpen: true,
        title: 'নতুন টপিক',
        initialValue: '',
        onConfirm: async (val) => {
          if (!val.trim()) return;
          await addTopic(currentView.chapter.id, val.trim());
          setPromptDialog((prev) => ({ ...prev, isOpen: false }));
          showToast('নতুন টপিক যুক্ত হয়েছে');
          loadData();
        },
      });
    } else if (currentView.level === 'questions') {
      setQuestionFormState({
        isOpen: true,
        initialTopicId: currentView.topic.id,
        editQuestionId: null,
      });
    }
  };

  // Rename Item
  const handleRenameItem = (
    type: 'subject' | 'chapter' | 'topic',
    id: string,
    currentName: string
  ) => {
    setPromptDialog({
      isOpen: true,
      title: `${type === 'subject' ? 'বিষয়' : type === 'chapter' ? 'অধ্যায়' : 'টপিক'} নাম পরিবর্তন`,
      initialValue: currentName,
      onConfirm: async (val) => {
        if (!val.trim()) return;
        if (type === 'subject') await updateSubject(id, val.trim());
        if (type === 'chapter') await updateChapter(id, val.trim());
        if (type === 'topic') await updateTopic(id, val.trim());
        setPromptDialog((prev) => ({ ...prev, isOpen: false }));
        showToast('নাম পরিবর্তন সম্পন্ন হয়েছে');
        loadData();
      },
    });
  };

  // Delete Item
  const handleDeleteItem = (
    type: 'subject' | 'chapter' | 'topic',
    id: string,
    name: string
  ) => {
    setConfirmDialog({
      isOpen: true,
      title: `${type === 'subject' ? 'বিষয়' : type === 'chapter' ? 'অধ্যায়' : 'টপিক'} মুছবেন?`,
      message: `"${name}" এবং এর অন্তর্গত সকল ডাটা মুছে ফেলতে চান?`,
      onConfirm: async () => {
        if (type === 'subject') await deleteSubject(id);
        if (type === 'chapter') await deleteChapter(id);
        if (type === 'topic') await deleteTopic(id);
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        showToast('মুছে ফেলা হয়েছে');

        if (
          (type === 'chapter' && currentView.level === 'topics' && currentView.chapter.id === id) ||
          (type === 'topic' && currentView.level === 'questions' && currentView.topic.id === id)
        ) {
          handleGoBack();
        } else {
          loadData();
        }
      },
    });
  };

  // Current view title
  const currentTitle = useMemo(() => {
    if (currentView.level === 'subjects') return 'বিষয় তালিকা (Subjects)';
    if (currentView.level === 'chapters') return currentView.subject.name;
    if (currentView.level === 'topics') return currentView.chapter.name;
    if (currentView.level === 'questions') return currentView.topic.name;
    return 'কালেকশন';
  }, [currentView]);

  // Header KebabMenu Items
  const headerMenuItems = useMemo((): MenuItem[] => {
    const items: MenuItem[] = [];

    // Add Action
    let addLabel = 'নতুন বিষয় যোগ করুন';
    if (currentView.level === 'chapters') addLabel = 'নতুন অধ্যায় যোগ করুন';
    if (currentView.level === 'topics') addLabel = 'নতুন টপিক যোগ করুন';
    if (currentView.level === 'questions') addLabel = 'নতুন প্রশ্ন যোগ করুন';

    items.push({
      id: 'add',
      label: addLabel,
      icon: <PlusCircle className="w-4 h-4 text-[#3B4FD8]" />,
      onClick: handleOpenAddDialog,
    });

    if (currentView.level === 'questions') {
      items.push({
        id: 'paste-json',
        label: 'JSON পেস্ট করে প্রশ্ন যোগ',
        icon: <Upload className="w-4 h-4 text-[#3B4FD8]" />,
        onClick: () => setShowPasteModal(true),
      });
    }

    // Rename & Delete for active screen container
    if (currentView.level === 'chapters') {
      items.push({
        id: 'rename-subj',
        label: 'বিষয়ের নাম পরিবর্তন',
        icon: <FileEdit className="w-4 h-4 text-[#1B1F2A]" />,
        onClick: () => handleRenameItem('subject', currentView.subject.id, currentView.subject.name),
      });
      items.push({
        id: 'delete-subj',
        label: 'বিষয় মুছে ফেলুন',
        icon: <Trash2 className="w-4 h-4 text-red-500" />,
        isDestructive: true,
        onClick: () => handleDeleteItem('subject', currentView.subject.id, currentView.subject.name),
      });
    } else if (currentView.level === 'topics') {
      items.push({
        id: 'rename-chap',
        label: 'অধ্যায়ের নাম পরিবর্তন',
        icon: <FileEdit className="w-4 h-4 text-[#1B1F2A]" />,
        onClick: () => handleRenameItem('chapter', currentView.chapter.id, currentView.chapter.name),
      });
      items.push({
        id: 'delete-chap',
        label: 'অধ্যায় মুছে ফেলুন',
        icon: <Trash2 className="w-4 h-4 text-red-500" />,
        isDestructive: true,
        onClick: () => handleDeleteItem('chapter', currentView.chapter.id, currentView.chapter.name),
      });
    } else if (currentView.level === 'questions') {
      items.push({
        id: 'rename-top',
        label: 'টপিকের নাম পরিবর্তন',
        icon: <FileEdit className="w-4 h-4 text-[#1B1F2A]" />,
        onClick: () => handleRenameItem('topic', currentView.topic.id, currentView.topic.name),
      });
      items.push({
        id: 'delete-top',
        label: 'টপিক মুছে ফেলুন',
        icon: <Trash2 className="w-4 h-4 text-red-500" />,
        isDestructive: true,
        onClick: () => handleDeleteItem('topic', currentView.topic.id, currentView.topic.name),
      });
    }

    // Subjects level extras
    if (currentView.level === 'subjects') {
      items.push({
        id: 'import',
        label: 'Import Question Collection',
        icon: <Upload className="w-4 h-4 text-[#3B4FD8]" />,
        onClick: () => setShowImportModal(true),
      });
      items.push({
        id: 'export',
        label: 'Export Question Collection',
        icon: <Download className="w-4 h-4 text-[#3B4FD8]" />,
        onClick: async () => {
          try {
            const ok = await exportQuestionCollection();
            if (ok) {
              showToast('প্রশ্ন কালেকশন সফলভাবে এক্সপোর্ট হয়েছে');
            } else {
              showToast('কালেকশন এক্সপোর্ট করা যায়নি');
            }
          } catch {
            showToast('কালেকশন এক্সপোর্ট ব্যর্থ হয়েছে');
          }
        },
      });
    }

    // Clear Selection
    items.push({
      id: 'clear-sel',
      label: 'সব নির্বাচন মুছুন',
      icon: <Square className="w-4 h-4 text-red-500" />,
      isDestructive: true,
      onClick: handleClearAllSelection,
    });

    return items;
  }, [currentView, showToast]);

  // Filter questions by search query
  const filteredQuestionGroups = useMemo(() => {
    if (!searchQuery.trim()) return questionGroups;
    const query = searchQuery.toLowerCase().trim();

    return questionGroups
      .map((grp) => {
        const stimulusMatches =
          (grp.stimulus?.text && grp.stimulus.text.toLowerCase().includes(query)) ||
          (grp.stimulus?.boardTag && grp.stimulus.boardTag.toLowerCase().includes(query));

        const matchedQuestions = grp.questions.filter((q) => {
          const textMatch = q.questionText.toLowerCase().includes(query);
          const solMatch = q.solutionText && q.solutionText.toLowerCase().includes(query);
          const boardMatch = q.usedInBoards.some(
            (b) =>
              b.board.toLowerCase().includes(query) ||
              b.years.some((y) => String(y).includes(query) || toBn(y).includes(query))
          );
          return textMatch || solMatch || boardMatch || stimulusMatches;
        });

        if (matchedQuestions.length > 0) {
          return {
            ...grp,
            questions: matchedQuestions,
          };
        }
        return null;
      })
      .filter(Boolean) as StimulusWithQuestions[];
  }, [questionGroups, searchQuery]);

  // Construct Breadcrumb Items (Requirement 7)
  const breadcrumbItems = useMemo(() => {
    const items: Array<{
      id: string;
      label: string;
      isCurrent: boolean;
      onClick?: () => void;
    }> = [];

    // Level 0: Home / Subjects
    items.push({
      id: 'subjects',
      label: currentView.level === 'subjects' ? '🏠 বিষয়সমূহ' : '🏠',
      isCurrent: currentView.level === 'subjects',
      onClick:
        currentView.level === 'subjects'
          ? undefined
          : () => setCurrentView({ level: 'subjects' }),
    });

    // Level 1: Subject
    if (
      currentView.level === 'chapters' ||
      currentView.level === 'topics' ||
      currentView.level === 'questions'
    ) {
      const s = currentView.subject;
      const label = `${toBnPad2(s.order)}. ${s.name}`;
      items.push({
        id: `subject-${s.id}`,
        label,
        isCurrent: currentView.level === 'chapters',
        onClick:
          currentView.level === 'chapters'
            ? undefined
            : () => setCurrentView({ level: 'chapters', subject: s }),
      });
    }

    // Level 2: Chapter
    if (currentView.level === 'topics' || currentView.level === 'questions') {
      const c = currentView.chapter;
      const label = `${toBnPad2(c.order)}. ${c.name}`;
      items.push({
        id: `chapter-${c.id}`,
        label,
        isCurrent: currentView.level === 'topics',
        onClick:
          currentView.level === 'topics'
            ? undefined
            : () =>
                setCurrentView({
                  level: 'topics',
                  subject: currentView.subject,
                  chapter: c,
                }),
      });
    }

    // Level 3: Topic
    if (currentView.level === 'questions') {
      const t = currentView.topic;
      const label = `${toBnPad2(t.order)}. ${t.name}`;
      items.push({
        id: `topic-${t.id}`,
        label,
        isCurrent: true,
        onClick: undefined,
      });
    }

    return items;
  }, [currentView]);

  return (
    <div className="flex-1 flex flex-col min-h-full pb-20 bg-[#F2F4F8]">
      {/* Top Header */}
      <Header
        title={currentTitle}
        showBack={currentView.level !== 'subjects'}
        onBack={handleGoBack}
        menuItems={headerMenuItems}
      />

      {/* Top Control Bar (Requirement 7: Horizontal Scrollable Breadcrumb) */}
      <div className="bg-white border-b border-[#D5D9E2] px-3.5 py-2 shadow-2xs space-y-2">
        {/* Breadcrumb Path on all levels */}
        <div
          ref={breadcrumbContainerRef}
          className="flex items-center gap-1 overflow-x-auto whitespace-nowrap no-scrollbar py-0.5 scroll-smooth"
          style={{
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {breadcrumbItems.map((item, idx) => (
            <React.Fragment key={item.id}>
              {idx > 0 && (
                <span className="text-[#94A3B8] text-xs px-1 select-none shrink-0 font-bold">
                  ›
                </span>
              )}
              <button
                type="button"
                disabled={item.isCurrent}
                onClick={item.onClick}
                className={`min-h-[44px] px-2 py-1 rounded-lg text-xs flex items-center shrink-0 transition-colors ${
                  item.isCurrent
                    ? 'font-bold text-[#1B1F2A] cursor-default pointer-events-none'
                    : 'text-[#2A3BB0] hover:bg-[#EEF2FF] font-medium active:bg-[#E0E7FF]'
                }`}
              >
                {item.label}
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* Action Row */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          {/* Left: Reorder button (for lists) or Selection info */}
          {currentView.level !== 'questions' ? (
            <button
              type="button"
              aria-label={isReordering ? 'ক্রম সংরক্ষণ করুন' : 'ক্রম পরিবর্তন করুন'}
              onClick={isReordering ? handleSaveReorder : () => setIsReordering(true)}
              className={`min-h-[44px] px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
                isReordering
                  ? 'bg-[#3B4FD8] text-white border-[#3B4FD8]'
                  : 'bg-[#EEF2FF] text-[#2A3BB0] border-[#D5D9E2] hover:bg-[#E0E7FF]'
              }`}
            >
              {isReordering ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Done</span>
                </>
              ) : (
                <>
                  <Layers className="w-3.5 h-3.5 text-[#3B4FD8]" />
                  <span>Reorder</span>
                </>
              )}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full bg-[#EEF2FF] text-[#2A3BB0] text-xs font-bold border border-[#D5D9E2]">
                {toBn(selectedStimuliCount)} নির্বাচিত
              </span>
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllSelection}
                  className="min-h-[44px] text-xs text-red-600 hover:text-red-700 font-semibold px-2"
                >
                  Clear all selection
                </button>
              )}
            </div>
          )}

          {/* Right: Quick Total Counter (Requirement 3: "মোট প্রশ্ন: ...টি") */}
          <div className="text-xs text-[#64748B] font-medium">
            {currentView.level === 'subjects' && `মোট বিষয়: ${toBn(subjects.length)}টি`}
            {currentView.level === 'chapters' && `মোট অধ্যায়: ${toBn(chapters.length)}টি`}
            {currentView.level === 'topics' && `মোট টপিক: ${toBn(topics.length)}টি`}
            {currentView.level === 'questions' && `মোট প্রশ্ন: ${toBn(filteredQuestionGroups.length)}টি`}
          </div>
        </div>

        {/* Search Box on Questions Screen */}
        {currentView.level === 'questions' && (
          <div className="relative pt-1">
            <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="প্রশ্ন, উদ্দীপক বা বোর্ড ট্যাগ খুঁজুন..."
              className="w-full min-h-[44px] pl-9 pr-8 py-2 rounded-xl bg-[#F2F4F8] border border-[#D5D9E2] text-xs text-[#1B1F2A] focus:outline-none focus:ring-2 focus:ring-[#3B4FD8] focus:bg-white transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="অনুসন্ধান মুছুন"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[#64748B] hover:text-[#1B1F2A] p-1 font-bold"
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <main className="flex-1 p-3.5 space-y-3">
        {loading && (
          <div className="py-16 text-center text-xs text-[#64748B] flex flex-col items-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-[#3B4FD8]" />
            <span>ডাটা লোড হচ্ছে...</span>
          </div>
        )}

        {/* ---------------- LEVEL 0: SUBJECTS ---------------- */}
        {!loading && currentView.level === 'subjects' && (
          <div className="space-y-2.5">
            {subjects.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center border border-[#D5D9E2] space-y-3">
                <p className="text-sm text-[#64748B]">কোনো বিষয় যুক্ত করা হয়নি</p>
                <button
                  type="button"
                  onClick={handleOpenAddDialog}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#3B4FD8] text-white text-xs font-semibold"
                >
                  + বিষয় যোগ করুন
                </button>
              </div>
            ) : (
              subjects.map((subject, index) => {
                const subStat = stats.subjectStats[subject.id] || { total: 0, selected: 0 };
                const padOrder = toBnPad2(subject.order || index + 1);

                return (
                  <div
                    key={subject.id}
                    className="bg-white rounded-2xl p-3.5 border border-[#D5D9E2] shadow-xs flex items-center justify-between gap-3 hover:border-[#3B4FD8] transition-all cursor-pointer select-none"
                    onClick={() => {
                      if (!isReordering) {
                        setCurrentView({ level: 'chapters', subject });
                      }
                    }}
                  >
                    {/* Left: Blue Square with Bengali Serial */}
                    <div className="w-10 h-10 rounded-xl bg-[#3B4FD8] text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-2xs">
                      {padOrder}
                    </div>

                    {/* Middle: Name & Count Subtitle */}
                    <div className="flex-1 min-w-0">
                      <h2 className="text-sm font-bold text-[#1B1F2A] truncate leading-snug">
                        {subject.name}
                      </h2>
                      <p className="text-[0.6875rem] text-[#64748B] font-medium mt-0.5">
                        {toBn(subStat.total)}টি প্রশ্ন · {toBn(subStat.selected)} নির্বাচিত
                      </p>
                    </div>

                    {/* Right: Reorder or Kebab + Chevron */}
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {isReordering ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-label="উপরে সরান"
                            disabled={index === 0}
                            onClick={() => handleMoveItem(index, 'up')}
                            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-[#F2F4F8] hover:bg-[#EEF2FF] text-[#1B1F2A] disabled:opacity-30 disabled:pointer-events-none"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            aria-label="নিচে সরান"
                            disabled={index === subjects.length - 1}
                            onClick={() => handleMoveItem(index, 'down')}
                            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-[#F2F4F8] hover:bg-[#EEF2FF] text-[#1B1F2A] disabled:opacity-30 disabled:pointer-events-none"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <KebabMenu
                            items={[
                              {
                                id: 'rename',
                                label: 'নাম পরিবর্তন',
                                onClick: () => handleRenameItem('subject', subject.id, subject.name),
                              },
                              {
                                id: 'delete',
                                label: 'মুছে ফেলুন',
                                isDestructive: true,
                                onClick: () => handleDeleteItem('subject', subject.id, subject.name),
                              },
                            ]}
                          />
                          <ChevronRight className="w-5 h-5 text-[#64748B]" />
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ---------------- LEVEL 1: CHAPTERS ---------------- */}
        {!loading && currentView.level === 'chapters' && (
          <div className="space-y-2.5">
            {chapters.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center border border-[#D5D9E2] space-y-3">
                <p className="text-sm text-[#64748B]">এই বিষয়ে এখনো কোনো অধ্যায় নেই</p>
                <button
                  type="button"
                  onClick={handleOpenAddDialog}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#3B4FD8] text-white text-xs font-semibold"
                >
                  + অধ্যায় যোগ করুন
                </button>
              </div>
            ) : (
              chapters.map((chapter, index) => {
                const chStat = stats.chapterStats[chapter.id] || { total: 0, selected: 0 };
                const padOrder = toBnPad2(chapter.order || index + 1);

                return (
                  <div
                    key={chapter.id}
                    className="bg-white rounded-2xl p-3.5 border border-[#D5D9E2] shadow-xs flex items-center justify-between gap-3 hover:border-[#3B4FD8] transition-all cursor-pointer select-none"
                    onClick={() => {
                      if (!isReordering) {
                        setCurrentView({
                          level: 'topics',
                          subject: currentView.subject,
                          chapter,
                        });
                      }
                    }}
                  >
                    {/* Left: Blue Square with Bengali Serial */}
                    <div className="w-10 h-10 rounded-xl bg-[#3B4FD8] text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-2xs">
                      {padOrder}
                    </div>

                    {/* Middle: Name & Count Subtitle */}
                    <div className="flex-1 min-w-0">
                      <h2 className="text-sm font-bold text-[#1B1F2A] truncate leading-snug">
                        {chapter.name}
                      </h2>
                      <p className="text-[0.6875rem] text-[#64748B] font-medium mt-0.5">
                        {toBn(chStat.total)}টি প্রশ্ন · {toBn(chStat.selected)} নির্বাচিত
                      </p>
                    </div>

                    {/* Right: Reorder or Kebab + Chevron */}
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {isReordering ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-label="উপরে সরান"
                            disabled={index === 0}
                            onClick={() => handleMoveItem(index, 'up')}
                            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-[#F2F4F8] hover:bg-[#EEF2FF] text-[#1B1F2A] disabled:opacity-30 disabled:pointer-events-none"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            aria-label="নিচে সরান"
                            disabled={index === chapters.length - 1}
                            onClick={() => handleMoveItem(index, 'down')}
                            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-[#F2F4F8] hover:bg-[#EEF2FF] text-[#1B1F2A] disabled:opacity-30 disabled:pointer-events-none"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <KebabMenu
                            items={[
                              {
                                id: 'rename',
                                label: 'নাম পরিবর্তন',
                                onClick: () => handleRenameItem('chapter', chapter.id, chapter.name),
                              },
                              {
                                id: 'delete',
                                label: 'মুছে ফেলুন',
                                isDestructive: true,
                                onClick: () => handleDeleteItem('chapter', chapter.id, chapter.name),
                              },
                            ]}
                          />
                          <ChevronRight className="w-5 h-5 text-[#64748B]" />
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ---------------- LEVEL 2: TOPICS ---------------- */}
        {!loading && currentView.level === 'topics' && (
          <div className="space-y-2.5">
            {topics.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center border border-[#D5D9E2] space-y-3">
                <p className="text-sm text-[#64748B]">এই অধ্যায়ে এখনো কোনো টপিক নেই</p>
                <button
                  type="button"
                  onClick={handleOpenAddDialog}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#3B4FD8] text-white text-xs font-semibold"
                >
                  + টপিক যোগ করুন
                </button>
              </div>
            ) : (
              topics.map((topic, index) => {
                const topStat = stats.topicStats[topic.id] || { total: 0, selected: 0 };
                const padOrder = toBnPad2(topic.order || index + 1);

                return (
                  <div
                    key={topic.id}
                    className="bg-white rounded-2xl p-3.5 border border-[#D5D9E2] shadow-xs flex items-center justify-between gap-3 hover:border-[#3B4FD8] transition-all cursor-pointer select-none"
                    onClick={() => {
                      if (!isReordering) {
                        setCurrentView({
                          level: 'questions',
                          subject: currentView.subject,
                          chapter: currentView.chapter,
                          topic,
                        });
                      }
                    }}
                  >
                    {/* Left: Blue Square with Bengali Serial */}
                    <div className="w-10 h-10 rounded-xl bg-[#3B4FD8] text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-2xs">
                      {padOrder}
                    </div>

                    {/* Middle: Name & Count Subtitle */}
                    <div className="flex-1 min-w-0">
                      <h2 className="text-sm font-bold text-[#1B1F2A] truncate leading-snug">
                        {topic.name}
                      </h2>
                      <p className="text-[0.6875rem] text-[#64748B] font-medium mt-0.5">
                        {toBn(topStat.total)}টি প্রশ্ন · {toBn(topStat.selected)} নির্বাচিত
                      </p>
                    </div>

                    {/* Right: Reorder or Kebab + Chevron */}
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {isReordering ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-label="উপরে সরান"
                            disabled={index === 0}
                            onClick={() => handleMoveItem(index, 'up')}
                            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-[#F2F4F8] hover:bg-[#EEF2FF] text-[#1B1F2A] disabled:opacity-30 disabled:pointer-events-none"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            aria-label="নিচে সরান"
                            disabled={index === topics.length - 1}
                            onClick={() => handleMoveItem(index, 'down')}
                            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-[#F2F4F8] hover:bg-[#EEF2FF] text-[#1B1F2A] disabled:opacity-30 disabled:pointer-events-none"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <KebabMenu
                            items={[
                              {
                                id: 'rename',
                                label: 'নাম পরিবর্তন',
                                onClick: () => handleRenameItem('topic', topic.id, topic.name),
                              },
                              {
                                id: 'delete',
                                label: 'মুছে ফেলুন',
                                isDestructive: true,
                                onClick: () => handleDeleteItem('topic', topic.id, topic.name),
                              },
                            ]}
                          />
                          <ChevronRight className="w-5 h-5 text-[#64748B]" />
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ---------------- LEVEL 3: QUESTIONS LIST (Requirement 3) ---------------- */}
        {!loading && currentView.level === 'questions' && (
          <div className="space-y-4">
            {/* Clipboard Notice Bar */}
            {groupClipboard && (
              <div className="bg-[#EEF2FF] border border-[#3B4FD8] rounded-xl px-3.5 py-2.5 flex items-center justify-between text-xs text-[#2A3BB0] font-bold shadow-2xs">
                <span>
                  ১টি প্রশ্ন {groupClipboard.mode === 'cut' ? 'কাট' : 'কপি'} করা আছে
                </span>
                <button
                  type="button"
                  aria-label="ক্লিপবোর্ড খালি করুন"
                  onClick={handleClearClipboard}
                  className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/80 text-[#3B4FD8] font-bold text-sm"
                >
                  ✕
                </button>
              </div>
            )}

            {filteredQuestionGroups.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center border border-[#D5D9E2] space-y-3">
                <p className="text-sm font-semibold text-[#1B1F2A]">
                  {searchQuery ? 'অনুসন্ধানের সাথে কোনো প্রশ্ন মেলেনি' : 'এই টপিকে এখনো প্রশ্ন নেই'}
                </p>
                <p className="text-xs text-[#64748B]">
                  নতুন প্রশ্ন তৈরি করে এই টপিকে যুক্ত করুন।
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setQuestionFormState({
                      isOpen: true,
                      initialTopicId: currentView.topic.id,
                      editQuestionId: null,
                    })
                  }
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#3B4FD8] hover:bg-[#2A3BB0] text-white text-xs font-semibold shadow-xs"
                >
                  + Add question
                </button>
              </div>
            ) : (
              filteredQuestionGroups.map((grp, grpIdx) => {
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

                grp.questions.forEach((q) => {
                  if (q.usedInBoards) {
                    q.usedInBoards.forEach((b) => {
                      if (!allBoards.some((ex) => ex.board === b.board)) {
                        allBoards.push(b);
                      }
                    });
                  }
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
                    className="bg-white rounded-2xl border-[1.5px] border-[#3B4FD8] shadow-xs overflow-hidden mb-4"
                  >
                    {/* Top Ribbon (Full width, bg #3B4FD8, rounded-t-2xl, white text & icons) */}
                    <div className="bg-[#3B4FD8] text-white px-3.5 py-2.5 flex items-center justify-between gap-2 rounded-t-2xl">
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
                              allGroupSelected ? 'bg-white text-[#3B4FD8]' : 'bg-transparent text-transparent'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        </button>

                        {/* 3. Rating Badge: Yellowish bg with dark brownish text */}
                        <span className="px-2 py-0.5 rounded-md bg-[#FEF9C3] text-[#713F12] text-[0.625rem] font-bold border border-[#FDE047] whitespace-nowrap shadow-2xs">
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
                            icon: <FileEdit className="w-4 h-4 text-[#3B4FD8]" />,
                            onClick: () => handleEditGroup(grp),
                          },
                          {
                            id: 'copy',
                            label: 'Copy',
                            icon: <Copy className="w-4 h-4 text-[#3B4FD8]" />,
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
                            icon: <Plus className="w-4 h-4 text-[#2A3BB0]" />,
                            onClick: () => handlePasteGroup(grp, 'after'),
                          },
                          {
                            id: 'paste-before',
                            label: 'Paste before',
                            icon: <Plus className="w-4 h-4 text-[#2A3BB0]" />,
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
                    <div className="bg-[#F8FAFC] border-b border-[#E2E8F0] px-3.5 py-2 flex flex-wrap items-center gap-1.5">
                      {/* Board Tag Chips */}
                      {allBoards.length > 0 ? (
                        allBoards.map((b, bIdx) => (
                          <span
                            key={bIdx}
                            className="px-2 py-0.5 rounded bg-white text-[#1B1F2A] text-[0.625rem] font-semibold border border-[#D5D9E2] flex items-center gap-1 shadow-2xs"
                          >
                            <Tag className="w-3 h-3 text-[#64748B]" />
                            <span>
                              {b.board}'{b.years.map((y) => toBn(String(y).slice(-2))).join(',')}
                            </span>
                          </span>
                        ))
                      ) : grp.stimulus?.boardTag ? (
                        <span className="px-2 py-0.5 rounded bg-white text-[#1B1F2A] text-[0.625rem] font-semibold border border-[#D5D9E2] flex items-center gap-1 shadow-2xs">
                          <Tag className="w-3 h-3 text-[#64748B]" />
                          <span>{grp.stimulus.boardTag}</span>
                        </span>
                      ) : null}

                      {/* Paper Usages Chips */}
                      {allUsages.map((u) => (
                        <span
                          key={u.paperId}
                          className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 text-[0.625rem] font-bold border border-emerald-200 flex items-center gap-1"
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
                            className="text-xs font-medium text-[#1B1F2A] leading-relaxed"
                          />

                          {grp.stimulus.imageIds?.map((imgId) => {
                            const url = imageUrls[imgId];
                            if (!url) return null;
                            return (
                              <div
                                key={imgId}
                                className="w-full my-2 overflow-hidden rounded-xl border border-[#D5D9E2] bg-white text-center"
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
                      <div className="space-y-3 pt-1 border-t border-[#F2F4F8]">
                        {grp.questions.map((question) => {
                          const isSolutionOpen = expandedSolutions[question.id] || false;
                          const solutionUrls = (question.solutionImageIds || [])
                            .map((id) => imageUrls[id])
                            .filter(Boolean) as string[];

                          return (
                            <div key={question.id} className="space-y-2">
                              {/* Question line: plain "গ." or "ঘ." in front */}
                              <div className="flex items-start gap-1.5 text-xs text-[#1B1F2A]">
                                <span className="font-bold shrink-0 text-[#1B1F2A]">
                                  {question.type ? `${question.type}.` : ''}
                                </span>
                                <RichText
                                  text={question.questionText}
                                  className="text-xs text-[#1B1F2A] leading-relaxed flex-1 font-medium"
                                />
                              </div>

                              {/* "সমাধান দেখো" button */}
                              <div>
                                <button
                                  type="button"
                                  aria-label={isSolutionOpen ? 'সমাধান লুকান' : 'সমাধান দেখুন'}
                                  onClick={() =>
                                    setExpandedSolutions((prev) => ({
                                      ...prev,
                                      [question.id]: !isSolutionOpen,
                                    }))
                                  }
                                  className="min-h-[44px] px-3.5 py-1.5 rounded-xl border border-[#D5D9E2] bg-white hover:bg-[#F2F4F8] text-xs font-semibold text-[#2A3BB0] flex items-center gap-1.5 transition-colors"
                                >
                                  {isSolutionOpen ? (
                                    <>
                                      <EyeOff className="w-4 h-4" />
                                      <span>সমাধান লুকাও</span>
                                    </>
                                  ) : (
                                    <>
                                      <Eye className="w-4 h-4" />
                                      <span>সমাধান দেখো</span>
                                    </>
                                  )}
                                </button>

                                {/* Solution expansion */}
                                {isSolutionOpen && (
                                  <div className="mt-2.5 p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2 animate-in fade-in duration-150">
                                    <div className="text-[0.6875rem] font-bold text-[#2A3BB0] uppercase tracking-wider">
                                      সমাধান:
                                    </div>
                                    <RichText
                                      text={question.solutionText}
                                      className="text-xs text-[#1B1F2A] leading-relaxed"
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
                                            className="w-full overflow-hidden rounded-xl border border-[#D5D9E2] bg-white cursor-pointer hover:opacity-95 transition-opacity"
                                            title="পূর্ণ স্ক্রিনে দেখতে ট্যাপ করুন"
                                          >
                                            <img
                                              src={url}
                                              alt="সমাধান চিত্র"
                                              className="w-full h-auto object-contain max-h-56 mx-auto"
                                            />
                                          </div>
                                        ))}
                                        <p className="text-[0.625rem] text-[#64748B] text-center italic">
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
              })
            )}
          </div>
        )}
      </main>

      {/* Floating Action Button (+ Add question) with Safe Area offset */}
      {currentView.level === 'questions' && (
        <button
          type="button"
          aria-label="নতুন প্রশ্ন যোগ করুন"
          onClick={() =>
            setQuestionFormState({
              isOpen: true,
              initialTopicId: currentView.topic.id,
              editQuestionId: null,
            })
          }
          style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
          className="fixed right-4 z-40 min-h-[48px] px-4 py-2.5 rounded-full bg-[#3B4FD8] hover:bg-[#2A3BB0] active:bg-[#202E91] text-white font-bold text-xs shadow-xl flex items-center gap-2 transition-transform hover:scale-105 active:scale-95"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
          <span>Add question</span>
        </button>
      )}

      {/* Full-screen Zoomable Image Viewer (Requirement 4) */}
      <ImageViewerModal
        isOpen={imageViewerState.isOpen}
        images={imageViewerState.images}
        initialIndex={imageViewerState.initialIndex}
        onClose={() => setImageViewerState((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Input Prompt Dialog (Add & Rename) */}
      <PromptDialog
        isOpen={promptDialog.isOpen}
        title={promptDialog.title}
        initialValue={promptDialog.initialValue}
        onConfirm={promptDialog.onConfirm}
        onCancel={() => setPromptDialog((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText="হ্যাঁ, নিশ্চিত"
        cancelText="না"
        isDestructive={true}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Full-Screen Question Add & Edit Modal */}
      <QuestionFormModal
        isOpen={questionFormState.isOpen}
        initialTopicId={questionFormState.initialTopicId}
        editQuestionId={questionFormState.editQuestionId}
        onClose={() =>
          setQuestionFormState({
            isOpen: false,
            initialTopicId: undefined,
            editQuestionId: null,
          })
        }
        onSaved={() => {
          loadData();
        }}
      />

      {/* Paste JSON Questions Modal */}
      <PasteQuestionsModal
        isOpen={showPasteModal && currentView.level === 'questions'}
        topicId={currentView.level === 'questions' ? currentView.topic.id : ''}
        topicName={currentView.level === 'questions' ? currentView.topic.name : ''}
        onClose={() => setShowPasteModal(false)}
        onSuccess={() => {
          loadData();
        }}
      />

      {/* Import Collection Modal */}
      <ImportCollectionModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={() => {
          loadData();
        }}
      />
    </div>
  );
};

export default CollectionScreen;
