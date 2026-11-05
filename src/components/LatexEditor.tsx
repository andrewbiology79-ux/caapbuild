import React, { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { RichText } from './RichText';
import { Eye, Edit3, ChevronDown } from 'lucide-react';

export interface LatexEditorProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  rows?: number;
  previewTitle?: string;
  className?: string;
  /** show the built-in live preview card under the editor (default true) */
  showPreview?: boolean;
  /** show the math toolbar ($ ইনলাইন, $$ ব্লক, ভগ্নাংশ …) above the text box (default true) */
  showToolbar?: boolean;
  /** show the "ইনলাইন: $সূত্ৰ$ | ব্লক: $$সূত্ৰ$$" hint next to the label (default true) */
  showHint?: boolean;
  /** extra control shown at the right end of the label row (e.g. the board picker) */
  headerRight?: React.ReactNode;
  /** shown on its own line right under the label row (e.g. the small board chips) */
  belowHeader?: React.ReactNode;
}

interface InsertSpec {
  template: string;
  cursorOffset?: number; // Cursor position relative to inserted template start
  wrapSelection?: boolean;
}

export const LatexEditor: React.FC<LatexEditorProps> = ({
  value,
  onChange,
  label,
  placeholder = 'এখানে বাংলা বা LaTeX সূত্র টাইপ করুন...',
  rows = 5,
  previewTitle = 'লাইভ প্রিভিউ (KaTeX)',
  className = '',
  showPreview = true,
  showToolbar = true,
  showHint = true,
  headerRight,
  belowHeader,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ---- drag-to-resize handle (a visible grip in the bottom-right corner) ----
  // The browser's own resize corner is hidden under the scrollbar on phones, so we draw our own.
  const [boxHeight, setBoxHeight] = useState<number | null>(null);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  const handleGripDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const ta = textareaRef.current;
    if (!ta) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { startY: e.clientY, startH: ta.offsetHeight };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const handleGripMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    e.preventDefault();
    setBoxHeight(Math.max(52, Math.min(1200, Math.round(d.startH + (e.clientY - d.startY)))));
  };
  const handleGripUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const [showGreekMenu, setShowGreekMenu] = useState(false);
  const greekMenuRef = useRef<HTMLDivElement>(null);
  const greekBtnRef = useRef<HTMLButtonElement>(null);
  const [greekPos, setGreekPos] = useState<{ top: number; left: number } | null>(null);

  // The list is drawn in a floating layer (portal) so the scrolling toolbar can never clip it.
  const GREEK_W = 168;
  useLayoutEffect(() => {
    if (!showGreekMenu) return;
    const place = () => {
      const r = greekBtnRef.current?.getBoundingClientRect();
      if (!r) return;
      const vw = window.innerWidth;
      const left = Math.max(6, Math.min(vw - GREEK_W - 6, r.right - GREEK_W));
      setGreekPos({ top: r.bottom + 4, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [showGreekMenu]);

  // Close greek menu on outside tap
  useEffect(() => {
    if (!showGreekMenu) return;
    const handleOutside = (e: Event) => {
      const t = e.target as Node;
      if (greekMenuRef.current?.contains(t) || greekBtnRef.current?.contains(t)) return;
      setShowGreekMenu(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [showGreekMenu]);

  const insertSnippet = (spec: InsertSpec | string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? value.length;
    const selectedText = value.substring(start, end);

    let insertText = '';
    let newCursorPos = start;

    if (typeof spec === 'string') {
      insertText = spec;
      newCursorPos = start + insertText.length;
    } else {
      if (spec.wrapSelection && selectedText) {
        if (spec.template === '$$') {
          insertText = `$${selectedText}$`;
          newCursorPos = start + insertText.length;
        } else if (spec.template.includes('\\frac{}{}')) {
          insertText = `\\frac{${selectedText}}{}`;
          newCursorPos = start + insertText.length - 1; // inside 2nd brace
        } else if (spec.template.includes('\\sqrt{}')) {
          insertText = `\\sqrt{${selectedText}}`;
          newCursorPos = start + insertText.length;
        } else {
          insertText = spec.template;
          newCursorPos = start + (spec.cursorOffset ?? insertText.length);
        }
      } else {
        insertText = spec.template;
        newCursorPos = start + (spec.cursorOffset ?? insertText.length);
      }
    }

    const nextValue = value.substring(0, start) + insertText + value.substring(end);
    onChange(nextValue);

    // Reposition cursor and refocus
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const greekSymbols = [
    { label: 'α', code: '\\alpha ' },
    { label: 'β', code: '\\beta ' },
    { label: 'γ', code: '\\gamma ' },
    { label: 'δ', code: '\\delta ' },
    { label: 'ε', code: '\\epsilon ' },
    { label: 'θ', code: '\\theta ' },
    { label: 'λ', code: '\\lambda ' },
    { label: 'μ', code: '\\mu ' },
    { label: 'π', code: '\\pi ' },
    { label: 'ρ', code: '\\rho ' },
    { label: 'σ', code: '\\sigma ' },
    { label: 'τ', code: '\\tau ' },
    { label: 'φ', code: '\\phi ' },
    { label: 'ω', code: '\\omega ' },
    { label: 'Δ', code: '\\Delta ' },
    { label: 'Ω', code: '\\Omega ' },
  ];

  const hintNode = (
    <span className="text-xs font-normal text-[#64748B]">
      ইনলাইন: <code className="text-[#2A3BB0]">$সূত্ৰ$</code> | ব্লক:{' '}
      <code className="text-[#2A3BB0]">$$সূত্ৰ$$</code>
    </span>
  );

  return (
    <div className={`space-y-3 ${className}`}>
      {label && (
        <div className="space-y-1">
          <div className="text-sm font-semibold text-[#1B1F2A] flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 min-w-0">
              <Edit3 className="w-4 h-4 text-[#3B4FD8] shrink-0" />
              <span className="truncate">{label}</span>
            </span>
            {headerRight ? (
              <div className="shrink-0">{headerRight}</div>
            ) : (
              showHint && hintNode
            )}
          </div>
          {belowHeader}
          {headerRight && showHint && <div className="text-right">{hintNode}</div>}
        </div>
      )}

      {/* Editor Box */}
      <div className="bg-white rounded-xl border border-[#D5D9E2] shadow-xs overflow-hidden focus-within:ring-2 focus-within:ring-[#3B4FD8]/40 focus-within:border-[#3B4FD8]">
        {/* Toolbar (hidden in the Minimum editor) */}
        {showToolbar && (
        <div className="bg-[#F2F4F8] border-b border-[#D5D9E2] px-2 py-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {/* Inline Math $ */}
          <button
            type="button"
            aria-label="ইনলাইন সূত্র যোগ করুন"
            title="ইনলাইন সূত্র ($$)"
            onClick={() => insertSnippet({ template: '$$', cursorOffset: 1, wrapSelection: true })}
            className="min-h-[44px] px-3 py-1.5 bg-white hover:bg-[#EEF2FF] active:bg-[#E0E7FF] text-[#1B1F2A] border border-[#D5D9E2] rounded-lg text-xs font-semibold shrink-0 transition-colors"
          >
            $ ইনলাইন
          </button>

          {/* Block Math $$ */}
          <button
            type="button"
            aria-label="ব্লক সূত্র যোগ করুন"
            title="ব্লক সূত্র ($$...$$)"
            onClick={() => insertSnippet({ template: '\n$$\n\n$$\n', cursorOffset: 4 })}
            className="min-h-[44px] px-3 py-1.5 bg-white hover:bg-[#EEF2FF] active:bg-[#E0E7FF] text-[#1B1F2A] border border-[#D5D9E2] rounded-lg text-xs font-semibold shrink-0 transition-colors"
          >
            $$ ব্লক
          </button>

          {/* Fraction */}
          <button
            type="button"
            aria-label="ভগ্নাংশ সূত্র যোগ করুন"
            title="ভগ্নাংশ (\frac{}{})"
            onClick={() => insertSnippet({ template: '\\frac{}{}', cursorOffset: 6, wrapSelection: true })}
            className="min-h-[44px] px-3 py-1.5 bg-white hover:bg-[#EEF2FF] active:bg-[#E0E7FF] text-[#1B1F2A] border border-[#D5D9E2] rounded-lg text-xs font-medium shrink-0 transition-colors"
          >
            ভগ্নাংশ
          </button>

          {/* Square Root */}
          <button
            type="button"
            aria-label="বর্গমূল সূত্র যোগ করুন"
            title="বর্গমূল (\sqrt{})"
            onClick={() => insertSnippet({ template: '\\sqrt{}', cursorOffset: 6, wrapSelection: true })}
            className="min-h-[44px] px-3 py-1.5 bg-white hover:bg-[#EEF2FF] active:bg-[#E0E7FF] text-[#1B1F2A] border border-[#D5D9E2] rounded-lg text-xs font-medium shrink-0 transition-colors"
          >
            বর্গমূল
          </button>

          {/* Power / Superscript */}
          <button
            type="button"
            aria-label="ঘাত বা পাওয়ার যোগ করুন"
            title="ঘাত (^{})"
            onClick={() => insertSnippet({ template: '^{}', cursorOffset: 2 })}
            className="min-h-[44px] px-3 py-1.5 bg-white hover:bg-[#EEF2FF] active:bg-[#E0E7FF] text-[#1B1F2A] border border-[#D5D9E2] rounded-lg text-xs font-medium shrink-0 transition-colors font-mono"
          >
            ঘাত
          </button>

          {/* Subscript */}
          <button
            type="button"
            aria-label="সাবস্ক্রিপ্ট যোগ করুন"
            title="সাবস্ক্রিপ্ট (_{})"
            onClick={() => insertSnippet({ template: '_{}', cursorOffset: 2 })}
            className="min-h-[44px] px-3 py-1.5 bg-white hover:bg-[#EEF2FF] active:bg-[#E0E7FF] text-[#1B1F2A] border border-[#D5D9E2] rounded-lg text-xs font-medium shrink-0 transition-colors font-mono"
          >
            সাবস্ক্রিপ্ট
          </button>

          {/* Sum */}
          <button
            type="button"
            aria-label="সামেশন যোগ করুন"
            title="সামেশন (\sum)"
            onClick={() => insertSnippet('\\sum ')}
            className="min-h-[44px] px-3 py-1.5 bg-white hover:bg-[#EEF2FF] active:bg-[#E0E7FF] text-[#1B1F2A] border border-[#D5D9E2] rounded-lg text-xs font-semibold shrink-0 transition-colors"
          >
            ∑
          </button>

          {/* Integral */}
          <button
            type="button"
            aria-label="ইন্টিগ্রেশন যোগ করুন"
            title="ইন্টিগ্রেশন (\int)"
            onClick={() => insertSnippet('\\int ')}
            className="min-h-[44px] px-3 py-1.5 bg-white hover:bg-[#EEF2FF] active:bg-[#E0E7FF] text-[#1B1F2A] border border-[#D5D9E2] rounded-lg text-xs font-semibold shrink-0 transition-colors"
          >
            ∫
          </button>

          {/* Greek Symbols Menu */}
          <div className="relative shrink-0">
            <button
              ref={greekBtnRef}
              type="button"
              aria-label="গ্রিক বর্ণমালার তালিকা খুলুন"
              aria-haspopup="true"
              aria-expanded={showGreekMenu}
              onClick={() => setShowGreekMenu((prev) => !prev)}
              className="min-h-[44px] px-3 py-1.5 bg-white hover:bg-[#EEF2FF] active:bg-[#E0E7FF] text-[#2A3BB0] border border-[#D5D9E2] rounded-lg text-xs font-semibold shrink-0 transition-colors flex items-center gap-1"
            >
              <span>α β θ</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        )}

        {showGreekMenu &&
          greekPos &&
          createPortal(
            <div
              ref={greekMenuRef}
              role="menu"
              style={{ position: 'fixed', top: greekPos.top, left: greekPos.left, width: GREEK_W, zIndex: 200 }}
              className="greek-pop bg-white border border-[#D5D9E2] rounded-lg shadow-xl p-1.5 grid grid-cols-4 gap-1"
            >
              {greekSymbols.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  aria-label={`গ্রিক বর্ণ ${item.label}`}
                  onClick={() => {
                    insertSnippet(item.code);
                    setShowGreekMenu(false);
                  }}
                  style={{ minHeight: 0, height: 32 }}
                  className="rounded-md text-center text-[#1B1F2A] font-semibold text-sm hover:bg-[#EEF2FF] active:bg-[#E0E7FF] border border-transparent hover:border-[#D5D9E2] transition-colors"
                >
                  {item.label}
                </button>
              ))}
            </div>,
            document.body
          )}

        {/* Textarea + custom resize grip */}
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            placeholder={placeholder}
            style={boxHeight ? { height: boxHeight } : undefined}
            className="w-full min-h-[3.25rem] p-3.5 pb-6 text-sm text-[#1B1F2A] bg-white border-0 outline-none resize-none font-sans leading-relaxed block"
          />
          <div
            role="separator"
            aria-label="টেনে ঘরটি ছোট-বড় করুন"
            title="টেনে ছোট-বড় করুন"
            onPointerDown={handleGripDown}
            onPointerMove={handleGripMove}
            onPointerUp={handleGripUp}
            onPointerCancel={handleGripUp}
            style={{ touchAction: 'none' }}
            className="absolute right-0 bottom-0 z-10 w-9 h-9 flex items-end justify-end p-1.5 cursor-ns-resize select-none"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" className="rounded-br-md bg-white/80" aria-hidden="true">
              <path d="M13 5 5 13M13 9 9 13M13 1 1 13" stroke="#94A3B8" strokeWidth="1.6" strokeLinecap="round" fill="none" />
            </svg>
          </div>
        </div>
      </div>

      {/* Live KaTeX Preview Section */}
      {showPreview && (
      <div className="bg-white rounded-xl border border-[#D5D9E2] p-4 shadow-2xs">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#2A3BB0] pb-2 border-b border-[#F2F4F8] mb-2">
          <Eye className="w-3.5 h-3.5" />
          <span>{previewTitle}</span>
        </div>

        {value.trim() ? (
          <RichText text={value} className="text-sm" />
        ) : (
          <div className="text-xs text-[#64748B] italic py-1">
            উপরে লিখলে এখানে তাৎক্ষণিক প্রিভিউ দেখা যাবে।
          </div>
        )}
      </div>
      )}
    </div>
  );
};

export default LatexEditor;
