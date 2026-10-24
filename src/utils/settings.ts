import { db, DEFAULT_PAPER_NOTE } from '../db/db';

export type ThemeMode = 'light' | 'dark';
export type FontSizeOption = 'small' | 'medium' | 'large';

export interface AppSettings {
  theme: ThemeMode;
  fontSize: FontSizeOption;
  defaultPaperTitle: string;
  /** দ্রষ্টব্য (note) that is filled in automatically for every new question paper. '' = no note */
  defaultPaperNote: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  fontSize: 'medium',
  defaultPaperTitle: 'পদার্থবিজ্ঞান ১ম পত্র - মডেল টেস্ট',
  defaultPaperNote: DEFAULT_PAPER_NOTE,
};

const SETTINGS_KEY = 'settings';

const FONT_SIZE_PX: Record<FontSizeOption, number> = {
  small: 14,
  medium: 16,
  large: 19,
};

/**
 * Normalize stored values (old/invalid data such as a numeric fontSize or unknown theme)
 */
function normalizeSettings(raw: any): AppSettings {
  const merged = { ...DEFAULT_SETTINGS, ...(raw || {}) };

  const theme: ThemeMode = merged.theme === 'dark' ? 'dark' : 'light';

  let fontSize: FontSizeOption = 'medium';
  if (merged.fontSize === 'small' || merged.fontSize === 'medium' || merged.fontSize === 'large') {
    fontSize = merged.fontSize;
  } else if (typeof merged.fontSize === 'number') {
    fontSize = merged.fontSize <= 14 ? 'small' : merged.fontSize >= 18 ? 'large' : 'medium';
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
  root.style.fontSize = `${FONT_SIZE_PX[settings.fontSize]}px`;
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
