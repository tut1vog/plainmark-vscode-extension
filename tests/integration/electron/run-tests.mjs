// Entrypoint for the @vscode/test-electron host smoke.
//
// Boots a real VS Code Desktop instance with this extension loaded and
// hands off to `./suite/index.cjs` (compiled by esbuild into
// `dist/integration/electron/suite/index.cjs`). The Mocha suite there
// drives the three host-side assertions: openWith → isDirty=false;
// external applyEdit → isDirty=true + getText() matches; INV-UNDO-2
// muzzle wiring intact (noop_undo inert, Ctrl+Z keybinding present).

import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runTests } from '@vscode/test-electron';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repo_root = resolve(__dirname, '../../..');
const extension_development_path = repo_root;
const extension_tests_path = resolve(repo_root, 'dist/integration/electron/suite/index.cjs');

// macOS caps AF_UNIX socket paths at ~104 bytes, and VS Code's main process
// creates its IPC socket inside the user-data dir. The default user-data dir
// (.vscode-test/user-data under this repo's deep path) pushes the socket path
// past the cap → `listen EINVAL` at boot before any test runs. A short
// tmpdir-based dir keeps the socket path well under the limit.
const user_data_dir = mkdtempSync(join(tmpdir(), 'pm-ud-'));

try {
  await runTests({
    extensionDevelopmentPath: extension_development_path,
    extensionTestsPath: extension_tests_path,
    launchArgs: [
      '--disable-extensions',
      '--disable-workspace-trust',
      '--user-data-dir',
      user_data_dir,
    ],
    // Arms the provider's test seam (PlainmarkEditorProvider test_hook_enabled)
    // for this run only, so host-write-path.test.ts can inject a synthetic
    // webview `update` into the real onDidReceiveMessage dispatch. The env var
    // is scoped to this spawned extension-host process; a shipped extension
    // never sees it, so the seam stays inert in production.
    extensionTestsEnv: { PLAINMARK_TEST_HOOK: '1' },
  });
} catch (err) {
  console.error('Failed to run host smoke tests:', err);
  process.exit(1);
}
