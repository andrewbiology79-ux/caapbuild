/**
 * Custom (user-added) boards for the question form.
 * Stored in localStorage so the built-in board list stays untouched.
 */
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
