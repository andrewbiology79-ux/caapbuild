import { describe, it, expect } from 'vitest';
import {
  sanitizeFolderName,
  baseOfDirName,
  pickDirName,
  imageFileName,
  imageIdFromFileName,
  kindOfDepth,
} from '../src/storage/folderLayout';

describe('folderLayout', () => {
  it('ফোল্ডারের নামে নিষিদ্ধ চিহ্ন বদলায়', () => {
    expect(sanitizeFolderName('ক/খ:গ')).toBe('ক-খ-গ');
  });

  it('শুরুর ডট ও শেষের ডট/স্পেস বাদ, ফাঁকা হলে "নামহীন"', () => {
    expect(sanitizeFolderName('..লুকানো')).toBe('লুকানো');
    expect(sanitizeFolderName('নাম. ')).toBe('নাম');
    expect(sanitizeFolderName('   ')).toBe('নামহীন');
  });

  it('বাংলা লম্বা নাম ২০০ বাইটের মধ্যে কাটে', () => {
    const out = sanitizeFolderName('অ'.repeat(200));
    expect(new TextEncoder().encode(out).length).toBeLessThanOrEqual(200);
  });

  it('baseOfDirName "(২)" সংখ্যা সরায়', () => {
    expect(baseOfDirName('পদার্থ (2)')).toBe('পদার্থ');
    expect(baseOfDirName('পদার্থ')).toBe('পদার্থ');
  });

  it('pickDirName ব্যবহৃত নাম এড়ায় (বড়-ছোট হাত নির্বিশেষে)', async () => {
    expect(await pickDirName('Physics', new Set())).toBe('Physics');
    expect(await pickDirName('Physics', new Set(['physics']))).toBe('Physics (2)');
    expect(await pickDirName('A', new Set(['A', 'A (2)']))).toBe('A (3)');
  });

  it('pickDirName ডিস্কে থাকা নামও এড়ায়', async () => {
    const onDisk = new Set(['B']);
    expect(await pickDirName('B', new Set(), async (c) => onDisk.has(c))).toBe('B (2)');
  });

  it('ছবির ফাইলের নাম <-> id', () => {
    expect(imageFileName('abc')).toBe('abc.webp');
    expect(imageIdFromFileName('abc.webp')).toBe('abc');
    expect(imageIdFromFileName('x.y.JPG')).toBe('x.y');
    expect(imageIdFromFileName('data.json')).toBeNull();
  });

  it('kindOfDepth: Chapter CQ-তে টপিক স্তর নেই', () => {
    expect(kindOfDepth('type', 3)).toBe('topic');
    expect(kindOfDepth('chapter', 3)).toBeNull();
    expect(kindOfDepth('type', 1)).toBe('subject');
  });
});

import { uniqueAppName } from '../src/storage/folderLayout';

describe('uniqueAppName (একই নাম হলে নামের পরে (2))', () => {
  it('ফাঁকা থাকলে নাম বদলায় না', () => {
    expect(uniqueAppName('ক', ['খ', 'গ'])).toBe('ক');
  });
  it('একই নাম থাকলে (2), তারপর (3)', () => {
    expect(uniqueAppName('ক', ['ক'])).toBe('ক (2)');
    expect(uniqueAppName('ক', ['ক', 'ক (2)'])).toBe('ক (3)');
  });
  it('ছোট/বড় হাতের তফাত ধরা হয় না', () => {
    expect(uniqueAppName('Force', ['force'])).toBe('Force (2)');
  });
});
