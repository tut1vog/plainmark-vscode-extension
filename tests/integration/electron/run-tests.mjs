// Entrypoint for the @vscode/test-electron host smoke.
//
// Boots a real VS Code Desktop instance with this extension loaded and
// hands off to `./suite/index.cjs` (compiled by esbuild into
// `dist/integration/electron/suite/index.cjs`). The Mocha suite there
// drives the three host-side assertions: openWith → isDirty=false;
// external applyEdit → isDirty=true + getText() matches; workbench undo →
// getText() matches pre-edit.

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { runTests } from '@vscode/test-electron';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repo_root = resolve(__dirname, '../../..');
const extension_development_path = repo_root;
const extension_tests_path = resolve(repo_root, 'dist/integration/electron/suite/index.cjs');

try {
  await runTests({
    extensionDevelopmentPath: extension_development_path,
    extensionTestsPath: extension_tests_path,
    launchArgs: ['--disable-extensions', '--disable-workspace-trust'],
  });
} catch (err) {
  console.error('Failed to run host smoke tests:', err);
  process.exit(1);
}
