/**
 * যাচাই-পরিকল্পনা ধাপ ১ — মেমরির নকল ফাইল-সিস্টেম।
 * src/storage/nativeStore.ts-এর হুবহু একই ফাংশন-তালিকা, কিন্তু ফোনের ফাইলের বদলে একটা Map-এ চলে।
 * ফলে writer.ts, scanner.ts, syncEngine.ts ইত্যাদি আসল কোডেই চলে।
 *
 * ব্যবহার (প্রতিটি verify-*.test.ts ফাইলের শুরুতে):
 *   import { vi } from 'vitest';
 *   vi.mock('../src/storage/nativeStore', async () => await import('./stubs/memoryStore'));
 *   import * as fs from './stubs/memoryStore';   // fs.resetFs(), fs.seedText(...), fs.dumpFiles() ...
 *
 * আসল ফোনের সাথে যে আচরণ মিলিয়ে রাখা হয়েছে:
 *  - scanTree: মূল ফোল্ডার না থাকলে {exists:false}; পথ মূল ফোল্ডারের ভেতর থেকে মাপা; ".folder.json"-এর লেখা `t`-তে;
 *    "." দিয়ে শুরু ফোল্ডারের ভেতরে ঢোকে না (StorageAccessPlugin.java walk()-এর মতো)।
 *  - writeTextSafe: .tmp -> যাচাই -> .bak -> বসানো (nativeStore.ts-এর হুবহু ধাপ)।
 */
import type { ScanResult, ScanEntry } from '../../src/utils/storageAccess';

interface FileNode {
  data: string; // টেক্সট ফাইল: UTF-8 লেখা; বাইনারি: base64
  binary: boolean;
  mtime: number;
}

const files = new Map<string, FileNode>();
const dirs = new Set<string>();
let clock = 1_700_000_000_000;

export interface FsOp {
  op: string;
  path: string;
  to?: string;
}
export const opLog: FsOp[] = [];

/** ব্যর্থতা ঢোকানোর হুক: true ফেরালে ওই কাজ exception ছোঁড়ে */
let failRule: ((op: string, path: string) => boolean) | null = null;

const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
const parentOf = (p: string) => {
  const i = p.lastIndexOf('/');
  return i < 0 ? '' : p.slice(0, i);
};
const tick = () => ++clock;

function maybeFail(op: string, path: string) {
  if (failRule && failRule(op, path)) throw new Error(`নকল ফাইল-সিস্টেম ব্যর্থতা: ${op} ${path}`);
}
function ensureParents(path: string) {
  let d = parentOf(path);
  while (d) {
    dirs.add(d);
    d = parentOf(d);
  }
}

