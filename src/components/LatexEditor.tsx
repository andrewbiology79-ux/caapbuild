import React, { useRef, useState, useEffect } from 'react';
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
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showGreekMenu, setShowGreekMenu] = useState(false);
  const greekMenuRef = useRef<HTMLDivElement>(null);

  // Close greek menu on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (greekMenuRef.current && !greekMenuRef.current.contains(e.target as Node)) {
        setShowGreekMenu(false);
      }
    };
    if (showGreekMenu) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutside);
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
    { label: 'θ', code: '\\theta ' },
    { label: 'γ', code: '\\gamma ' },
    { label: 'δ', code: '\\delta ' },
    { label: 'ω', code: '\\omega ' },
    { label: 'μ', code: '\\mu ' },
    { label: 'π', code: '\\pi ' },
    { label: 'λ', code: '\\lambda ' },
  ];

  return (
    <div className={`space-y-3 ${className}`}>
      {label && (
        <label className="block text-sm font-semibold text-[#1B1F2A] flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Edit3 className="w-4 h-4 text-[#3B4FD8]" />
            {label}
          </span>
          <span className="text-xs font-normal text-[#64748B]">
            ইনলাইন: <code className="text-[#2A3BB0]">$সূত্ৰ$</code> | ব্লক:{' '}
            <code className="text-[#2A3BB0]">$$সূত্ৰ$$</code>
          </span>
        </label>
      )}

      {/* Editor Box */}
      <div className="bg-white rounded-xl border border-[#D5D9E2] shadow-xs overflow-hidden focus-within:ring-2 focus-within:ring-[#3B4FD8]/40 focus-within:border-[#3B4FD8]">
        {/* Toolbar */}
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
          <div className="relative shrink-0" ref={greekMenuRef}>
            <button
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

            {showGreekMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-[#D5D9E2] rounded-xl shadow-xl p-2 grid grid-cols-3 gap-1.5 w-44 animate-in fade-in zoom-in-95">
                {greekSymbols.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    aria-label={`গ্রিক বর্ণ ${item.label}`}
                    onClick={() => {
                      insertSnippet(item.code);
                      setShowGreekMenu(false);
                    }}
                    className="min-h-[44px] py-2 px-2 text-center rounded-lg hover:bg-[#EEF2FF] text-[#1B1F2A] font-semibold text-sm border border-transparent hover:border-[#D5D9E2] transition-colors"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          className="w-full p-3.5 text-sm text-[#1B1F2A] bg-white border-0 outline-none resize-y font-sans leading-relaxed"
        />
      </div>

      {/* Live KaTeX Preview Section */}
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
    </div>
  );
};

export default LatexEditor;
