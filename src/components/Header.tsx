import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { KebabMenu, type MenuItem } from './KebabMenu';

export interface HeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  showBack?: boolean;
  menuItems?: MenuItem[];
  rightAction?: React.ReactNode;
  /** extra buttons shown in the ribbon just before the 3-dot menu (e.g. a search icon) */
  actions?: React.ReactNode;
  /** replaces the title in the middle of the ribbon (e.g. the search box) */
  centerOverride?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  onBack,
  showBack = false,
  menuItems = [],
  rightAction,
  actions,
  centerOverride,
}) => {
  return (
    <header
      className="sticky top-0 z-40 bg-[#3B4FD8] text-white shadow-md select-none transition-colors"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex items-center justify-between px-3 h-14 max-w-[390px] mx-auto">
        {/* Left Side: Back button or placeholder */}
        <div className="flex items-center min-w-[44px]">
          {showBack && onBack ? (
            <button
              type="button"
              aria-label="ফিরে যান"
              onClick={onBack}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-white/90 hover:text-white hover:bg-white/10 active:bg-white/20 transition-colors focus:outline-none focus:ring-2 focus:ring-white/40"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          ) : (
            <div className="w-2" />
          )}
        </div>

        {/* Center: Title */}
        <div className="flex-1 text-center px-2 min-w-0">
          {centerOverride ? (
            centerOverride
          ) : (
            <>
              <h1 className="text-lg font-semibold tracking-tight text-white truncate leading-tight">
                {title}
              </h1>
              {subtitle && (
                <p className="text-[0.6875rem] text-white/80 truncate leading-tight mt-0.5">
                  {subtitle}
                </p>
              )}
            </>
          )}
        </div>

        {/* Right Side: KebabMenu or custom right action */}
        <div className="flex items-center justify-end min-w-[44px]">
          {actions}
          {rightAction ? (
            rightAction
          ) : (
            <KebabMenu items={menuItems} buttonAriaLabel="মেনু" align="right" />
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
