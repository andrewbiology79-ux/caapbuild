import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { App as CapacitorApp } from '@capacitor/app';
import { buildQuestionCollectionExport, buildAppFullBackupExport } from './collectionTransfer';
import { hasStorageAccess, ensureStorageAccess, BACKUP_ROOT, BACKUP_FOLDERS, StorageAccess } from './storageAccess';

/** Every backup gets its own folder (date + time) in here, e.g. Download/QbCollection/Backup/AutoBackup/2026-11-02_14-30-25 */
export const AUTO_BACKUP_ROOT = `${BACKUP_ROOT}/${BACKUP_FOLDERS.auto}`;

const LAST_KEY = 'qb_auto_backup_last_date';
const LAST_TIME_KEY = 'qb_auto_backup_last_time';
const ENABLED_KEY = 'qb_auto_backup_enabled';

/** Local date like 2026-11-02 */
export function localDateString(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local date + time for folder names, like 2026-11-02_14-30-25 (safe in file names) */
export function localStampString(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${localDateString(d)}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
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

/** Date and time of the latest backup (automatic or manual), like "2026-11-02 14:30:25" */
export function getLastAutoBackupTime(): string | null {
  try {
    return localStorage.getItem(LAST_TIME_KEY);
  } catch {
    return null;
  }
}

export type AutoBackupResult =
  | { status: 'done'; folder: string; staleUnfinished?: number }
  | { status: 'skipped' } // already done today / switched off
  | { status: 'busy' }
  | { status: 'unsupported' } // browser preview: cannot write silently into phone storage
  | { status: 'no-access' }
  | { status: 'error'; message: string };

const FAIL_KEY = 'qb_auto_backup_last_failure';
const LAST_SIZE_KEY = 'qb_auto_backup_last_size';
const LAST_OK_MS_KEY = 'qb_auto_backup_last_ok_ms';
/** এর বেশি বড় ফাইল ব্যাকআপ শেষে আবার পড়ে JSON যাচাই করা হয় না (ফোনের RAM বাঁচাতে) - শুধু আকার মেলানো হয় */
const READBACK_LIMIT_BYTES = 60 * 1024 * 1024;
const UNFINISHED_SUFFIX = '_unfinished';

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

/** শেষ ব্যর্থতার বার্তা (সফল হলে মুছে যায়) */
export function getLastBackupFailure(): { at: string; message: string } | null {
  try {
    const raw = localStorage.getItem(FAIL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** শেষ সফল ও যাচাইকৃত ব্যাকআপ কত দিন আগে (না থাকলে null) */
export function getLastBackupAgeDays(): number | null {
  try {
    const ms = Number(localStorage.getItem(LAST_OK_MS_KEY));
    if (!ms) return null;
    return Math.floor((Date.now() - ms) / 86400000);
  } catch {
    return null;
  }
}

function setFailure(message: string): void {
  try {
    localStorage.setItem(FAIL_KEY, JSON.stringify({ at: localStampString(), message }));
  } catch {
    /* ignore */
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function statSize(path: string): Promise<number | null> {
  try {
    const st = await Filesystem.stat({ path, directory: Directory.ExternalStorage });
    return Number(st.size);
  } catch {
    return null;
  }
}

async function removeFolder(path: string): Promise<void> {
  try {
    await Filesystem.rmdir({ path, directory: Directory.ExternalStorage, recursive: true });
  } catch {
    /* already gone */
  }
}

/** আগের অসমাপ্ত (_unfinished) ফোল্ডারের সংখ্যা - অ্যাপ এগুলো মোছে না, শুধু জানায় */
async function countStaleUnfinished(except: string): Promise<number> {
  try {
    const res = await Filesystem.readdir({ path: AUTO_BACKUP_ROOT, directory: Directory.ExternalStorage });
    return res.files.filter((f) => f.type === 'directory' && f.name.endsWith(UNFINISHED_SUFFIX) && f.name !== except).length;
  } catch {
    return 0;
  }
}

interface PlannedFile {
  name: string;
  json: string;
  questionCount: number;
  imageCount: number;
  /** পড়ে যাচাইয়ের সময় প্রশ্ন সংখ্যা বের করার উপায় */
  countOf: (parsed: any) => number;
}

/**
 * ব্যাকআপ নেয় - প্রতিবার নতুন ফোল্ডার, অ্যাপ কখনো কিছু মোছে/ওভাররাইট করে না (নিজের ব্যর্থ _unfinished ছাড়া).
 *
 * ধাপ (Data_Safety_Plan ধাপ ৩ / ব৪):
 *  ১) জায়গা: আগের ব্যাকআপের আকার x ১.২ খালি জায়গার চেয়ে বেশি হলে শুরুই করে না
 *  ২) <সময়>_unfinished ফোল্ডারে তিনটি ফাইল লেখে
 *  ৩) প্রতিটির আকার মেলায়; ছোট ফাইল আবার পড়ে JSON ও প্রশ্ন সংখ্যা ডাটাবেসের সাথে মেলায়
 *  ৪) কোনো ছবি পাওয়া না গেলে ব্যাকআপ \"সফল\" হয় না (ফোল্ডারের নাম হয় <সময়>_অসম্পূর্ণ, মোছা হয় না)
 *  ৫) manifest.json (ফাইল, আকার, SHA-256, সংখ্যা) লিখে ফোল্ডারের নাম বদলে আসল নাম
 * কোনো ধাপে ব্যর্থ হলে \"শেষ সফল ব্যাকআপ\" তারিখ বদলায় না।
 * Runs at most once per day unless `force` is true.
 *
 * `reason` manifest.json-এ লেখা হয় (কেন নেওয়া): 'auto' (দৈনিক), 'manual' (এখনই ব্যাকআপ বাটন),
 * অথবা 'before-...' (রিস্টোর/Replace-ইমপোর্টের আগের নিরাপত্তা ব্যাকআপ - ধাপ ১.৪)।
 * 'before-' ব্যাকআপ \"আজকের দৈনিক ব্যাকআপ হয়ে গেছে\" চিহ্ন বসায় না: ওই কাজের পরে ডেটা বদলে যাবে,
 * তাই আজকের দৈনিক ব্যাকআপ তখনও নেওয়া বাকি থাকে।
 */
export async function runAutoBackup(force = false, reason?: string): Promise<AutoBackupResult> {
  if (!Capacitor.isNativePlatform()) return { status: 'unsupported' };
  if (!force && !isAutoBackupEnabled()) return { status: 'skipped' };

  const today = localDateString();
  if (!force && getLastAutoBackupDate() === today) return { status: 'skipped' };
  if (running) return { status: 'busy' };

  running = true;
  let unfinished = '';
  const why = reason ?? (force ? 'manual' : 'auto');
  const isSafetyBackup = why.startsWith('before-');
  try {
    let access = await hasStorageAccess();
    if (!access && (force || !askedAccessThisSession)) {
      askedAccessThisSession = true;
      access = await ensureStorageAccess();
    }
    if (!access) return { status: 'no-access' };

    // ১) জায়গা
    try {
      const lastSize = Number(localStorage.getItem(LAST_SIZE_KEY)) || 0;
      const { free } = await StorageAccess.getFreeSpace();
      if (lastSize > 0 && free < lastSize * 1.2) {
        const msg = 'জায়গা কম, ব্যাকআপ নেওয়া যাচ্ছে না, পুরনো ব্যাকআপ মুছে দাও।';
        setFailure(msg);
        return { status: 'error', message: msg };
      }
    } catch {
      /* জায়গা মাপা না গেলে চালিয়ে যাও - লেখা ব্যর্থ হলে সেটাই জানাবে */
    }

    const now = new Date();
    const stamp = localStampString(now);
    const finalFolder = `${AUTO_BACKUP_ROOT}/${stamp}`;
    unfinished = `${finalFolder}${UNFINISHED_SUFFIX}`;

    // তিনটি ফাইলের তথ্য এক এক করে বানানো (RAM-এর জন্য), লেখার আগে
    const typeCq = await buildQuestionCollectionExport('type', false);
    const chapterCq = await buildQuestionCollectionExport('chapter', false);
    const full = await buildAppFullBackupExport();
    const planned: PlannedFile[] = [
      { name: `type-cq_${stamp}.json`, json: typeCq.json, questionCount: typeCq.questionCount, imageCount: typeCq.imageCount, countOf: (p) => p?.questions?.length },
      { name: `chapter-cq_${stamp}.json`, json: chapterCq.json, questionCount: chapterCq.questionCount, imageCount: chapterCq.imageCount, countOf: (p) => p?.questions?.length },
      {
        name: `full-backup_${stamp}.json`,
        json: full.json,
        questionCount: full.questionCount,
        imageCount: full.imageCount,
        countOf: (p) => (p?.databases?.type?.questions?.length ?? 0) + (p?.databases?.chapter?.questions?.length ?? 0),
      },
    ];
    const missingImages = typeCq.missingImages + chapterCq.missingImages + full.missingImages;

    // ২-৩) লেখা ও যাচাই
    const manifestFiles: Array<{ name: string; bytes: number; sha256: string; questions: number; images: number; verified: string }> = [];
    let totalBytes = 0;
    for (const f of planned) {
      const bytes = new TextEncoder().encode(f.json);
      await writeText(`${unfinished}/${f.name}`, f.json);
      const size = await statSize(`${unfinished}/${f.name}`);
      if (size !== bytes.length) {
        throw new Error(`${f.name} ঠিকমতো লেখা হয়নি (আকার মেলেনি)`);
      }
      let verified = 'size';
      if (bytes.length <= READBACK_LIMIT_BYTES) {
        const back = await Filesystem.readFile({
          path: `${unfinished}/${f.name}`,
          directory: Directory.ExternalStorage,
          encoding: Encoding.UTF8,
        });
        const text = typeof back.data === 'string' ? back.data : await (back.data as Blob).text();
        let parsed: any;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error(`${f.name} আবার পড়ে JSON ঠিক পাওয়া যায়নি`);
        }
        if (f.countOf(parsed) !== f.questionCount) {
          throw new Error(`${f.name}-এ প্রশ্ন সংখ্যা ডাটাবেসের সাথে মেলেনি`);
        }
        verified = 'size+json+count';
      }
      manifestFiles.push({
        name: f.name,
        bytes: bytes.length,
        sha256: await sha256Hex(bytes),
        questions: f.questionCount,
        images: f.imageCount,
        verified,
      });
      totalBytes += bytes.length;
    }

    // ৫) manifest + নাম বদল
    const manifest = {
      type: 'qb-backup-manifest',
      version: 1,
      createdAt: now.toISOString(),
      reason: why,
      complete: missingImages === 0,
      missingImages,
      files: manifestFiles,
    };
    await writeText(`${unfinished}/manifest.json`, JSON.stringify(manifest, null, 2));

    // ৪) ছবি বাদ পড়লে সফল নয়
    if (missingImages > 0) {
      const incomplete = `${finalFolder}_অসম্পূর্ণ`;
      await Filesystem.rename({ from: unfinished, to: incomplete, directory: Directory.ExternalStorage, toDirectory: Directory.ExternalStorage });
      unfinished = '';
      const msg = `ব্যাকআপ সম্পূর্ণ হয়নি: ${missingImages}টি ছবির ফাইল পাওয়া যায়নি (ফোল্ডার: ${incomplete}). \"শেষ সফল ব্যাকআপ\" বদলায়নি।`;
      setFailure(msg);
      return { status: 'error', message: msg };
    }

    await Filesystem.rename({ from: unfinished, to: finalFolder, directory: Directory.ExternalStorage, toDirectory: Directory.ExternalStorage });
    unfinished = '';

    const stale = await countStaleUnfinished('');
    try {
      if (!isSafetyBackup) localStorage.setItem(LAST_KEY, today);
      localStorage.setItem(LAST_TIME_KEY, stamp.replace('_', ' ').replace(/-(\d\d)-(\d\d)$/, ':$1:$2'));
      localStorage.setItem(LAST_SIZE_KEY, String(totalBytes));
      localStorage.setItem(LAST_OK_MS_KEY, String(Date.now()));
      localStorage.removeItem(FAIL_KEY);
    } catch {
      /* ignore */
    }
    return { status: 'done', folder: finalFolder, staleUnfinished: stale || undefined };
  } catch (err: any) {
    console.error('Auto backup failed:', err);
    const msg = `ব্যাকআপ হয়নি, কারণ: ${err?.message || String(err)}`;
    setFailure(msg);
    // শুধু নিজের এই চলতি অসমাপ্ত ফোল্ডার মোছা (জায়গা ফেরাতে); পুরনো কিছু ছোঁয়া হয় না
    if (unfinished) await removeFolder(unfinished);
    return { status: 'error', message: msg };
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
