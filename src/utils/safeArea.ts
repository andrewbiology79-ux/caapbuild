/**
 * Android নতুন ভার্সনে (edge-to-edge) WebView-তে env(safe-area-inset-*) প্রায়ই 0 আসে,
 * ফলে হেডার স্ট্যাটাস বারের নিচে চলে যায়। MainActivity আসল মান পাঠায়;
 * এখানে সেটা --safe-top / --safe-bottom CSS ভ্যারিয়েবলে বসানো হয়।
 * ব্রাউজারে (নেটিভ নয়) ভ্যারিয়েবল সেট হয় না, তাই env() ফলব্যাক কাজ করে।
 */
export function initSafeArea(): void {
  const root = document.documentElement;
  const w = window as unknown as {
    QbInsets?: { top(): number; bottom(): number; setDark?(d: boolean): void };
    __qbSetInsets?: (t: number, b: number) => void;
  };
  const set = (t: number, b: number) => {
    root.style.setProperty('--safe-top', `${Math.max(0, t)}px`);
    root.style.setProperty('--safe-bottom', `${Math.max(0, b)}px`);
  };
  w.__qbSetInsets = set;
  try {
    if (w.QbInsets) set(w.QbInsets.top(), w.QbInsets.bottom());
  } catch {
    /* ignore */
  }

  // নেভিগেশন বারের আইকন/রঙ অ্যাপের ডার্ক/লাইট থিমের সাথে মেলানো
  const syncNavTheme = () => {
    try {
      w.QbInsets?.setDark?.(root.classList.contains('dark'));
    } catch {
      /* ignore */
    }
  };
  syncNavTheme();
  new MutationObserver(syncNavTheme).observe(root, { attributes: true, attributeFilter: ['class'] });
}
