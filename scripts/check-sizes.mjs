import { statSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const root = fileURLToPath(new URL('..', import.meta.url));

// Generous ceilings: a regression that doubles a bundle fails, a release that
// grows a few percent does not. Dev builds are unminified, so the caps hold
// for both `build:dev` (pre-commit) and `build` (CI, release).
const caps = [
  { file: 'dist/extension.web.cjs', label: 'extension.web.cjs', max_kb: 256 },
  { file: 'dist/webview.js', label: 'webview.js (excl. MathJax)', max_kb: 5120 },
  { file: 'dist/mathjax.js', label: 'MathJax bundle', max_kb: 3072 },
  { file: 'dist/mermaid.js', label: 'Mermaid bundle', max_kb: 10240 },
];

// A bundle that is not built is skipped locally (pre-commit runs build:check
// without a build) but fails in CI, whose static job builds first — otherwise
// the check silently passes there by printing nothing.
const in_ci = !!process.env.CI;
let failed = false;

for (const { file, label, max_kb } of caps) {
  const path = join(root, file);
  let size;
  try {
    size = statSync(path).size;
  } catch {
    if (in_ci) {
      console.error(`[check-sizes] FAIL  ${label}: not built (${file})`);
      failed = true;
    } else {
      console.log(`[check-sizes] SKIP  ${label}: not built`);
    }
    continue;
  }
  const kb = size / 1024;
  if (kb > max_kb) {
    console.error(`[check-sizes] FAIL  ${label}: ${kb.toFixed(1)} KB exceeds the ${max_kb} KB cap`);
    failed = true;
  } else {
    console.log(`[check-sizes] OK    ${label}: ${kb.toFixed(1)} KB (cap ${max_kb} KB)`);
  }
}

if (failed) process.exit(1);
