// Mocha bootstrap for the @vscode/test-web suite (T28.8). Loaded by the
// browser workbench at
// `/static/devextensions/dist/integration/web/suite/index.cjs`.
//
// The `./mocha-setup.js` import MUST precede every `*.test.ts` import:
// it loads mocha's browser build and calls `mocha.setup({ ui: 'tdd' })`,
// which installs the `suite` / `test` globals. Test files evaluate at
// import time and reference those globals at the top level — without
// the setup running first, the bundle dies with `ReferenceError: suite
// is not defined` before `run()` is ever called.

import './mocha-setup.js';
import './web-smoke.test.js';

declare const mocha: {
  run(cb: (failures: number) => void): void;
};

export function run(): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      mocha.run((failures) => {
        if (failures > 0) reject(new Error(`${failures} tests failed.`));
        else resolve();
      });
    } catch (err) {
      reject(err);
    }
  });
}
