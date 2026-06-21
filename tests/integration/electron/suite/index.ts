// Mocha bootstrap for the VS Code Desktop integration suite. Loaded by
// `@vscode/test-electron` via the `extensionTestsPath` option in
// `tests/integration/electron/run-tests.mjs`.
//
// The exports/declarations here are CJS-style (`module.exports.run`)
// because @vscode/test-electron's loader invokes `require(extensionTestsPath)`
// inside the extension host process; esbuild compiles this file to CJS so the
// loader sees the synchronous module shape it expects.

import Mocha from 'mocha';
import { glob } from 'glob';
import * as path from 'node:path';

export async function run(): Promise<void> {
  const mocha = new Mocha({
    // TDD UI (suite/test globals) — matches host-smoke.test.ts. BDD's
    // describe/it would leave `suite` undefined when Mocha loads the
    // compiled test file.
    ui: 'tdd',
    color: true,
    timeout: 20000,
  });

  const tests_root = path.resolve(__dirname);
  const files = await glob('**/*.test.cjs', { cwd: tests_root });
  for (const file of files) {
    mocha.addFile(path.resolve(tests_root, file));
  }

  return new Promise((resolve, reject) => {
    try {
      mocha.run((failures) => {
        if (failures > 0) reject(new Error(`${failures} tests failed`));
        else resolve();
      });
    } catch (err) {
      reject(err);
    }
  });
}
