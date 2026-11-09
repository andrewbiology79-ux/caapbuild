import { describe, it, expect } from 'vitest';
import { withSyncLock } from '../src/storage/syncLock';

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

describe('syncLock (ধাপ ২.৫)', () => {
  it('jobs run one after another, never together', async () => {
    const log: string[] = [];
    const a = withSyncLock(async () => {
      log.push('a-start');
      await tick(20);
      log.push('a-end');
    });
    const b = withSyncLock(async () => {
      log.push('b-start');
      await tick(1);
      log.push('b-end');
    });
    await Promise.all([a, b]);
    expect(log).toEqual(['a-start', 'a-end', 'b-start', 'b-end']);
  });

  it('a holder can pass its token inward - no deadlock', async () => {
    const log: string[] = [];
    const result = await withSyncLock(async (held) => {
      log.push('outer');
      // inner call with the token runs at once (without the token this would wait for itself forever)
      const inner = await withSyncLock(async () => {
        log.push('inner');
        return 42;
      }, held);
      return inner + 1;
    });
    expect(result).toBe(43);
    expect(log).toEqual(['outer', 'inner']);
  });

  it('an outsider (no token) still waits until the holder is done', async () => {
    const log: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const holder = withSyncLock(async (held) => {
      log.push('holder-start');
      await gate;
      await withSyncLock(async () => {
        log.push('holder-inner');
      }, held);
      log.push('holder-end');
    });
    const outsider = withSyncLock(async () => {
      log.push('outsider');
    });
    await tick(20);
    expect(log).toEqual(['holder-start']); // the outsider has not started
    release();
    await Promise.all([holder, outsider]);
    expect(log).toEqual(['holder-start', 'holder-inner', 'holder-end', 'outsider']);
  });

  it('a failing job does not block the next one, and its error reaches its own caller', async () => {
    const bad = withSyncLock(async () => {
      throw new Error('boom');
    });
    await expect(bad).rejects.toThrow('boom');
    await expect(withSyncLock(async () => 'ok')).resolves.toBe('ok');
  });

  it('an error inside the holder still releases the lock', async () => {
    await expect(
      withSyncLock(async (held) => {
        await withSyncLock(async () => {
          throw new Error('inner-fail');
        }, held);
      })
    ).rejects.toThrow('inner-fail');
    await expect(withSyncLock(async () => 7)).resolves.toBe(7);
  });
});
