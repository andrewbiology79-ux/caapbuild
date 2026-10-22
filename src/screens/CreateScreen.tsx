import React, { useState, useEffect, useCallback } from 'react';
import { Header } from '../components/Header';
import { useToast } from '../components/Toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PaperFormModal } from '../components/PaperFormModal';
import { PaperViewModal } from '../components/PaperViewModal';
import { getPapers, getSelectedIds, getSelectedStimuliCount, type Paper } from '../db/api';
import { useNavigation } from '../utils/navigation';
import { toBn } from '../utils/toBn';
import {
  FileText,
  Plus,
  Calendar,
  Clock,
  Award,
  ChevronRight,
  FolderCheck,
  Sparkles,
  RefreshCw,
  Layers,
} from 'lucide-react';

export const CreateScreen: React.FC = () => {
  const { showToast } = useToast();
  const { switchTab } = useNavigation();

  const [papers, setPapers] = useState<Paper[]>([]);
  const [selectedCount, setSelectedCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  // Modals
  const [formOpen, setFormOpen] = useState(false);
  const [editPaper, setEditPaper] = useState<Paper | null>(null);

  const [viewPaperId, setViewPaperId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [list, selIds] = await Promise.all([getPapers(), getSelectedIds()]);
      const stimCount = await getSelectedStimuliCount(selIds);
      setPapers(list);
      setSelectedCount(stimCount);
    } catch (err) {
      console.error('Failed to load papers:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenCreateNew = () => {
    setEditPaper(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (paper: Paper) => {
    setViewPaperId(null);
    setEditPaper(paper);
    setFormOpen(true);
  };

  const menuItems = [
    {
      id: 'new-paper',
      label: 'নতুন প্রশ্নপত্র তৈরি',
      icon: <Plus className="w-4 h-4 text-[#3B4FD8]" />,
      onClick: handleOpenCreateNew,
    },
    {
      id: 'go-collection',
      label: 'কালেকশন থেকে প্রশ্ন নির্বাচন',
      icon: <Layers className="w-4 h-4 text-[#2A3BB0]" />,
      onClick: () => switchTab('collection'),
    },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-full pb-24 bg-[#F2F4F8] dark:bg-slate-900 transition-colors">
      <Header
        title="তৈরি (Create)"
        subtitle="পরীক্ষা ও প্রশ্নপত্র ব্যবস্থাপনা"
        menuItems={menuItems}
      />

      <main className="flex-1 p-3.5 space-y-3.5">
        {/* Selected Questions Notice / Action Banner */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-3.5 border border-[#D5D9E2] dark:border-slate-700 shadow-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#EEF2FF] dark:bg-indigo-950 flex items-center justify-center text-[#3B4FD8] dark:text-indigo-400 shrink-0">
              <FolderCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-[#1B1F2A] dark:text-slate-100 block">
                {selectedCount > 0
                  ? `${toBn(selectedCount)}টি প্রশ্ন নির্বাচিত আছে`
                  : 'কোনো প্রশ্ন নির্বাচন করা হয়নি'}
              </span>
              <p className="text-[0.6875rem] text-[#64748B] dark:text-slate-400">
                {selectedCount > 0
                  ? 'নির্বাচিত প্রশ্নগুলো দিয়ে সরাসরি প্রশ্নপত্র তৈরি করতে পারেন'
                  : 'কালেকশন ট্যাবে গিয়ে প্রশ্ন নির্বাচন করুন'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={selectedCount > 0 ? handleOpenCreateNew : () => switchTab('collection')}
            className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-[#3B4FD8] hover:bg-[#2A3BB0] active:bg-[#202E91] text-white text-xs font-bold shrink-0 shadow-2xs transition-colors"
          >
            {selectedCount > 0 ? '+ তৈরি করো' : 'নির্বাচন করো'}
          </button>
        </div>

        {/* Papers Section Title */}
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-bold text-[#1B1F2A] dark:text-slate-200">
            তৈরি প্রশ্নপত্রের তালিকা ({toBn(papers.length)}টি)
          </h2>
          <button
            type="button"
            onClick={handleOpenCreateNew}
            className="text-xs font-bold text-[#3B4FD8] dark:text-indigo-400 hover:underline"
          >
            + নতুন প্রশ্নপত্র
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="py-12 text-center text-xs text-[#64748B] dark:text-slate-400 flex flex-col items-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-[#3B4FD8]" />
            <span>প্রশ্নপত্র লোড হচ্ছে...</span>
          </div>
        )}

        {/* Empty State */}
        {!loading && papers.length === 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-7 text-center border border-[#D5D9E2] dark:border-slate-700 shadow-xs space-y-3">
            <div className="w-14 h-14 rounded-full bg-[#EEF2FF] dark:bg-indigo-950 flex items-center justify-center mx-auto text-[#3B4FD8] dark:text-indigo-400">
              <FileText className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-bold text-[#1B1F2A] dark:text-slate-100">
              কোনো প্রশ্নপত্র তৈরি করা হয়নি
            </h3>
            <p className="text-xs text-[#64748B] dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
              কালেকশন থেকে প্রশ্ন সিলেক্ট করে বা সরাসরি তথ্য দিয়ে সুন্দর A4 সাইজের পরীক্ষার প্রশ্নপত্র তৈরি ও প্রিন্ট করুন।
            </p>
            <button
              type="button"
              onClick={handleOpenCreateNew}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#3B4FD8] hover:bg-[#2A3BB0] text-white text-xs font-bold shadow-xs transition-colors"
            >
              + প্রথম প্রশ্নপত্র তৈরি করুন
            </button>
          </div>
        )}

        {/* List of Created Papers */}
        {!loading && papers.length > 0 && (
          <div className="space-y-2.5">
            {papers.map((paper) => {
              const qCount = paper.questionIds?.length || 0;
              const dateStr = new Date(paper.createdAt || Date.now()).toLocaleDateString('bn-BD', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              });

              return (
                <div
                  key={paper.id}
                  onClick={() => setViewPaperId(paper.id)}
                  className="bg-white dark:bg-slate-800 hover:border-[#3B4FD8] dark:hover:border-indigo-500 rounded-2xl p-4 border border-[#D5D9E2] dark:border-slate-700 shadow-xs flex items-center justify-between gap-3 cursor-pointer transition-all group"
                >
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-[#EEF2FF] dark:bg-indigo-950 text-[#3B4FD8] dark:text-indigo-300 font-bold text-[0.6875rem] border border-[#D5D9E2] dark:border-indigo-900 truncate">
                        {paper.shortName}
                      </span>
                      {paper.category && (
                        <span className="text-[0.625rem] text-[#64748B] dark:text-slate-400 bg-[#F2F4F8] dark:bg-slate-700 px-2 py-0.5 rounded-md">
                          {paper.category}
                        </span>
                      )}
                    </div>

                    <h3 className="text-sm font-bold text-[#1B1F2A] dark:text-slate-100 truncate group-hover:text-[#3B4FD8] dark:group-hover:text-indigo-400 transition-colors">
                      {paper.title}
                    </h3>

                    <div className="flex flex-wrap items-center gap-3 text-[0.6875rem] text-[#64748B] dark:text-slate-400">
                      <span className="flex items-center gap-1 font-medium">
                        <Award className="w-3.5 h-3.5 text-[#3B4FD8]" />
                        <span>{toBn(paper.totalMarks || 50)} নম্বর</span>
                      </span>

                      <span className="flex items-center gap-1 font-medium">
                        <FileText className="w-3.5 h-3.5 text-[#2A3BB0]" />
                        <span>{toBn(qCount)}টি প্রশ্ন</span>
                      </span>

                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{dateStr}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 text-[#3B4FD8] dark:text-indigo-400 shrink-0">
                    <span className="text-xs font-semibold hidden sm:inline">দেখুন</span>
                    <ChevronRight className="w-5 h-5 text-[#94A3B8] group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Floating Action Button (+ New Paper) */}
      <button
        type="button"
        aria-label="নতুন প্রশ্নপত্র তৈরি করুন"
        onClick={handleOpenCreateNew}
        style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
        className="fixed right-4 z-40 min-h-[48px] px-4 py-2.5 rounded-full bg-[#3B4FD8] hover:bg-[#2A3BB0] active:bg-[#202E91] text-white font-bold text-xs shadow-xl flex items-center gap-2 transition-transform hover:scale-105 active:scale-95"
      >
        <Plus className="w-5 h-5 stroke-[2.5]" />
        <span>নতুন প্রশ্নপত্র</span>
      </button>

      {/* Paper Form Modal (Create / Edit) */}
      <PaperFormModal
        isOpen={formOpen}
        editPaper={editPaper}
        onClose={() => {
          setFormOpen(false);
          setEditPaper(null);
        }}
        onSaved={loadData}
      />

      {/* Paper View Modal (A4 Preview & PDF Export) */}
      <PaperViewModal
        paperId={viewPaperId}
        isOpen={Boolean(viewPaperId)}
        onClose={() => setViewPaperId(null)}
        onEdit={handleOpenEdit}
        onDeleted={loadData}
      />
    </div>
  );
};

export default CreateScreen;
