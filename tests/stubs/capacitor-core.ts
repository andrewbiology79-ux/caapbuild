// পরীক্ষায় ফোনের Capacitor লাগে না - খালি বদলি
export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' };
export const registerPlugin = () => ({});
