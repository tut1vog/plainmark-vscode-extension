// Compile the @vscode/test-electron integration suite (T28.7) into the CJS
// shape the VS Code extension host's loader expects. Output to
// `dist/integration/electron/suite/*.cjs`; `tests/integration/electron/run-tests.mjs`
// points `extensionTestsPath` at `dist/integration/electron/suite/index.cjs`.

import * as esbuild from 'esbuild';
import { glob } from 'glob';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repo_root = resolve(__dirname, '..');
const suite_dir = resolve(repo_root, 'tests/integration/electron/suite');
const out_dir = resolve(repo_root, 'dist/integration/electron/suite');

const entries = await glob('**/*.ts', { cwd: suite_dir });
if (entries.length === 0) {
  console.error('[build-integration-tests] no .ts files found under', suite_dir);
  process.exit(1);
}

const entryPoints = entries.map((rel) => resolve(suite_dir, rel));

await esbuild.build({
  entryPoints,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outdir: out_dir,
  outExtension: { '.js': '.cjs' },
  external: ['vscode', 'mocha', 'glob'],
  sourcemap: true,
});

console.log('[build-integration-tests] built', entries.length, 'files →', out_dir);
