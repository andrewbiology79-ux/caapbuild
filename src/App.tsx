import React, { useEffect } from 'react';
import { ToastProvider } from './components/Toast';
import { NavigationProvider, useNavigation } from './utils/navigation';
import { BottomNav } from './components/BottomNav';
import { CreateScreen } from './screens/CreateScreen';
import { CollectionScreen } from './screens/CollectionScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { FilterScreen } from './screens/FilterScreen';
import { getAppSettings, applySettingsToDOM } from './utils/settings';
import { hideSystemBars } from './utils/storageAccess';
import { App as CapacitorApp } from '@capacitor/app';
import { StoragePermissionDialog } from './components/StoragePermissionDialog';
import { PdfSavedDialog } from './components/PdfSavedDialog';

import { StatusBar } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';

const MainLayout: React.FC = () => {
  const { activeTab, switchTab } = useNavigation();

  useEffect(() => {
    const initApp = async () => {
      const settings = await getAppSettings();
      applySettingsToDOM(settings);

      // Full screen: status bar + navigation bar hidden (swipe from the edge to peek)
      if (Capacitor.isNativePlatform()) {
        try {
          await StatusBar.hide();
        } catch (e) {
          console.warn('Failed to hide StatusBar:', e);
        }
        await hideSystemBars();
      }
    };
    initApp();

    // Bring back full screen whenever the app returns to the foreground
    let handle: { remove: () => Promise<void> } | null = null;
    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          StatusBar.hide().catch(() => {});
          hideSystemBars();
        }
      }).then((h) => {
        handle = h;
      });
    }
    return () => {
      handle?.remove();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#E5E9F0] dark:bg-slate-950 flex justify-center items-start sm:py-6 transition-colors">
      {/* Mobile-first viewport frame (390px width) */}
      <div className="w-full max-w-[390px] min-h-screen sm:min-h-[844px] sm:max-h-[844px] bg-[#F2F4F8] dark:bg-slate-900 text-[#1B1F2A] dark:text-slate-100 flex flex-col relative overflow-hidden shadow-2xl sm:rounded-[36px] border border-[#D5D9E2] dark:border-slate-800">
        
        {/* Dynamic Screen View */}
        <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden">
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
      </NavigationProvider>
    </ToastProvider>
  );
}
