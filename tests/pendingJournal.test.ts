import { describe, it, expect } from 'vitest';
import {
  emptyJournalScope,
  journalIsEmpty,
  serializeJournal,
  parseJournal,
  canRedoTopicWrite,
  type PendingJournal,
} from '../src/storage/pendingJournal';

const mk = (): PendingJournal => ({ v: 1, type: emptyJournalScope(), chapter: emptyJournalScope() });

describe('pendingJournal (ধাপ ২.৬)', () => {
  it('empty list is not saved at all', () => {
    expect(journalIsEmpty(mk())).toBe(true);
    expect(serializeJournal(mk())).toBeNull();
  });

  it('round trip keeps everything', () => {
    const j = mk();
    j.type.topics = ['t1', 't2'];
    j.type.entities = [['s1', 'subject'], ['c1', 'chapter']];
    j.chapter.deletes = ['x'];
    j.chapter.imageDeletes = [{ id: 'img1', topicId: 't9' }, { id: 'img2' }];
    const back = parseJournal(serializeJournal(j));
    expect(back).toEqual({
      v: 1,
      type: { entities: [['s1', 'subject'], ['c1', 'chapter']], deletes: [], topics: ['t1', 't2'], imageDeletes: [] },
      chapter: { entities: [], deletes: ['x'], topics: [], imageDeletes: [{ id: 'img1', topicId: 't9' }, { id: 'img2', topicId: undefined }] },
    });
  });

  it('broken / foreign text gives null and never throws', () => {
    expect(parseJournal(null)).toBeNull();
    expect(parseJournal('')).toBeNull();
    expect(parseJournal('{not json')).toBeNull();
    expect(parseJournal('{"v":2,"type":{"topics":["a"]}}')).toBeNull();
    expect(parseJournal('[1,2,3]')).toBeNull();
  });

  it('bad entries are dropped, good ones kept', () => {
    const text = JSON.stringify({
      v: 1,
      type: { topics: ['ok', 5, null], entities: [['a', 'topic'], ['b', 'weird'], 'x'], deletes: ['d', 7], imageDeletes: [{ id: 'i' }, { nope: 1 }] },
    });
    const j = parseJournal(text)!;
    expect(j.type.topics).toEqual(['ok']);
    expect(j.type.entities).toEqual([['a', 'topic']]);
    expect(j.type.deletes).toEqual(['d']);
    expect(j.type.imageDeletes.map((d) => d.id)).toEqual(['i']);
    expect(j.chapter).toEqual(emptyJournalScope());
  });

  it('a list that only has junk becomes null', () => {
    expect(parseJournal(JSON.stringify({ v: 1, type: { topics: [1, 2] } }))).toBeNull();
  });

  describe('canRedoTopicWrite', () => {
    it('file unchanged since the last sync -> write again', () => {
      expect(canRedoTopicWrite({ mtime: 10, size: 100 }, { mtime: 10, size: 100 })).toBe('redo');
    });
    it('file changed outside the app -> do not overwrite it', () => {
      expect(canRedoTopicWrite({ mtime: 10, size: 100 }, { mtime: 99, size: 100 })).toBe('file-changed');
      expect(canRedoTopicWrite({ mtime: 10, size: 100 }, { mtime: 10, size: 120 })).toBe('file-changed');
    });
    it('file missing or nothing remembered -> writing it is the repair', () => {
      expect(canRedoTopicWrite({ mtime: 10, size: 100 }, null)).toBe('redo');
      expect(canRedoTopicWrite(undefined, { mtime: 1, size: 1 })).toBe('redo');
    });
  });
});
