import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { App as CapacitorApp } from '@capacitor/app';

/**
 * Native helper (see native-android/StorageAccessPlugin.java) for the
 * "All files access" (MANAGE_EXTERNAL_STORAGE) permission of Android 11+.
 */
interface StorageAccessPlugin {
  check(): Promise<{ granted: boolean; sdk: number }>;
  openSettings(): Promise<void>;
  openFolder(options: { path: string }): Promise<void>;
  openFile(options: { path: string; mimeType?: string }): Promise<void>;
}

const StorageAccess = registerPlugin<StorageAccessPlugin>('StorageAccess');

/** Folder (inside the phone's Download folder) where PDFs are saved */
export const PDF_SAVE_FOLDER = 'Download/QbCollection';

/**
 * Is the app currently allowed to write PDFs into the phone storage?
 */
export async function hasStorageAccess(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const res = await StorageAccess.check();
    if (res.sdk >= 30) {
      return res.granted;
    }
    // Android 10 and below: normal storage permission
    const perm = await Filesystem.checkPermissions();
    return perm.publicStorage === 'granted';
  } catch (err) {
    console.warn('Storage access check failed:', err);
    return false;
  }
}

/**
 * Open the system window where the user can allow "All files access" for this app.
 * (Android 10 and below: shows the normal storage permission prompt.)
 * Resolves with the permission state once the user comes back to the app.
 */
export async function openStorageAccessSettings(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;

  let sdk = 0;
  try {
    sdk = (await StorageAccess.check()).sdk;
  } catch {
    sdk = 0;
  }

  if (sdk > 0 && sdk < 30) {
    try {
      const perm = await Filesystem.requestPermissions();
      return perm.publicStorage === 'granted';
    } catch {
      return false;
    }
  }

  return new Promise<boolean>((resolve) => {
    let handle: { remove: () => Promise<void> } | null = null;
    let settled = false;

    const finish = async () => {
      if (settled) return;
      settled = true;
      try {
        await handle?.remove();
      } catch {
        /* ignore */
      }
      resolve(await hasStorageAccess());
    };

    CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        // small delay so the permission state is updated after returning from Settings
        setTimeout(finish, 300);
      }
    }).then((h) => {
      handle = h;
      if (settled) h.remove();
    });

    StorageAccess.openSettings().catch(() => {
      finish();
    });
  });
}

/* ------------------------------------------------------------------
 * Permission dialog (rendered by <StoragePermissionDialog /> in App)
 * ---------------------------------------------------------------- */

type DialogListener = (open: boolean) => void;
let dialogListener: DialogListener | null = null;
let pendingResolve: ((granted: boolean) => void) | null = null;

export function subscribeStoragePermissionDialog(listener: DialogListener): () => void {
  dialogListener = listener;
  return () => {
    if (dialogListener === listener) dialogListener = null;
  };
}

export function resolveStoragePermissionDialog(granted: boolean): void {
  dialogListener?.(false);
  const resolve = pendingResolve;
  pendingResolve = null;
  resolve?.(granted);
}

/**
 * Make sure the app can write to phone storage. If not, a dialog explains why and
 * lets the user open the permission window. Resolves true when access is granted.
 */
export async function ensureStorageAccess(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  if (await hasStorageAccess()) return true;
  if (!dialogListener) return false;

  return new Promise<boolean>((resolve) => {
    pendingResolve = resolve;
    dialogListener?.(true);
  });
}

/* ------------------------------------------------------------------
 * Saving
 * ---------------------------------------------------------------- */

export function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|\r\n\t]+/g, '-').trim() || 'question-paper';
}

/** Time stamp like 20261024-153012 (used in file / folder names) */
export function makeTimeStamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(
    now.getMinutes()
  )}${pad(now.getSeconds())}`;
}

export interface SavePdfOptions {
  /** Folder to save into (relative to the phone's internal storage). Default: Download/QbCollection */
  folder?: string;
  /** Add a time stamp to the file name (default true) */
  addStamp?: boolean;
}

/**
 * Save a PDF (base64 without data-URL prefix) into Download/QbCollection
 * (or into the given folder). Returns the saved path (relative to the phone's internal storage).
 */
export async function savePdfToPhoneStorage(
  base64Data: string,
  baseName: string,
  options: SavePdfOptions = {}
): Promise<string> {
  const folder = options.folder || PDF_SAVE_FOLDER;
  const cleanBase = sanitizeFileName(baseName.replace(/\.pdf$/i, ''));
  const fileName = options.addStamp === false ? `${cleanBase}.pdf` : `${cleanBase}_${makeTimeStamp()}.pdf`;
  const filePath = `${folder}/${fileName}`;

  await Filesystem.writeFile({
    path: filePath,
    data: base64Data,
    directory: Directory.ExternalStorage,
    recursive: true,
  });

  return filePath;
}

/* ------------------------------------------------------------------
 * "PDF saved" dialog with an Open-folder button (rendered by <PdfSavedDialog /> in App)
 * ---------------------------------------------------------------- */

type SavedListener = (savedPath: string | null) => void;
let savedListener: SavedListener | null = null;

export function subscribePdfSavedDialog(listener: SavedListener): () => void {
  savedListener = listener;
  return () => {
    if (savedListener === listener) savedListener = null;
  };
}

/** Show the "PDF saved" dialog. Returns false if no dialog host is mounted. */
export function showPdfSavedDialog(savedPath: string): boolean {
  if (!savedListener) return false;
  savedListener(savedPath);
  return true;
}

export function closePdfSavedDialog(): void {
  savedListener?.(null);
}

/** Folder part of a saved file path, e.g. "Download/QbCollection/x.pdf" -> "Download/QbCollection" */
export function getFolderOfPath(filePath: string): string {
  const idx = filePath.lastIndexOf('/');
  return idx > 0 ? filePath.slice(0, idx) : PDF_SAVE_FOLDER;
}

/**
 * Open the folder in the phone's file manager. Resolves true when a file manager was launched.
 */
export async function openSavedFolder(filePath: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    await StorageAccess.openFolder({ path: getFolderOfPath(filePath) });
    return true;
  } catch (err) {
    console.warn('Open folder failed:', err);
    return false;
  }
}

/**
 * Open the saved PDF directly in another app (PDF viewer chosen by the user).
 * Resolves true when an app was launched.
 */
export async function openSavedFile(filePath: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    await StorageAccess.openFile({ path: filePath, mimeType: 'application/pdf' });
    return true;
  } catch (err) {
    console.warn('Open file failed:', err);
    return false;
  }
}
