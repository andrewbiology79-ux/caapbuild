import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Header } from '../components/Header';
import { useToast } from '../components/Toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PromptDialog } from '../components/PromptDialog';
import { QuestionFormModal } from '../components/QuestionFormModal';
import { ImportCollectionModal } from '../components/ImportCollectionModal';
import {
  getMultiClipboard,
  getMultiClipboardMode,
  clearMultiClipboard,
  pasteMultiClipboard,
  countMultiClipboard,
} from '../db/crossDb';
import { PasteQuestionsModal } from '../components/PasteQuestionsModal';
import { ImageViewerModal } from '../components/ImageViewerModal';
import { ReferenceDialog } from '../components/ReferenceDialog';
import { exportQuestionCollection } from '../utils/collectionTransfer';
import { RichText } from '../components/RichText';
import { QuestionBoardTags } from '../components/QuestionBoardTags';
import { KebabMenu, type MenuItem } from '../components/KebabMenu';
import { HierarchyList } from '../features/collection/HierarchyList';
import { QuestionGroupCard } from '../features/collection/QuestionGroupCard';
import { toBn, toBnPad2 } from '../utils/toBn';
import { useNavigation } from '../utils/navigation';
import { getDb, type CqScope } from '../db/db';
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
} from '../db/api';
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

type DrillView =
  | { level: 'subjects' }
  | { level: 'chapters'; subject: Subject }
  | { level: 'topics'; subject: Subject; chapter: Chapter }
  | { level: 'questions'; subject: Subject; chapter: Chapter; topic: Topic };

// Remembers where the user was inside Collection, so switching tabs and coming back restores it
const lastDrillViews: Record<CqScope, DrillView> = {
  type: { level: 'subjects' },
  chapter: { level: 'subjects' },
};

interface CollectionScreenProps {
  /** 'type' = Type CQ (old Collection), 'chapter' = Chapter CQ */
  scope?: CqScope;
}

/**
 * Used by the Filter tab ("open where this question is"): jump straight to a topic's question list
 * the next time the Type CQ / Chapter CQ tab opens, and highlight the question there.
 */
const pendingFocusQuestion: Record<CqScope, string | null> = { type: null, chapter: null };

export function openCollectionAtQuestion(
  scope: CqScope,
  location: { subject: Subject; chapter: Chapter; topic: Topic },
  questionId: string
): void {
  lastDrillViews[scope] = { level: 'questions', ...location };
  pendingFocusQuestion[scope] = questionId;
}

