import { describe, it, expect } from 'vitest';
import { fileLooksChanged, decideDataWrite, conflictFileName, conflictStamp } from '../src/storage/conflict';

const row = { mtime: 1000, size: 50, sha256: 'aaa' };

describe('conflict (ধাপ ১.২)', () => {
  it('file same as last write -> not changed, write is safe', () => {
    expect(fileLooksChanged(row, { mtime: 1000, size: 50 })).toBe(false);
    expect(decideDataWrite(row, { mtime: 1000, size: 50 }, undefined, 'bbb')).toBe('write');
  });

  it('no baseline (no row) or no file -> write (it is the repair)', () => {
    expect(decideDataWrite(undefined, { mtime: 5, size: 5 }, 'x', 'y')).toBe('write');
    expect(decideDataWrite(row, null, undefined, 'y')).toBe('write');
    expect(decideDataWrite({ mtime: 0, size: 0 }, { mtime: 5, size: 5 }, 'x', 'y')).toBe('write');
  });

  it('only touched (new mtime, same text as our last copy) -> write', () => {
    expect(decideDataWrite(row, { mtime: 2000, size: 50 }, 'aaa', 'bbb')).toBe('write');
  });

  it('file already holds exactly what we are about to write -> write', () => {
    expect(decideDataWrite(row, { mtime: 2000, size: 60 }, 'bbb', 'bbb')).toBe('write');
  });

  it('file really changed outside and differs from our new text -> conflict', () => {
    expect(decideDataWrite(row, { mtime: 2000, size: 60 }, 'ccc', 'bbb')).toBe('conflict');
  });

  it('cannot read / hash the file -> conflict (a spare copy is better than a loss)', () => {
    expect(decideDataWrite(row, { mtime: 2000, size: 60 }, undefined, 'bbb')).toBe('conflict');
    expect(decideDataWrite({ mtime: 1000, size: 50 }, { mtime: 2000, size: 60 }, 'ccc', undefined)).toBe('conflict');
  });

  it('conflict file name: stamp + safe name, never too long', () => {
    const stamp = conflictStamp(new Date('2026-11-09T10:20:30.123Z'));
    expect(stamp).toBe('2026-11-09T10-20-30-123Z');
    expect(conflictFileName(stamp, 'পদার্থ/অধ্যায়: ১?')).toBe('2026-11-09T10-20-30-123Z_পদার্থ-অধ্যায়- ১-.json');
    expect(conflictFileName(stamp, '')).toBe('2026-11-09T10-20-30-123Z_নামহীন.json');
    const long = conflictFileName(stamp, 'ক'.repeat(300));
    expect(new TextEncoder().encode(long).length).toBeLessThan(200);
    expect(long.endsWith('.json')).toBe(true);
  });
});
