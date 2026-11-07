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

export async function removeDir(path: string): Promise<void> {
  try {
    await Filesystem.rmdir({ path, directory: DIR, recursive: true });
  } catch {
    /* already gone */
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
