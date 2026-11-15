/**
 * সেভ-গার্ড (ডবল-সেভ ঠেকানো — যাচাই-পরিকল্পনা সমস্যা ৪)।
 * প্রশ্ন সেভের শুরুতে ডুপ্লিকেট-চেক (await) চলার সময় loading চালু হয় না, তখন আবার ✓ চাপলে দুটো সেভ চলে
 * আর নতুন প্রশ্নে (id নেই) দুই সেট উদ্দীপক + প্রশ্ন তৈরি হতো। গার্ড সেভ শুরুর মুহূর্তেই (await-এর আগে) তালা দেয়।
 * ফর্মে useRef-এ রাখা হয়, তাই রিরেন্ডারের মাঝেও একই তালা থাকে।
 */
export interface SaveGuard {
  /** তালা দেওয়া থাকলে true */
  isBusy(): boolean;
  /** তালা পাওয়া গেলে true (এবং তালা দেওয়া হলো); আগে থেকে দেওয়া থাকলে false */
  tryEnter(): boolean;
  /** তালা খোলা */
  leave(): void;
}

export function createSaveGuard(): SaveGuard {
  let busy = false;
  return {
    isBusy: () => busy,
    tryEnter() {
      if (busy) return false;
      busy = true;
      return true;
    },
    leave() {
      busy = false;
    },
  };
}
