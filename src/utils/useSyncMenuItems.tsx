import React, { useMemo } from 'react';
import { FolderDown, FolderUp } from 'lucide-react';
import type { MenuItem } from '../components/KebabMenu';
import { useToast } from '../components/Toast';
import { isNativeApp } from '../storage/nativeStore';
import { isFolderSyncEnabled } from '../storage/syncEngine';
import { syncController } from '../storage/syncDialogStore';
import { autoSyncStore } from '../storage/autoSyncStatus';
import { syncUnavailableReason } from '../storage/syncView';

/**
 * ধাপ ৪ - থ্রি ডট মেনুর সব সময়কার দুটো সিঙ্ক অপশন:
 *   "ফোল্ডার থেকে সিঙ্ক করুন" (ফোল্ডার -> অ্যাপ), "অ্যাপ থেকে ফোল্ডারে সিঙ্ক করুন" (অ্যাপ -> ফোল্ডার)
 * ট্যাপ করলে প্রিভিউ উইন্ডো খোলে; লুকানো থাকে না - সিঙ্ক চালু না থাকলে কারণ জানানো হয়।
 *
 * ধাপ ২ক: এই আইটেম দুটো শুধু Type CQ ও Chapter CQ উইন্ডোর ৩-ডট মেনুতে (CollectionScreen) থাকে। দুই উইন্ডোর যেকোনোটা থেকে
 * চাপলে Type_CQ ও Chapter_CQ দুটোই একসাথে সিঙ্ক হয় (ব্যবহারকারীর সিদ্ধান্ত)। অন্য কোনো স্ক্রিনে (Create, Filter, Profile) নেই।
 * (সিঙ্ক ইঞ্জিনে scope প্যারামিটার আছে, কিন্তু মেনু তা পাঠায় না।)
 */
export function useSyncMenuItems(): MenuItem[] {
  const { showToast } = useToast();

  const go = (direction: 'folder-to-app' | 'app-to-folder') => {
    const why = syncUnavailableReason(isNativeApp(), isFolderSyncEnabled());
    if (why) {
      showToast(why, 4500);
      return;
    }
    if (autoSyncStore.isRunning()) {
      showToast('অটো সিঙ্ক চলছে, শেষ হলে আবার চেষ্টা করুন', 2500);
      return;
    }
    if (!syncController.start(direction)) showToast('সিঙ্ক উইন্ডো আগে থেকেই খোলা আছে', 2500);
  };

  return useMemo(() => [
    {
      id: 'sync-folder-to-app',
      label: 'ফোল্ডার থেকে সিঙ্ক করুন',
      icon: <FolderDown className="w-4 h-4 text-[#3B4FD8]" />,
      onClick: () => go('folder-to-app'),
    },
    {
      id: 'sync-app-to-folder',
      label: 'অ্যাপ থেকে ফোল্ডারে সিঙ্ক করুন',
      icon: <FolderUp className="w-4 h-4 text-[#3B4FD8]" />,
      onClick: () => go('app-to-folder'),
    },
  ], [showToast]); // eslint-disable-line react-hooks/exhaustive-deps
}
