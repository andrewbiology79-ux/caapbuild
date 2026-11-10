import { describe, it, expect } from 'vitest';
import {
  CATEGORY_ROOT,
  categoryDirNameFor,
  categoryMetaToText,
  emptyCategorySyncState,
  isPaperFileName,
  isUncategorizedName,
  normalizeCategorySyncState,
  paperFileBase,
  paperFileNameFor,
  paperToText,
  parseCategoryMeta,
  parsePaperFile,
  samePaperContent,
  type ParsedPaper,
} from '../src/storage/categoryLayout';

const paper = (over: Partial<ParsedPaper> = {}): ParsedPaper => ({
  id: 'p1',
  shortName: 'উইকলি মডেল টেস্ট-১',
  createdAt: 1000,
  title: 'পদার্থবিজ্ঞান',
  questionIds: ['q1', 'q2'],
  ...over,
});

describe('categoryLayout - পথ ও নাম', () => {
  it('Category ফোল্ডার QB Collection-এর সরাসরি ভেতরে', () => {
    expect(CATEGORY_ROOT).toBe('Download/QB Collection/Category');
  });

  it('প্রশ্নপত্রের ফাইল চেনে (সিস্টেম/.tmp/.bak/অন্য ধরন নয়)', () => {
    expect(isPaperFileName('উইকলি-১.json')).toBe(true);
    expect(isPaperFileName('A.JSON')).toBe(true);
    expect(isPaperFileName('.folder.json')).toBe(false);
    expect(isPaperFileName('x.json.tmp')).toBe(false);
    expect(isPaperFileName('x.json.bak')).toBe(false);
    expect(isPaperFileName('x.txt')).toBe(false);
  });

  it('paperFileBase "(২)" ও .json সরায়', () => {
    expect(paperFileBase('নাম (2).json')).toBe('নাম');
    expect(paperFileBase('নাম.json')).toBe('নাম');
  });

  it('paperFileNameFor ব্যবহৃত নাম এড়ায় (বড়-ছোট হাত নির্বিশেষে)', () => {
    expect(paperFileNameFor('টেস্ট-১', new Set())).toBe('টেস্ট-১.json');
    expect(paperFileNameFor('Test', new Set(['test.json']))).toBe('Test (2).json');
    expect(paperFileNameFor('A', new Set(['a.json', 'a (2).json']))).toBe('A (3).json');
  });

  it('প্রশ্নপত্রের নামে নিষিদ্ধ চিহ্ন বদলায়, বাংলা লম্বা নাম ২০৫ বাইটের মধ্যে', () => {
    expect(paperFileNameFor('ক/খ:গ', new Set())).toBe('ক-খ-গ.json');
    const long = paperFileNameFor('অ'.repeat(200), new Set());
    expect(new TextEncoder().encode(long).length).toBeLessThanOrEqual(205);
  });

  it('categoryDirNameFor "unnecessary" নাম নেয় না, ব্যবহৃত নাম এড়ায়', () => {
    expect(categoryDirNameFor('উইকলি', new Set())).toBe('উইকলি');
    expect(categoryDirNameFor('উইকলি', new Set(['উইকলি']))).toBe('উইকলি (2)');
    expect(categoryDirNameFor('unnecessary', new Set())).toBe('unnecessary (2)');
  });

  it('অশ্রেণিবদ্ধ নাম চেনে', () => {
    expect(isUncategorizedName('অশ্রেণিবদ্ধ')).toBe(true);
    expect(isUncategorizedName(' অশ্রেণিবদ্ধ ')).toBe(true);
    expect(isUncategorizedName('অন্য')).toBe(false);
  });
});

describe('categoryLayout - .folder.json', () => {
  it('লেখা ও পড়া মেলে', () => {
    const text = categoryMetaToText({ id: 'c1', name: 'উইকলি', order: 2 });
    expect(parseCategoryMeta(text)).toEqual({ id: 'c1', kind: 'category', name: 'উইকলি', order: 2 });
  });

  it('ভুল/অন্য ধরনের মেটা null', () => {
    expect(parseCategoryMeta(undefined)).toBeNull();
    expect(parseCategoryMeta('না-JSON')).toBeNull();
    expect(parseCategoryMeta(JSON.stringify({ id: 'x', kind: 'subject' }))).toBeNull();
    expect(parseCategoryMeta(JSON.stringify({ kind: 'category' }))).toBeNull();
  });
});

