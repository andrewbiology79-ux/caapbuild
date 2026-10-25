import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { MoreVertical } from 'lucide-react';
import type { MenuItem } from './KebabMenu';

export interface PopupMenuProps {
  items: MenuItem[];
  buttonAriaLabel?: string;
  buttonClassName?: string;
  iconClassName?: string;
}

const MENU_WIDTH = 256;
const MARGIN = 8;

/**
 * 3-dot button that opens a small popup menu right next to the button
 * (not a bottom sheet). Uses fixed positioning so cards with overflow-hidden never clip it.
 */
export const PopupMenu: React.FC<PopupMenuProps> = ({
  items,
  buttonAriaLabel = 'আরও অপশন',
  buttonClassName = '',
  iconClassName = 'w-5 h-5',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = () => setIsOpen(false);

  // position the popup under the button (flip above when there is no room), keep it on screen
  useLayoutEffect(() => {
    if (!isOpen || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const menuH = menuRef.current?.offsetHeight ?? items.length * 48 + 16;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(MENU_WIDTH, vw - MARGIN * 2);

    let left = rect.right - width;
    left = Math.max(MARGIN, Math.min(left, vw - width - MARGIN));

    let top = rect.bottom + 4;
    if (top + menuH > vh - MARGIN) {
      const above = rect.top - menuH - 4;
      top = above >= MARGIN ? above : Math.max(MARGIN, vh - menuH - MARGIN);
    }
    setPos({ top, left });
  }, [isOpen, items.length]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={buttonAriaLabel}
        aria-haspopup="true"
        aria-expanded={isOpen}
        onClick={(e) => {
          e.stopPropagation();
          setPos(null);
          setIsOpen((v) => !v);
        }}
        className={
          buttonClassName ||
          'min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-ink-muted hover:bg-hover dark:hover:bg-slate-700 focus:outline-none'
        }
      >
        <MoreVertical className={iconClassName} />
      </button>

      {isOpen && (
        <>
          {/* transparent layer: a tap outside closes the popup */}
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
              width: Math.min(MENU_WIDTH, window.innerWidth - MARGIN * 2),
              visibility: pos ? 'visible' : 'hidden',
            }}
            className="fixed z-[61] bg-surface rounded-2xl shadow-xl border border-line py-1.5 animate-in fade-in zoom-in-95 duration-100"
          >
            {items.map((item) => (
              <button
                key={item.id}
                role="menuitem"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  close();
                  item.onClick();
                }}
                className={`w-full min-h-[46px] px-4 py-2 text-left text-sm font-medium flex items-center gap-3 transition-colors ${
                  item.isDestructive
                    ? 'text-red-600 dark:text-red-400 hover:bg-danger-soft dark:hover:bg-red-950/40'
                    : 'text-ink hover:bg-hover dark:hover:bg-slate-700'
                }`}
              >
                {item.icon && <span className="w-5 h-5 flex items-center justify-center shrink-0">{item.icon}</span>}
                <span className="leading-snug">{item.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
};

export default PopupMenu;
