/**
 * English to Bengali digit mapping
 */
const bnDigits: { [key: string]: string } = {
  '0': '০',
  '1': '১',
  '2': '২',
  '3': '৩',
  '4': '৪',
  '5': '৫',
  '6': '৬',
  '7': '৭',
  '8': '৮',
  '9': '৯',
};

const enDigits: { [key: string]: string } = {
  '০': '0',
  '১': '1',
  '২': '2',
  '৩': '3',
  '৪': '4',
  '৫': '5',
  '৬': '6',
  '৭': '7',
  '৮': '8',
  '৯': '9',
};

/**
 * Converts English digits (0-9) to Bengali digits (০-৯).
 * Example: toBn(12) => "১২"
 * Example: toBn("Score: 98.5%") => "Score: ৯৮.৫%"
 */
export function toBn(value: number | string | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  return str.replace(/[0-9]/g, (match) => bnDigits[match] || match);
}

/**
 * Converts English digits (0-9) to Bengali digits (০-৯) with minimum 2 digits padding.
 * Example: toBnPad2(1) => "০১"
 * Example: toBnPad2(12) => "১২"
 */
export function toBnPad2(value: number | string | null | undefined): string {
  if (value === null || value === undefined) {
    return '০০';
  }
  const num = typeof value === 'number' ? value : parseInt(String(value), 10);
  if (isNaN(num)) {
    return toBn(value);
  }
  const padded = num < 10 ? `0${num}` : `${num}`;
  return toBn(padded);
}

/**
 * Converts Bengali digits (০-৯) to English digits (0-9).
 * Example: toEn("১২") => "12"
 */
export function toEn(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/[০-৯]/g, (match) => enDigits[match] || match);
}

export default toBn;
