import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

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

/**
 * Save file to device using Capacitor Filesystem + Share, or trigger Web download
 */
export async function exportJsonFile(fileName: string, jsonString: string): Promise<boolean> {
  // If native Capacitor platform
  if (Capacitor.isNativePlatform()) {
    try {
      const writeResult = await Filesystem.writeFile({
        path: fileName,
        data: jsonString,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });

      await Share.share({
        title: fileName,
        text: `${fileName} ফাইলটি সংরক্ষণ বা শেয়ার করুন`,
        url: writeResult.uri,
        dialogTitle: 'ফাইল সেভ বা শেয়ার করুন',
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
    link.download = fileName;
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
