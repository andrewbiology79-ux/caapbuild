import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  Download,
  AlertCircle,
  FileCheck,
  CheckCircle2,
  Image as ImageIcon,
  RefreshCw,
  FolderOpen,
} from 'lucide-react';
import {
  parseAndValidateCollectionJson,
  executeCollectionImport,
  getSampleCollectionJson,
  type CollectionPreviewResult,
} from '../utils/collectionTransfer';
import { exportJsonFile } from '../utils/fileExport';
import { useToast } from './Toast';
import { ConfirmDialog } from './ConfirmDialog';
import { toBn } from '../utils/toBn';
import type { CqScope } from '../db/db';

export interface ImportCollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** which collection to import into (default: Type CQ) */
  scope?: CqScope;
}

export const ImportCollectionModal: React.FC<ImportCollectionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  scope = 'type' as CqScope,
}) => {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imagesInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [preview, setPreview] = useState<CollectionPreviewResult | null>(null);

  // Mode: merge or replace
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');

  // Manual image files selected
  const [manualImages, setManualImages] = useState<File[]>([]);

  // Confirmation dialog state for 'replace' mode
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const [importing, setImporting] = useState(false);

  if (!isOpen) return null;

  // Handle JSON file selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setAnalyzing(true);
    setPreview(null);
    setManualImages([]);

    try {
      const text = await file.text();
      const res = await parseAndValidateCollectionJson(text, scope);
      setPreview(res);
    } catch (err: any) {
      setPreview({
        valid: false,
        errorMessage: `ফাইল পড়তে ব্যর্থ হয়েছে: ${err.message || 'অজানা ত্রুটি'}`,
        subjectsCount: 0,
        chaptersCount: 0,
        topicsCount: 0,
        stimuliCount: 0,
        totalQuestions: 0,
        newQuestionsCount: 0,
        duplicateQuestionsCount: 0,
        missingImageFiles: [],
      });
    } finally {
      setAnalyzing(false);
    }
  };

  // Handle manual image files selection
  const handleManualImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    setManualImages((prev) => [...prev, ...fileArray]);
    showToast(`${toBn(fileArray.length)}টি ছবি বাছাই করা হয়েছে`);
  };

  // Download Sample JSON
  const handleDownloadSample = async () => {
    try {
      const sampleContent = getSampleCollectionJson(scope);
      const success = await exportJsonFile(scope === 'chapter' ? 'qb-chapter-cq-sample.json' : 'qb-type-cq-sample.json', sampleContent);
      if (success) {
        showToast('নমুনা JSON ফাইল ডাউনলোড হয়েছে');
      } else {
        showToast('ফাইল ডাউনলোড ব্যর্থ হয়েছে');
      }
    } catch (err) {
      console.error('Failed to download sample:', err);
      showToast('ডাউনলোড করতে সমস্যা হয়েছে');
    }
  };

  // Trigger Import
  const handleStartImport = () => {
    if (!preview || !preview.valid || !preview.rawPayload) return;

    if (importMode === 'replace') {
      setShowReplaceConfirm(true);
    } else {
      runImport();
    }
  };

  // Run the actual import operation
  const runImport = async () => {
    if (!preview || !preview.rawPayload) return;

    setImporting(true);
    try {
      const stats = await executeCollectionImport(preview.rawPayload, {
        mode: importMode,
        manualFiles: manualImages,
      }, scope);

      showToast(
        `সফলভাবে ${toBn(stats.subjects)}টি বিষয় ও ${toBn(stats.questions)}টি প্রশ্ন ইমপোর্ট হয়েছে`
      );
      onSuccess();
      handleClose();
    } catch (err: any) {
      console.error('Import execution failed:', err);
      showToast(`ইমপোর্টে সমস্যা হয়েছে: ${err.message || 'ত্রুটি'}`);
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setPreview(null);
    setManualImages([]);
    setImportMode('merge');
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
    >
      <div className="w-full max-w-[370px] bg-surface text-ink rounded-3xl border border-line shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="bg-brand text-white px-5 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-white" />
            <h2 id="import-modal-title" className="text-base font-bold text-white">
              {scope === 'chapter' ? 'Chapter CQ ইমপোর্ট' : 'Type CQ ইমপোর্ট'}
            </h2>
          </div>
          <button
            type="button"
            aria-label="বন্ধ করুন"
            onClick={handleClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 active:bg-white/20 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Top Actions: File Select and Sample File Download */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 min-h-[44px] px-3.5 py-2.5 rounded-xl bg-brand hover:bg-brand-strong active:bg-[#202E91] text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
                <span>JSON ফাইল বাছুন</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadSample}
                className="min-h-[44px] px-3 py-2.5 rounded-xl border border-line bg-surface hover:bg-hover dark:hover:bg-slate-700/60 text-brand-ink dark:text-indigo-300 text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 shadow-2xs"
                title="নমুনা ফাইল ডাউনলোড করুন"
              >
                <Download className="w-4 h-4 text-brand" />
                <span>নমুনা ফাইল নামাও</span>
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="hidden"
            />

            {selectedFile && (
              <p className="text-[0.6875rem] text-ink-muted px-1 truncate">
                বাছাইকৃত ফাইল: <span className="font-semibold text-ink">{selectedFile.name}</span>
              </p>
            )}
          </div>

          {/* Loading Indicator */}
          {analyzing && (
            <div className="p-6 text-center text-xs text-ink-muted flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-brand-fg" />
              <span>ফাইল বিশ্লেষণ করা হচ্ছে...</span>
            </div>
          )}

          {/* Error Message Display */}
          {preview && !preview.valid && (
            <div className="p-3.5 rounded-2xl bg-danger-soft dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                <span>ফাইল ত্রুটিযুক্ত</span>
              </div>
              <p className="text-xs leading-relaxed">{preview.errorMessage}</p>
            </div>
          )}

          {/* Valid Preview Display */}
          {preview && preview.valid && (
            <div className="space-y-4">
              {/* Summary Stats Card */}
              <div className="p-3.5 rounded-2xl bg-brand-soft border border-line dark:border-indigo-900/50 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-brand-ink dark:text-indigo-300">
                  <FileCheck className="w-4 h-4 text-brand-fg" />
                  <span>ফাইল প্রিভিউ ও পরিসংখ্যান</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-ink">
                  <div className="bg-surface dark:bg-slate-800/80 p-2.5 rounded-xl border border-line">
                    <span className="text-[0.6875rem] text-ink-muted block">বিষয় / অধ্যায় / টপিক</span>
                    <span className="font-bold text-brand-ink dark:text-indigo-300">
                      {toBn(preview.subjectsCount)}টি · {toBn(preview.chaptersCount)}টি · {toBn(preview.topicsCount)}টি
                    </span>
                  </div>

                  <div className="bg-surface dark:bg-slate-800/80 p-2.5 rounded-xl border border-line">
                    <span className="text-[0.6875rem] text-ink-muted block">মোট প্রশ্ন</span>
                    <span className="font-bold text-brand-ink dark:text-indigo-300">
                      {toBn(preview.totalQuestions)}টি
                    </span>
                  </div>
                </div>

                {/* Duplicate Analysis Tag */}
                <div className="p-2.5 rounded-xl bg-surface dark:bg-slate-800/80 border border-line text-xs font-semibold text-ink">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                    {toBn(preview.newQuestionsCount)}টি নতুন প্রশ্ন
                  </span>
                  {preview.duplicateQuestionsCount > 0 && (
                    <span className="text-amber-600 dark:text-amber-400 font-bold ml-1.5">
                      · {toBn(preview.duplicateQuestionsCount)}টি ডুপ্লিকেট
                    </span>
                  )}
                </div>
              </div>

              {/* Mode Selection */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-ink block">
                  ইমপোর্ট মোড নির্বাচন করুন
                </label>
                <div className="space-y-2">
                  <label
                    onClick={() => setImportMode('merge')}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                      importMode === 'merge'
                        ? 'border-brand bg-brand-soft/60 dark:bg-indigo-950/40 ring-1 ring-brand'
                        : 'border-line bg-surface'
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'merge'}
                      onChange={() => setImportMode('merge')}
                      className="mt-0.5 text-brand-fg"
                    />
                    <div>
                      <div className="text-xs font-bold text-ink">
                        বিদ্যমান ডাটার সাথে যোগ করো
                      </div>
                      <div className="text-[0.6875rem] text-ink-muted leading-tight">
                        নতুন প্রশ্নগুলো যুক্ত হবে এবং ডুপ্লিকেটগুলো আপডেট হবে। বর্তমান অন্য কোনো প্রশ্ন মুছবে না।
                      </div>
                    </div>
                  </label>

                  <label
                    onClick={() => setImportMode('replace')}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                      importMode === 'replace'
                        ? 'border-red-500 bg-danger-soft/50 dark:bg-red-950/30 ring-1 ring-red-500'
                        : 'border-line bg-surface'
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'replace'}
                      onChange={() => setImportMode('replace')}
                      className="mt-0.5 text-red-600"
                    />
                    <div>
                      <div className="text-xs font-bold text-red-600 dark:text-red-400">
                        সব বদলে দাও (প্রতিস্থাপন)
                      </div>
                      <div className="text-[0.6875rem] text-ink-muted leading-tight">
                        বর্তমান সকল বিষয়, অধ্যায় ও প্রশ্ন মুছে দিয়ে এই ফাইলের ডাটা দিয়ে প্রতিস্থাপন করবে।
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Missing Images Section */}
              {preview.missingImageFiles.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 space-y-2.5 text-xs text-amber-900 dark:text-amber-200">
                  <div className="flex items-center justify-between">
                    <span className="font-bold flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-amber-600" />
                      <span>ছবির ফাইল সংযুক্তকরণ</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => imagesInputRef.current?.click()}
                      className="min-h-[44px] px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-2xs"
                    >
                      ছবির ফাইল বাছুন
                    </button>
                    <input
                      ref={imagesInputRef}
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleManualImagesChange}
                      className="hidden"
                    />
                  </div>

                  <p className="text-[0.6875rem] text-amber-800 dark:text-amber-300 leading-tight">
                    ফাইলে {toBn(preview.missingImageFiles.length)}টি ছবির নাম পাওয়া গেছে কিন্তু ছবি অন্তর্ভুক্ত নেই। ফোল্ডার থেকে ছবিগুলো নির্বাচন করলে নাম মিলিয়ে যুক্ত হবে।
                  </p>

                  {manualImages.length > 0 && (
                    <div className="text-[0.6875rem] font-semibold text-emerald-700 dark:text-emerald-400">
                      ✓ {toBn(manualImages.length)}টি ছবি নির্বাচিত হয়েছে
                    </div>
                  )}

                  {/* List of missing file names */}
                  <div className="p-2 rounded-xl bg-white/70 dark:bg-slate-900/70 border border-amber-200 dark:border-amber-800/50 max-h-24 overflow-y-auto space-y-0.5 font-mono text-[0.625rem]">
                    {preview.missingImageFiles.map((fn, idx) => (
                      <div key={idx} className="truncate">
                        • {fn}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-surface-2 dark:bg-slate-800/60 border-t border-line flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleClose}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-line bg-surface text-xs font-semibold text-ink hover:bg-hover"
          >
            বাতিল
          </button>

          <button
            type="button"
            disabled={!preview || !preview.valid || importing}
            onClick={handleStartImport}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-brand hover:bg-brand-strong active:bg-[#202E91] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            {importing ? (
              <span>ইমপোর্ট হচ্ছে...</span>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>ইমপোর্ট সম্পন্ন করো</span>
              </>
            )}
          </button>
        </div>

        {/* Replace All Confirmation Dialog */}
        <ConfirmDialog
          isOpen={showReplaceConfirm}
          title="সব বদলে দেওয়া হবে!"
          message="আপনি কি নিশ্চিত যে বর্তমান সকল বিষয়, অধ্যায়, টপিক ও প্রশ্ন মুছে ফেলে এই ফাইলের তথ্য প্রতিস্থাপন করতে চান? এটি আর ফিরিয়ে আনা যাবে না।"
          confirmText="হ্যাঁ, সব প্রতিস্থাপন করো"
          cancelText="না, বাতিল করো"
          isDestructive={true}
          onConfirm={() => {
            setShowReplaceConfirm(false);
            runImport();
          }}
          onCancel={() => setShowReplaceConfirm(false)}
        />
      </div>
    </div>
  );
};
