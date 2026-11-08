import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { getDb, type CqScope } from '../db/db';
import { StorageAccess, ensureStorageAccess, hasStorageAccess, QB_ROOT } from '../utils/storageAccess';
import { QUESTION_BANK_ROOT, scopeRoot, DATA_FILE, entityPath } from './folderLayout';
import { makeDir, readText, pathExists, renamePath } from './nativeStore';
import {
  installWriteHooks,
  flushAllWrites,
  markEverythingDirty,
  setWritesEnabled,
  setWriteErrorHandler,
  getLastWriteAt,
  hasPendingWrites,
  resetWriterCaches,
} from './writer';
import { scanScope, type ScanSummary } from './scanner';
import { withSyncLock } from './syncLock';

/**
 * Folder sync - the one place that decides WHEN things are written / read.
 *
 *  - app -> folders : automatic (Dexie hooks + debounced writer, see writer.ts)
 *  - folders -> app : a scan when the app opens, when it comes back to the front,
 *                     when the folder watcher reports a change, and on the refresh button
 */

const ENABLED_KEY = 'qb_folder_sync_enabled';
export const SYNC_CHANGED_EVENT = 'qb:sync-changed';
const SCOPES: CqScope[] = ['type', 'chapter'];

export interface SyncReport {
  changed: boolean;
  added: number;
  renamed: number;
  deleted: number;
  topicsUpdated: number;
  warnings: string[];
  error?: string;
}

const emptyReport = (): SyncReport => ({ changed: false, added: 0, renamed: 0, deleted: 0, topicsUpdated: 0, warnings: [] });

export function isFolderSyncEnabled(): boolean {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    return localStorage.getItem(ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}

function setEnabledFlag(on: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

let pauseCount = 0;
/** Big import / restore jobs rewrite the whole database - the folders are not scanned while they run */
export function pauseSync(): void {
  pauseCount++;
}
export function resumeSync(): void {
  pauseCount = Math.max(0, pauseCount - 1);
}

let confirmMassDelete: ((count: number, total: number) => boolean) | null = null;
export function setMassDeleteConfirm(fn: ((count: number, total: number) => boolean) | null): void {
  confirmMassDelete = fn;
}

function announce(report: SyncReport): void {
  try {
    window.dispatchEvent(new CustomEvent(SYNC_CHANGED_EVENT, { detail: report }));
  } catch {
    /* ignore */
  }
}

/** Write pending app changes into the folders, then read the folders back into the app */
export async function syncNow(): Promise<SyncReport> {
  const report = emptyReport();
  if (!isFolderSyncEnabled() || pauseCount > 0) return report;

  await flushAllWrites();

  const summaries: ScanSummary[] = await withSyncLock(async () => {
    const out: ScanSummary[] = [];
    for (const scope of SCOPES) {
      try {
        out.push(await scanScope(scope, { confirmMassDelete: confirmMassDelete ?? undefined }));
      } catch (err: any) {
        console.warn(`Folder scan (${scope}) failed:`, err);
        out.push({ scope, added: 0, renamed: 0, deleted: 0, topicsUpdated: 0, warnings: [], changed: false, error: err?.message || String(err) });
      }
    }
    return out;
  });

  for (const s of summaries) {
    report.added += s.added;
    report.renamed += s.renamed;
    report.deleted += s.deleted;
    report.topicsUpdated += s.topicsUpdated;
    report.warnings.push(...s.warnings);
    if (s.error) report.error = s.error;
    if (s.changed) report.changed = true;
  }

  // the scan may have queued follow-up writes (missing data.json, new folders ...)
  if (hasPendingWrites()) await flushAllWrites();

  if (report.changed) announce(report);
  return report;
}

/* ------------------------------------------------------------------
 * Start / stop (mounted once by <SyncRunner />)
 * ---------------------------------------------------------------- */

export function startFolderSync(onReport: (r: SyncReport) => void, onWriteError: (message: string) => void): () => void {
  if (!isFolderSyncEnabled()) return () => {};

  setWritesEnabled(true);
  installWriteHooks();
  setWriteErrorHandler(onWriteError);

  let stopped = false;
  let running = false;
  const run = async () => {
    if (stopped || running) return;
    running = true;
    try {
      if (!(await hasStorageAccess())) return;
      try {
        if (await recoverInterruptedRebuild()) {
          onReport({ ...emptyReport(), warnings: ['আগের ফোল্ডার পুনর্গঠন মাঝপথে থেমেছিল - অ্যাপের ডেটা থেকে ফোল্ডার আবার লেখা হয়েছে'] });
        }
      } catch (err: any) {
        console.warn('Interrupted rebuild recovery failed:', err);
        onReport({ ...emptyReport(), error: `ফোল্ডার পুনর্গঠন সম্পূর্ণ করা যায়নি: ${err?.message || err}` });
        return; // স্ক্যান নয় - আধা-লেখা ফোল্ডার থেকে ডেটা মোছার ঝুঁকি
      }
      const r = await syncNow();
      if (r.changed || r.error || r.warnings.length) onReport(r);
    } catch (err) {
      console.warn('Folder sync failed:', err);
    } finally {
      running = false;
    }
  };

  const first = setTimeout(run, 1200);

  let resumeHandle: { remove: () => Promise<void> } | null = null;
  CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive) setTimeout(run, 800);
  }).then((h) => {
    resumeHandle = h;
    if (stopped) h.remove();
  });

  // live folder watcher (extra - the scan on resume is the safety net)
  let watchHandle: { remove: () => Promise<void> } | null = null;
  let watchTimer: ReturnType<typeof setTimeout> | null = null;
  (async () => {
    try {
      if (!(await hasStorageAccess())) return;
      await makeDir(QUESTION_BANK_ROOT);
      watchHandle = await StorageAccess.addListener('storageChanged', () => {
        if (watchTimer) clearTimeout(watchTimer);
        watchTimer = setTimeout(() => {
          // ignore the echo of our own writes
          if (Date.now() - getLastWriteAt() < 3000 || hasPendingWrites()) return;
          run();
        }, 1500);
      });
      await StorageAccess.watch({ root: QUESTION_BANK_ROOT });
      if (stopped) {
        watchHandle?.remove();
        StorageAccess.unwatch().catch(() => {});
      }
    } catch (err) {
      console.warn('Folder watcher not available (the scan still works):', err);
    }
  })();

  return () => {
    stopped = true;
    clearTimeout(first);
    if (watchTimer) clearTimeout(watchTimer);
    resumeHandle?.remove().catch(() => {});
    watchHandle?.remove().catch(() => {});
    StorageAccess.unwatch().catch(() => {});
  };
}

