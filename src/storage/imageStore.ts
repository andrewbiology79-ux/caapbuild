import { db, chapterDb, type QbDatabase, type DbImage } from '../db/db';
import { entityPath, mediaDirOf, imageFileName, scopeOfDb } from './folderLayout';
import { isNativeApp, readBase64 } from './nativeStore';
import { base64ToBlob } from '../utils/fileExport';

/**
 * Pictures with folder sync: the file lives in <topic folder>/media/<id>.webp.
 * A picture that was just added (not yet written into a folder) still has its blob in the database.
 */

/** Full path of the picture file, or null when it has no folder (yet) */
export async function imageFilePath(sdb: QbDatabase, rec: DbImage): Promise<string | null> {
  if (!rec.topicId) return null;
  const dir = await entityPath(sdb, scopeOfDb(sdb, chapterDb), rec.topicId);
  return dir ? `${mediaDirOf(dir)}/${imageFileName(rec.id)}` : null;
}

async function readBlobFromRecord(sdb: QbDatabase, rec: DbImage): Promise<Blob | null> {
  if (rec.blob) return rec.blob;
  if (!isNativeApp()) return null;
  const path = await imageFilePath(sdb, rec);
  if (!path) return null;
  const b64 = await readBase64(path);
  return b64 ? base64ToBlob(b64, 'image/webp') : null;
}

/** Picture data from the given database (or the other one) as a Blob */
export async function getImageBlob(imageId: string, preferred: QbDatabase = db): Promise<Blob | null> {
  const other = preferred === db ? chapterDb : db;
  for (const sdb of [preferred, other]) {
    const rec = await sdb.images.get(imageId);
    if (!rec) continue;
    const blob = await readBlobFromRecord(sdb, rec);
    if (blob) return blob;
  }
  return null;
}

/**
 * Give picture records their blob again (in memory only) so exports / PDF code that expects `img.blob` keeps working.
 * Records whose file cannot be read are returned without a blob.
 */
export async function hydrateImages(sdb: QbDatabase, imgs: DbImage[]): Promise<DbImage[]> {
  const out: DbImage[] = [];
  for (const rec of imgs) {
    if (rec.blob) {
      out.push(rec);
      continue;
    }
    const blob = await readBlobFromRecord(sdb, rec);
    out.push(blob ? { ...rec, blob } : rec);
  }
  return out;
}

/* ------------------------------------------------------------------
 * Fast, cached, throttled object URLs (so lists can show text first and
 * pictures a little later without choking the phone)
 * ---------------------------------------------------------------- */

const urlCache = new Map<string, string>();
const MAX_PARALLEL = 3;
let running = 0;
const waiting: Array<() => void> = [];

async function acquire(): Promise<void> {
  if (running < MAX_PARALLEL) {
    running++;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
}

function release(): void {
  running--;
  const next = waiting.shift();
  if (next) next();
}

export function forgetImageUrl(imageId: string): void {
  urlCache.delete(imageId);
}

/** Object URL of a picture (cached). Looks in the given database first, then in the other one. */
export async function getImageObjectUrl(imageId: string, preferred: QbDatabase = db): Promise<string | null> {
  const cached = urlCache.get(imageId);
  if (cached) return cached;
  await acquire();
  try {
    const again = urlCache.get(imageId);
    if (again) return again;
    const blob = await getImageBlob(imageId, preferred);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urlCache.set(imageId, url);
    return url;
  } catch {
    return null;
  } finally {
    release();
  }
}

/** Natural size of a picture blob (for the layout placeholder) */
export async function blobDimensions(blob: Blob): Promise<{ w: number; h: number } | null> {
  try {
    if (typeof createImageBitmap === 'function') {
      const bmp = await createImageBitmap(blob);
      const res = { w: bmp.width, h: bmp.height };
      bmp.close?.();
      return res;
    }
  } catch {
    /* fall through */
  }
  return null;
}
