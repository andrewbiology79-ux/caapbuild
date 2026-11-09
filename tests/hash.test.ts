import { describe, it, expect } from 'vitest';
import { sha256Hex, sameContent } from '../src/storage/hash';

describe('hash (ধাপ ২.২)', () => {
  it('known SHA-256 values', async () => {
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('Bengali text hashes (UTF-8) and differs when one letter differs', async () => {
    const a = await sha256Hex('প্রশ্ন ১');
    const b = await sha256Hex('প্রশ্ন ২');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
  it('sameContent needs two real, equal hashes', () => {
    expect(sameContent('aa', 'aa')).toBe(true);
    expect(sameContent('aa', 'bb')).toBe(false);
    expect(sameContent(undefined, 'aa')).toBe(false);
    expect(sameContent('aa', undefined)).toBe(false);
    expect(sameContent(undefined, undefined)).toBe(false);
    expect(sameContent('', '')).toBe(false);
  });
});