/* ------------------------------------------------------------------
 * One-time migration: database -> folders
 * ---------------------------------------------------------------- */

export type EnableResult =
  | { ok: true; topics: number; questions: number }
  | { ok: false; reason: 'no-access' | 'backup-failed' | 'verify-failed' | 'error'; message: string };

/**
 * Turns folder sync ON:
 *  1) storage permission  2) safety backup  3) every subject / chapter / type + pictures -> folders
 *  4) check that what is in the folders matches the database  5) switch the sync on.
 * Nothing is deleted from the database unless the folder copy was verified.
 */
export async function enableFolderSync(onProgress?: (text: string) => void): Promise<EnableResult> {
  if (!Capacitor.isNativePlatform()) return { ok: false, reason: 'error', message: 'শুধু অ্যান্ড্রয়েড অ্যাপে চলে' };
  const say = (t: string) => onProgress?.(t);

  say('স্টোরেজ অনুমতি যাচাই হচ্ছে…');
  if (!(await ensureStorageAccess())) {
    return { ok: false, reason: 'no-access', message: 'স্টোরেজ অনুমতি (All files access) দরকার' };
  }

  pauseSync();
  try {
    say('নিরাপত্তার জন্য ব্যাকআপ নেওয়া হচ্ছে…');
    const { runAutoBackup } = await import('../utils/autoBackup');
    const backup = await runAutoBackup(true);
    if (backup.status !== 'done') {
      const msg = backup.status === 'error' ? backup.message : 'ব্যাকআপ নেওয়া যায়নি';
      return { ok: false, reason: 'backup-failed', message: msg };
    }

    say('ফোল্ডার তৈরি হচ্ছে…');
    for (const scope of SCOPES) await makeDir(scopeRoot(scope));

    setWritesEnabled(true);
    installWriteHooks();
    for (const scope of SCOPES) await markEverythingDirty(scope);
    say('প্রশ্ন ও ছবি ফোল্ডারে লেখা হচ্ছে…');
    await flushAllWrites(true);

    say('যাচাই করা হচ্ছে…');
    let topics = 0;
    let questions = 0;
    for (const scope of SCOPES) {
      const sdb = getDb(scope);
      for (const t of await sdb.topics.toArray()) {
        const dir = await entityPath(sdb, scope, t.id);
        const text = dir ? await readText(`${dir}/${DATA_FILE}`) : null;
        const count = await sdb.questions.where('topicId').equals(t.id).count();
        let fileCount = -1;
        try {
          fileCount = text ? JSON.parse(text).questions.length : -1;
        } catch {
          fileCount = -1;
        }
        if (fileCount !== count) {
          setWritesEnabled(false);
          return { ok: false, reason: 'verify-failed', message: `"${t.name}" ফোল্ডারের তথ্য মেলেনি` };
        }
        topics++;
        questions += count;
      }
    }

    setEnabledFlag(true);
    return { ok: true, topics, questions };
  } catch (err: any) {
    setWritesEnabled(false);
    return { ok: false, reason: 'error', message: err?.message || String(err) };
  } finally {
    resumeSync();
  }
}

