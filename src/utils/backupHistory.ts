/**
 * Backup history + reminder.
 * Kept in localStorage on purpose: it must NOT travel inside backup files, and a restore
 * (replace) must not wipe the record of when the user last backed up.
 */
const HISTORY_KEY = 'qb:backupHistory';
const REMINDER_KEY = 'qb:backupReminderDays';
const SNOOZE_KEY = 'qb:backupSnoozeUntil';
const MAX_ENTRIES = 30;

export type BackupKind = 'full' | 'type' | 'chapter';

export interface BackupLogEntry {
  id: string;
  at: number;
  kind: BackupKind;
  questions: number;
  papers: number;
}

export const REMINDER_OPTIONS = [0, 3, 7, 14, 30] as const;
export const DEFAULT_REMINDER_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: history is a convenience only */
  }
}

export function getBackupHistory(): BackupLogEntry[] {
  const list = readJson<BackupLogEntry[]>(HISTORY_KEY, []);
  return Array.isArray(list) ? [...list].sort((a, b) => b.at - a.at) : [];
}

export function recordBackup(entry: Omit<BackupLogEntry, 'id' | 'at'>): void {
  const now = Date.now();
  const list = getBackupHistory();
  const next: BackupLogEntry[] = [
    { id: `bk_${now}_${Math.random().toString(36).slice(2, 6)}`, at: now, ...entry },
    ...list,
  ].slice(0, MAX_ENTRIES);
  write(HISTORY_KEY, next);
  // a fresh backup clears any "remind me later"
  try {
    localStorage.removeItem(SNOOZE_KEY);
  } catch {
    /* ignore */
  }
}

export function clearBackupHistory(): void {
  write(HISTORY_KEY, []);
}

export function getLastFullBackupAt(): number | null {
  const last = getBackupHistory().find((b) => b.kind === 'full');
  return last ? last.at : null;
}

/** 0 = reminders off */
export function getReminderDays(): number {
  const v = readJson<number>(REMINDER_KEY, DEFAULT_REMINDER_DAYS);
  return (REMINDER_OPTIONS as readonly number[]).includes(v) ? v : DEFAULT_REMINDER_DAYS;
}

export function setReminderDays(days: number): void {
  write(REMINDER_KEY, days);
}

export function snoozeReminder(days = 1): void {
  write(SNOOZE_KEY, Date.now() + days * DAY_MS);
}

export interface BackupReminderState {
  due: boolean;
  /** null = never backed up */
  daysSince: number | null;
}

/**
 * `hasData` – only nag people who actually have something to lose.
 */
export function getBackupReminderState(hasData: boolean): BackupReminderState {
  const last = getLastFullBackupAt();
  const daysSince = last === null ? null : Math.floor((Date.now() - last) / DAY_MS);
  const interval = getReminderDays();
  if (!hasData || interval === 0) return { due: false, daysSince };
  const snoozedUntil = readJson<number>(SNOOZE_KEY, 0);
  if (snoozedUntil > Date.now()) return { due: false, daysSince };
  const due = last === null || Date.now() - last >= interval * DAY_MS;
  return { due, daysSince };
}
