// Compile the @vscode/test-web integration suite (T28.8) into a browser-
// loadable bundle. `tests/integration/web/run-tests.mjs` points
// extensionTestsPath at `dist/integration/web/suite/index.cjs`; the workbench
// loads it from `/static/devextensions/dist/integration/web/suite/index.cjs`.

import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repo_root = resolve(__dirname, '..');

// Output extension MUST be `.cjs` — the web extension host's `_isESM`
// loader (vscode/src/vs/workbench/api/common/extHostExtensionService.ts)
// picks ESM when the host extension's `package.json` declares
// `"type": "module"` AND the test path does not end in `.cjs`. Our
// package.json is type=module (the build scripts and vitest config are
// ESM), so the test bundle has to opt out by extension.
await esbuild.build({
  entryPoints: [resolve(repo_root, 'tests/integration/web/suite/index.ts')],
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2022',
  outfile: resolve(repo_root, 'dist/integration/web/suite/index.cjs'),
  external: ['vscode'],
  sourcemap: true,
});

console.log('[build-integration-tests-web] built → dist/integration/web/suite/index.cjs');
