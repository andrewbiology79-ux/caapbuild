import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical } from 'lucide-react';

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
  menuClassName?: string;
}

export const KebabMenu: React.FC<KebabMenuProps> = ({
  items,
  buttonAriaLabel = 'আরও অপশন',
  align = 'right',
  className = '',
  buttonClassName = '',
  menuClassName = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div
      className={`relative inline-block text-left ${className}`}
      ref={menuRef}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label={buttonAriaLabel}
        aria-haspopup="true"
        aria-expanded={isOpen}
        onClick={(e) => {
          e.stopPropagation();
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
        <div
          role="menu"
          aria-orientation="vertical"
          onClick={(e) => e.stopPropagation()}
          className={`absolute ${
            align === 'right' ? 'right-0' : 'left-0'
          } mt-1 min-w-[200px] bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-[#D5D9E2] dark:border-slate-700 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 origin-top-right ${menuClassName}`}
        >
          {items.length === 0 ? (
            <div className="px-4 py-2 text-xs text-[#64748B] dark:text-slate-400">কোনো অপশন নেই</div>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                role="menuitem"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                  item.onClick();
                }}
                className={`w-full min-h-[40px] px-3.5 py-2 text-left text-xs font-semibold flex items-center gap-2.5 transition-colors ${
                  item.isDestructive
                    ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40'
                    : 'text-[#1B1F2A] dark:text-slate-100 hover:bg-[#F2F4F8] dark:hover:bg-slate-700/60'
                }`}
              >
                {item.icon && (
                  <span className="w-4 h-4 flex items-center justify-center shrink-0">
                    {item.icon}
                  </span>
                )}
                <span className="truncate">{item.label}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default KebabMenu;
