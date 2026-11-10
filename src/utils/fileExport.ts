import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { BACKUP_ROOT, ensureStorageAccess } from './storageAccess';

/**
 * Convert Blob to Base64 data URL string
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(blob);
  });
}

/**
 * Convert Base64 data URL or pure Base64 string to Blob
 */
export function base64ToBlob(base64Data: string, fallbackMime = 'image/webp'): Blob {
  let mime = fallbackMime;
  let pureBase64 = base64Data;

  if (base64Data.includes(';base64,')) {
    const parts = base64Data.split(';base64,');
    mime = parts[0].replace('data:', '') || fallbackMime;
    pureBase64 = parts[1];
  }

  const byteCharacters = atob(pureBase64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mime });
}

/** Local date + time for file names, like 2026-11-06_14-52-30 */
export function fileStamp(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(
    d.getMinutes()
  )}-${pad(d.getSeconds())}`;
}

export interface ExportJsonOptions {
  /**
   * Save straight into Download/QbCollection/Backup/<folder>/<date_time>.json.
   * Without it the old behaviour is kept (file is handed to the Share / Save dialog).
   */
  folder?: string;
}

/** Tell the UI (Toast) where a file was saved */
export const FILE_SAVED_EVENT = 'qb:file-saved';

async function fileExists(path: string): Promise<boolean> {
  try {
    await Filesystem.stat({ path, directory: Directory.ExternalStorage });
    return true;
  } catch {
    return false;
  }
}

/**
 * Save file to device: into its own backup folder (when `options.folder` is given and the app may write
 * to the phone storage), otherwise through Capacitor Filesystem + Share, or as a Web download
 */
export async function exportJsonFile(
  fileName: string,
  jsonString: string,
  options: ExportJsonOptions = {}
): Promise<boolean> {
  const stamp = fileStamp();

  // If native Capacitor platform
  if (Capacitor.isNativePlatform()) {
    // 1) direct save into  Download/QbCollection/Backup/<folder>/<date_time>.json
    if (options.folder) {
      try {
        if (await ensureStorageAccess()) {
          const dir = `${BACKUP_ROOT}/${options.folder}`;
          let path = `${dir}/${stamp}.json`;
          for (let n = 2; (await fileExists(path)) && n < 100; n++) {
            path = `${dir}/${stamp}-${n}.json`;
          }
          await Filesystem.writeFile({
            path,
            data: jsonString,
            directory: Directory.ExternalStorage,
            encoding: Encoding.UTF8,
            recursive: true,
          });
          // shown a moment later so it is not hidden by the caller's own "done" message
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent(FILE_SAVED_EVENT, { detail: { path } }));
          }, 60);
          return true;
        }
      } catch (saveErr) {
        console.warn('Direct save failed, falling back to Share dialog:', saveErr);
      }
    }

    // 2) fallback: Share / Save dialog
    try {
      const writeResult = await Filesystem.writeFile({
        path: fileName,
        data: jsonString,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });

      await Share.share({
        title: fileName,
        text: `${fileName} ফাইলটি সংরক্ষণ বা শেয়ার করুন`,
        url: writeResult.uri,
        dialogTitle: 'ফাইল সেভ বা শেয়ার করুন',
      });
      return true;
    } catch (nativeErr) {
      console.warn('Native Capacitor export failed, falling back to Web download:', nativeErr);
    }
  }

  // Web Browser fallback
  try {
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = options.folder ? `${options.folder.replace(/\s+/g, '-')}_${stamp}.json` : fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch (webErr) {
    console.error('Web file download failed:', webErr);
    return false;
  }
}
