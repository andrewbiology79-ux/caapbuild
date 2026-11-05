import { db, DEFAULT_PAPER_NOTE } from '../db/db';

export type ThemeMode = 'light' | 'dark';
/** Root font size in px (e.g. 16, 20, 21, 22 …) — chosen by number in Settings */
export type FontSizeOption = number;

export const MIN_FONT_SIZE = 12;
export const MAX_FONT_SIZE = 28;
export const DEFAULT_FONT_SIZE = 16;

export interface AppSettings {
  theme: ThemeMode;
  fontSize: FontSizeOption;
  defaultPaperTitle: string;
  /** দ্রষ্টব্য (note) that is filled in automatically for every new question paper. '' = no note */
  defaultPaperNote: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  fontSize: DEFAULT_FONT_SIZE,
  defaultPaperTitle: 'পদার্থবিজ্ঞান ১ম পত্র - মডেল টেস্ট',
  defaultPaperNote: DEFAULT_PAPER_NOTE,
};

const SETTINGS_KEY = 'settings';

/**
 * Normalize stored values (old/invalid data such as a numeric fontSize or unknown theme)
 */
function normalizeSettings(raw: any): AppSettings {
  const merged = { ...DEFAULT_SETTINGS, ...(raw || {}) };

  const theme: ThemeMode = merged.theme === 'dark' ? 'dark' : 'light';

  // old versions stored 'small' | 'medium' | 'large'; new versions store the size in px
  let fontSize: FontSizeOption = DEFAULT_FONT_SIZE;
  if (merged.fontSize === 'small') fontSize = 14;
  else if (merged.fontSize === 'medium') fontSize = 16;
  else if (merged.fontSize === 'large') fontSize = 19;
  else if (typeof merged.fontSize === 'number' && isFinite(merged.fontSize)) {
    fontSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(merged.fontSize)));
  }

  return {
    theme,
    fontSize,
    defaultPaperTitle:
      typeof merged.defaultPaperTitle === 'string' && merged.defaultPaperTitle.trim()
        ? merged.defaultPaperTitle
        : DEFAULT_SETTINGS.defaultPaperTitle,
    defaultPaperNote:
      typeof merged.defaultPaperNote === 'string'
        ? merged.defaultPaperNote
        : DEFAULT_SETTINGS.defaultPaperNote,
  };
}

/**
 * Apply settings to the DOM (Tailwind .dark class and root html font size)
 */
export function applySettingsToDOM(input: AppSettings): void {
  const settings = normalizeSettings(input);
  const root = document.documentElement;

  // 1. Theme
  if (settings.theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  // 2. Root Font Size (all rem based Tailwind sizes follow this)
  root.style.fontSize = `${settings.fontSize}px`;
}

/**
 * Get current settings from meta table with fallback
 */
export async function getAppSettings(): Promise<AppSettings> {
  try {
    const record = await db.meta.get(SETTINGS_KEY);
    if (record && record.value) {
      return normalizeSettings(record.value);
    }
  } catch (err) {
    console.error('Failed to read settings:', err);
  }
  return { ...DEFAULT_SETTINGS };
}

/**
 * Save settings to meta table and apply immediately
 */
export async function saveAppSettings(input: AppSettings): Promise<void> {
  const settings = normalizeSettings(input);
  await db.meta.put({
    key: SETTINGS_KEY,
    value: settings,
  });
  applySettingsToDOM(settings);
}

/* ------------------------------------------------------------------
 * PDF text size (remembered between exports)
 * ---------------------------------------------------------------- */

const PDF_FONT_SCALE_KEY = 'pdf_font_scale';

/** Allowed PDF text scales (1 = 100%) */
export const PDF_FONT_SCALES = [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3] as const;
export const DEFAULT_PDF_FONT_SCALE = 1;

/** Snap any stored/invalid value to the nearest allowed scale */
export function normalizePdfFontScale(value: unknown): number {
  const n = typeof value === 'number' && isFinite(value) ? value : DEFAULT_PDF_FONT_SCALE;
  let best: number = PDF_FONT_SCALES[0];
  for (const step of PDF_FONT_SCALES) {
    if (Math.abs(step - n) < Math.abs(best - n)) best = step;
  }
  return best;
}

export async function getPdfFontScale(): Promise<number> {
  try {
    const record = await db.meta.get(PDF_FONT_SCALE_KEY);
    if (record && record.value !== undefined) {
      return normalizePdfFontScale(record.value);
    }
  } catch (err) {
    console.error('Failed to read PDF font scale:', err);
  }
  return DEFAULT_PDF_FONT_SCALE;
}

export async function savePdfFontScale(scale: number): Promise<void> {
  try {
    await db.meta.put({ key: PDF_FONT_SCALE_KEY, value: normalizePdfFontScale(scale) });
  } catch (err) {
    console.error('Failed to save PDF font scale:', err);
  }
}
