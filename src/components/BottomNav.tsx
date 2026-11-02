import React from 'react';
import { PlusCircle, Layers, BookOpen, SlidersHorizontal, User } from 'lucide-react';

export type TabType = 'create' | 'typeCq' | 'chapterCq' | 'filter' | 'profile';

interface BottomNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

interface NavItemConfig {
  key: TabType;
  label: string;
  icon: React.ElementType;
  ariaLabel: string;
}

const navItems: NavItemConfig[] = [
  {
    key: 'create',
    label: 'Create',
    icon: PlusCircle,
    ariaLabel: 'তৈরি ট্যাব খুলুন',
  },
  {
    key: 'typeCq',
    label: 'Type CQ',
    icon: Layers,
    ariaLabel: 'টাইপ সিকিউ ট্যাব খুলুন',
  },
  {
    key: 'chapterCq',
    label: 'Chapter CQ',
    icon: BookOpen,
    ariaLabel: 'চ্যাপ্টার সিকিউ ট্যাব খুলুন',
  },
  {
    key: 'filter',
    label: 'Filter',
    icon: SlidersHorizontal,
    ariaLabel: 'ফিল্টার ট্যাব খুলুন',
  },
  {
    key: 'profile',
    label: 'Profile',
    icon: User,
    ariaLabel: 'প্রোফাইল ট্যাব খুলুন',
  },
];

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange }) => {
  return (
    <nav
      aria-label="নিচের নেভিগেশন বার"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-slate-900 border-t border-[#D5D9E2] dark:border-slate-800 shadow-[0_-2px_10px_rgba(0,0,0,0.04)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="max-w-[390px] mx-auto flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const isActive = activeTab === item.key;
          const IconComponent = item.icon;

          return (
            <button
              key={item.key}
              type="button"
              aria-label={item.ariaLabel}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onTabChange(item.key)}
              className={`flex-1 min-h-[48px] h-full flex flex-col items-center justify-center gap-1 transition-all rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3B4FD8]/40 ${
                isActive
                  ? 'text-[#3B4FD8] dark:text-indigo-400 font-semibold'
                  : 'text-[#64748B] dark:text-slate-400 hover:text-[#1B1F2A] dark:hover:text-slate-200 font-medium'
              }`}
            >
              <div
                className={`w-9 h-7 flex items-center justify-center rounded-full transition-transform ${
                  isActive ? 'bg-[#EEF2FF] dark:bg-indigo-950/80 scale-105' : ''
                }`}
              >
                <IconComponent className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
              </div>
              <span className="text-[0.68rem] leading-none tracking-tight whitespace-nowrap">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
