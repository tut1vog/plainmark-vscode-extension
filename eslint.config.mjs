import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // INV-HOST-1: everything under src/ is bundled into a host or webview
    // target, none of which can resolve Node built-ins on the Web. The
    // browser-target esbuild bundle (`pnpm run build`) already fails on these;
    // this lints them before a build runs. Tests run under vitest and may use them.
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['fs', 'path', 'child_process', 'os', 'crypto', 'stream', 'http', 'https', 'net', 'dns']
            .flatMap((m) => [m, `node:${m}`])
            .map((name) => ({
              name,
              message: 'INV-HOST-1: no Node built-ins in bundled source (host, shared, or webview).',
            })),
        },
      ],
    },
  },
  {
    // Build and generator scripts run under Node; declare the globals they use.
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly', URL: 'readonly' },
    },
  },
  {
    // A focused test would turn every other test in its tier green-by-omission.
    files: ['src/**/*.test.ts', 'tests/**/*.{test,spec}.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name='only'][callee.object.name=/^(describe|it|test)$/]",
          message: 'Focused tests (.only) must not reach main.',
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
