import { describe, it, expect } from 'vitest';
import {
  EMPTY_CRITERIA,
  applyFilters,
  countActiveFilters,
  groupRows,
  computeScopedFacets,
  rowBoards,
  rowRating,
  type FilterRow,
  type FilterCriteria,
} from '../src/utils/filterEngine';

let seqCounter = 0;
function row(over: {
  id: string;
  type?: string;
  rating?: number;
  marks?: number;
  source?: 'type' | 'chapter';
  subject?: string;
  chapter?: string;
  topic?: string;
  stimulus?: any;
  boards?: Array<{ board: string; years?: number[] }>;
  text?: string;
  solution?: string;
}): FilterRow {
  const source = over.source ?? 'type';
  const question = {
    id: over.id,
    topicId: 't1',
    type: over.type ?? 'ক',
    marks: over.marks ?? 1,
    questionText: over.text ?? `প্রশ্ন ${over.id}`,
    solutionText: over.solution ?? '',
    solutionImageIds: [],
    rating: over.rating ?? 3,
    order: 0,
    usedInBoards: over.boards ?? [],
  } as any;
  return {
    key: `${source}:${over.id}`,
    source,
    question,
    stimulus: over.stimulus,
    subjectName: over.subject ?? 'পদার্থ',
    chapterName: over.chapter ?? 'গতি',
    topicName: over.topic ?? '',
    seq: seqCounter++,
    haystack: `${question.questionText} ${question.solutionText} ${over.stimulus?.text ?? ''}`.toLowerCase(),
    categoryIds: [],
    usages: [],
  };
}

const crit = (over: Partial<FilterCriteria>): FilterCriteria => ({ ...EMPTY_CRITERIA, ...over });
const ids = (rows: FilterRow[]) => rows.map((r) => r.question.id);

