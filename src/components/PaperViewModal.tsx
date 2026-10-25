import { getQuestionsByIds, getStimuliByIds } from '../db/crossDb';
import React, { useRef, useState, useEffect } from 'react';
import { X, Trash2, Edit3, FileDown, AlertTriangle, Minus, Plus, Timer } from 'lucide-react';
import { db, DEFAULT_PAPER_NOTE, type Paper, type Question, type Stimulus } from '../db/db';
import { deletePaper, getImageBlobUrl } from '../db/api';
import { RichText } from './RichText';
import { useToast } from './Toast';
import { ConfirmDialog } from './ConfirmDialog';
import { toBn } from '../utils/toBn';
import {
  PDF_FONT_SCALES,
  DEFAULT_PDF_FONT_SCALE,
  getPdfFontScale,
  savePdfFontScale,
} from '../utils/settings';
import { generateAndSharePdf } from '../utils/pdfGenerator';
import { showPdfSavedDialog } from '../utils/storageAccess';
import { ExamModal } from './ExamModal';

export interface PaperViewModalProps {
  paperId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (paper: Paper) => void;
  onDeleted: () => void;
}

export const PaperViewModal: React.FC<PaperViewModalProps> = ({
  paperId,
  isOpen,
  onClose,
  onEdit,
  onDeleted,
}) => {
  const { showToast } = useToast();
  const printAreaRef = useRef<HTMLDivElement>(null);
  const hiddenPrintAreaRef = useRef<HTMLDivElement>(null);

  const [paper, setPaper] = useState<Paper | null>(null);
  const [groupedQuestions, setGroupedQuestions] = useState<
    Array<{ stimulus?: Stimulus; questions: Question[] }>
  >([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [exportingPdf, setExportingPdf] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showExam, setShowExam] = useState(false);
  const [pdfErrorMessage, setPdfErrorMessage] = useState<string | null>(null);
  const [pdfFontScale, setPdfFontScale] = useState<number>(DEFAULT_PDF_FONT_SCALE);

  // Load the PDF text size that was selected last time
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    getPdfFontScale().then((v) => {
      if (!cancelled) setPdfFontScale(v);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const changePdfFontScale = (dir: -1 | 1) => {
    const idx = PDF_FONT_SCALES.indexOf(pdfFontScale as (typeof PDF_FONT_SCALES)[number]);
    const next = PDF_FONT_SCALES[Math.min(PDF_FONT_SCALES.length - 1, Math.max(0, idx + dir))];
    if (next === pdfFontScale) return;
    setPdfFontScale(next);
    savePdfFontScale(next); // remembered for the next export
  };

  useEffect(() => {
    if (!isOpen || !paperId) return;

    const loadPaperData = async () => {
      try {
        const p = await db.papers.get(paperId);
        if (!p) {
          showToast('প্রশ্নপত্র পাওয়া যায়নি');
          onClose();
          return;
        }
        setPaper(p);

        // Fetch questions
        const questionsList = await getQuestionsByIds(p.questionIds || []);

        // Sort by order in paper.questionIds
        questionsList.sort((a, b) => {
          const idxA = p.questionIds.indexOf(a.id);
          const idxB = p.questionIds.indexOf(b.id);
          return idxA - idxB;
        });

        // Group by stimulus
        const stimulusIds = Array.from(
          new Set(questionsList.map((q) => q.stimulusId).filter(Boolean))
        ) as string[];

        const stimuliMap = new Map<string, Stimulus>();
        if (stimulusIds.length > 0) {
          const stims = await getStimuliByIds(stimulusIds);
          stims.forEach((s) => stimuliMap.set(s.id, s));
        }

        const groups: Array<{ stimulus?: Stimulus; questions: Question[] }> = [];
        const stimGroupMap = new Map<string, Question[]>();
        const noStimQuestions: Question[] = [];

        for (const q of questionsList) {
          if (q.stimulusId && stimuliMap.has(q.stimulusId)) {
            const arr = stimGroupMap.get(q.stimulusId) || [];
            arr.push(q);
            stimGroupMap.set(q.stimulusId, arr);
          } else {
            noStimQuestions.push(q);
          }
        }

        stimGroupMap.forEach((qList, stimId) => {
          groups.push({
            stimulus: stimuliMap.get(stimId),
            questions: qList,
          });
        });

        for (const q of noStimQuestions) {
          groups.push({ questions: [q] });
        }

        setGroupedQuestions(groups);

        // Fetch Images Blob URLs
        const urls: Record<string, string> = {};
        for (const g of groups) {
          if (g.stimulus?.imageIds) {
            for (const imgId of g.stimulus.imageIds) {
              const url = await getImageBlobUrl(imgId);
              if (url) urls[imgId] = url;
            }
          }
          for (const q of g.questions) {
            if (q.solutionImageIds) {
              for (const imgId of q.solutionImageIds) {
                const url = await getImageBlobUrl(imgId);
                if (url) urls[imgId] = url;
              }
            }
          }
        }
        setImageUrls(urls);
      } catch (err) {
        console.error('Failed to load paper view:', err);
      }
    };

    loadPaperData();
  }, [isOpen, paperId]);

  if (!isOpen || !paper) return null;

  // Export to PDF with dedicated hidden container and error dialogue
  const handleExportPdf = async () => {
    const targetElement = hiddenPrintAreaRef.current || printAreaRef.current;
    if (!targetElement) return;

    setExportingPdf(true);
    showToast('PDF বানানো হচ্ছে…');

    try {
      const savedPath = await generateAndSharePdf({
        paper,
        groupedQuestions,
        imageUrls,
        fontScale: pdfFontScale,
      });
      if (!(savedPath && showPdfSavedDialog(savedPath))) {
        showToast(savedPath ? `PDF সেভ হয়েছে: ${savedPath}` : 'PDF তৈরি সম্পন্ন হয়েছে', savedPath ? 4500 : 2000);
      }
    } catch (err: any) {
      console.error('PDF export failed:', err);
      setPdfErrorMessage(err?.message || 'পিডিএফ তৈরিতে অপ্রত্যাশিত সমস্যা হয়েছে।');
    } finally {
      setExportingPdf(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deletePaper(paper.id);
      showToast('প্রশ্নপত্র মুছে ফেলা হয়েছে');
      setShowDeleteConfirm(false);
      onDeleted();
      onClose();
    } catch {
      showToast('মুছতে সমস্যা হয়েছে');
    }
  };

  const renderPaperContent = (isExport: boolean) => (
    <div
      className={`paper-a4 w-full bg-white text-[#111827] space-y-4 ${
        isExport ? 'p-8' : 'p-4 sm:p-6 shadow-xl rounded-xl border border-[#D5D9E2]'
      }`}
      style={{
        fontFamily: "'Hind Siliguri', serif",
        backgroundColor: '#FFFFFF',
        color: '#111827',
      }}
    >
      {/* Paper Header */}
      <div className="text-center space-y-1 pb-3 border-b-2 border-black/80">
        <h1 className="text-base sm:text-lg font-black text-black tracking-tight leading-snug">
          {paper.title}
        </h1>
        {paper.subjectLine && (
          <p className="text-xs font-bold text-black">{paper.subjectLine}</p>
        )}
        <div className="flex items-center justify-between text-[0.6875rem] font-bold text-black pt-1">
          <span>সময়: {paper.duration || '২ ঘণ্টা ৩০ মিনিট'}</span>
          <span>পূর্ণমান: {toBn(paper.totalMarks || 50)}</span>
        </div>
      </div>

      {/* Instruction Notice */}
      {(paper.note === undefined ? DEFAULT_PAPER_NOTE : paper.note).trim() && (
        <div className="text-center text-[0.6875rem] font-semibold text-black/80 italic whitespace-pre-wrap">
          {(paper.note === undefined ? DEFAULT_PAPER_NOTE : paper.note).trim()}
        </div>
      )}

      {/* Questions List */}
      <div className="space-y-4 pt-2">
        {groupedQuestions.map((group, gIdx) => (
          <div
            key={gIdx}
            className="space-y-2 pb-3 border-b border-gray-200 last:border-b-0"
            style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
          >
            {/* Stimulus with single question serial ("১।", "২।") */}
            <div className="space-y-1.5 text-xs">
              <div className="flex items-start gap-2 font-bold text-black">
                <span className="text-xs font-black text-black shrink-0">
                  {toBn(gIdx + 1)}।
                </span>
                {group.stimulus && (
                  <RichText
                    text={group.stimulus.text}
                    className="text-xs font-medium text-black leading-relaxed flex-1 min-w-0"
                  />
                )}
              </div>

              {group.stimulus && (
                <>
                  {group.stimulus.imageIds?.map((imgId) => {
                    const url = imageUrls[imgId];
                    if (!url) return null;
                    return (
                      <div
                        key={imgId}
                        className={`my-2.5 max-w-full sm:max-w-sm mx-auto overflow-hidden text-center bg-white ${
                          isExport ? '' : 'rounded-lg border border-gray-200 p-1'
                        }`}
                      >
                        <img
                          src={url}
                          alt="উদ্দীপক চিত্র"
                          className="w-full h-auto max-h-[260px] object-contain mx-auto rounded"
                        />
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            {/* Sub-questions (গ, ঘ) */}
            <div className="space-y-1.5 pl-3">
              {group.questions.map((q, qIdx) => (
                <div
                  key={q.id}
                  className="flex items-start justify-between gap-2 text-xs"
                  style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
                >
                  <div className="flex items-start gap-1 flex-1">
                    <span className="font-bold text-black shrink-0">
                      {q.type ? `${q.type}.` : `(${toBn(qIdx + 1)})`}
                    </span>
                    <RichText
                      text={q.questionText}
                      className="text-xs text-black leading-relaxed flex-1"
                    />
                  </div>
                  <span className="font-bold text-black text-xs shrink-0 pl-2">
                    {toBn(q.marks)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* End of Paper marker */}
      <div className="text-center text-[0.625rem] text-gray-500 pt-4">
        — সমাপ্ত —
      </div>
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="paper-view-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in duration-150"
    >
      <div className="w-full max-w-[390px] h-full sm:h-[844px] bg-app dark:bg-slate-900 text-ink flex flex-col relative overflow-hidden shadow-2xl sm:rounded-[36px] border border-line">
        {/* Top Header with Safe Area Inset */}
        <header
          className="bg-brand text-white px-4 h-14 flex items-center justify-between shrink-0 shadow-md"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="বন্ধ করুন"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 active:bg-white/20 text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 id="paper-view-title" className="text-sm font-bold text-white truncate max-w-[105px]">
              {paper.shortName}
            </h2>
          </div>

          {/* Quick Actions in Header */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="পিডিএফ ডাউনলোড করুন"
              disabled={exportingPdf}
              onClick={handleExportPdf}
              className="min-h-[44px] px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold flex items-center gap-1 transition-colors disabled:opacity-50"
            >
              <FileDown className="w-4 h-4" />
              <span>{exportingPdf ? 'তৈরি হচ্ছে...' : 'PDF'}</span>
            </button>
            <button
              type="button"
              aria-label="পরীক্ষা দিন"
              onClick={() => setShowExam(true)}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/20 text-white"
            >
              <Timer className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="প্রশ্নপত্র সম্পাদনা করুন"
              onClick={() => onEdit(paper)}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/20 text-white"
            >
              <Edit3 className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="প্রশ্নপত্র মুছুন"
              onClick={() => setShowDeleteConfirm(true)}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-red-500/30 text-red-200"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* PDF text size control (remembered for next time) */}
        <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-2 bg-surface border-b border-line">
          <span className="text-xs font-bold text-ink">PDF টেক্সট সাইজ</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="টেক্সট ছোট করুন"
              disabled={pdfFontScale <= PDF_FONT_SCALES[0]}
              onClick={() => changePdfFontScale(-1)}
              className="w-9 h-9 min-h-0 rounded-lg border border-line flex items-center justify-center text-brand disabled:opacity-40 active:bg-hover dark:active:bg-slate-800"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="min-w-[52px] text-center text-xs font-black text-brand">
              {toBn(Math.round(pdfFontScale * 100))}%
            </span>
            <button
              type="button"
              aria-label="টেক্সট বড় করুন"
              disabled={pdfFontScale >= PDF_FONT_SCALES[PDF_FONT_SCALES.length - 1]}
              onClick={() => changePdfFontScale(1)}
              className="w-9 h-9 min-h-0 rounded-lg border border-line flex items-center justify-center text-brand disabled:opacity-40 active:bg-hover dark:active:bg-slate-800"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable A4 Preview Container */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 bg-[#E5E9F0] dark:bg-slate-950/70">
          <div ref={printAreaRef}>
            {renderPaperContent(false)}
          </div>
        </div>

        {/* Dedicated Hidden A4 Container for pristine PDF export */}
        {/* Important: NEVER display:none! */}
        <div
          ref={hiddenPrintAreaRef}
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '-9999px',
            top: '0px',
            width: '794px',
            background: '#ffffff',
            boxSizing: 'border-box',
          }}
        >
          {renderPaperContent(true)}
        </div>

        <ExamModal paperId={paper.id} isOpen={showExam} onClose={() => setShowExam(false)} />

        {/* Delete Confirmation */}
        <ConfirmDialog
          isOpen={showDeleteConfirm}
          title="প্রশ্নপত্র মুছবেন?"
          message={`"${paper.shortName}" প্রশ্নপত্রটি স্থায়ীভাবে মুছে ফেলতে চান?`}
          confirmText="হ্যাঁ, মুছে ফেলুন"
          cancelText="না"
          isDestructive={true}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />

        {/* PDF Failure Error Modal showing real error.message */}
        {pdfErrorMessage && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in"
          >
            <div className="w-full max-w-sm bg-surface rounded-2xl p-5 border border-red-200 dark:border-red-900 shadow-2xl space-y-3">
              <div className="flex items-center gap-2 text-red-600 font-bold text-sm">
                <AlertTriangle className="w-5 h-5" />
                <span>PDF তৈরিতে ত্রুটি</span>
              </div>
              <p className="text-xs text-ink bg-danger-soft dark:bg-red-950/40 p-3 rounded-xl border border-red-100 dark:border-red-900 font-mono break-all leading-relaxed">
                {pdfErrorMessage}
              </p>
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setPdfErrorMessage(null)}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-brand text-white text-xs font-bold"
                >
                  ঠিক আছে
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaperViewModal;
