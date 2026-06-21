// Entrypoint for the @vscode/test-web activation smoke (T28.8). Boots a
// Playwright Chromium pointed at a vscode.dev-style workbench server with
// this extension loaded, hands off to `dist/integration/web/suite/index.cjs`
// (built by `scripts/build-integration-tests-web.mjs`). The Mocha suite
// there runs three activation-side assertions.

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { runTests } from '@vscode/test-web';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repo_root = resolve(__dirname, '../../..');

try {
  await runTests({
    browserType: 'chromium',
    headless: true,
    extensionDevelopmentPath: repo_root,
    extensionTestsPath: resolve(repo_root, 'dist/integration/web/suite/index.cjs'),
  });
} catch (err) {
  console.error('Failed to run web smoke tests:', err);
  process.exit(1);
}
