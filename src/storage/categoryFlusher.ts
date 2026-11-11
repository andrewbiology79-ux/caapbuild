import type { CategoryQueue, CategoryWork } from './categoryQueue';

/**
 * অংশ ১খ-২খ (প্রথম রাউন্ড) - ক্যাটেগরির অটো লেখার চালক (খাঁটি কোড: সব IO বাইরে থেকে দেওয়া হয়, তাই টেস্ট করা যায়)।
 *
 *   schedule()  - বদল জমার পর ডাকা হয়; ~০.৮ সেকেন্ড থামলে flushNow() চলে (debounce)
 *   flushNow()  - ফর্ম খোলা থাকলে অপেক্ষা -> "অটো সিঙ্ক হচ্ছে…" -> সারি থেকে কাজ তুলে লেখা -> শেষ/ত্রুটি
 *                 ব্যর্থ হলে কাজ সারিতে ফেরে (পরের বদলে আবার চেষ্টা)। একসাথে একটাই লেখা চলে; চলার সময় নতুন বদল এলে শেষে আবার একবার।
 */

export interface FlushOutcome {
  /** ফোল্ডারে সত্যিই কিছু বদলেছে (লেখা/সরানো) */
  changed: boolean;
  /** ব্যবহারকারীকে জানানোর মতো সতর্কতা/কারণ (খালি = সব ঠিক) */
  messages: string[];
}

export interface FlusherBanner {
  isRunning(): boolean;
  start(): void;
  finish(changed: boolean): void;
  fail(): void;
}

export interface FlusherDeps {
  queue: CategoryQueue;
  /** ফর্ম/এডিটর সব বন্ধ না হওয়া পর্যন্ত অপেক্ষা; থামাতে বললে (isStopped) false */
  waitEditorsClosed: (isStopped: () => boolean) => Promise<boolean>;
  /** তুলে নেওয়া কাজ থেকে বাড়তি প্রশ্নের id খোঁজা (উদ্দীপক/ছবির বদল -> প্রশ্ন); ব্যর্থ হলে exception */
  expandContent: (work: CategoryWork) => Promise<string[]>;
  /** আসল লেখা */
  flush: (work: CategoryWork, extraQuestionIds: string[]) => Promise<FlushOutcome>;
  banner: FlusherBanner;
  /** সতর্কতা/কারণ দেখানো (টোস্ট) */
  onMessages: (messages: string[]) => void;
  /** লেখাই ব্যর্থ হলে (exception) */
  onError: (message: string) => void;
  debounceMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface CategoryFlusher {
  schedule(): void;
  flushNow(): Promise<void>;
  /** অপেক্ষারত টাইমার বাতিল ও অপেক্ষা থামানো (জমা কাজ সারিতেই থাকে) */
  stop(): void;
  isFlushing(): boolean;
}

export const CATEGORY_DEBOUNCE_MS = 800;

export function createCategoryFlusher(deps: FlusherDeps): CategoryFlusher {
  const debounceMs = deps.debounceMs ?? CATEGORY_DEBOUNCE_MS;
  const setT = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearT = deps.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let timer: unknown = null;
  let flushing: Promise<void> | null = null;
  let rerun = false;
  let stopped = false;

  const clear = () => {
    if (timer !== null) clearT(timer);
    timer = null;
  };

  async function runOnce(): Promise<void> {
    if (!deps.queue.hasPending()) return;

    // লেখার ফর্ম খোলা থাকলে অপেক্ষা (সিঙ্ক উইন্ডো/লক লেখার মাঝখানে আটকাত)
    const proceed = await deps.waitEditorsClosed(() => stopped);
    if (!proceed || stopped) return; // জমা কাজ সারিতেই থাকে
    if (!deps.queue.hasPending()) return;

    const showBanner = !deps.banner.isRunning(); // অন্য অটো সিঙ্ক চললে দ্বিতীয়বার নয়
    if (showBanner) deps.banner.start();

    const work = deps.queue.take();
    try {
      const extra = await deps.expandContent(work);
      const outcome = await deps.flush(work, extra);
      if (outcome.messages.length) deps.onMessages(outcome.messages);
      if (showBanner) deps.banner.finish(outcome.changed);
    } catch (err: any) {
      deps.queue.restore(work); // পরের বদলে আবার চেষ্টা
      deps.onError(err?.message || String(err));
      if (showBanner) deps.banner.fail();
      rerun = false; // ব্যর্থ হলে সাথে সাথে আবার ঘুরব না
    }
  }

  function flushNow(): Promise<void> {
    clear();
    if (flushing) {
      rerun = true;
      return flushing;
    }
    flushing = (async () => {
      try {
        do {
          rerun = false;
          await runOnce();
        } while (rerun && !stopped && deps.queue.hasPending());
      } finally {
        flushing = null;
      }
    })();
    return flushing;
  }

  return {
    schedule() {
      stopped = false;
      clear();
      timer = setT(() => {
        timer = null;
        void flushNow();
      }, debounceMs);
    },
    flushNow,
    stop() {
      stopped = true;
      clear();
    },
    isFlushing: () => flushing !== null,
  };
}

/**
 * একই সতর্কতা বারবার না দেখানোর ছোট ফিল্টার (খাঁটি; সময় বাইরে থেকে দেওয়া যায়)।
 * যেমন মোছা ফোল্ডারের ক্যাটেগরিতে প্রতিটা বদলে একই "ফোল্ডার নেই" বার্তা টোস্টে ঝরত।
 * windowMs-এর মধ্যে একই বার্তা আবার এলে বাদ; নতুন/অন্য বার্তা সব সময় যায়।
 */
export function createMessageThrottle(windowMs = 60_000, now: () => number = () => Date.now()): (messages: string[]) => string[] {
  const seen = new Map<string, number>();
  return (messages) => {
    const t = now();
    for (const [m, at] of Array.from(seen)) if (t - at >= windowMs) seen.delete(m);
    const out: string[] = [];
    for (const m of messages) {
      if (seen.has(m)) continue;
      seen.set(m, t);
      out.push(m);
    }
    return out;
  };
}
