import { Capacitor } from '@capacitor/core';
import { blobToBase64 } from './fileExport';
import { ensureStorageAccess, saveImageToPhoneStorage, makeTimeStamp } from './storageAccess';

export interface ExportedImage {
  /** Native: path inside the phone storage. Web: the downloaded file name. */
  savedPath: string;
  native: boolean;
}

/**
 * Pictures are stored as WebP inside the app. Convert them to PNG for export so every
 * gallery / editor app can open them. PNG and JPEG blobs are exported untouched.
 */
async function toExportableBlob(blob: Blob): Promise<{ blob: Blob; extension: string }> {
  if (blob.type === 'image/png') return { blob, extension: 'png' };
  if (blob.type === 'image/jpeg') return { blob, extension: 'jpg' };

  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image decode failed'));
      el.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2d context unavailable');
    ctx.drawImage(img, 0, 0);

    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('PNG conversion failed');
    return { blob: png, extension: 'png' };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Export a picture shown in the form (a blob: URL) to the phone.
 *  - Android app: saved into Download/QbCollection/Images
 *  - Browser: normal file download
 * Resolves null when the storage permission was not granted. Throws on any other failure.
 */
export async function exportImageFromUrl(url: string, baseName = 'qb-image'): Promise<ExportedImage | null> {
  const response = await fetch(url);
  const source = await response.blob();
  const { blob, extension } = await toExportableBlob(source);

  if (Capacitor.isNativePlatform()) {
    const allowed = await ensureStorageAccess();
    if (!allowed) return null;

    const dataUrl = await blobToBase64(blob);
    const pureBase64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const savedPath = await saveImageToPhoneStorage(pureBase64, baseName, extension);
    return { savedPath, native: true };
  }

  const fileName = `${baseName}_${makeTimeStamp()}.${extension}`;
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
  return { savedPath: fileName, native: false };
}
