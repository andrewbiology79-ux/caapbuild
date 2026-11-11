import { describe, it, expect } from 'vitest';
import { extraMoveProblem, moveCategoryExtras, planCategoryExtraMoves, type ExtraMoveFs } from '../src/storage/categoryExtrasMove';
import { CATEGORY_ROOT } from '../src/storage/categoryLayout';

function fakeFs(initial: string[]) {
  const files = new Set(initial);
  const log: string[] = [];
  const fs: ExtraMoveFs = {
    pathExists: async (p) => files.has(p),
    makeDir: async (p) => void log.push(`mkdir:${p}`),
    renamePath: async (a, b) => {
      if (!files.has(a)) throw new Error('নেই');
      files.delete(a);
      files.add(b);
      log.push(`mv:${a}->${b}`);
    },
    writeText: async (p) => {
      files.add(p);
      log.push(`write:${p}`);
    },
  };
  return { fs, files, log };
}

const R = CATEGORY_ROOT;
const ex = (owner: string, name: string) => ({
  path: owner ? [owner, name] : [name],
  sourcePath: owner ? `${owner}/${name}` : name,
  moveTo: [R, owner, 'unnecessary', name].filter(Boolean).join('/'),
});

describe('planCategoryExtraMoves', () => {
  it('ওপরের ফোল্ডার আগে; ভেতরেরটা সঙ্গে যায়', () => {
    const p = planCategoryExtraMoves([{ sourcePath: 'a/x/y.txt' }, { sourcePath: 'a/x' }, { sourcePath: 'b' }]);
    expect(p.order).toEqual([2, 1]);
    expect(p.covered.get(0)).toBe(1);
  });
  it('একই নামের আগে-পরে (a, ab) গুলিয়ে যায় না', () => {
    const p = planCategoryExtraMoves([{ sourcePath: 'a' }, { sourcePath: 'ab' }]);
    expect(p.order).toEqual([0, 1]);
    expect(p.covered.size).toBe(0);
  });
});

describe('extraMoveProblem', () => {
  it('ঠিক পথে সমস্যা নেই', () => {
    expect(extraMoveProblem(ex('পদার্থ', 'x.txt'))).toBeNull();
    expect(extraMoveProblem(ex('', 'বাড়তি'))).toBeNull();
  });
  it('.. থাকলে, ফাঁকা হলে, unnecessary/-র ভেতরের হলে, গন্তব্য বাইরে হলে বা unnecessary নয় হলে আটকায়', () => {
    expect(extraMoveProblem({ sourcePath: '../x', moveTo: `${R}/unnecessary/x` })).toBeTruthy();
    expect(extraMoveProblem({ sourcePath: '', moveTo: `${R}/unnecessary/x` })).toBeTruthy();
    expect(extraMoveProblem({ sourcePath: 'a/unnecessary/x', moveTo: `${R}/a/unnecessary/x` })).toBeTruthy();
    expect(extraMoveProblem({ sourcePath: 'a/x', moveTo: '/other/unnecessary/x' })).toBeTruthy();
    expect(extraMoveProblem({ sourcePath: 'a/x', moveTo: `${R}/a/x` })).toBeTruthy();
    expect(extraMoveProblem({ sourcePath: 'a/x', moveTo: `${R}/a/../unnecessary/x` })).toBeTruthy();
  });
});

describe('moveCategoryExtras', () => {
  it('unnecessary/-তে সরায় ও .nomedia বসায়; মোছে না', async () => {
    const e = ex('পদার্থ', 'media-old.webp');
    const { fs, files } = fakeFs([`${R}/${e.sourcePath}`]);
    const r = await moveCategoryExtras([e], fs);
    expect(r.moved).toEqual([true]);
    expect(r.failures).toHaveLength(0);
    expect(files.has(`${R}/${e.sourcePath}`)).toBe(false);
    expect(files.has(e.moveTo)).toBe(true);
    expect(files.has(`${R}/পদার্থ/unnecessary/.nomedia`)).toBe(true);
  });

  it('গন্তব্যে একই নাম থাকলে "নাম (2)"', async () => {
    const e = ex('পদার্থ', 'a.png');
    const { fs, files } = fakeFs([`${R}/${e.sourcePath}`, e.moveTo]);
    const r = await moveCategoryExtras([e], fs);
    expect(r.moved).toEqual([true]);
    expect(files.has(`${R}/পদার্থ/unnecessary/a (2).png`)).toBe(true);
    expect(files.has(e.moveTo)).toBe(true);
  });

  it('উৎস না থাকলে ওই আইটেম ব্যর্থ, বাকিরা চলে', async () => {
    const a = ex('পদার্থ', 'gone.txt');
    const b = ex('রসায়ন', 'ok.txt');
    const { fs, files } = fakeFs([`${R}/${b.sourcePath}`]);
    const r = await moveCategoryExtras([a, b], fs);
    expect(r.moved).toEqual([false, true]);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0].index).toBe(0);
    expect(files.has(b.moveTo)).toBe(true);
  });

  it('অনিরাপদ পথ কিছুই সরায় না', async () => {
    const bad = { path: ['x'], sourcePath: '../x', moveTo: `${R}/unnecessary/x` };
    const { fs, log } = fakeFs([]);
    const r = await moveCategoryExtras([bad], fs);
    expect(r.moved).toEqual([false]);
    expect(r.failures).toHaveLength(1);
    expect(log).toHaveLength(0);
  });

  it('ফোল্ডারের ভেতরের জিনিস ফোল্ডারের সঙ্গে গেছে ধরা হয়, আলাদা সরানো হয় না', async () => {
    const dir = ex('', 'বাড়তি-ফোল্ডার');
    const inner = { path: ['বাড়তি-ফোল্ডার', 'f.txt'], sourcePath: 'বাড়তি-ফোল্ডার/f.txt', moveTo: `${R}/বাড়তি-ফোল্ডার/unnecessary/f.txt` };
    const { fs, log } = fakeFs([`${R}/${dir.sourcePath}`]);
    const r = await moveCategoryExtras([inner, dir], fs);
    expect(r.moved).toEqual([true, true]);
    expect(log.filter((l) => l.startsWith('mv:'))).toHaveLength(1);
  });

  it('ফাঁকা তালিকায় কিছুই হয় না; onUnit প্রতিটির জন্য একবার', async () => {
    const { fs } = fakeFs([]);
    expect((await moveCategoryExtras([], fs)).moved).toEqual([]);
    const e = ex('পদার্থ', 'a.txt');
    const f = fakeFs([`${R}/${e.sourcePath}`]);
    const labels: string[] = [];
    await moveCategoryExtras([e], f.fs, (l) => labels.push(l));
    expect(labels).toEqual(['পদার্থ › a.txt']);
  });
});
