import { describe, it, expect } from 'vitest';
import type { ConflictEntry, PreviewEntry, PreviewTotals, TopicDiff } from '../src/storage/syncCompare';
import type { SyncProgress } from '../src/storage/syncProgress';
import {
  emptyCounts,
  makeResultView,
  resultHeadline,
  isBlocking,
  entryText,
  groupEntries,
  topicDiffText,
  totalsChips,
  conflictChip,
  questionsLine,
  conflictMoveText,
  progressLine,
  percentText,
  currentWork,
  counterCells,
  dialogTitle,
  type SyncDialogState,
} from '../src/storage/syncView';

const totals = (over: Partial<PreviewTotals> = {}): PreviewTotals => ({
  add: 0,
  create: 0,
  rename: 0,
  move: 0,
  delete: 0,
  update: 0,
  questionsAdded: 0,
  questionsRemoved: 0,
  questionsChanged: 0,
  imagesToWrite: 0,
  conflicts: 0,
  extras: 0,
  ...over,
});

const diff = (over: Partial<TopicDiff> = {}): TopicDiff => ({
  questionsAdded: [],
  questionsRemoved: [],
  questionsChanged: [],
  stimuliAdded: 0,
  stimuliRemoved: 0,
  stimuliChanged: 0,
  imagesNew: 0,
  imagesMissing: [],
  imagesToWrite: 0,
  ...over,
});

const q = (id: string) => ({ id, type: 'ক', title: id });

