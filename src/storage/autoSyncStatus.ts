import { useSyncExternalStore } from 'react';

/**
 * অটো সিঙ্কের ছোট অবস্থা (পুরো উইন্ডো নয়): রিবনের (Header) ঠিক নিচে এক লাইনের লেখা দেখানোর জন্য।
 *   idle -> running ("অটো সিঙ্ক হচ্ছে…") -> done / error (কয়েক সেকেন্ড) -> idle
 * খাঁটি স্টোর: ফাইল/ডেটাবেস/React IO নেই (শুধু useSyncExternalStore হুক)।
 */

export type AutoSyncStatus =
  | { phase: 'idle' }
  | { phase: 'running' }
  | { phase: 'done'; changed: boolean }
  | { phase: 'error' };

export const AUTO_SYNC_RUNNING_TEXT = 'অটো সিঙ্ক হচ্ছে…';
export const AUTO_SYNC_DONE_TEXT = 'অটো সিঙ্ক শেষ';
export const AUTO_SYNC_DONE_NOTHING_TEXT = 'অটো সিঙ্ক শেষ - কিছু বদলায়নি';
export const AUTO_SYNC_ERROR_TEXT = 'অটো সিঙ্ক হয়নি';
/** শেষ/ত্রুটির লেখা এতক্ষণ (মিলিসেকেন্ড) থাকে */
export const AUTO_SYNC_LINGER_MS = 2500;

export function autoSyncText(s: AutoSyncStatus): string {
  switch (s.phase) {
    case 'running':
      return AUTO_SYNC_RUNNING_TEXT;
    case 'done':
      return s.changed ? AUTO_SYNC_DONE_TEXT : AUTO_SYNC_DONE_NOTHING_TEXT;
    case 'error':
      return AUTO_SYNC_ERROR_TEXT;
    default:
      return '';
  }
}

export interface AutoSyncStore {
  get(): AutoSyncStatus;
  subscribe(fn: () => void): () => void;
  isRunning(): boolean;
  start(): void;
  finish(changed: boolean): void;
  fail(): void;
}

export function createAutoSyncStore(lingerMs: number = AUTO_SYNC_LINGER_MS): AutoSyncStore {
  let state: AutoSyncStatus = { phase: 'idle' };
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();

  const set = (s: AutoSyncStatus) => {
    state = s;
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch {
        /* শ্রোতার ভুলে সিঙ্ক থামে না */
      }
    }
  };
  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const linger = () => {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      if (state.phase === 'done' || state.phase === 'error') set({ phase: 'idle' });
    }, lingerMs);
  };

  return {
    get: () => state,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    isRunning: () => state.phase === 'running',
    start: () => {
      clearTimer();
      set({ phase: 'running' });
    },
    finish: (changed) => {
      set({ phase: 'done', changed });
      linger();
    },
    fail: () => {
      set({ phase: 'error' });
      linger();
    },
  };
}

/** অ্যাপের একটাই অটো সিঙ্ক অবস্থা */
export const autoSyncStore = createAutoSyncStore();

export function useAutoSyncStatus(): AutoSyncStatus {
  return useSyncExternalStore(autoSyncStore.subscribe, autoSyncStore.get, autoSyncStore.get);
}
