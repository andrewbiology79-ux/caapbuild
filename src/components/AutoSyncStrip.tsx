import React from 'react';
import { RefreshCw, Check, AlertCircle } from 'lucide-react';
import { autoSyncText, useAutoSyncStatus } from '../storage/autoSyncStatus';

/**
 * অটো সিঙ্ক চলার সময় রিবনের ঠিক নিচে ছোট এক লাইনের লেখা (পুরো উইন্ডো নয়)।
 * Header-এর ভেতরে বসে, তাই সব স্ক্রিনে রিবনের সঙ্গে একসাথে থাকে।
 */
export const AutoSyncStrip: React.FC = () => {
  const status = useAutoSyncStatus();
  if (status.phase === 'idle') return null;

  const Icon = status.phase === 'running' ? RefreshCw : status.phase === 'error' ? AlertCircle : Check;
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-1.5 bg-[#2F40B8] px-3 py-1 text-xs text-white/95"
    >
      <Icon className={`w-3.5 h-3.5 ${status.phase === 'running' ? 'animate-spin' : ''}`} />
      <span className="truncate">{autoSyncText(status)}</span>
    </div>
  );
};

export default AutoSyncStrip;
