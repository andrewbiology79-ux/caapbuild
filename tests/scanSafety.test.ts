import { describe, it, expect } from 'vitest';
import { isUnderUnreadable, rowPathOf, pickTopLevel, missingIds, type RowLike } from '../src/storage/scanSafety';

const rows: RowLike[] = [
  { id: 's1', kind: 'subject', dirName: 'পদার্থ' },
  { id: 'c1', kind: 'chapter', parentId: 's1', dirName: 'গতি' },
  { id: 't1', kind: 'topic', parentId: 'c1', dirName: 'টাইপ ১' },
  { id: 's2', kind: 'subject', dirName: 'রসায়ন' },
];
const byId = new Map(rows.map((r) => [r.id, r]));

describe('scanSafety (ধাপ ১.৫ ও নিশ্চিতকরণ)', () => {
  it('nothing unreadable -> nothing is skipped', () => {
    expect(isUnderUnreadable('পদার্থ/গতি', [])).toBe(false);
  });

  it('the unreadable folder and everything below it is skipped; siblings are not', () => {
    const u = ['পদার্থ/গতি'];
    expect(isUnderUnreadable('পদার্থ/গতি', u)).toBe(true);
    expect(isUnderUnreadable('পদার্থ/গতি/টাইপ ১', u)).toBe(true);
    expect(isUnderUnreadable('পদার্থ/গতিবিদ্যা', u)).toBe(false); // similar prefix, different folder
    expect(isUnderUnreadable('রসায়ন', u)).toBe(false);
  });

  it('unreadable root ("") skips everything; unknown path is treated as unsafe', () => {
    expect(isUnderUnreadable('রসায়ন', [''])).toBe(true);
    expect(isUnderUnreadable(null, ['x'])).toBe(true);
    expect(isUnderUnreadable(null, [])).toBe(false);
  });

  it('rowPathOf builds subject/chapter/type; broken chain -> null', () => {
    expect(rowPathOf(rows[2], byId)).toBe('পদার্থ/গতি/টাইপ ১');
    expect(rowPathOf(rows[0], byId)).toBe('পদার্থ');
    expect(rowPathOf({ id: 'x', kind: 'chapter', parentId: 'missing', dirName: 'ক' }, byId)).toBeNull();
  });

  it('pickTopLevel keeps only rows whose parent is not deleted too', () => {
    const top = pickTopLevel([rows[0], rows[1], rows[2], rows[3]]);
    expect(top.map((r) => r.id)).toEqual(['s1', 's2']);
    expect(pickTopLevel([rows[2]]).map((r) => r.id)).toEqual(['t1']);
  });

  it('missingIds lists old ids that are not in the new set', () => {
    expect(missingIds(['a', 'b', 'c'], new Set(['b']))).toEqual(['a', 'c']);
    expect(missingIds([], new Set(['b']))).toEqual([]);
  });
});