describe('categoryLayout - প্রশ্নপত্রের ফাইল', () => {
  it('লিখে আবার পড়লে একই প্রশ্নপত্র', () => {
    const p = paper({ subjectLine: 'সৃজনশীল', note: '', duration: '২ ঘণ্টা', totalMarks: 70, order: 3 });
    const r = parsePaperFile(paperToText(p));
    expect(r.ok).toBe(true);
    if (r.ok) expect(samePaperContent(r.paper, p)).toBe(true);
  });

  it('খালি edits ফাইলে যায় না, থাকলে ফিরে আসে', () => {
    const empty = JSON.parse(paperToText(paper({ edits: { questions: {}, stimuli: {} } })));
    expect(empty.edits).toBeUndefined();
    const edits = { questions: { q1: { questionText: 'নতুন', marks: 3 } } };
    const r = parsePaperFile(paperToText(paper({ edits })));
    expect(r.ok && r.paper.edits).toEqual(edits);
  });

  it('ক্যাটেগরির তথ্য ফাইলে থাকে না', () => {
    const data = JSON.parse(paperToText({ ...paper(), category: 'X', categoryId: 'c1' } as any));
    expect(data.category).toBeUndefined();
    expect(data.categoryId).toBeUndefined();
    expect(data.type).toBe('qb-paper');
  });

  it('ভুল ফাইলে কারণ সহ ok:false', () => {
    const bad = (t: any) => {
      const r = parsePaperFile(t);
      return r.ok ? '' : r.reason;
    };
    expect(bad('')).toContain('খালি');
    expect(bad('{ভাঙা')).toContain('JSON');
    expect(bad('[]')).toContain('নয়');
    expect(bad(JSON.stringify({ type: 'other', id: 'a' }))).toContain('নয়');
    expect(bad(JSON.stringify({ id: '' }))).toContain('id');
    expect(bad(JSON.stringify({ id: 'a', version: 99 }))).toContain('নতুন');
    expect(bad(JSON.stringify({ id: 'a', questionIds: 'q1' }))).toContain('questionIds');
  });

  it('হাতে লেখা ছোট ফাইল: নাম না থাকলে শিরোনাম, createdAt না থাকলে ফাইলের সময়', () => {
    const r = parsePaperFile(JSON.stringify({ id: 'a', title: 'মডেল টেস্ট' }), 555);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.paper.shortName).toBe('মডেল টেস্ট');
      expect(r.paper.createdAt).toBe(555);
      expect(r.paper.questionIds).toEqual([]);
    }
  });

  it('samePaperContent: ঘরের ক্রম গুরুত্বহীন, প্রশ্ন বদলালে আলাদা', () => {
    const a = paper();
    const b = JSON.parse(JSON.stringify({ questionIds: a.questionIds, title: a.title, createdAt: a.createdAt, shortName: a.shortName, id: a.id }));
    expect(samePaperContent(a, b)).toBe(true);
    expect(samePaperContent(a, paper({ questionIds: ['q2', 'q1'] }))).toBe(false);
  });
});

describe('categoryLayout - সিঙ্কের স্মৃতি', () => {
  it('ভাঙা মান খালি অবস্থা দেয়', () => {
    expect(normalizeCategorySyncState(null)).toEqual(emptyCategorySyncState());
    expect(normalizeCategorySyncState({ categories: { a: {} }, papers: { p: { categoryId: 1 } } })).toEqual(emptyCategorySyncState());
  });

  it('ঠিক সারি রাখে', () => {
    const s = normalizeCategorySyncState({
      categories: { c1: { dirName: 'উইকলি' } },
      papers: { p1: { categoryId: 'c1', fileName: 'x.json', mtime: 5, size: 9 } },
    });
    expect(s.categories.c1.dirName).toBe('উইকলি');
    expect(s.papers.p1).toEqual({ categoryId: 'c1', fileName: 'x.json', mtime: 5, size: 9 });
  });
});
