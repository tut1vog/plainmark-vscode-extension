import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'scripts/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // INV-HOST-1: host + webview code must not import Node built-ins (the Web
    // target cannot resolve them). The browser-target esbuild bundle already
    // fails on these; this lints them before a build runs.
    files: ['src/host/**/*.ts', 'src/extension.ts', 'src/extension.web.ts', 'src/webview/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['fs', 'path', 'child_process', 'os', 'crypto', 'stream', 'http', 'https', 'net', 'dns']
            .flatMap((m) => [m, `node:${m}`])
            .map((name) => ({
              name,
              message: 'INV-HOST-1: no Node built-ins in host/webview code.',
            })),
        },
      ],
    },
  },
  {
    // CR-P9: all logging goes through src/log.ts (create_logger). Ban raw
    // console in src so the logger stays the single chokepoint; log.ts itself
    // and test files (which spy on console) are exempt.
    files: ['src/**/*.ts'],
    ignores: ['src/log.ts', 'src/**/*.test.ts'],
    rules: {
      'no-console': 'error',
    },
  },
);
