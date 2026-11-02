import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import type { TabType } from '../components/BottomNav';
import { ConfirmDialog } from '../components/ConfirmDialog';

export interface RouteItem {
  id: string;
  name: string;
  tab: TabType;
  params?: Record<string, unknown>;
}

type BackHandler = () => boolean;

interface NavigationContextType {
  currentRoute: RouteItem;
  stack: RouteItem[];
  activeTab: TabType;
  canGoBack: boolean;
  push: (route: Omit<RouteItem, 'id'>) => void;
  pop: () => boolean;
  switchTab: (tab: TabType) => void;
  resetToTab: (tab: TabType) => void;
  registerBackHandler: (handler: BackHandler) => () => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export const useNavigation = (): NavigationContextType => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
};

interface NavigationProviderProps {
  children: React.ReactNode;
}

const getInitialRoute = (tab: TabType = 'typeCq'): RouteItem => ({
  id: `root-${tab}-${Date.now()}`,
  name: tab,
  tab,
});

export const NavigationProvider: React.FC<NavigationProviderProps> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<TabType>('typeCq');
  const [stack, setStack] = useState<RouteItem[]>([getInitialRoute('typeCq')]);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const exitConfirmOpenRef = useRef(false);
  exitConfirmOpenRef.current = exitConfirmOpen;
  const stackRef = useRef<RouteItem[]>(stack);
  stackRef.current = stack;

  // Priority stack of back handlers registered by active components
  const backHandlersRef = useRef<BackHandler[]>([]);

  const registerBackHandler = useCallback((handler: BackHandler) => {
    backHandlersRef.current.push(handler);
    return () => {
      backHandlersRef.current = backHandlersRef.current.filter((h) => h !== handler);
    };
  }, []);

  const currentRoute = stack[stack.length - 1] || getInitialRoute(activeTab);
  const canGoBack = stack.length > 1;

  const push = useCallback((newRoute: Omit<RouteItem, 'id'>) => {
    const routeWithId: RouteItem = {
      ...newRoute,
      id: `${newRoute.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };
    setActiveTab(newRoute.tab);
    setStack((prev) => [...prev, routeWithId]);
  }, []);

  const pop = useCallback((): boolean => {
    let handled = false;
    setStack((prev) => {
      if (prev.length > 1) {
        handled = true;
        const newStack = prev.slice(0, prev.length - 1);
        const top = newStack[newStack.length - 1];
        if (top) {
          setActiveTab(top.tab);
        }
        return newStack;
      }
      return prev;
    });
    return handled;
  }, []);

  const switchTab = useCallback((tab: TabType) => {
    setActiveTab(tab);
    setStack([getInitialRoute(tab)]);
  }, []);

  const resetToTab = useCallback((tab: TabType) => {
    switchTab(tab);
  }, [switchTab]);

  // Handle Android Hardware Back Button via @capacitor/app
  useEffect(() => {
    let isSubscribed = true;
    let listenerHandle: { remove: () => Promise<void> | void } | null = null;

    const setupBackHandler = async () => {
      try {
        const handle = await CapacitorApp.addListener('backButton', () => {
          if (!isSubscribed) return;

          // 1. Check registered component back handlers first (e.g. inner drill-down navigation)
          const handlers = backHandlersRef.current;
          if (handlers.length > 0) {
            const topHandler = handlers[handlers.length - 1];
            const wasHandled = topHandler();
            if (wasHandled) {
              return;
            }
          }

          // 2. Exit confirmation already showing → a second back press dismisses it
          if (exitConfirmOpenRef.current) {
            setExitConfirmOpen(false);
            return;
          }

          // 3. Fall back to root stack pop
          const current = stackRef.current;
          if (current.length > 1) {
            const newStack = current.slice(0, -1);
            const top = newStack[newStack.length - 1];
            if (top) setActiveTab(top.tab);
            setStack(newStack);
          } else {
            // At root of stack: ask before leaving the app
            setExitConfirmOpen(true);
          }
        });
        listenerHandle = handle;
      } catch (e) {
        // Non-Capacitor web environment fallback
        console.info('Capacitor backButton listener not available in standard web preview.');
      }
    };

    setupBackHandler();

    return () => {
      isSubscribed = false;
      if (listenerHandle) {
        listenerHandle.remove();
      }
    };
  }, []);

  return (
    <NavigationContext.Provider
      value={{
        currentRoute,
        stack,
        activeTab,
        canGoBack,
        push,
        pop,
        switchTab,
        resetToTab,
        registerBackHandler,
      }}
    >
      {children}
      <ConfirmDialog
        isOpen={exitConfirmOpen}
        title="অ্যাপ থেকে বের হবেন?"
        message="আপনি কি সত্যিই অ্যাপ বন্ধ করতে চান?"
        confirmText="বের হোন"
        cancelText="থাকুন"
        onConfirm={() => {
          setExitConfirmOpen(false);
          try {
            CapacitorApp.exitApp();
          } catch (err) {
            console.warn('CapacitorApp.exitApp error:', err);
          }
        }}
        onCancel={() => setExitConfirmOpen(false)}
      />
    </NavigationContext.Provider>
  );
};

export default NavigationProvider;
