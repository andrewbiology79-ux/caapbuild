import { describe, it, expect } from 'vitest';
import {
  NO_CROP,
  DEFAULT_EDIT,
  setCropEdge,
  isCropped,
  isEdited,
  rotatedSize,
  cropRect,
  fitSize,
  otsuThreshold,
  applyScanToRGBA,
} from '../src/utils/imageEdit';

/** দুই রঙের RGBA ডেটা: প্রথম অর্ধেক লেখা (গাঢ়), বাকি কাগজ (হালকা) */
function page(dark: number, light: number, n = 1000, darkShare = 0.2): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = i < n * darkShare ? dark : light;
    out.push(v, v, v, 255);
  }
  return out;
}

describe('imageEdit - ক্রপ', () => {
  it('setCropEdge ০-এর নিচে ও সীমার ওপরে যায় না', () => {
    expect(setCropEdge(NO_CROP, 'left', -0.5).left).toBe(0);
    expect(setCropEdge(NO_CROP, 'left', 5).left).toBeCloseTo(0.9, 5);
  });

  it('বিপরীত ধারের সাথে মিলে ছবি ১০%-এর কম থাকতে দেয় না', () => {
    const c = setCropEdge({ ...NO_CROP, right: 0.5 }, 'left', 0.9);
    expect(c.left).toBeCloseTo(0.4, 5);
    expect(c.left + c.right).toBeCloseTo(0.9, 5);
  });

  it('অবৈধ (NaN) মান ০ ধরে', () => {
    expect(setCropEdge(NO_CROP, 'top', NaN).top).toBe(0);
  });

  it('cropRect পিক্সেল এলাকা ঠিক বের করে', () => {
    expect(cropRect(200, 100, { left: 0.1, right: 0.2, top: 0.5, bottom: 0 })).toEqual({ x: 20, y: 50, w: 140, h: 50 });
    expect(cropRect(200, 100, NO_CROP)).toEqual({ x: 0, y: 0, w: 200, h: 100 });
  });

  it('cropRect কখনো ছবির বাইরে বা ০ মাপ দেয় না', () => {
    const r = cropRect(10, 10, { left: 0.9, right: 0.9, top: 0, bottom: 0 });
    expect(r.w).toBeGreaterThan(0);
    expect(r.x + r.w <= 10).toBe(true);
  });

  it('isCropped / isEdited', () => {
    expect(isCropped(NO_CROP)).toBe(false);
    expect(isEdited(DEFAULT_EDIT)).toBe(false);
    expect(isEdited({ ...DEFAULT_EDIT, rotation: 90 })).toBe(true);
    expect(isEdited({ ...DEFAULT_EDIT, scan: 'bw' })).toBe(true);
    expect(isEdited({ ...DEFAULT_EDIT, crop: { ...NO_CROP, left: 0.1 } })).toBe(true);
  });
});

describe('imageEdit - মাপ', () => {
  it('৯০/২৭০ ডিগ্রিতে প্রস্থ-উচ্চতা অদলবদল', () => {
    expect(rotatedSize(300, 100, 90)).toEqual({ w: 100, h: 300 });
    expect(rotatedSize(300, 100, 270)).toEqual({ w: 100, h: 300 });
    expect(rotatedSize(300, 100, 180)).toEqual({ w: 300, h: 100 });
    expect(rotatedSize(300, 100, 0)).toEqual({ w: 300, h: 100 });
  });

  it('fitSize বড় ছবি ছোট করে (অনুপাত ঠিক), ছোট ছবি বদলায় না', () => {
    expect(fitSize(4000, 2000, 2000)).toEqual({ w: 2000, h: 1000 });
    expect(fitSize(1000, 500, 2000)).toEqual({ w: 1000, h: 500 });
  });
});

describe('imageEdit - স্ক্যান', () => {
  it('otsuThreshold দুই গুচ্ছের মাঝখানে পড়ে', () => {
    const hist = new Array(256).fill(0);
    hist[40] = 200;
    hist[220] = 800;
    const t = otsuThreshold(hist);
    expect(t >= 40 && t < 220).toBe(true);
  });

  it('otsuThreshold ফাঁকা হিস্টোগ্রামে ক্র্যাশ করে না', () => {
    expect(otsuThreshold(new Array(256).fill(0))).toBe(128);
  });

  it('সাদা-কালো মোডে সব পিক্সেল ঠিক ০ বা ২৫৫; লেখা কালো, কাগজ সাদা', () => {
    const d = page(60, 200);
    applyScanToRGBA(d, 'bw');
    for (let i = 0; i < d.length; i += 4) {
      expect(d[i] === 0 || d[i] === 255).toBe(true);
      expect(d[i]).toBe(d[i + 1]);
      expect(d[i + 3]).toBe(255);
    }
    expect(d[0]).toBe(0);
    expect(d[d.length - 4]).toBe(255);
  });

  it('গ্রে মোডে কনট্রাস্ট বাড়ে: কাগজ প্রায় সাদা, লেখা প্রায় কালো, আলফা অপরিবর্তিত', () => {
    const d = page(90, 170);
    applyScanToRGBA(d, 'gray');
    expect(d[0]).toBeLessThanOrEqual(10);
    expect(d[d.length - 4]).toBeGreaterThan(245);
    expect(d[3]).toBe(255);
  });

  it('একরঙা ছবিতে (কোনো কনট্রাস্ট নেই) গ্রে মোড ছবি নষ্ট করে না', () => {
    const d = page(128, 128);
    applyScanToRGBA(d, 'gray');
    expect(d[0]).toBe(128);
  });

  it('off মোডে কিছু বদলায় না', () => {
    const d = page(10, 240);
    const copy = d.slice();
    applyScanToRGBA(d, 'off');
    expect(d).toEqual(copy);
  });
});
