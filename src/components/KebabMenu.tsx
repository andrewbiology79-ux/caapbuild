import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { MoreVertical } from 'lucide-react';
import { useBackClose } from '../utils/useBackClose';

const MARGIN = 8;
// নিচের নেভিগেশন বারের উচ্চতা (মেনু এর নিচে ঢুকবে না)
const BOTTOM_NAV = 72;
const MENU_MIN_W = 192;
const MENU_MAX_W = 272;

export interface MenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  isDestructive?: boolean;
  onClick: () => void;
}

export interface KebabMenuProps {
  items: MenuItem[];
  buttonAriaLabel?: string;
  align?: 'left' | 'right';
  className?: string;
  buttonClassName?: string;
}

export const KebabMenu: React.FC<KebabMenuProps> = ({
  items,
  buttonAriaLabel = 'আরও অপশন',
  align = 'right',
  className = '',
  buttonClassName = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const startTopRef = useRef<number | null>(null);

  const close = () => setIsOpen(false);
  useBackClose(isOpen, close);

  // fixed পজিশনে বসানো, তাই কার্ডের overflow-hidden বা স্ক্রলার মেনু কাটতে পারে না
  useLayoutEffect(() => {
    if (!isOpen || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    startTopRef.current = rect.top;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const el = menuRef.current;
    const width = Math.min(Math.max(el?.offsetWidth ?? MENU_MIN_W, MENU_MIN_W), MENU_MAX_W, vw - MARGIN * 2);
    const naturalH = el?.scrollHeight ?? items.length * 46 + 16;
    const safeBottom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom')) || 0;
    const limit = vh - BOTTOM_NAV - safeBottom;

    let left = align === 'right' ? rect.right - width : rect.left;
    left = Math.max(MARGIN, Math.min(left, vw - width - MARGIN));

    const spaceBelow = limit - (rect.bottom + 4) - MARGIN;
    const spaceAbove = rect.top - 4 - MARGIN;
    let top: number;
    let maxH: number;
    if (naturalH <= spaceBelow || spaceBelow >= spaceAbove) {
      top = rect.bottom + 4;
      maxH = Math.max(120, spaceBelow);
    } else {
      maxH = Math.max(120, spaceAbove);
      top = Math.max(MARGIN, rect.top - 4 - Math.min(naturalH, maxH));
    }
    setPos({ top, left, maxH });
  }, [isOpen, items.length, align]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    // মেনুর নিজের স্ক্রলে বা পেছনের পেজের সামান্য নড়াচড়ায় মেনু বন্ধ হবে না;
    // বাটন জায়গা থেকে অনেকটা সরে গেলে (>24px) তবেই বন্ধ
    const onScroll = (e: Event) => {
      const menu = menuRef.current;
      const t = e.target as Node | null;
      if (menu && t && t instanceof Node && menu.contains(t)) return;
      const btn = btnRef.current;
      if (!btn || startTopRef.current == null) return;
      if (Math.abs(btn.getBoundingClientRect().top - startTopRef.current) > 24) close();
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('keydown', onKey);
        window.removeEventListener('scroll', onScroll, true);
    };
  }, [isOpen]);

  return (
    <div className={`relative inline-block text-left ${className}`}>
      <button
        ref={btnRef}
        type="button"
        aria-label={buttonAriaLabel}
        aria-haspopup="true"
        aria-expanded={isOpen}
        onClick={(e) => {
          e.stopPropagation();
          setPos(null);
          setIsOpen((prev) => !prev);
        }}
        className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full transition-colors focus:outline-none ${
          buttonClassName ||
          'text-white/90 hover:text-white hover:bg-white/10 active:bg-white/20 focus:ring-2 focus:ring-white/40'
        }`}
      >
        <MoreVertical className="w-5 h-5" />
      </button>

      {isOpen && (
        <>
          {/* বাইরে চাপলে বন্ধ */}
          <div
            className="fixed inset-0 z-[60]"
            onClick={(e) => {
              e.stopPropagation();
              close();
            }}
          />
          <div
            ref={menuRef}
            role="menu"
            aria-orientation="vertical"
            onClick={(e) => e.stopPropagation()}
            style={{
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              maxHeight: pos?.maxH,
              visibility: pos ? 'visible' : 'hidden',
            }}
            className="fixed z-[61] w-max min-w-[12rem] max-w-[17rem] overflow-y-auto overscroll-contain bg-white rounded-xl shadow-xl border border-[#D5D9E2] py-1.5 animate-in fade-in zoom-in-95 duration-100"
          >
            {items.length === 0 ? (
              <div className="px-4 py-2 text-xs text-[#64748B]">কোনো অপশন নেই</div>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  role="menuitem"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    close();
                    item.onClick();
                  }}
                  className={`w-full min-h-[44px] px-3.5 py-2 text-left text-sm font-medium flex items-center gap-2.5 transition-colors ${
                    item.isDestructive
                      ? 'text-red-600 hover:bg-red-50'
                      : 'text-[#1B1F2A] hover:bg-[#F2F4F8]'
                  }`}
                >
                  {item.icon && <span className="w-4 h-4 flex items-center justify-center">{item.icon}</span>}
                  <span className="leading-snug">{item.label}</span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default KebabMenu;
