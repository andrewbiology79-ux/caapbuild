import { describe, it, expect } from 'vitest';
import { imageIdsOfGroup, remapMarkers, remapStimulusImages, remapQuestionImages } from '../src/utils/imageClone';

describe('imageIdsOfGroup', () => {
  it('ids তালিকা ও লেখার [[img:ID]] চিহ্ন দুটো থেকেই, ডুপ্লিকেট ছাড়া', () => {
    const ids = imageIdsOfGroup(
      { text: 'উদ্দীপক [[img:s2]]', imageIds: ['s1', 's2'] },
      [
        { questionText: 'প্রশ্ন [[img:q1]]', solutionText: 'সমাধান [[img:a1]] [[img:a1]]', solutionImageIds: ['a1'] },
        { answerText: 'উত্তর [[img:z]]', solutionImageIds: [] },
      ]
    );
    expect(ids.sort()).toEqual(['a1', 'q1', 's1', 's2', 'z']);
  });

  it('উদ্দীপক ছাড়া/ফাঁকা ঠিকঠাক', () => {
    expect(imageIdsOfGroup(undefined, [{ solutionImageIds: ['x', ''] }])).toEqual(['x']);
    expect(imageIdsOfGroup(null, [])).toEqual([]);
  });
});

describe('remap', () => {
  const map = new Map([['a', 'A2'], ['b', 'B2']]);

  it('লেখার চিহ্ন বদলায়; না-থাকা id dropMissing অনুযায়ী', () => {
    expect(remapMarkers('x [[img:a]] y [[img:b]] z', map, true)).toBe('x [[img:A2]] y [[img:B2]] z');
    expect(remapMarkers('[[img:zz]]', map, true)).toBe('');
    expect(remapMarkers('[[img:zz]]', map, false)).toBe('[[img:zz]]');
    expect(remapMarkers(undefined, map, true)).toBe('');
  });

  it('উদ্দীপক: imageIds ও লেখা নতুন id-তে; মূল অবজেক্ট অক্ষত; ছবির ডেটা-না-থাকা id বাদ', () => {
    const s = { id: 's', text: '[[img:a]]', imageIds: ['a', 'gone'] };
    const out = remapStimulusImages(s, map);
    expect(out.imageIds).toEqual(['A2']);
    expect(out.text).toBe('[[img:A2]]');
    expect(s.imageIds).toEqual(['a', 'gone']);
    expect(out.id).toBe('s');
  });

  it('প্রশ্ন: solutionImageIds, প্রশ্ন/সমাধান/উত্তরের চিহ্ন নতুন id-তে; answerText না থাকলে যোগ হয় না', () => {
    const q = { id: 'q', questionText: '[[img:a]]', solutionText: '[[img:b]]', solutionImageIds: ['a', 'b'] };
    const out: any = remapQuestionImages(q, map);
    expect(out.solutionImageIds).toEqual(['A2', 'B2']);
    expect(out.questionText).toBe('[[img:A2]]');
    expect(out.solutionText).toBe('[[img:B2]]');
    expect('answerText' in out).toBe(false);
    const withAns: any = remapQuestionImages({ ...q, answerText: '[[img:a]]' }, map);
    expect(withAns.answerText).toBe('[[img:A2]]');
  });

  it('একই মূল দুবার নকল হলে নতুন id আলাদা (দুই কপি একই ছবি ধরে না)', () => {
    const m1 = new Map([['a', 'N1']]);
    const m2 = new Map([['a', 'N2']]);
    const q = { solutionImageIds: ['a'], questionText: '', solutionText: '' };
    expect(remapQuestionImages(q, m1).solutionImageIds).toEqual(['N1']);
    expect(remapQuestionImages(q, m2).solutionImageIds).toEqual(['N2']);
  });
});
