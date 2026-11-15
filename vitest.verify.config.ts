import path from 'path';
import {defineConfig} from 'vitest/config';

// যাচাই-পরিকল্পনার টেস্ট (tests/verify-*.test.ts) — build-apk.yml-এ আলাদা, ফেল করলেও বিল্ড চলে ধাপে।
// আসল টেস্টের কনফিগের (vitest.config.ts) সাথে একই alias/setup; শুধু include আলাদা।
const stub = (name: string) => path.resolve(__dirname, 'tests/stubs', name);

export default defineConfig({
  resolve: {
    alias: {
      '@capacitor/core': stub('capacitor-core.ts'),
      '@capacitor/filesystem': stub('capacitor-filesystem.ts'),
      '@capacitor/app': stub('capacitor-app.ts'),
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/verify-*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
});
