import { useEffect, useRef } from 'react';
import { useNavigation } from './navigation';

/**
 * Android Back বাটন চাপলে খোলা ডায়ালগ/মোডাল নিজে বন্ধ হবে (নিচের স্ক্রিন পিছিয়ে যাবে না)।
 *
 * - active=true থাকা অবস্থায় হ্যান্ডলার নিবন্ধিত থাকে; যেটা সবার শেষে খুলেছে সেটাই আগে সাড়া দেয়
 *   (ডায়ালগের ওপর ডায়ালগ খুললে ওপরেরটা আগে বন্ধ হয়)।
 * - onBack বদলালেও হ্যান্ডলারের অবস্থান বদলায় না (ref ব্যবহার), তাই ক্রম ঠিক থাকে।
 * - onBack যদি false ফেরত দেয়, Back-টা নিচের হ্যান্ডলারে চলে যায়।
 * - ব্লক অবস্থা (ধাপ ৩, সিঙ্ক চলার সময়): onBack কিছু না করে true/undefined ফেরত দিলে Back-টা খরচ হয়ে যায়,
 *   কিছুই ঘটে না, নিচের স্ক্রিনও পিছোয় না। (SyncPreviewDialog 'running' অবস্থায় এটাই করে।)
 */
export function useBackClose(active: boolean, onBack: () => boolean | void): void {
  const { registerBackHandler } = useNavigation();
  const cbRef = useRef(onBack);
  cbRef.current = onBack;

  useEffect(() => {
    if (!active) return;
    return registerBackHandler(() => cbRef.current() !== false);
  }, [active, registerBackHandler]);
}