describe('syncView (ধাপ ৩ - বাংলা লেখা ও অবস্থা)', () => {
  it('ফলের "কিছু বদলায়নি" শুধু যখন সংখ্যা ও কনফ্লিক্ট দুটোই শূন্য', () => {
    const none = makeResultView(emptyCounts(), []);
    expect(none.nothingChanged).toBe(true);
    expect(resultHeadline(none)).toBe('সিঙ্ক সম্পন্ন - কিছু বদলায়নি');

    const changed = makeResultView({ ...emptyCounts(), add: 1 }, []);
    expect(changed.nothingChanged).toBe(false);
    expect(resultHeadline(changed)).toBe('সিঙ্ক সম্পন্ন');

    const conflict: ConflictEntry = {
      scope: 'type',
      kind: 'duplicate-id',
      path: ['পদার্থ'],
      folderSide: 'x',
      appSide: 'y',
      moveTo: 'Sync_Conflicts/s',
      sourcePath: 'পদার্থ',
    };
    const withConflict = makeResultView(emptyCounts(), [{ ...conflict, moved: false }]);
    expect(withConflict.nothingChanged).toBe(false);
  });

  it('শুধু চলার সময় Back ব্লক (running)', () => {
    const run: SyncDialogState = { kind: 'running', direction: 'folder-to-app', progress: null, counts: emptyCounts() };
    const res: SyncDialogState = {
      kind: 'result',
      direction: 'folder-to-app',
      auto: true,
      result: makeResultView(emptyCounts(), []),
    };
    expect(isBlocking(run)).toBe(true);
    expect(isBlocking(res)).toBe(false);
    expect(isBlocking(null)).toBe(false);
  });

  it('শিরোনামে দিক, অটো হলে "স্বয়ংক্রিয় সিঙ্ক"', () => {
    expect(dialogTitle('folder-to-app')).toBe('সিঙ্ক: ফোল্ডার → অ্যাপ');
    expect(dialogTitle('app-to-folder', true)).toBe('স্বয়ংক্রিয় সিঙ্ক: অ্যাপ → ফোল্ডার');
  });

  it('টাইপের প্রশ্ন-পার্থক্য বাংলা অঙ্কে', () => {
    expect(topicDiffText(undefined)).toBe('');
    expect(topicDiffText(diff())).toBe('');
    expect(topicDiffText(diff({ questionsAdded: [q('a'), q('b')], questionsChanged: [q('c')], imagesMissing: ['i1'] }))).toBe(
      '২টি প্রশ্ন যোগ, ১টি প্রশ্ন বদল, ১টি ছবির ফাইল নেই'
    );
  });

  it('entryText: নাম বদল, সরানো, নোট', () => {
    const rename: PreviewEntry = { scope: 'type', kind: 'chapter', action: 'rename', path: ['পদার্থ', 'নতুন'], from: 'পুরনো', to: 'নতুন' };
    const t = entryText(rename);
    expect(t.actionLabel).toBe('নাম বদল');
    expect(t.kindLabel).toBe('অধ্যায়');
    expect(t.pathText).toBe('পদার্থ › নতুন');
    expect(t.change).toBe('পুরনো → নতুন');

    const move: PreviewEntry = { scope: 'type', kind: 'topic', action: 'move', path: ['a', 'b', 'c'], from: 'x', note: 'ফোল্ডার নতুন জায়গায় সরবে' };
    const m = entryText(move);
    expect(m.change).toBe('আগের জায়গা: x');
    expect(m.detail).toBe('ফোল্ডার নতুন জায়গায় সরবে');
  });

  it('groupEntries: Type CQ আগে, তারপর Chapter CQ; বিষয় অনুযায়ী', () => {
    const e = (scope: 'type' | 'chapter', subject: string): PreviewEntry => ({ scope, kind: 'subject', action: 'add', path: [subject] });
    const groups = groupEntries([e('chapter', 'গণিত'), e('type', 'পদার্থ'), e('type', 'রসায়ন'), e('type', 'পদার্থ')]);
    expect(groups.map((g) => g.key)).toEqual(['type|পদার্থ', 'type|রসায়ন', 'chapter|গণিত']);
    expect(groups[0].entries).toHaveLength(2);
    expect(groups[0].scopeTitle).toBe('Type CQ');
  });

  it('মাথার সংখ্যা: কনফ্লিক্ট আলাদা, মোছা লাল', () => {
    const t = totals({ add: 2, delete: 1, conflicts: 3, questionsAdded: 5 });
    const chips = totalsChips(t);
    expect(chips.map((c) => c.key)).toEqual(['add', 'delete']);
    expect(chips.find((c) => c.key === 'delete')?.tone).toBe('danger');
    expect(chips.some((c) => c.key === 'conflicts')).toBe(false); // সাধারণ সংখ্যায় মেশে না
    expect(conflictChip(t)?.text).toBe('৩টি কনফ্লিক্ট');
    expect(conflictChip(totals())).toBeNull();
    expect(questionsLine(t)).toBe('৫টি প্রশ্ন যোগ');
  });

  it('কনফ্লিক্ট কোথায় সরবে: প্রিভিউ / সরানো হয়েছে / অটো', () => {
    const c = { moveTo: 'Sync_Conflicts/2026-11-10_14-30-05/Type_CQ/পদার্থ' };
    expect(conflictMoveText(c, false)).toBe(`সরানো হবে: ${c.moveTo}`);
    expect(conflictMoveText(c, true)).toBe(`সরানো হয়েছে: ${c.moveTo}`);
    expect(conflictMoveText(c, false, true)).toContain('অটো সিঙ্ক সরায় না');
    expect(conflictMoveText(c, false, true)).toContain(c.moveTo);
  });

  it('প্রগ্রেসের লেখা: ৩৪ / ১২০ ধাপ সম্পন্ন, বাকি ৮৬', () => {
    const p: SyncProgress = { phase: 'data', done: 34, total: 120, label: 'পদার্থ › ১ম অধ্যায়', percent: 28, finished: false };
    expect(percentText(p)).toBe('২৮%');
    expect(progressLine(p)).toBe('৩৪ / ১২০ ধাপ সম্পন্ন, বাকি ৮৬');
    expect(currentWork(p)).toBe('data.json লেখা: পদার্থ › ১ম অধ্যায়');
    expect(currentWork({ ...p, label: undefined })).toBe('data.json লেখা');
  });

  it('চলতি সংখ্যা: যোগ = নতুন+তৈরি, বদল = আপডেট+নাম+সরানো', () => {
    const cells = counterCells({ add: 1, create: 2, rename: 1, move: 1, update: 3, delete: 4, conflictsMoved: 5, extrasMoved: 2 });
    expect(cells.map((c) => [c.key, c.value])).toEqual([
      ['added', 3],
      ['changed', 5],
      ['deleted', 4],
      ['conflicts', 5],
      ['extras', 2],
    ]);
  });
});
