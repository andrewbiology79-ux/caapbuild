/**
 * One sync job at a time (writing app -> folders and scanning folders -> app never overlap).
 *
 * ধাপ ২.৫ (re-entrant লক): বড় কাজ (ইমপোর্ট / রিস্টোর) ডাটাবেস লেখা ও ফোল্ডার পুনর্গঠন পুরোটা একটাই লকের
 * ভেতরে করে। ভেতরের ফাংশনগুলো (flushAllWrites, rebuildFolders ...) আবার লক নিতে গেলে আটকে যেত (deadlock) -
 * তাই লক-ধারক নিজের "টোকেন" ভেতরের ফাংশনে পাঠায়; টোকেন থাকলে ওই ফাংশন নতুন করে লক নেয় না, সরাসরি চলে।
 * টোকেন না থাকলে আগের মতোই লাইনে দাঁড়ায়। (async কোডে "এখন লক ধরা আছে কি" বলে একটা সাধারণ চিহ্ন রাখা চলে
 * না - তখন অন্য কাজও ভুল করে ঢুকে পড়ত; তাই টোকেন স্পষ্ট করে পাঠানো হয়।)
 */
export interface SyncLockToken {
  readonly held: true;
}

let chain: Promise<unknown> = Promise.resolve();

export function withSyncLock<T>(fn: (token: SyncLockToken) => Promise<T>, held?: SyncLockToken): Promise<T> {
  // the caller already holds the lock -> run right away (no queueing, no deadlock)
  if (held) return fn(held);
  const token: SyncLockToken = { held: true };
  const run = chain.then(
    () => fn(token),
    () => fn(token)
  );
  chain = run.catch(() => undefined);
  return run;
}
