// Compile an integration suite into the CJS shape its VS Code host expects.
//
//   node scripts/build-integration-tests.mjs desktop
//     @vscode/test-electron suite → dist/integration/electron/suite/*.cjs
//     (tests/integration/electron/run-tests.mjs points extensionTestsPath at index.cjs)
//     Also rebuilds dist/extension.cjs with PLAINMARK_TEST_HOOK on, so the
//     message-injection seam the suite drives exists in the host under test
//     (`pnpm run build` compiles it out — run this after, never before, a build).
//   node scripts/build-integration-tests.mjs web
//     @vscode/test-web suite → dist/integration/web/suite/index.cjs, loaded by the
//     workbench from /static/devextensions/dist/integration/web/suite/index.cjs
//
// Output extension MUST be `.cjs` — the web extension host's `_isESM` loader
// (vscode/src/vs/workbench/api/common/extHostExtensionService.ts) picks ESM
// when the host extension's `package.json` declares `"type": "module"` AND the
// test path does not end in `.cjs`. Our package.json is type=module (the build
// scripts and vitest config are ESM), so the test bundle has to opt out by
// extension; the electron loader accepts `.cjs` too.

import * as esbuild from 'esbuild';
import { glob } from 'glob';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repo_root = resolve(__dirname, '..');

const targets = {
  desktop: {
    suite_dir: 'tests/integration/electron/suite',
    out_dir: 'dist/integration/electron/suite',
    platform: 'node',
    target: 'node22',
    // every suite file is an entry: the electron runner globs the compiled suite
    all_files: true,
    external: ['vscode', 'mocha', 'glob'],
    host_entry: { entryPoints: ['src/extension.ts'], outfile: 'dist/extension.cjs' },
  },
  web: {
    suite_dir: 'tests/integration/web/suite',
    out_dir: 'dist/integration/web/suite',
    platform: 'browser',
    target: 'es2022',
    all_files: false,
    external: ['vscode'],
  },
};

const name = process.argv[2];
const target = targets[name];
if (!target) {
  console.error(`[build-integration-tests] usage: node scripts/build-integration-tests.mjs <${Object.keys(targets).join('|')}>`);
  process.exit(1);
}

const suite_dir = resolve(repo_root, target.suite_dir);
const out_dir = resolve(repo_root, target.out_dir);
const entries = target.all_files ? await glob('**/*.ts', { cwd: suite_dir }) : ['index.ts'];
if (entries.length === 0) {
  console.error('[build-integration-tests] no .ts files found under', suite_dir);
  process.exit(1);
}

await esbuild.build({
  entryPoints: entries.map((rel) => resolve(suite_dir, rel)),
  bundle: true,
  platform: target.platform,
  format: 'cjs',
  target: target.target,
  outdir: out_dir,
  outExtension: { '.js': '.cjs' },
  external: target.external,
  sourcemap: true,
});

if (target.host_entry) {
  await esbuild.build({
    ...target.host_entry,
    absWorkingDir: repo_root,
    bundle: true,
    platform: target.platform,
    format: 'cjs',
    target: target.target,
    external: ['vscode'],
    define: { PLAINMARK_TEST_HOOK: 'true' },
  });
  console.log(`[build-integration-tests] ${name}: rebuilt ${target.host_entry.outfile} with the test seam`);
}

console.log(`[build-integration-tests] ${name}: built ${entries.length} file(s) → ${out_dir}`);