export const CollectionScreen: React.FC<CollectionScreenProps> = ({ scope = 'type' as CqScope }) => {
  const db = getDb(scope);
  const { seedInitialDataIfNeeded, getSubjects, getChapters, getTopics, getQuestionsByTopicGrouped, getHierarchyStats, getSelectedIds, toggleStimulusSelect, getSelectedStimuliCount, clearSelection, copyStimulusGroup, getGroupClipboard, clearGroupClipboard, pasteStimulusGroup, deleteStimulusGroup, getQuestionPaperUsage, getImageBlobUrl, addSubject, updateSubject, deleteSubject, reorderSubjects, addChapter, updateChapter, deleteChapter, reorderChapters, addTopic, updateTopic, deleteTopic, reorderTopics } = getApi(scope);
  const { showToast } = useToast();
  const { registerBackHandler } = useNavigation();

  // Navigation Drill-down View State (restored from last visit)
  const [currentView, setCurrentView] = useState<DrillView>(lastDrillViews[scope]);

  useEffect(() => {
    lastDrillViews[scope] = currentView;
  }, [currentView, scope]);

  // If the remembered chapter/topic no longer exists (deleted/imported elsewhere), fall back to subjects
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = lastDrillViews[scope];
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
  // Questions copied from the Filter tab (many at once)
  const [multiClipCount, setMultiClipCount] = useState<number>(0);
  const [multiClipMode, setMultiClipMode] = useState<'copy' | 'cut'>('copy');
  // "রেফারেন্স দেখুন" dialog of a question card
  const [referenceView, setReferenceView] = useState<{ isOpen: boolean; text: string }>({ isOpen: false, text: '' });

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

      const [subList, statsData, selIds, clip, multiClip, multiMode] = await Promise.all([
        getSubjects(),
        getHierarchyStats(),
        getSelectedIds(),
        getGroupClipboard(),
        getMultiClipboard(),
        getMultiClipboardMode(),
      ]);
      setMultiClipCount(countMultiClipboard(multiClip));
      setMultiClipMode(multiMode);

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
  }, [currentView, showToast, scope, multiClipCount]);

  useEffect(() => {
    loadData();
    setIsReordering(false);
  }, [loadData]);

  // Chapter CQ has no topic level: every chapter owns one hidden default topic that holds its questions
  const openChapter = useCallback(
    async (subject: Subject, chapter: Chapter) => {
      if (scope !== 'chapter') {
        setCurrentView({ level: 'topics', subject, chapter });
        return;
      }
      try {
        const existing = await getTopics(chapter.id);
        const topic = existing[0] ?? (await addTopic(chapter.id, 'সকল প্রশ্ন'));
        setCurrentView({ level: 'questions', subject, chapter, topic });
      } catch (err) {
        console.error('Failed to open chapter:', err);
        showToast('অধ্যায় খুলতে সমস্যা হয়েছে');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, showToast]
  );

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

    if (currentView.level === 'questions' && scope === 'chapter') {
      setCurrentView({ level: 'chapters', subject: currentView.subject });
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
  }, [currentView, isReordering, imageViewerState.isOpen, scope]);

  // Register with Capacitor Back Button listener
  useEffect(() => {
    const unregister = registerBackHandler(() => {
      return handleGoBack();
    });
    return unregister;
  }, [handleGoBack, registerBackHandler]);

  // Arrived from the Filter tab: scroll to the question and flash it
  useEffect(() => {
    const qid = pendingFocusQuestion[scope];
    if (!qid || currentView.level !== 'questions' || loading || questionGroups.length === 0) return;
    const el = document.querySelector<HTMLElement>(`[data-qids~="${qid}"]`);
    if (!el) return;
    pendingFocusQuestion[scope] = null;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const cls = ['ring-4', 'ring-amber-400'];
    el.classList.add(...cls);
    window.setTimeout(() => el.classList.remove(...cls), 2200);
  }, [scope, currentView, loading, questionGroups]);

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

  // Batch: select / unselect every question group currently visible in this topic (respects the search box)
  const visibleGroupsRef = useRef<StimulusWithQuestions[]>([]);
  const handleBatchSelectVisible = async (select: boolean) => {
    try {
      const groups = visibleGroupsRef.current;
      let current = await getSelectedIds();
      let changedGroups = 0;
      for (const grp of groups) {
        const qIds = grp.questions.map((q) => q.id);
        if (qIds.length === 0) continue;
        const allSel = qIds.every((id) => current.includes(id));
        const anySel = qIds.some((id) => current.includes(id));
        if (select && !allSel) {
          current = await toggleStimulusSelect(grp.stimulus?.id, qIds);
          changedGroups++;
        } else if (!select && anySel) {
          if (!allSel) current = await toggleStimulusSelect(grp.stimulus?.id, qIds); // make it "all" first
          current = await toggleStimulusSelect(grp.stimulus?.id, qIds); // then unselect all
          changedGroups++;
        }
      }
      setSelectedIds(current);
      setSelectedStimuliCount(await getSelectedStimuliCount(current));
      setStats(await getHierarchyStats());
      showToast(
        changedGroups === 0
          ? 'কোনো পরিবর্তন হয়নি'
          : select
          ? `${toBn(changedGroups)}টি গ্রুপের প্রশ্ন নির্বাচন করা হয়েছে`
          : `${toBn(changedGroups)}টি গ্রুপের নির্বাচন বাতিল করা হয়েছে`
      );
    } catch {
      showToast('নির্বাচন আপডেট করা যায়নি');
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
      await clearMultiClipboard(); // only one clipboard is active at a time
      setMultiClipCount(0);
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
      if (currentView.level !== 'questions') return;

      // Questions copied from the Filter tab
      if (multiClipCount > 0) {
        const n = await pasteMultiClipboard(scope, currentView.topic.id, position, {
          stimulusId: targetGrp.stimulus?.id,
          questionId: targetGrp.questions[0]?.id,
        });
        showToast(`${toBn(n)}টি প্রশ্ন পেস্ট হয়েছে`);
        loadData();
        return;
      }

      const clip = await getGroupClipboard();
      if (!clip || clip.questions.length === 0) {
        showToast('আগে Copy বা Cut করুন');
        return;
      }

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

  // Paste the questions copied from the Filter tab at the END of the open type / chapter
  const handlePasteMultiAtEnd = async () => {
    if (currentView.level !== 'questions') return;
    try {
      if (multiClipCount === 0) {
        showToast('ফিল্টার ট্যাব থেকে আগে প্রশ্ন কপি করুন');
        return;
      }
      const n = await pasteMultiClipboard(scope, currentView.topic.id, 'end');
      showToast(`${toBn(n)}টি প্রশ্ন পেস্ট হয়েছে`);
      loadData();
    } catch (err) {
      console.error(err);
      showToast('পেস্ট করতে ব্যর্থ হয়েছে');
    }
  };

  // Clear Group Clipboard
  const handleClearClipboard = async () => {
    await clearGroupClipboard();
    await clearMultiClipboard();
    setMultiClipCount(0);
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
    return scope === 'chapter' ? 'Chapter CQ' : 'Type CQ';
  }, [currentView, scope]);

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
      icon: <PlusCircle className="w-4 h-4 text-brand-fg" />,
      onClick: handleOpenAddDialog,
    });

    if (currentView.level === 'questions') {
      items.push({
        id: 'paste-json',
        label: 'JSON পেস্ট করে প্রশ্ন যোগ',
        icon: <Upload className="w-4 h-4 text-brand-fg" />,
        onClick: () => setShowPasteModal(true),
      });
      items.push({
        id: 'paste-copied',
        label:
          multiClipCount > 0
            ? `${multiClipMode === 'cut' ? 'কাট' : 'কপি'} করা প্রশ্ন পেস্ট করুন (${toBn(multiClipCount)}টি)`
            : 'কপি/কাট করা প্রশ্ন পেস্ট করুন',
        icon: <ClipboardPaste className="w-4 h-4 text-emerald-600" />,
        onClick: handlePasteMultiAtEnd,
      });
    }

    // Rename & Delete for active screen container
    if (currentView.level === 'chapters') {
      items.push({
        id: 'rename-subj',
        label: 'বিষয়ের নাম পরিবর্তন',
        icon: <FileEdit className="w-4 h-4 text-ink" />,
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
        icon: <FileEdit className="w-4 h-4 text-ink" />,
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
        icon: <FileEdit className="w-4 h-4 text-ink" />,
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
        label: scope === 'chapter' ? 'Import Chapter CQ' : 'Import Type CQ',
        icon: <Upload className="w-4 h-4 text-brand-fg" />,
        onClick: () => setShowImportModal(true),
      });
      items.push({
        id: 'export',
        label: scope === 'chapter' ? 'Export Chapter CQ' : 'Export Type CQ',
        icon: <Download className="w-4 h-4 text-brand-fg" />,
        onClick: async () => {
          try {
            const ok = await exportQuestionCollection(scope);
            if (ok) {
              showToast(`${scope === 'chapter' ? 'Chapter CQ' : 'Type CQ'} সফলভাবে এক্সপোর্ট হয়েছে`);
            } else {
              showToast('এক্সপোর্ট করা যায়নি');
            }
          } catch {
            showToast('এক্সপোর্ট করা যায়নি');
          }
        },
      });
    }

    // Batch selection (only inside a topic's question list)
    if (currentView.level === 'questions') {
      items.push({
        id: 'batch-select-visible',
        label: 'দেখা যাচ্ছে এমন সব প্রশ্ন নির্বাচন করুন',
        icon: <CheckSquare className="w-4 h-4 text-brand-fg" />,
        onClick: () => handleBatchSelectVisible(true),
      });
      items.push({
        id: 'batch-unselect-visible',
        label: 'দেখা যাচ্ছে এমন সব প্রশ্নের নির্বাচন বাতিল',
        icon: <Square className="w-4 h-4 text-brand-fg" />,
        onClick: () => handleBatchSelectVisible(false),
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
  }, [currentView, showToast, scope]);

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

  visibleGroupsRef.current = filteredQuestionGroups;

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
        isCurrent: currentView.level === 'topics' || (scope === 'chapter' && currentView.level === 'questions'),
        onClick:
          currentView.level === 'topics' || (scope === 'chapter' && currentView.level === 'questions')
            ? undefined
            : () => openChapter(currentView.subject, c),
      });
    }

    // Level 3: Topic (Chapter CQ has no visible topic level)
    if (currentView.level === 'questions' && scope !== 'chapter') {
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
  }, [currentView, scope, openChapter]);

  return (
    <div className="flex-1 flex flex-col min-h-full pb-20 bg-app">
      {/* Top Header */}
      <Header
        title={currentTitle}
        showBack={currentView.level !== 'subjects'}
        onBack={handleGoBack}
        menuItems={headerMenuItems}
      />

      {/* Top Control Bar (Requirement 7: Horizontal Scrollable Breadcrumb) */}
      <div className="bg-surface border-b border-line px-3.5 py-2 shadow-2xs space-y-2">
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
                    ? 'font-bold text-ink cursor-default pointer-events-none'
                    : 'text-brand-ink hover:bg-brand-hover font-medium active:bg-press'
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
                  ? 'bg-brand text-white border-brand'
                  : 'bg-brand-soft text-brand-ink border-line hover:bg-press'
              }`}
            >
              {isReordering ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Done</span>
                </>
              ) : (
                <>
                  <Layers className="w-3.5 h-3.5 text-brand-fg" />
                  <span>Reorder</span>
                </>
              )}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full bg-brand-soft text-brand-ink text-xs font-bold border border-line">
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
          <div className="text-xs text-ink-muted font-medium">
            {currentView.level === 'subjects' && `মোট বিষয়: ${toBn(subjects.length)}টি`}
            {currentView.level === 'chapters' && `মোট অধ্যায়: ${toBn(chapters.length)}টি`}
            {currentView.level === 'topics' && `মোট টপিক: ${toBn(topics.length)}টি`}
            {currentView.level === 'questions' && `মোট প্রশ্ন: ${toBn(filteredQuestionGroups.length)}টি`}
          </div>
        </div>

        {/* Search Box on Questions Screen */}
        {currentView.level === 'questions' && (
          <div className="relative pt-1">
            <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="প্রশ্ন, উদ্দীপক বা বোর্ড ট্যাগ খুঁজুন..."
              className="w-full min-h-[44px] pl-9 pr-8 py-2 rounded-xl bg-app border border-line text-xs text-ink focus:outline-none focus:ring-2 focus:ring-brand focus:bg-surface transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="অনুসন্ধান মুছুন"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-muted hover:text-ink p-1 font-bold"
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
          <div className="py-16 text-center text-xs text-ink-muted flex flex-col items-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-brand-fg" />
            <span>ডাটা লোড হচ্ছে...</span>
          </div>
        )}

        {/* ---------------- LEVEL 0-2: SUBJECTS / CHAPTERS / TOPICS ---------------- */}
        {!loading && currentView.level === 'subjects' && (
          <HierarchyList
            items={subjects}
            stats={stats.subjectStats}
            isReordering={isReordering}
            emptyText="কোনো বিষয় যুক্ত করা হয়নি"
            addLabel="+ বিষয় যোগ করুন"
            onAdd={handleOpenAddDialog}
            onOpen={(subject) => setCurrentView({ level: 'chapters', subject })}
            onRename={(i) => handleRenameItem('subject', i.id, i.name)}
            onDelete={(i) => handleDeleteItem('subject', i.id, i.name)}
            onMove={handleMoveItem}
          />
        )}

        {!loading && currentView.level === 'chapters' && (
          <HierarchyList
            items={chapters}
            stats={stats.chapterStats}
            isReordering={isReordering}
            emptyText="এই বিষয়ে এখনো কোনো অধ্যায় নেই"
            addLabel="+ অধ্যায় যোগ করুন"
            onAdd={handleOpenAddDialog}
            onOpen={(chapter) => openChapter(currentView.subject, chapter)}
            onRename={(i) => handleRenameItem('chapter', i.id, i.name)}
            onDelete={(i) => handleDeleteItem('chapter', i.id, i.name)}
            onMove={handleMoveItem}
          />
        )}

        {!loading && currentView.level === 'topics' && (
          <HierarchyList
            items={topics}
            stats={stats.topicStats}
            isReordering={isReordering}
            emptyText="এই অধ্যায়ে এখনো কোনো টপিক নেই"
            addLabel="+ টপিক যোগ করুন"
            onAdd={handleOpenAddDialog}
            onOpen={(topic) =>
              setCurrentView({
                level: 'questions',
                subject: currentView.subject,
                chapter: currentView.chapter,
                topic,
              })
            }
            onRename={(i) => handleRenameItem('topic', i.id, i.name)}
            onDelete={(i) => handleDeleteItem('topic', i.id, i.name)}
            onMove={handleMoveItem}
          />
        )}

        {/* ---------------- LEVEL 3: QUESTIONS LIST (Requirement 3) ---------------- */}
        {!loading && currentView.level === 'questions' && (
          <div className="space-y-4">
            {/* Clipboard Notice Bar */}
            {multiClipCount > 0 && (
              <div className="bg-[#ECFDF5] border border-emerald-500 rounded-xl px-3.5 py-2.5 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300 font-bold shadow-2xs">
                <span>
                  {toBn(multiClipCount)}টি প্রশ্ন {multiClipMode === 'cut' ? 'কাট' : 'কপি'} করা আছে — প্রশ্নের মেনু থেকে "Paste after / before" বা রিবন মেনু থেকে পেস্ট করুন
                </span>
                <button
                  type="button"
                  aria-label="ক্লিপবোর্ড খালি করুন"
                  onClick={handleClearClipboard}
                  className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center hover:bg-white/80 text-emerald-700 font-bold text-sm"
                >
                  ✕
                </button>
              </div>
            )}
            {groupClipboard && multiClipCount === 0 && (
              <div className="bg-brand-soft border border-brand rounded-xl px-3.5 py-2.5 flex items-center justify-between text-xs text-brand-ink font-bold shadow-2xs">
                <span>
                  ১টি প্রশ্ন {groupClipboard.mode === 'cut' ? 'কাট' : 'কপি'} করা আছে
                </span>
                <button
                  type="button"
                  aria-label="ক্লিপবোর্ড খালি করুন"
                  onClick={handleClearClipboard}
                  className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/80 text-brand-fg font-bold text-sm"
                >
                  ✕
                </button>
              </div>
            )}

            {filteredQuestionGroups.length === 0 ? (
              <div className="bg-surface rounded-2xl p-8 text-center border border-line space-y-3">
                <p className="text-sm font-semibold text-ink">
                  {searchQuery ? 'অনুসন্ধানের সাথে কোনো প্রশ্ন মেলেনি' : 'এই টপিকে এখনো প্রশ্ন নেই'}
                </p>
                <p className="text-xs text-ink-muted">
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
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-strong text-white text-xs font-semibold shadow-xs"
                >
                  + Add question
                </button>
              </div>
            ) : (
              filteredQuestionGroups.map((grp, grpIdx) => (
                <QuestionGroupCard
                  key={grp.stimulus?.id || `group-${grpIdx}`}
                  grp={grp}
                  grpIdx={grpIdx}
                  selectedIds={selectedIds}
                  questionUsages={questionUsages}
                  imageUrls={imageUrls}
                  expandedSolutions={expandedSolutions}
                  setExpandedSolutions={setExpandedSolutions}
                  setReferenceView={setReferenceView}
                  handleToggleStimulusGroup={handleToggleStimulusGroup}
                  handleCopyOrCutGroup={handleCopyOrCutGroup}
                  handlePasteGroup={handlePasteGroup}
                  handleDeleteGroupPrompt={handleDeleteGroupPrompt}
                  handleEditGroup={handleEditGroup}
                  handleOpenImageViewer={handleOpenImageViewer}
                />
              ))
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
          className="fixed right-4 z-40 min-h-[48px] px-4 py-2.5 rounded-full bg-brand hover:bg-brand-strong active:bg-[#202E91] text-white font-bold text-xs shadow-xl flex items-center gap-2 transition-transform hover:scale-105 active:scale-95"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
          <span>Add question</span>
        </button>
      )}

      <ReferenceDialog
        isOpen={referenceView.isOpen}
        reference={referenceView.text}
        onClose={() => setReferenceView({ isOpen: false, text: '' })}
      />

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
        scope={scope}
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
        scope={scope}
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
        scope={scope}
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
