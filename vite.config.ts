import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {readFileSync} from 'fs';
import {defineConfig} from 'vite';

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));
// CI sets BUILD_NUMBER (GitHub run number); local builds show "dev".
const buildNumber = process.env.BUILD_NUMBER || 'dev';
const buildDate = new Date().toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: 'numeric'});

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __BUILD_NUMBER__: JSON.stringify(buildNumber),
      __BUILD_DATE__: JSON.stringify(buildDate),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
