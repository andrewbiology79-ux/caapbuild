/**
 * গ২ - ছবি এডিট: ঘোরানো, ক্রপ, স্ক্যান মোড (গ্রে / সাদা-কালো)।
 * গণিতের অংশগুলো (pure) আলাদা ফাংশনে - DOM ছাড়া পরীক্ষা করা যায়। canvas শুধু ফাংশনের ভেতরে ব্যবহার হয়।
 */

export type Rotation = 0 | 90 | 180 | 270;
export type ScanMode = 'off' | 'gray' | 'bw';
export type CropEdge = 'left' | 'top' | 'right' | 'bottom';
/** প্রতিটি ধার ছবির মাপের ভগ্নাংশ (০ = কাটা নেই) */
export type Crop = Record<CropEdge, number>;

export interface ImageEditParams {
  rotation: Rotation;
  crop: Crop;
  scan: ScanMode;
}

export const NO_CROP: Crop = { left: 0, top: 0, right: 0, bottom: 0 };
export const DEFAULT_EDIT: ImageEditParams = { rotation: 0, crop: NO_CROP, scan: 'off' };

/** ক্রপের পর অন্তত এতটুকু (ভগ্নাংশ) ছবি অবশিষ্ট থাকবে */
export const MIN_REMAINING = 0.1;
/** এডিটের সময় ছবির বড় দিক এর বেশি হবে না (শেষে ৮০০px-এ ছোট হয়ই) */
export const EDIT_MAX_DIM = 2000;

const OPPOSITE: Record<CropEdge, CropEdge> = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };

/** এক ধারের মান বদলাও; বিপরীত ধারের সাথে মিলে যেন ছবি ১০%-এর কম না হয় */
export function setCropEdge(crop: Crop, edge: CropEdge, value: number): Crop {
  const v = Number.isFinite(value) ? value : 0;
  const max = 1 - MIN_REMAINING - crop[OPPOSITE[edge]];
  return { ...crop, [edge]: Math.min(Math.max(0, v), Math.max(0, max)) };
}

export function isCropped(crop: Crop): boolean {
  return crop.left > 0 || crop.top > 0 || crop.right > 0 || crop.bottom > 0;
}

export function isEdited(p: ImageEditParams): boolean {
  return p.rotation !== 0 || p.scan !== 'off' || isCropped(p.crop);
}

/** ঘোরানোর পর ছবির মাপ */
export function rotatedSize(w: number, h: number, rotation: Rotation): { w: number; h: number } {
  return rotation === 90 || rotation === 270 ? { w: h, h: w } : { w, h };
}

/** ক্রপের এলাকা পিক্সেলে (ঘোরানো ছবির ওপর) */
export function cropRect(w: number, h: number, crop: Crop): { x: number; y: number; w: number; h: number } {
  const x = Math.round(crop.left * w);
  const y = Math.round(crop.top * h);
  const cw = Math.max(1, Math.round(w - (crop.left + crop.right) * w));
  const ch = Math.max(1, Math.round(h - (crop.top + crop.bottom) * h));
  return { x, y, w: Math.min(cw, w - x), h: Math.min(ch, h - y) };
}

/** বড় ছবি EDIT_MAX_DIM-এর মধ্যে ছোট করার মাপ (ছোট ছবি বড় হয় না) */
export function fitSize(w: number, h: number, maxDim = EDIT_MAX_DIM): { w: number; h: number } {
  const big = Math.max(w, h);
  if (big <= maxDim) return { w, h };
  const s = maxDim / big;
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/** Otsu পদ্ধতি: আলো-অন্ধকারের মাঝের সবচেয়ে ভালো কাট-অফ (০-২৫৫) */
export function otsuThreshold(hist: ArrayLike<number>): number {
  let total = 0;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) {
    total += hist[i];
    sumAll += i * hist[i];
  }
  if (total === 0) return 128;
  let wB = 0;
  let sumB = 0;
  let best = 0;
  let bestVar = -1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > bestVar) {
      bestVar = between;
      best = t;
    }
  }
  return best;
}

