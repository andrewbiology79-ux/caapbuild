import { describe, it, expect } from 'vitest';
import { legacyBoardTag } from '../src/utils/boards';

const db25 = [{ board: 'DB', years: [2025] }];

describe('legacyBoardTag (কার্ডের পুরনো boardTag লেখা)', () => {
  it('বোর্ড শুধু গ/ঘ-তে থাকলে উপরের (উদ্দীপকের) জায়গায় কিছু দেখায় না', () => {
    expect(legacyBoardTag({ boardTag: "DB'25", usedInBoards: [] }, [{ usedInBoards: db25 }, { usedInBoards: [] }])).toBe('');
  });

  it('উদ্দীপকে বোর্ড থাকলে পুরনো লেখা লাগে না', () => {
    expect(legacyBoardTag({ boardTag: "DB'25", usedInBoards: db25 }, [{ usedInBoards: [] }])).toBe('');
  });

  it('নতুন পদ্ধতির কোনো বোর্ড না থাকলে পুরনো boardTag লেখা দেখায়', () => {
    expect(legacyBoardTag({ boardTag: "DB'২৫" }, [{ usedInBoards: [] }])).toBe("DB'২৫");
    expect(legacyBoardTag({ boardTag: "DB'২৫", usedInBoards: [] }, [{ usedInBoards: [] }])).toBe("DB'২৫");
  });

  it('boardTag বা উদ্দীপক না থাকলে খালি', () => {
    expect(legacyBoardTag({ usedInBoards: [] }, [{ usedInBoards: [] }])).toBe('');
    expect(legacyBoardTag(undefined, [{ usedInBoards: [] }])).toBe('');
  });
});
