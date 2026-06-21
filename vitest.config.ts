import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // tests/integration/electron is Mocha-driven, loaded by
    // @vscode/test-electron — its test files use Mocha's suite/test globals,
    // not vitest's describe/it.
    exclude: ['**/node_modules/**', 'tests/integration/**'],
    environment: 'node',
    passWithNoTests: true,
  },
});
