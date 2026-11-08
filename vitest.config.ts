import path from 'path';
import {defineConfig} from 'vitest/config';

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
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
});