/** RGBA ডেটা সরাসরি বদলায়: 'gray' = সাদা-কালো ছাপ + কনট্রাস্ট বাড়ানো; 'bw' = খাঁটি সাদা/কালো */
export function applyScanToRGBA(data: Uint8ClampedArray | number[], mode: ScanMode): void {
  if (mode === 'off') return;
  const n = Math.floor(data.length / 4);
  const lum = new Uint8Array(n);
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < n; i++) {
    const l = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
    lum[i] = l;
    hist[l]++;
  }

  if (mode === 'bw') {
    const t = otsuThreshold(hist);
    for (let i = 0; i < n; i++) {
      const v = lum[i] > t ? 255 : 0;
      data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    }
    return;
  }

  // gray: ২%-৯৮% সীমা টেনে ০-২৫৫ বানানো (কাগজ সাদা, লেখা গাঢ়)
  const cut = Math.max(1, Math.floor(n * 0.02));
  let acc = 0;
  let lo = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= cut) {
      lo = i;
      break;
    }
  }
  acc = 0;
  let hi = 255;
  for (let i = 255; i >= 0; i--) {
    acc += hist[i];
    if (acc >= cut) {
      hi = i;
      break;
    }
  }
  if (hi - lo < 10) {
    lo = 0;
    hi = 255;
  }
  const scale = 255 / (hi - lo);
  for (let i = 0; i < n; i++) {
    const v = Math.min(255, Math.max(0, Math.round((lum[i] - lo) * scale)));
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
  }
}

// ---------------- canvas অংশ (শুধু ব্রাউজার/ফোনে) ----------------

/** ছবি ঘুরিয়ে (এবং দরকারে ছোট করে) নতুন canvas-এ আঁকে; স্ক্যান এখনো দেয় না */
export function drawRotated(img: CanvasImageSource & { width: number; height: number }, rotation: Rotation, maxDim = EDIT_MAX_DIM): HTMLCanvasElement {
  const fit = fitSize(img.width, img.height, maxDim);
  const out = rotatedSize(fit.w, fit.h, rotation);
  const canvas = document.createElement('canvas');
  canvas.width = out.w;
  canvas.height = out.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas 2d context');
  ctx.translate(out.w / 2, out.h / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(img, -fit.w / 2, -fit.h / 2, fit.w, fit.h);
  return canvas;
}

export function applyScanToCanvas(canvas: HTMLCanvasElement, mode: ScanMode): void {
  if (mode === 'off') return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  applyScanToRGBA(data.data, mode);
  ctx.putImageData(data, 0, 0);
}

/** চূড়ান্ত ছবি: ঘোরানো ছবি থেকে ক্রপ কেটে, তারপর স্ক্যান (স্ক্যানের হিসাব শুধু কাটা অংশের ওপর) */
export function buildEditedCanvas(rotated: HTMLCanvasElement, params: ImageEditParams): HTMLCanvasElement {
  const r = cropRect(rotated.width, rotated.height, params.crop);
  const out = document.createElement('canvas');
  out.width = r.w;
  out.height = r.h;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas 2d context');
  ctx.drawImage(rotated, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  applyScanToCanvas(out, params.scan);
  return out;
}

export function canvasToFile(canvas: HTMLCanvasElement, originalName: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to encode edited image'));
        return;
      }
      const base = originalName.replace(/\.[^/.]+$/, '') || 'image';
      resolve(new File([blob], `${base}.png`, { type: 'image/png' }));
    }, 'image/png');
  });
}

// ---------------- সেটিং: ছবি যোগের সময় এডিটর খুলবে কি না ----------------

const EDITOR_KEY = 'qb_image_editor';

export function isImageEditorEnabled(): boolean {
  try {
    return localStorage.getItem(EDITOR_KEY) !== '0'; // ডিফল্ট চালু
  } catch {
    return true;
  }
}

export function setImageEditorEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(EDITOR_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}
