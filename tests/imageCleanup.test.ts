import { describe, it, expect } from 'vitest';
import { imageCleanupCandidates, createImageUseTracker, markClipboardUse, splitOrphansByDb } from '../src/utils/imageCleanup';

describe('imageCleanupCandidates', () => {
  const added = ['n1', 'n2'];
  const loaded = ['o1', 'o2'];

  it('সেভ ছাড়া বের হলে শুধু এই সেশনে বাছা ছবি (পুরনো ছবি অক্ষত)', () => {
    expect(imageCleanupCandidates('discarded', added, loaded).sort()).toEqual(['n1', 'n2']);
  });

  it('সেভ হলে বাছা + খোলার সময় থাকা ছবি, ডুপ্লিকেট ছাড়া', () => {
    expect(imageCleanupCandidates('saved', ['n1', 'o1'], ['o1', 'o2']).sort()).toEqual(['n1', 'o1', 'o2']);
  });

  it('খালি/ফাঁকা id বাদ', () => {
    expect(imageCleanupCandidates('saved', [''], [''])).toEqual([]);
    expect(imageCleanupCandidates('discarded', [], loaded)).toEqual([]);
  });
});

describe('createImageUseTracker', () => {
  it('কেউ ধরে না এমন ছবিই unused', () => {
    const t = createImageUseTracker(['a', 'b', 'c']);
    t.addStimulus({ imageIds: ['a'] });
    t.addQuestion({ solutionImageIds: ['c', 'zzz'] });
    expect(t.unused()).toEqual(['b']);
  });

  it('প্রার্থীর বাইরের id উপেক্ষা; undefined/null ঠিকঠাক সামলায়', () => {
    const t = createImageUseTracker(['a']);
    t.addStimulus({});
    t.addStimulus({ imageIds: null });
    t.addQuestion({ solutionImageIds: undefined });
    t.addQuestion({ solutionImageIds: ['other'] });
    expect(t.unused()).toEqual(['a']);
    expect(t.allUsed()).toBe(false);
  });

  it('কপি-পেস্ট করা প্রশ্ন একই ছবি ধরলে সেটা মোছা যায় না', () => {
    const t = createImageUseTracker(['shared', 'lonely']);
    t.addQuestion({ solutionImageIds: ['shared'] }); // পেস্ট করা কপি
    expect(t.unused()).toEqual(['lonely']);
  });

  it('সব ব্যবহৃত হলে allUsed true; প্রার্থী না থাকলে size 0 ও allUsed true', () => {
    const t = createImageUseTracker(['a', 'b']);
    t.addStimulus({ imageIds: ['a', 'b'] });
    expect(t.allUsed()).toBe(true);
    expect(t.unused()).toEqual([]);
    const e = createImageUseTracker([]);
    expect(e.size).toBe(0);
    expect(e.allUsed()).toBe(true);
  });
});

describe('markClipboardUse (ধাপ ৫গ — ক্লিপবোর্ডও ছবি ধরে আছে)', () => {
  it('একটা প্রশ্নের ক্লিপবোর্ড: তার সমাধানের ছবি ধরা থাকে', () => {
    const t = createImageUseTracker(['a', 'b']);
    markClipboardUse(t, { id: 'q1', solutionImageIds: ['a'] });
    expect(t.unused()).toEqual(['b']);
  });

  it('গ্রুপ ক্লিপবোর্ড: উদ্দীপক ও সব প্রশ্নের ছবি ধরা থাকে', () => {
    const t = createImageUseTracker(['s', 'x', 'y', 'z']);
    markClipboardUse(t, {
      mode: 'copy',
      stimulus: { imageIds: ['s'] },
      questions: [{ solutionImageIds: ['x'] }, { solutionImageIds: ['y'] }],
    });
    expect(t.unused()).toEqual(['z']);
  });

  it('গ্রুপ ক্লিপবোর্ডে উদ্দীপক না থাকলেও চলে', () => {
    const t = createImageUseTracker(['x']);
    markClipboardUse(t, { mode: 'cut', questions: [{ solutionImageIds: ['x'] }] });
    expect(t.unused()).toEqual([]);
  });

  it('null / অচেনা আকার / ভাঙা সারি: কিছু করে না, ভাঙে না', () => {
    const t = createImageUseTracker(['a']);
    markClipboardUse(t, null);
    markClipboardUse(t, undefined);
    markClipboardUse(t, 'text');
    markClipboardUse(t, { questions: [null, 5, { solutionImageIds: null }] });
    expect(t.unused()).toEqual(['a']);
  });
});

describe('splitOrphansByDb (ধাপ ৫খ)', () => {
  it('প্রতিটা ডেটাবেসের সারি থেকে শুধু unused আলাদা করে', () => {
    const r = splitOrphansByDb({ type: ['a', 'b', 'c'], chapter: ['d', 'e'] }, ['b', 'e']);
    expect(r).toEqual({ type: ['b'], chapter: ['e'] });
  });

  it('অন্য ডেটাবেসের প্রশ্ন ধরা ছবি unused-এ নেই, তাই কোনো ডেটাবেসেই এতিম নয়', () => {
    const t = createImageUseTracker(['shared', 'lonely']);
    t.addQuestion({ solutionImageIds: ['shared'] }); // অন্য ডেটাবেসের প্রশ্ন
    const r = splitOrphansByDb({ type: ['shared', 'lonely'], chapter: ['shared'] }, t.unused());
    expect(r).toEqual({ type: ['lonely'], chapter: [] });
  });

  it('কিছু এতিম না থাকলে খালি তালিকা', () => {
    expect(splitOrphansByDb({ type: ['a'], chapter: [] }, [])).toEqual({ type: [], chapter: [] });
  });
});
