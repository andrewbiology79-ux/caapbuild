/**
 * ধাপ ২.১ - সিঙ্কের প্রগ্রেস হিসাব (খাঁটি কোড, কোনো ফাইল/ডেটাবেস IO নেই)।
 *
 * প্রিভিউ (syncPreview.ts) আর আসল সিঙ্ক (ধাপ ৫) একই SyncProgress টাইপ ও একই ProgressTracker ব্যবহার করে,
 * আর প্রগ্রেস উইন্ডো (SyncPreviewDialog) শুধু এটা দেখায়।
 *
 * নিয়ম:
 *  - done শুধু বাড়ে, পিছোয় না।
 *  - total কাজের মাঝখানে বাড়তে পারে (যেমন ফোল্ডার পড়ার পর জানা গেল ৮০টি data.json পড়তে হবে);
 *    তখন বার পিছোয় না, লাফায়ও না: যেখানে ছিল সেখান থেকে বাকি কাজের ওপর সমানভাবে ১০০%-এর দিকে এগোয়।
 *  - ১০০% দেখায় শুধু finish() ডাকার পর (কাজ সত্যিই শেষ হলে)।
 *  - কলব্যাক না দিলে (cb = undefined) কিছুই বদলায় না, আগের আচরণ একই থাকে।
 */

export type SyncPhase =
  | 'list' // ফোল্ডার তালিকা পড়া
  | 'snapshot' // অ্যাপের তথ্য নেওয়া
  | 'read' // data.json পড়া
  | 'compare' // তুলনা
  | 'folders' // ফোল্ডার তৈরি / নাম বদল / সরানো
  | 'data' // data.json লেখা
  | 'images' // ছবি কপি
  | 'conflicts' // কনফ্লিক্ট সরানো
  | 'finish'; // শেষ করা

export const PHASE_LABEL: Record<SyncPhase, string> = {
  list: 'ফোল্ডার তালিকা পড়া হচ্ছে',
  snapshot: 'অ্যাপের তথ্য নেওয়া হচ্ছে',
  read: 'data.json পড়া হচ্ছে',
  compare: 'তুলনা করা হচ্ছে',
  folders: 'ফোল্ডার তৈরি',
  data: 'data.json লেখা',
  images: 'ছবি কপি',
  conflicts: 'কনফ্লিক্ট সরানো',
  finish: 'শেষ করা হচ্ছে',
};

export interface SyncProgress {
  phase: SyncPhase;
  /** কাজের একক শেষ হলো (পিছোয় না) */
  done: number;
  /** মোট একক (কাজের মাঝে বাড়তে পারে, কখনো done-এর নিচে নামে না) */
  total: number;
  /** এখন কোন বিষয়/অধ্যায়/টাইপ নিয়ে কাজ চলছে */
  label?: string;
  /** বারের শতকরা, ০-১০০ (পিছোয় না) */
  percent: number;
  /** finish() ডাকা হয়েছে */
  finished: boolean;
}

export type ProgressCallback = (p: SyncProgress) => void;

export class ProgressTracker {
  private done = 0;
  private total: number;
  private phase: SyncPhase;
  private label: string | undefined;
  private pct = 0;
  private finished = false;
  /** শেষবার total বাড়ার মুহূর্তের done ও শতকরা: এখান থেকে বাকি কাজ সমানভাবে ১০০%-এ যায় */
  private anchorDone = 0;
  private anchorPct = 0;

  constructor(private readonly cb?: ProgressCallback, total = 0, phase: SyncPhase = 'list') {
    this.total = Math.max(0, Math.floor(total));
    this.phase = phase;
  }

  /** আরও কাজ জানা গেলে মোট বাড়ানো (কমানো যায় না) */
  addTotal(n: number): void {
    const add = Math.floor(n);
    if (!(add > 0) || this.finished) return;
    this.anchorPct = this.snapshot().percent; // total বদলানোর আগের শতকরা
    this.anchorDone = this.done;
    this.total += add;
    this.emit();
  }

  /** পর্যায় (ও চাইলে বর্তমান কাজের নাম) বদল, done বদলায় না */
  setPhase(phase: SyncPhase, label?: string): void {
    if (this.finished) return;
    this.phase = phase;
    this.label = label;
    this.emit();
  }

  /** n একক কাজ শেষ। phase/label দিলে সেটাও বদলায়। */
  step(n = 1, label?: string, phase?: SyncPhase): void {
    if (this.finished) return;
    const inc = Math.floor(n);
    if (inc > 0) {
      this.done += inc;
      if (this.done > this.total) this.total = this.done; // মোট কখনো done-এর নিচে নয়
    }
    if (phase) this.phase = phase;
    if (label !== undefined) this.label = label;
    this.emit();
  }

  /** কাজ সত্যিই শেষ - বার ১০০% */
  finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.done = this.total;
    this.pct = 100;
    this.phase = 'finish';
    this.label = undefined;
    this.emit();
  }

  snapshot(): SyncProgress {
    const remaining = this.total - this.anchorDone;
    let p = this.pct;
    if (!this.finished && remaining > 0) {
      const raw = this.anchorPct + ((100 - this.anchorPct) * (this.done - this.anchorDone)) / remaining;
      p = Math.max(this.pct, Math.min(99, Math.floor(raw)));
    }
    this.pct = this.finished ? 100 : p;
    return {
      phase: this.phase,
      done: this.done,
      total: this.total,
      label: this.label,
      percent: this.pct,
      finished: this.finished,
    };
  }

  private emit(): void {
    const snap = this.snapshot();
    if (!this.cb) return;
    try {
      this.cb(snap);
    } catch {
      /* প্রগ্রেস দেখানোর ভুলে আসল কাজ থামে না */
    }
  }
}
