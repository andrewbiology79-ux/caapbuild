import { useEffect } from 'react';
import { acquireEditor } from '../storage/editorGuard';

/** ফর্ম/এডিটর খোলা থাকলে (active=true) অটো সিঙ্ক অপেক্ষা করে */
export function useEditorOpen(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return acquireEditor();
  }, [active]);
}
