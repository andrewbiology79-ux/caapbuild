import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseSolution } from '../src/utils/solutionParts';

// খ২: PDF পরীক্ষার নমুনা ফাইল ভেঙে গেলে (ছবির id, সম্পর্ক) আগেই ধরা পড়ুক
const file = fileURLToPath(new URL('../test-data/pdf-test-collection.json', import.meta.url));
const data = JSON.parse(readFileSync(file, 'utf8'));
const ids = (list: any[]) => list.map((x) => x.id);

describe('test-data/pdf-test-collection.json', () => {
  it('ইমপোর্টের দরকারি কাঠামো আছে (Type CQ ফাইল)', () => {
    expect(data.type).toBe('qb-question-collection');
    expect(data.scope).toBe('type');
    for (const k of ['subjects', 'chapters', 'topics', 'stimuli', 'questions', 'images']) {
      expect(Array.isArray(data[k])).toBe(true);
    }
  });

  it('সব সম্পর্ক ঠিক: বিষয় -> অধ্যায় -> টপিক -> উদ্দীপক/প্রশ্ন', () => {
    const chapters = new Set(ids(data.chapters));
    const topics = new Set(ids(data.topics));
    const stimuli = new Set(ids(data.stimuli));
    expect(data.chapters.every((c: any) => data.subjects.some((s: any) => s.id === c.subjectId))).toBe(true);
    expect(data.topics.every((t: any) => chapters.has(t.chapterId))).toBe(true);
    expect(data.stimuli.every((s: any) => topics.has(s.topicId))).toBe(true);
    expect(data.questions.every((q: any) => topics.has(q.topicId))).toBe(true);
    expect(data.questions.every((q: any) => !q.stimulusId || stimuli.has(q.stimulusId))).toBe(true);
  });

  it('id একটাও ডুপ্লিকেট নয়', () => {
    const all = [...ids(data.subjects), ...ids(data.chapters), ...ids(data.topics), ...ids(data.stimuli), ...ids(data.questions), ...ids(data.images)];
    expect(new Set(all).size).toBe(all.length);
  });

  it('উদ্দীপক ও সমাধানের প্রতিটি ছবির ডেটা ভেতরে আছে', () => {
    const embedded = new Set(data.images.filter((i: any) => i.data?.startsWith('data:image/')).map((i: any) => i.id));
    for (const s of data.stimuli) for (const id of s.imageIds) expect(embedded.has(id)).toBe(true);
    for (const q of data.questions) {
      for (const p of parseSolution(q.solutionText, q.solutionImageIds)) {
        if (p.kind === 'image') expect(embedded.has(p.id)).toBe(true);
      }
    }
  });

  it('সব পরীক্ষার ক্ষেত্র আছে: লম্বা সমাধান, ছবির মাঝে লেখা, উত্তর/সমাধান না থাকা', () => {
    const q = (id: string) => data.questions.find((x: any) => x.id === id);
    expect(q('pdft-q-7').solutionText.length).toBeGreaterThan(2000);
    expect(q('pdft-q-6').solutionText).toContain('[[box]]');
    expect(q('pdft-q-6').solutionText).toContain('[[img:');
    expect(q('pdft-q-9').solutionText).toBe('');
    expect(q('pdft-q-9').answerText).toBeUndefined();
    expect(q('pdft-q-10').solutionText).toBe('');
    expect(q('pdft-q-10').answerText === undefined).toBe(false);
    expect(q('pdft-q-4').answerText).toBeUndefined();
  });

  it('বিষয়ের নাম আলাদা চেনা যায় ([PDF পরীক্ষা])', () => {
    expect(data.subjects[0].name).toContain('[PDF পরীক্ষা]');
  });
});
