// Mocha setup module — must be imported BEFORE any `*.test.ts` file in
// the bundle. The browser build of mocha (`mocha/mocha.js`) defines the
// `mocha` global; `mocha.setup()` then installs the TDD `suite` / `test`
// globals on `globalThis`. If the test files import before this runs,
// their top-level `suite('...')` calls hit a ReferenceError.
//
// Esbuild evaluates ESM imports in dependency order, top-down, so as
// long as the entry file imports this module before its test imports,
// the globals are in place when the test bodies evaluate.

import 'mocha/mocha.js';

declare const mocha: {
  setup(opts: Record<string, unknown>): void;
};

mocha.setup({ ui: 'tdd', reporter: undefined });
