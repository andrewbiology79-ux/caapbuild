import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { StorageAccess, type ScanResult } from '../utils/storageAccess';

/** Thin wrapper over the Capacitor Filesystem plugin - every path is relative to the phone's internal storage */

const DIR = Directory.ExternalStorage;

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export async function statPath(path: string): Promise<{ isDir: boolean; size: number; mtime: number } | null> {
  try {
    const st = await Filesystem.stat({ path, directory: DIR });
    return { isDir: st.type === 'directory', size: Number(st.size) || 0, mtime: Number(st.mtime) || 0 };
  } catch {
    return null;
  }
}

export async function pathExists(path: string): Promise<boolean> {
  return (await statPath(path)) !== null;
}

export async function makeDir(path: string): Promise<void> {
  try {
    await Filesystem.mkdir({ path, directory: DIR, recursive: true });
  } catch (err: any) {
    // "already exists" is fine
    if (!(await pathExists(path))) throw err;
  }
}

export async function readText(path: string): Promise<string | null> {
  try {
    const res = await Filesystem.readFile({ path, directory: DIR, encoding: Encoding.UTF8 });
    return typeof res.data === 'string' ? res.data : await (res.data as Blob).text();
  } catch {
    return null;
  }
}

export async function writeText(path: string, text: string): Promise<void> {
  await Filesystem.writeFile({ path, data: text, directory: DIR, encoding: Encoding.UTF8, recursive: true });
}

/**
 * ধাপ ২.১ - নিরাপদ লেখা: আগের ফাইল কখনো আধা-লেখা অবস্থায় থাকে না।
 *   ১) পাশে <ফাইল>.tmp-তে লেখা, ২) আবার পড়ে হুবহু মিলছে কি না দেখা (না মিললে .tmp মুছে ব্যর্থ),
 *   ৩) আগের ফাইল থাকলে <ফাইল>.bak-এ কপি (আগের .bak বদলে যায়), ৪) .tmp -> আসল নামে বসানো।
 * বসানো ব্যর্থ হলে আগের ফাইল .bak থেকে ফেরানো হয়। যেকোনো ব্যর্থতায় exception ছোঁড়ে,
 * যাতে ডাকার কোড "সেভ হয়েছে" না ধরে।
 * Android-এ rename আগের ফাইলের ওপর কী করে তা ফোনে পরীক্ষা বাকি, তাই দুই রাস্তাই আছে।
 */
export async function writeTextSafe(path: string, text: string): Promise<void> {
  const tmp = `${path}.tmp`;
  const bak = `${path}.bak`;
  await writeText(tmp, text);
  const back = await readText(tmp);
  if (back !== text) {
    await removeFile(tmp);
    throw new Error(`লেখা যাচাইয়ে মেলেনি: ${path}`);
  }
  const hadOld = await pathExists(path);
  if (hadOld) {
    await removeFile(bak);
    try {
      await copyFile(path, bak);
    } catch (err) {
      await removeFile(tmp);
      throw err; // আগের ফাইলের কপি না রেখে বদলানো হবে না
    }
  }
  try {
    await renamePath(tmp, path);
  } catch {
    try {
      if (hadOld) await removeFile(path);
      await renamePath(tmp, path);
    } catch (err2) {
      if (hadOld && !(await pathExists(path))) {
        try {
          await copyFile(bak, path); // আগের ফাইল ফেরানো
        } catch {
          /* .bak তো থেকেই গেল */
        }
      }
      throw err2;
    }
  }
}

/** base64 WITHOUT the data-URL prefix */
export async function writeBase64(path: string, base64: string): Promise<void> {
  await Filesystem.writeFile({ path, data: base64, directory: DIR, recursive: true });
}

export async function readBase64(path: string): Promise<string | null> {
  try {
    const res = await Filesystem.readFile({ path, directory: DIR });
    if (typeof res.data === 'string') return res.data;
    const blob = res.data as Blob;
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return btoa(bin);
  } catch {
    return null;
  }
}

function isPathNotFoundError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /\b(enoent|not found|does not exist|no such file|file\s+does not exist)\b/i.test(message);
}

async function confirmPathRemoved(path: string): Promise<boolean> {
  try {
    await Filesystem.stat({ path, directory: DIR });
    return false; // এখনও আছে
  } catch (err) {
    // কেবল স্পষ্ট not-found error-ই অনুপস্থিতির প্রমাণ। Permission বা অন্য
    // storage error-কে কখনোই "ফোল্ডার নেই" ধরে নেওয়া যাবে না।
    if (isPathNotFoundError(err)) return true;
    throw err;
  }
}

export async function removeDir(path: string): Promise<void> {
  try {
    await Filesystem.rmdir({ path, directory: DIR, recursive: true });
  } catch (removeError) {
    if (await confirmPathRemoved(path)) return;
    throw removeError;
  }

  // সফল response-এর পরও path থাকলে deletion সম্পূর্ণ হয়নি। stat-এর
  // permission/অন্যান্য error-ও caller-এর কাছে যাবে; metadata অক্ষত থাকবে।
  if (!(await confirmPathRemoved(path))) {
    throw new Error(`ফোল্ডার মুছতে ব্যর্থ: ${path}`);
  }
}

export async function removeFile(path: string): Promise<void> {
  try {
    await Filesystem.deleteFile({ path, directory: DIR });
  } catch {
    /* already gone */
  }
}

export async function renamePath(from: string, to: string): Promise<void> {
  await Filesystem.rename({ from, to, directory: DIR, toDirectory: DIR });
}

export async function copyFile(from: string, to: string): Promise<void> {
  await Filesystem.copy({ from, to, directory: DIR, toDirectory: DIR });
}

/** Whole folder tree in one native call */
export async function scanTree(root: string): Promise<ScanResult> {
  return StorageAccess.scanTree({ root });
}
