import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { ime_commit, ime_insert_text } from './tests/visual/commands/ime.js';

export default defineConfig({
  publicDir: 'node_modules/@mathjax/mathjax-newcm-font/chtml',
  optimizeDeps: {
    include: [
      '@codemirror/state',
      '@codemirror/view',
      '@codemirror/language',
      '@codemirror/commands',
      '@codemirror/lang-markdown',
      '@lezer/markdown',
      '@lezer/common',
    ],
  },
  test: {
    include: ['tests/visual/**/*.spec.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
    setupFiles: ['./tests/visual/console-sentinel.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
      headless: true,
      commands: { ime_commit, ime_insert_text },
    },
  },
});