describe('filterEngine', () => {
  const rows = [
    row({ id: 'k', type: 'ক', rating: 1 }),
    row({ id: 'g', type: 'গ', rating: 4, boards: [{ board: 'ঢাকা', years: [2025] }] }),
    row({ id: 'gh', type: 'ঘ', rating: 5, boards: [{ board: 'রাজশাহী', years: [2024] }] }),
    row({ id: 'ch', type: 'গ', source: 'chapter', subject: 'রসায়ন', chapter: 'অম্ল' }),
  ];

  it('কোনো শর্ত না দিলে সব প্রশ্ন, আসল ক্রমে', () => {
    expect(ids(applyFilters(rows, crit({}), 'default'))).toEqual(['k', 'g', 'gh', 'ch']);
  });

  it('ধরন ক-ঘ: গ+ঘ একসাথে', () => {
    expect(ids(applyFilters(rows, crit({ types: ['গ', 'ঘ'] as any }), 'default'))).toEqual(['g', 'gh', 'ch']);
  });

  it('ব্যবহৃত / অব্যবহৃত (বোর্ডে এসেছে কি না)', () => {
    expect(ids(applyFilters(rows, crit({ usage: 'used' }), 'default'))).toEqual(['g', 'gh']);
    expect(ids(applyFilters(rows, crit({ usage: 'unused' }), 'default'))).toEqual(['k', 'ch']);
  });

  it('বোর্ড ও বছর একসাথে মিলতে হয়', () => {
    expect(ids(applyFilters(rows, crit({ boards: ['ঢাকা'] }), 'default'))).toEqual(['g']);
    expect(ids(applyFilters(rows, crit({ boards: ['ঢাকা'], years: [2024] }), 'default'))).toEqual([]);
    expect(ids(applyFilters(rows, crit({ years: [2024] }), 'default'))).toEqual(['gh']);
  });

  it('উৎস, বিষয় ও অধ্যায়', () => {
    expect(ids(applyFilters(rows, crit({ sources: ['chapter'] }), 'default'))).toEqual(['ch']);
    expect(ids(applyFilters(rows, crit({ subjects: ['রসায়ন'] }), 'default'))).toEqual(['ch']);
    expect(ids(applyFilters(rows, crit({ chapters: ['পদার্থ||গতি'] }), 'default'))).toEqual(['k', 'g', 'gh']);
  });

  it('রেটিং ও সর্ট', () => {
    expect(ids(applyFilters(rows, crit({ ratings: [4, 5] }), 'default'))).toEqual(['g', 'gh']);
    expect(ids(applyFilters(rows, crit({}), 'rating-desc'))[0]).toBe('gh');
    expect(ids(applyFilters(rows, crit({}), 'rating-asc'))[0]).toBe('k');
  });

  it('উদ্দীপকের রেটিংই মূল: ছাঁকনি, সর্ট; উদ্দীপকে রেটিং না থাকলে প্রশ্নের রেটিং', () => {
    const withStim = [
      row({ id: 'a', rating: 1, stimulus: { id: 's1', text: 'x', rating: 5 } }),
      row({ id: 'b', rating: 5, stimulus: { id: 's2', text: 'y', rating: 2 } }),
      row({ id: 'c', rating: 4, stimulus: { id: 's3', text: 'z' } }), // old data: no stimulus rating
      row({ id: 'd', rating: 3 }), // no stimulus at all
    ];
    expect(rowRating(withStim[0])).toBe(5);
    expect(rowRating(withStim[2])).toBe(4);
    expect(rowRating(withStim[3])).toBe(3);
    expect(ids(applyFilters(withStim, crit({ ratings: [5] }), 'default'))).toEqual(['a']);
    expect(ids(applyFilters(withStim, crit({}), 'rating-desc'))).toEqual(['a', 'c', 'd', 'b']);
    expect(ids(applyFilters(withStim, crit({}), 'rating-asc'))).toEqual(['b', 'd', 'c', 'a']);
  });

  it('সর্ট "type" ক -> ঘ ক্রমে', () => {
    const shuffled = [rows[2], rows[0], rows[1]];
    expect(ids(applyFilters(shuffled, crit({}), 'type'))).toEqual(['k', 'g', 'gh']);
  });

  it('লেখা দিয়ে খোঁজা: সব শব্দ থাকতে হয়, বড়-ছোট হাত নির্বিশেষে', () => {
    const rs = [row({ id: 'a', text: 'Newton এর সূত্র' }), row({ id: 'b', text: 'Newton ও আইনস্টাইন' })];
    expect(ids(applyFilters(rs, crit({ text: 'newton সূত্র' }), 'default'))).toEqual(['a']);
  });

  it('সমাধান আছে / নেই', () => {
    const rs = [row({ id: 'a', solution: 'সমাধান' }), row({ id: 'b' })];
    expect(ids(applyFilters(rs, crit({ solution: 'with' }), 'default'))).toEqual(['a']);
    expect(ids(applyFilters(rs, crit({ solution: 'without' }), 'default'))).toEqual(['b']);
  });

  it('উদ্দীপক আছে / নেই', () => {
    const rs = [row({ id: 'a', stimulus: { id: 's', text: 'উদ্দীপক' } }), row({ id: 'b' })];
    expect(ids(applyFilters(rs, crit({ stimulus: 'with' }), 'default'))).toEqual(['a']);
    expect(ids(applyFilters(rs, crit({ stimulus: 'without' }), 'default'))).toEqual(['b']);
  });

  it('rowBoards উদ্দীপক ও প্রশ্নের একই বোর্ড মিলিয়ে বছর একত্র করে', () => {
    const r = row({
      id: 'a',
      stimulus: { id: 's', text: 'u', usedInBoards: [{ board: 'ঢাকা', years: [2023] }] },
      boards: [{ board: 'ঢাকা', years: [2021, 2023] }],
    });
    expect(rowBoards(r)).toEqual([{ board: 'ঢাকা', years: [2021, 2023] }]);
  });

  it('countActiveFilters', () => {
    expect(countActiveFilters(EMPTY_CRITERIA)).toBe(0);
    expect(countActiveFilters(crit({ types: ['গ'] as any, usage: 'used' }))).toBe(2);
  });

  it('groupRows: এক উদ্দীপকের প্রশ্ন একটি কার্ডে, ক -> ঘ ক্রমে', () => {
    const stim = { id: 's1', text: 'উদ্দীপক' };
    const rs = [
      row({ id: 'gh', type: 'ঘ', stimulus: stim }),
      row({ id: 'solo' }),
      row({ id: 'g', type: 'গ', stimulus: stim }),
    ];
    const groups = groupRows(rs);
    expect(groups).toHaveLength(2);
    expect(groups[0].rows.map((r) => r.question.id)).toEqual(['g', 'gh']);
    expect(groups[1].rows[0].question.id).toBe('solo');
  });

  it('computeScopedFacets: নির্বাচিত বিষয়ের অধ্যায় ও অধ্যায়ের টপিক', () => {
    const rs = [
      row({ id: '1', subject: 'পদার্থ', chapter: 'গতি', topic: 'টাইপ-১' }),
      row({ id: '2', subject: 'রসায়ন', chapter: 'অম্ল', topic: 'টাইপ-২' }),
    ];
    const f = computeScopedFacets(rs, { sources: [], subjects: ['পদার্থ'], chapters: [] });
    expect(f.chapters.map((c) => c.name)).toEqual(['গতি']);
    expect(f.topics).toEqual(['টাইপ-১']);
    expect(f.multiSubject).toBe(true);
  });
});
