/**
 * ধাপ ৫খ - অ্যাপে প্রশ্ন/প্রশ্নপত্র লেখার ফর্ম (এডিটর) খোলা আছে কি না। খোলা থাকলে অটো সিঙ্ক অপেক্ষা করে,
 * কারণ সিঙ্ক উইন্ডো হঠাৎ উঠে লেখার মাঝখানে আটকে দিত। খাঁটি কোড (React নেই)।
 */
let open = 0;

export function acquireEditor(): () => void {
  open++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    open = Math.max(0, open - 1);
  };
}

export function editorsOpenCount(): number {
  return open;
}

/** এডিটর সব বন্ধ না হওয়া পর্যন্ত অপেক্ষা; থামাতে বললে (isStopped) false */
export async function waitForEditorsClosed(
  isStopped: () => boolean,
  pollMs = 1500,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
): Promise<boolean> {
  while (open > 0) {
    if (isStopped()) return false;
    await sleep(pollMs);
  }
  return !isStopped();
}