// ───────────── টেস্টের সহায়ক ─────────────
export function resetFs(): void {
  files.clear();
  dirs.clear();
  opLog.length = 0;
  failRule = null;
  clock = 1_700_000_000_000;
}
export function setFailRule(rule: ((op: string, path: string) => boolean) | null): void {
  failRule = rule;
}
export function setClock(ms: number): void {
  clock = ms;
}
export function seedText(path: string, text: string, mtime?: number): void {
  const p = norm(path);
  ensureParents(p);
  files.set(p, { data: text, binary: false, mtime: mtime ?? tick() });
}
export function seedBase64(path: string, b64: string, mtime?: number): void {
  const p = norm(path);
  ensureParents(p);
  files.set(p, { data: b64, binary: true, mtime: mtime ?? tick() });
}
export function seedDir(path: string): void {
  const p = norm(path);
  dirs.add(p);
  ensureParents(p);
}
/** সব ফাইলের পথ (সাজানো) — prefix দিলে শুধু তার নিচের */
export function listFiles(prefix = ''): string[] {
  const pre = norm(prefix);
  return [...files.keys()].filter((k) => !pre || k === pre || k.startsWith(pre + '/')).sort();
}
export function listDirs(prefix = ''): string[] {
  const pre = norm(prefix);
  return [...dirs].filter((k) => !pre || k === pre || k.startsWith(pre + '/')).sort();
}
export function fileText(path: string): string | undefined {
  const f = files.get(norm(path));
  return f && !f.binary ? f.data : undefined;
}
export function fileBase64(path: string): string | undefined {
  const f = files.get(norm(path));
  return f && f.binary ? f.data : undefined;
}
export function fileJson<T = any>(path: string): T | undefined {
  const t = fileText(path);
  return t === undefined ? undefined : (JSON.parse(t) as T);
}
export function dumpFiles(prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of listFiles(prefix)) {
    const f = files.get(k)!;
    out[k] = f.binary ? `[base64:${f.data.length}]` : f.data;
  }
  return out;
}
export function countOps(op: string, pathPrefix = ''): number {
  const pre = norm(pathPrefix);
  return opLog.filter((o) => o.op === op && (!pre || o.path.startsWith(pre))).length;
}
export function clearOpLog(): void {
  opLog.length = 0;
}
/** বাইরের হাতে করা কাজ (ফাইল-ম্যানেজারে) নকল করা: লগে ঢোকে না, ব্যর্থতা-নিয়মও মানে না */
export function externalDelete(path: string): void {
  const p = norm(path);
  files.delete(p);
  if (dirs.has(p)) {
    for (const k of [...files.keys()]) if (k.startsWith(p + '/')) files.delete(k);
    for (const d of [...dirs]) if (d === p || d.startsWith(p + '/')) dirs.delete(d);
  }
}
export function externalRename(from: string, to: string): void {
  moveTree(norm(from), norm(to));
}

function moveTree(f: string, t: string) {
  if (files.has(f)) {
    const node = files.get(f)!;
    files.delete(f);
    ensureParents(t);
    files.set(t, { ...node, mtime: tick() });
    return;
  }
  if (dirs.has(f)) {
    ensureParents(t);
    dirs.add(t);
    for (const k of [...files.keys()]) {
      if (k.startsWith(f + '/')) {
        const node = files.get(k)!;
        files.delete(k);
        const nk = t + k.slice(f.length);
        ensureParents(nk);
        files.set(nk, node);
      }
    }
    for (const d of [...dirs]) {
      if (d === f || d.startsWith(f + '/')) {
        dirs.delete(d);
        dirs.add(t + d.slice(f.length));
      }
    }
    return;
  }
  throw new Error(`rename: উৎস নেই: ${f}`);
}

// ───────────── nativeStore-এর একই ফাংশন-তালিকা ─────────────
export function isNativeApp(): boolean {
  return true;
}

