import { describe, it, expect } from 'vitest';
import {
  parseSolution,
  serializeSolution,
  stripSolutionMarkers,
  splitStimulusImages,
} from '../src/utils/solutionParts';

describe('solutionParts', () => {
  it('ছবির জায়গা মনে রাখে (লেখা-ছবি-লেখা)', () => {
    const parts = parseSolution('আগে\n[[img:a1]]\nপরে', ['a1']);
    expect(parts).toEqual([
      { kind: 'text', text: 'আগে' },
      { kind: 'image', id: 'a1' },
      { kind: 'text', text: 'পরে' },
    ]);
  });

  it('মার্কার ছাড়া পুরনো সমাধানে ছবি শেষে যায়', () => {
    const parts = parseSolution('শুধু লেখা', ['p1', 'p2']);
    expect(parts.map((p) => p.kind)).toEqual(['text', 'image', 'image']);
  });

  it('তালিকায় নেই এমন ছবি বাদ পড়ে', () => {
    const parts = parseSolution('[[img:gone]]\nলেখা', []);
    expect(parts.some((p) => p.kind === 'image')).toBe(false);
  });

  it('সবসময় অন্তত একটি লেখার বক্স থাকে', () => {
    expect(parseSolution('', []).some((p) => p.kind === 'text')).toBe(true);
  });

  it('serialize -> parse ঘুরে এলে একই ফল', () => {
    const original = [
      { kind: 'text' as const, text: 'এক' },
      { kind: 'text' as const, text: 'দুই' },
      { kind: 'image' as const, id: 'x9' },
      { kind: 'text' as const, text: 'তিন' },
    ];
    const { text, imageIds } = serializeSolution(original);
    expect(imageIds).toEqual(['x9']);
    expect(parseSolution(text, imageIds)).toEqual(original);
  });

  it('stripSolutionMarkers মার্কার সরায়', () => {
    expect(stripSolutionMarkers('ক\n[[img:a]]\nখ')).not.toContain('[[');
    expect(stripSolutionMarkers(undefined)).toBe('');
  });

  it('splitStimulusImages উপর-নিচ ভাগ করে', () => {
    expect(splitStimulusImages(['a', 'b', 'c'], 1)).toEqual({ top: ['a'], bottom: ['b', 'c'] });
    expect(splitStimulusImages(['a'], 5)).toEqual({ top: ['a'], bottom: [] });
    expect(splitStimulusImages(undefined, undefined)).toEqual({ top: [], bottom: [] });
  });
});
