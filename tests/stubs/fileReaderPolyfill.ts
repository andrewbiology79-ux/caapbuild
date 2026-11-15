/**
 * যাচাই-পরিকল্পনা ধাপ ৩ — Node-এ FileReader নেই, কিন্তু src/utils/fileExport.ts-এর blobToBase64 সেটা ব্যবহার করে
 * (writer.ts ছবি লেখার সময় ডাকে)। এই ছোট বদলি readAsDataURL-টুকু দেয়; আসল ব্রাউজারের মতোই
 * "data:<mime>;base64,<...>" ফেরত দেয়। শুধু আগে থেকে না থাকলে বসে।
 */
class NodeFileReader {
  result: string | null = null;
  onloadend: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;

  readAsDataURL(blob: Blob): void {
    blob
      .arrayBuffer()
      .then((buf) => {
        let bin = '';
        for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
        const b64 = btoa(bin);
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${b64}`;
        this.onloadend?.();
      })
      .catch((e) => this.onerror?.(e));
  }
}

if (typeof (globalThis as any).FileReader === 'undefined') {
  (globalThis as any).FileReader = NodeFileReader;
}

export {};