/** Switch folder sync off again (the folders stay as they are) */
export function disableFolderSync(): void {
  setEnabledFlag(false);
  setWritesEnabled(false);
}

/* ------------------------------------------------------------------
 * For big import / restore jobs (collectionTransfer.ts)
 * ---------------------------------------------------------------- */

/**
 * Call after a job that cleared / replaced a whole database. The folders of that scope are rebuilt
 * from the app database (pictures that were just imported are still blobs there and are written out).
 */
const JOURNAL_KEY = 'qb_rebuild_journal';

function readJournal(): CqScope[] | null {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    const arr = raw ? JSON.parse(raw) : null;
    return Array.isArray(arr) && arr.length ? (arr as CqScope[]) : null;
  } catch {
    return null;
  }
}

function writeJournal(scopes: CqScope[] | null): void {
  try {
    if (scopes) localStorage.setItem(JOURNAL_KEY, JSON.stringify(scopes));
    else localStorage.removeItem(JOURNAL_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * ধাপ ২.৪: ফোল্ডার পুনর্গঠনের মাঝে অ্যাপ বন্ধ হলে "চলমান কাজ" চিহ্নটা থেকে যায়। পরের চালুতে
 * ফোল্ডার স্ক্যান না করে (আধা-লেখা ফোল্ডারকে \"মুছে গেছে\" ভেবে ডেটা মুছে ফেলার ঝুঁকি এড়াতে)
 * আগে ডাটাবেস থেকে আবার পুরো লেখা হয়। ডাটাবেসই সত্য, কারণ ইমপোর্ট ডাটাবেসে আগেই শেষ।
 * @returns true হলে উদ্ধার চলেছে
 */
export async function recoverInterruptedRebuild(): Promise<boolean> {
  const scopes = readJournal();
  if (!scopes || !isFolderSyncEnabled()) return false;
  await rebuildFolders(scopes);
  return true;
}

export async function rebuildFolders(scopes: CqScope[]): Promise<void> {
  if (!isFolderSyncEnabled()) return;
  await flushAllWrites(); // let queued small writes finish first
  writeJournal(scopes);
  await withSyncLock(async () => {
    for (const scope of scopes) {
      const sdb = getDb(scope);
      // ধাপ ২.৩: পুরনো ফোল্ডার মোছা হয় না - পাশে সরিয়ে রাখা হয়
      // (Download/QB Collection/Replaced_Folders/<সময়>_<নাম>)। সরানো ব্যর্থ হলে পুরো কাজ থামে,
      // ডেটা অক্ষত থাকে। জায়গা দরকার হলে ওই ফোল্ডার তুমি নিজে মুছবে।
      if (await pathExists(scopeRoot(scope))) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const holder = `${QB_ROOT}/Replaced_Folders`;
        await makeDir(holder);
        await renamePath(scopeRoot(scope), `${holder}/${stamp}_${scope === 'chapter' ? 'Chapter_CQ' : 'Type_CQ'}`);
      }
      await sdb.syncState.clear();
      await makeDir(scopeRoot(scope));
    }
    resetWriterCaches();
  });
  for (const scope of scopes) await markEverythingDirty(scope);
  await flushAllWrites(true);
  writeJournal(null); // সব লেখা শেষ - চিহ্ন মোছা
}

/** Call after a job that only added / updated rows (hooks already queued them) - just write now */
export async function flushAfterBulkChange(): Promise<void> {
  if (!isFolderSyncEnabled()) return;
  await flushAllWrites();
}
