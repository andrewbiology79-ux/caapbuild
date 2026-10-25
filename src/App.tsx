import React, { useEffect } from 'react';
import { ToastProvider, useToast } from './components/Toast';
import { NavigationProvider, useNavigation } from './utils/navigation';
import { BottomNav } from './components/BottomNav';
import { HomeScreen } from './features/home/HomeScreen';
import { CreateScreen } from './screens/CreateScreen';
import { CollectionScreen } from './screens/CollectionScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { FilterScreen } from './screens/FilterScreen';
import { getAppSettings, applySettingsToDOM } from './utils/settings';
import { db, chapterDb } from './db/db';
import { getBackupReminderState } from './utils/backupHistory';
import { StoragePermissionDialog } from './components/StoragePermissionDialog';
import { PdfSavedDialog } from './components/PdfSavedDialog';
import { GlobalSearch } from './features/search/GlobalSearch';

import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';

const MainLayout: React.FC = () => {
  const { activeTab, switchTab } = useNavigation();
  const { showToast } = useToast();

  useEffect(() => {
    const initApp = async () => {
      const settings = await getAppSettings();
      applySettingsToDOM(settings);

      // Configure Capacitor StatusBar on native platform
      if (Capacitor.isNativePlatform()) {
        try {
          await StatusBar.setOverlaysWebView({ overlay: false });
          await StatusBar.setBackgroundColor({ color: '#3B4FD8' });
          await StatusBar.setStyle({ style: Style.Dark });
        } catch (e) {
          console.warn('Failed to configure StatusBar:', e);
        }
      }
    };
    initApp();

    // Gentle once-per-launch backup reminder (only when there is data worth protecting)
    const checkBackupReminder = async () => {
      try {
        const [typeQ, chapterQ, papers] = await Promise.all([
          db.questions.count(),
          chapterDb.questions.count(),
          db.papers.count(),
        ]);
        if (getBackupReminderState(typeQ + chapterQ + papers > 0).due) {
          showToast('ব্যাকআপ নেওয়ার সময় হয়েছে — প্রোফাইল ট্যাবে দেখুন', 4500);
        }
      } catch (e) {
        console.warn('Backup reminder check failed:', e);
      }
    };
    checkBackupReminder();
  }, []);

  return (
    <div className="min-h-screen bg-outer flex justify-center items-start sm:py-6 transition-colors">
      {/* Mobile-first viewport frame (390px width) */}
      <div className="w-full max-w-[390px] min-h-screen sm:min-h-[844px] sm:max-h-[844px] bg-app text-ink flex flex-col relative overflow-hidden shadow-pop sm:rounded-[36px] border border-line">
        
        {/* Dynamic Screen View */}
        <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden">
          {activeTab === 'home' && <HomeScreen />}
          {activeTab === 'create' && <CreateScreen />}
          {activeTab === 'typeCq' && <CollectionScreen key="type" scope="type" />}
          {activeTab === 'chapterCq' && <CollectionScreen key="chapter" scope="chapter" />}
          {activeTab === 'filter' && <FilterScreen />}
          {activeTab === 'profile' && <ProfileScreen />}
        </div>

        {/* Fixed Bottom Navigation */}
        <BottomNav activeTab={activeTab} onTabChange={switchTab} />
      </div>
    </div>
  );
};

export default function App() {
  return (
    <ToastProvider>
      <NavigationProvider>
        <MainLayout />
        <StoragePermissionDialog />
        <PdfSavedDialog />
        <GlobalSearch />
      </NavigationProvider>
    </ToastProvider>
  );
}
