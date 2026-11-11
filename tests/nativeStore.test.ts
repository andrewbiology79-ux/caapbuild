import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rmdirMock, statMock } = vi.hoisted(() => ({
  rmdirMock: vi.fn(),
  statMock: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { rmdir: rmdirMock, stat: statMock },
  Directory: { ExternalStorage: 'EXTERNAL' },
  Encoding: { UTF8: 'utf8' },
}));

import { removeDir } from '../src/storage/nativeStore';

describe('nativeStore.removeDir', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ফোল্ডার আগে থেকেই না থাকলে deletion সফল ধরে', async () => {
    rmdirMock.mockRejectedValueOnce(new Error('does not exist'));
    statMock.mockRejectedValueOnce(new Error('not found'));

    await expect(removeDir('Category/Old')).resolves.toBeUndefined();
  });

  it('rmdir ব্যর্থ এবং ফোল্ডার থেকে গেলে error ছোঁড়ে', async () => {
    rmdirMock.mockRejectedValueOnce(new Error('permission denied'));
    statMock.mockResolvedValueOnce({ type: 'directory', size: 0, mtime: 0 });

    await expect(removeDir('Category/Old')).rejects.toThrow('permission denied');
  });

  it('rmdir সফল বললেও ফোল্ডার থেকে গেলে error ছোঁড়ে', async () => {
    rmdirMock.mockResolvedValueOnce(undefined);
    statMock.mockResolvedValueOnce({ type: 'directory', size: 0, mtime: 0 });

    await expect(removeDir('Category/Old')).rejects.toThrow('ফোল্ডার মুছতে ব্যর্থ');
  });

  it('rmdir সফল এবং ফোল্ডার না থাকলে সফল হয়', async () => {
    rmdirMock.mockResolvedValueOnce(undefined);
    statMock.mockRejectedValueOnce(new Error('File does not exist'));

    await expect(removeDir('Category/Old')).resolves.toBeUndefined();
  });

  it('rmdir ব্যর্থ এবং stat permission error দিলে সেটিও ছুঁড়ে দেয়', async () => {
    rmdirMock.mockRejectedValueOnce(new Error('permission denied'));
    statMock.mockRejectedValueOnce(new Error('EACCES: permission denied'));

    await expect(removeDir('Category/Old')).rejects.toThrow('EACCES');
  });

  it('rmdir সফল হলেও stat permission error হলে সফল ধরে না', async () => {
    rmdirMock.mockResolvedValueOnce(undefined);
    statMock.mockRejectedValueOnce(new Error('EACCES: permission denied'));

    await expect(removeDir('Category/Old')).rejects.toThrow('EACCES');
  });
});
