/** SHA-256 (hex) of a text. Returns undefined when the platform has no crypto.subtle (the caller then skips hash checks). */
export async function sha256Hex(text: string): Promise<string | undefined> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return undefined;
  }
}

/**
 * ধাপ ২.২: ফাইলের mtime/size বদলেছে কিন্তু লেখা হুবহু আগের মতো (যেমন ক্লাউড সিঙ্ক বা ফাইল ম্যানেজার ফাইল
 * "ছুঁয়ে" দিল) - তখন অ্যাপে আবার প্রয়োগ করার দরকার নেই। দুটো হ্যাশ থাকলে ও মিললেই true।
 */
export function sameContent(storedSha: string | undefined, fileSha: string | undefined): boolean {
  return !!storedSha && !!fileSha && storedSha === fileSha;
}
