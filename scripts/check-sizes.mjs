import { statSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const root = fileURLToPath(new URL('..', import.meta.url));

// All bundle-size caps retired — this is report-only.
const reportOnly = [
  { file: 'dist/extension.web.cjs', label: 'extension.web.cjs' },
  { file: 'dist/webview.js', label: 'webview.js (excl. MathJax)' },
  { file: 'dist/mathjax.js', label: 'MathJax bundle' },
  { file: 'dist/mermaid.js', label: 'Mermaid bundle' },
];

for (const { file, label } of reportOnly) {
  const path = join(root, file);
  try {
    const size = statSync(path).size;
    const kb = (size / 1024).toFixed(1);
    console.log(`[check-sizes] INFO  ${label}: ${kb} KB`);
  } catch {
    // not built yet; fine
  }
}
