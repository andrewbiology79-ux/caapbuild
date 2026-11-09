import type { AutoBackupResult } from './autoBackup';

/**
 * ধাপ ১.৪ - রিস্টোর বা Replace-ইমপোর্টের আগে নিরাপত্তা ব্যাকআপ।
 *
 * নিয়ম (Data_Safety_Plan ধাপ ১.৪ ও ব২):
 *  - বর্তমান ডেটা মুছে/বদলে দেওয়ার কাজের আগে সবসময় নতুন, যাচাইকৃত ব্যাকআপ নেওয়া হয়।
 *    "ডেটা না বদলালে বাদ" নিয়ম এখানে খাটে না।
 *  - ব্যাকআপ না নিতে পারলে (অনুমতি নেই, জায়গা নেই, লেখা ব্যর্থ, আরেকটি ব্যাকআপ অনেকক্ষণ চলছে)
 *    কাজটি শুরুই হয় না - SafetyBackupError ছোঁড়া হয়।
 *  - অ্যাপে কোনো ডেটা না থাকলে (নতুন ইনস্টলে রিস্টোর) ব্যাকআপ বাদ - হারানোর মতো কিছু নেই।
 *  - ব্রাউজার প্রিভিউতে (ফোনের স্টোরেজে চুপচাপ লেখা যায় না) ব্যাকআপ বাদ।
 *
 * এই ফাইলে ডাটাবেস/Capacitor ঢোকে না: দরকারি জিনিস deps দিয়ে আসে (পরীক্ষা: tests/safetyBackup.test.ts)।
 * আসল জোড়া লাগানো safeRestore.ts-এ।
 */

export type SafetyBackupErrorCode = 'failed' | 'no-access' | 'busy';

export class SafetyBackupError extends Error {
  readonly code: SafetyBackupErrorCode;
  constructor(code: SafetyBackupErrorCode, message: string) {
    super(message);
    this.name = 'SafetyBackupError';
    this.code = code;
  }
}

export function isSafetyBackupError(e: unknown): e is SafetyBackupError {
  return e instanceof SafetyBackupError || (e as any)?.name === 'SafetyBackupError';
}

export type SafetyBackupOutcome =
  | { kind: 'done'; folder: string }
  | { kind: 'skipped'; why: 'no-data' | 'browser' };

export interface SafetyBackupDeps {
  /** জোর করে (force) একটি যাচাইকৃত ব্যাকআপ নেয় */
  runBackup: (reason: string) => Promise<AutoBackupResult>;
  /** অ্যাপে (Type CQ বা Chapter CQ-তে) ব্যবহারকারীর কোনো ডেটা আছে কি না */
  hasUserData: () => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
}

/** আরেকটি ব্যাকআপ (যেমন দৈনিক) চলছে দেখলে এত সময় পর পর আবার চেষ্টা... */
export const BUSY_RETRY_MS = 1000;
/** ...সর্বোচ্চ এতবার (≈ ২ মিনিট); তার পরেও চললে কাজ শুরু হয় না */
export const BUSY_MAX_TRIES = 120;

export async function ensureSafetyBackupWith(deps: SafetyBackupDeps, reason: string): Promise<SafetyBackupOutcome> {
  // ডেটা আছে কি না মাপা না গেলে "আছে" ধরা হয় (নিরাপদ দিক)
  let hasData = true;
  try {
    hasData = await deps.hasUserData();
  } catch {
    hasData = true;
  }
  if (!hasData) return { kind: 'skipped', why: 'no-data' };

  let r: AutoBackupResult = { status: 'busy' };
  for (let i = 0; i < BUSY_MAX_TRIES; i++) {
    r = await deps.runBackup(reason);
    if (r.status !== 'busy') break;
    await deps.sleep(BUSY_RETRY_MS);
  }

  switch (r.status) {
    case 'done':
      return { kind: 'done', folder: r.folder };
    case 'unsupported':
      return { kind: 'skipped', why: 'browser' };
    case 'no-access':
      throw new SafetyBackupError(
        'no-access',
        'স্টোরেজ অনুমতি ছাড়া নিরাপত্তা ব্যাকআপ নেওয়া যায় না, তাই কাজটি শুরু হয়নি। অনুমতি দিয়ে আবার চেষ্টা করুন।'
      );
    case 'busy':
      throw new SafetyBackupError(
        'busy',
        'আরেকটি ব্যাকআপ অনেকক্ষণ ধরে চলছে, তাই কাজটি শুরু হয়নি। সেটি শেষ হলে আবার চেষ্টা করুন।'
      );
    case 'error':
      throw new SafetyBackupError(
        'failed',
        `${r.message}\nতাই কাজটি শুরুই করা হয়নি; আগের ডেটা যেমন ছিল তেমনই আছে।`
      );
    default:
      // 'skipped' বা অজানা কিছু: জোর-ব্যাকআপে এটা আসার কথা নয় - নিরাপদ দিকে ধরে কাজ আটকানো
      throw new SafetyBackupError(
        'failed',
        'নিরাপত্তা ব্যাকআপ নেওয়া যায়নি, তাই কাজটি শুরুই করা হয়নি; আগের ডেটা যেমন ছিল তেমনই আছে।'
      );
  }
}
