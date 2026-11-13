/**
 * Custom (user-added) boards for the question form.
 * Stored in localStorage so the built-in board list stays untouched.
 */
import type { Stimulus, Question } from '../db/db';

export interface BoardOption {
  value: string;
  label: string;
}

const CUSTOM_BOARDS_KEY = 'qb_custom_boards_v1';

export interface CustomBoard {
  code: string; // short code, e.g. CTB
  name: string; // full name, e.g. চট্টগ্রাম বোর্ড
}

export function loadCustomBoards(): CustomBoard[] {
  try {
    const raw = localStorage.getItem(CUSTOM_BOARDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (b) => b && typeof b.code === 'string' && b.code.trim() && typeof b.name === 'string'
    );
  } catch {
    return [];
  }
}

export function saveCustomBoards(list: CustomBoard[]): void {
  try {
    localStorage.setItem(CUSTOM_BOARDS_KEY, JSON.stringify(list));
  } catch {
    /* ignore storage errors */
  }
}

export function customBoardToOption(b: CustomBoard): BoardOption {
  return { value: b.code, label: b.name ? `${b.code} (${b.name})` : b.code };
}

/**
 * Old-style board text (stimulus.boardTag) that a card may show when no board was picked the new way.
 * boardTag is saved as the union of the stimulus' + every question's boards, so as soon as the stimulus OR a
 * গ / ঘ question has a board, the chips already show it in its own place and this returns ''
 * (otherwise a board picked only on গ would also show up at the top, in the stimulus' place).
 */
export function legacyBoardTag(
  stimulus: Pick<Stimulus, 'boardTag' | 'usedInBoards'> | undefined,
  questions: Array<Pick<Question, 'usedInBoards'>>
): string {
  const tag = (stimulus?.boardTag || '').trim();
  if (!tag) return '';
  if ((stimulus?.usedInBoards || []).length > 0) return '';
  const shown = (list?: Array<{ board: string; years: number[] }>) =>
    (list || []).some((b) => b && b.board && (b.years || []).length > 0);
  if (questions.some((q) => shown(q.usedInBoards))) return '';
  return tag;
}
