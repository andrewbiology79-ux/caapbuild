import { describe, it, expect } from 'vitest';
import {
  ensureSafetyBackupWith,
  isSafetyBackupError,
  SafetyBackupError,
  BUSY_MAX_TRIES,
  type SafetyBackupDeps,
} from '../src/utils/safetyBackup';
import type { AutoBackupResult } from '../src/utils/autoBackup';

/** নকল deps: কতবার ব্যাকআপ চাওয়া হলো ও কোন কারণে, তা মনে রাখে */
function makeDeps(opts: {
  hasData?: boolean | 'throw';
  results: AutoBackupResult[]; // একে একে ফেরানো হবে; শেষটা বারবার
}) {
  const calls: string[] = [];
  let sleeps = 0;
  const deps: SafetyBackupDeps = {
    runBackup: async (reason) => {
      calls.push(reason);
      const i = Math.min(calls.length - 1, opts.results.length - 1);
      return opts.results[i];
    },
    hasUserData: async () => {
      if (opts.hasData === 'throw') throw new Error('db error');
      return opts.hasData ?? true;
    },
    sleep: async () => {
      sleeps++;
    },
  };
  return { deps, calls, sleepCount: () => sleeps };
}

async function catchError(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  return undefined;
}

describe('ensureSafetyBackupWith', () => {
  it('ডেটা থাকলে ব্যাকআপ নেয় এবং ফোল্ডার ফেরায়, কারণসহ', async () => {
    const { deps, calls } = makeDeps({ results: [{ status: 'done', folder: 'Download/x/2026-11-09_10-00-00' }] });
    const out = await ensureSafetyBackupWith(deps, 'before-restore-replace');
    expect(out).toEqual({ kind: 'done', folder: 'Download/x/2026-11-09_10-00-00' });
    expect(calls).toEqual(['before-restore-replace']);
  });

  it('অ্যাপে কোনো ডেটা না থাকলে ব্যাকআপ বাদ (নতুন ইনস্টলে রিস্টোর)', async () => {
    const { deps, calls } = makeDeps({ hasData: false, results: [{ status: 'error', message: 'এটা ডাকা উচিত নয়' }] });
    const out = await ensureSafetyBackupWith(deps, 'before-restore-replace');
    expect(out).toEqual({ kind: 'skipped', why: 'no-data' });
    expect(calls.length).toBe(0);
  });

  it('ডেটা আছে কি না মাপতে ব্যর্থ হলে "আছে" ধরে ব্যাকআপ নেয়', async () => {
    const { deps, calls } = makeDeps({ hasData: 'throw', results: [{ status: 'done', folder: 'f' }] });
    const out = await ensureSafetyBackupWith(deps, 'before-import-replace');
    expect(out.kind).toBe('done');
    expect(calls.length).toBe(1);
  });

  it('ব্রাউজার প্রিভিউতে (unsupported) বাদ যায়, কাজ আটকায় না', async () => {
    const { deps } = makeDeps({ results: [{ status: 'unsupported' }] });
    const out = await ensureSafetyBackupWith(deps, 'before-restore-merge');
    expect(out).toEqual({ kind: 'skipped', why: 'browser' });
  });

  it('ব্যাকআপ ব্যর্থ হলে SafetyBackupError, কারণের বার্তাসহ - কাজ শুরু হয় না', async () => {
    const msg = 'জায়গা কম, ব্যাকআপ নেওয়া যাচ্ছে না, পুরনো ব্যাকআপ মুছে দাও।';
    const { deps } = makeDeps({ results: [{ status: 'error', message: msg }] });
    const err = await catchError(ensureSafetyBackupWith(deps, 'before-restore-replace'));
    expect(isSafetyBackupError(err)).toBe(true);
    expect(err instanceof SafetyBackupError).toBe(true);
    expect((err as SafetyBackupError).code).toBe('failed');
    expect((err as SafetyBackupError).message.includes(msg)).toBe(true);
  });

  it('স্টোরেজ অনুমতি না থাকলে SafetyBackupError (no-access)', async () => {
    const { deps } = makeDeps({ results: [{ status: 'no-access' }] });
    const err = await catchError(ensureSafetyBackupWith(deps, 'before-restore-replace'));
    expect(isSafetyBackupError(err)).toBe(true);
    expect((err as SafetyBackupError).code).toBe('no-access');
  });

  it('জোর-ব্যাকআপে "skipped" এলে (আসার কথা নয়) নিরাপদ দিকে কাজ আটকায়', async () => {
    const { deps } = makeDeps({ results: [{ status: 'skipped' }] });
    const err = await catchError(ensureSafetyBackupWith(deps, 'before-restore-replace'));
    expect(isSafetyBackupError(err)).toBe(true);
    expect((err as SafetyBackupError).code).toBe('failed');
  });

  it('আরেকটি ব্যাকআপ চললে অপেক্ষা করে আবার চেষ্টা করে, তারপর নিজেরটা নেয়', async () => {
    const { deps, calls, sleepCount } = makeDeps({
      results: [{ status: 'busy' }, { status: 'busy' }, { status: 'done', folder: 'f2' }],
    });
    const out = await ensureSafetyBackupWith(deps, 'before-restore-replace');
    expect(out).toEqual({ kind: 'done', folder: 'f2' });
    expect(calls.length).toBe(3);
    expect(sleepCount()).toBe(2);
  });

  it('অনেকক্ষণ busy থাকলে হাল ছেড়ে SafetyBackupError (busy)', async () => {
    const { deps, calls } = makeDeps({ results: [{ status: 'busy' }] });
    const err = await catchError(ensureSafetyBackupWith(deps, 'before-restore-replace'));
    expect(isSafetyBackupError(err)).toBe(true);
    expect((err as SafetyBackupError).code).toBe('busy');
    expect(calls.length).toBe(BUSY_MAX_TRIES);
  });
});
