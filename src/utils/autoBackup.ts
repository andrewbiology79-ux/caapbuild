import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { App as CapacitorApp } from '@capacitor/app';
import { buildQuestionCollectionExport, buildAppFullBackupExport } from './collectionTransfer';
import { hasStorageAccess, ensureStorageAccess } from './storageAccess';

/** Every day gets its own dated folder in here, e.g. Download/QbCollection/AutoBackup/2026-11-02 */
export const AUTO_BACKUP_ROOT = 'Download/QbCollection/AutoBackup';

const LAST_KEY = 'qb_auto_backup_last_date';
const ENABLED_KEY = 'qb_auto_backup_enabled';

/** Local date like 2026-11-02 */
export function localDateString(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isAutoBackupEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== '0'; // on by default
  } catch {
    return true;
  }
}

export function setAutoBackupEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function getLastAutoBackupDate(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

export type AutoBackupResult =
  | { status: 'done'; folder: string }
  | { status: 'skipped' } // already done today / switched off
  | { status: 'busy' }
  | { status: 'unsupported' } // browser preview: cannot write silently into phone storage
  | { status: 'no-access' }
  | { status: 'error'; message: string };

let running = false;
let askedAccessThisSession = false;

async function writeText(path: string, text: string): Promise<void> {
  await Filesystem.writeFile({
    path,
    data: text,
    directory: Directory.ExternalStorage,
    encoding: Encoding.UTF8,
    recursive: true,
  });
}

/**
 * Creates today's backup folder with 3 files:
 *  1. Type CQ file    2. Chapter CQ file    3. Full backup (everything)
 * Runs at most once per day unless `force` is true.
 */
export async function runAutoBackup(force = false): Promise<AutoBackupResult> {
  if (!Capacitor.isNativePlatform()) return { status: 'unsupported' };
  if (!force && !isAutoBackupEnabled()) return { status: 'skipped' };

  const today = localDateString();
  if (!force && getLastAutoBackupDate() === today) return { status: 'skipped' };
  if (running) return { status: 'busy' };

  running = true;
  try {
    let access = await hasStorageAccess();
    if (!access && (force || !askedAccessThisSession)) {
      askedAccessThisSession = true;
      access = await ensureStorageAccess();
    }
    if (!access) return { status: 'no-access' };

    const folder = `${AUTO_BACKUP_ROOT}/${today}`;

    const typeCq = await buildQuestionCollectionExport('type', false);
    await writeText(`${folder}/type-cq_${today}.json`, typeCq.json);

    const chapterCq = await buildQuestionCollectionExport('chapter', false);
    await writeText(`${folder}/chapter-cq_${today}.json`, chapterCq.json);

    const full = await buildAppFullBackupExport();
    await writeText(`${folder}/full-backup_${today}.json`, full.json);

    try {
      localStorage.setItem(LAST_KEY, today);
    } catch {
      /* ignore */
    }
    return { status: 'done', folder };
  } catch (err: any) {
    console.error('Auto backup failed:', err);
    return { status: 'error', message: err?.message || String(err) };
  } finally {
    running = false;
  }
}

/**
 * Checks for today's backup when the app opens, when it comes back to the front and
 * every 30 minutes while it stays open (so it also works across midnight).
 */
export function startAutoBackupScheduler(onResult: (r: AutoBackupResult) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};

  const check = async () => {
    const r = await runAutoBackup(false);
    if (r.status === 'done' || r.status === 'error' || r.status === 'no-access') onResult(r);
  };

  const first = setTimeout(check, 5000); // let the app finish loading first
  const timer = setInterval(check, 30 * 60 * 1000);

  let handle: { remove: () => Promise<void> } | null = null;
  let removed = false;
  CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive) setTimeout(check, 1500);
  }).then((h) => {
    handle = h;
    if (removed) h.remove();
  });

  return () => {
    removed = true;
    clearTimeout(first);
    clearInterval(timer);
    handle?.remove().catch(() => {});
  };
}