export async function statPath(path: string): Promise<{ isDir: boolean; size: number; mtime: number } | null> {
  const p = norm(path);
  const f = files.get(p);
  if (f) return { isDir: false, size: f.data.length, mtime: f.mtime };
  if (dirs.has(p)) return { isDir: true, size: 0, mtime: 0 };
  return null;
}
export async function pathExists(path: string): Promise<boolean> {
  return (await statPath(path)) !== null;
}
export async function makeDir(path: string): Promise<void> {
  const p = norm(path);
  opLog.push({ op: 'makeDir', path: p });
  maybeFail('makeDir', p);
  dirs.add(p);
  ensureParents(p);
}
export async function readText(path: string): Promise<string | null> {
  const f = files.get(norm(path));
  return f && !f.binary ? f.data : f ? f.data : null;
}
export async function writeText(path: string, text: string): Promise<void> {
  const p = norm(path);
  opLog.push({ op: 'writeText', path: p });
  maybeFail('writeText', p);
  ensureParents(p);
  files.set(p, { data: text, binary: false, mtime: tick() });
}
export async function writeTextSafe(path: string, text: string): Promise<void> {
  const p = norm(path);
  opLog.push({ op: 'writeTextSafe', path: p });
  maybeFail('writeTextSafe', p);
  const tmp = `${p}.tmp`;
  const bak = `${p}.bak`;
  await writeText(tmp, text);
  const back = await readText(tmp);
  if (back !== text) {
    await removeFile(tmp);
    throw new Error(`লেখা যাচাইয়ে মেলেনি: ${p}`);
  }
  const hadOld = await pathExists(p);
  if (hadOld) {
    await removeFile(bak);
    try {
      await copyFile(p, bak);
    } catch (err) {
      await removeFile(tmp);
      throw err;
    }
  }
  try {
    await renamePath(tmp, p);
  } catch {
    try {
      if (hadOld) await removeFile(p);
      await renamePath(tmp, p);
    } catch (err2) {
      if (hadOld && !(await pathExists(p))) {
        try {
          await copyFile(bak, p);
        } catch {
          /* .bak তো থেকেই গেল */
        }
      }
      throw err2;
    }
  }
}
export async function writeBase64(path: string, base64: string): Promise<void> {
  const p = norm(path);
  opLog.push({ op: 'writeBase64', path: p });
  maybeFail('writeBase64', p);
  ensureParents(p);
  files.set(p, { data: base64, binary: true, mtime: tick() });
}
export async function readBase64(path: string): Promise<string | null> {
  const f = files.get(norm(path));
  if (!f) return null;
  if (f.binary) return f.data;
  let bin = '';
  for (const b of new TextEncoder().encode(f.data)) bin += String.fromCharCode(b);
  return btoa(bin);
}
export async function removeDir(path: string): Promise<void> {
  const p = norm(path);
  opLog.push({ op: 'removeDir', path: p });
  maybeFail('removeDir', p);
  for (const k of [...files.keys()]) if (k.startsWith(p + '/')) files.delete(k);
  for (const d of [...dirs]) if (d === p || d.startsWith(p + '/')) dirs.delete(d);
}
export async function removeFile(path: string): Promise<void> {
  const p = norm(path);
  opLog.push({ op: 'removeFile', path: p });
  maybeFail('removeFile', p);
  files.delete(p);
}
export async function renamePath(from: string, to: string): Promise<void> {
  const f = norm(from);
  const t = norm(to);
  opLog.push({ op: 'renamePath', path: f, to: t });
  maybeFail('renamePath', f);
  moveTree(f, t);
}
export async function copyFile(from: string, to: string): Promise<void> {
  const f = norm(from);
  const t = norm(to);
  opLog.push({ op: 'copyFile', path: f, to: t });
  maybeFail('copyFile', f);
  const node = files.get(f);
  if (!node) throw new Error(`copy: উৎস নেই: ${f}`);
  ensureParents(t);
  files.set(t, { ...node, mtime: tick() });
}

const MAX_SCAN_DEPTH = 12;
export async function scanTree(root: string): Promise<ScanResult> {
  const base = norm(root);
  if (!dirs.has(base)) return { exists: false, entries: [] };
  const entries: ScanEntry[] = [];
  const walk = (dir: string, rel: string, depth: number) => {
    const names = new Map<string, boolean>(); // নাম -> ফোল্ডার কি না
    for (const d of dirs) if (parentOf(d) === dir) names.set(d.slice(dir.length + 1), true);
    for (const k of files.keys()) if (parentOf(k) === dir) names.set(k.slice(dir.length + 1), false);
    for (const [name, isDir] of [...names].sort((a, b) => a[0].localeCompare(b[0]))) {
      const p = rel ? `${rel}/${name}` : name;
      const full = `${dir}/${name}`;
      const e: ScanEntry = { p, d: isDir, s: 0, m: 0 };
      if (!isDir) {
        const f = files.get(full)!;
        e.s = f.data.length;
        e.m = f.mtime;
        if (name === '.folder.json' && !f.binary) e.t = f.data;
      }
      entries.push(e);
      if (isDir && depth < MAX_SCAN_DEPTH && !name.startsWith('.')) walk(full, p, depth + 1);
    }
  };
  walk(base, '', 0);
  return { exists: true, entries };
}
