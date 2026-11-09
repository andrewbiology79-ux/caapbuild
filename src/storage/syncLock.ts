/** One sync job at a time (writing app -> folders and scanning folders -> app never overlap) */
let chain: Promise<unknown> = Promise.resolve();

export function withSyncLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}
