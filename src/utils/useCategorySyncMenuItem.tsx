import React from 'react';
import { FolderSync } from 'lucide-react';
import type { MenuItem } from '../components/KebabMenu';
import { useToast } from '../components/Toast';
import { isNativeApp } from '../storage/nativeStore';
import { isFolderSyncEnabled } from '../storage/syncEngine';
import { categorySyncController } from '../storage/categorySyncStore';
import { CATEGORY_MENU_ID, CATEGORY_MENU_LABEL, categoryMenuTap } from '../storage/categorySyncMenu';

/**
 * অংশ ১গ-২খ - Create ৩-ডট মেনুর একটা আইটেম: "ফোল্ডার থেকে ক্যাটাগরি সিঙ্ক করুন"।
 * ট্যাপে প্রিভিউ উইন্ডো খোলে; সিঙ্ক চালু না থাকলে / অন্য সিঙ্ক চললে কারণ টোস্টে।
 */
export function useCategorySyncMenuItem(): MenuItem {
  const { showToast } = useToast();
  return {
    id: CATEGORY_MENU_ID,
    label: CATEGORY_MENU_LABEL,
    icon: <FolderSync className="w-4 h-4 text-[#3B4FD8]" />,
    onClick: () => {
      const why = categoryMenuTap({
        native: isNativeApp(),
        enabled: isFolderSyncEnabled(),
        start: () => categorySyncController.start(),
      });
      if (why) showToast(why, 4500);
    },
  };
}
