import { cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = join(root, 'node_modules/@mathjax/mathjax-newcm-font/chtml/woff2');
const dst = join(root, 'dist/fonts');

await rm(dst, { recursive: true, force: true });
await cp(src, dst, { recursive: true });
console.log('[copy-fonts] copied WOFF2 from', src, 'to', dst);
