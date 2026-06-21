import * as esbuild from 'esbuild';

const isDev = process.argv.includes('--dev');
const isWatch = process.argv.includes('--watch');

const common = {
  bundle: true,
  minify: !isDev,
  // 'external': emit .map files without a sourceMappingURL comment. The vsix
  // excludes dist/**/*.map, so a comment is a dangling pointer the webview
  // tries to fetch — CSP (default-src 'none', no connect-src) blocks it and
  // logs a violation for every lazily injected bundle.
  sourcemap: isDev ? 'external' : false,
  pure: isDev ? [] : ['console.log', 'console.warn', 'console.info', 'console.debug', 'console.trace'],
};

const configs = [
  {
    ...common,
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.cjs',
    platform: 'node',
    format: 'cjs',
    external: ['vscode'],
    target: 'node22',
  },
  {
    ...common,
    entryPoints: ['src/extension.web.ts'],
    outfile: 'dist/extension.web.cjs',
    platform: 'browser',
    format: 'cjs',
    external: ['vscode'],
    target: 'es2022',
  },
  {
    ...common,
    entryPoints: ['src/webview/index.ts'],
    outfile: 'dist/webview.js',
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
  },
  {
    ...common,
    entryPoints: ['src/webview/mathjax-bundle.ts'],
    outfile: 'dist/mathjax.js',
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
  },
  {
    ...common,
    entryPoints: ['src/webview/mermaid-bundle.ts'],
    outfile: 'dist/mermaid.js',
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
  },
];

if (isWatch) {
  const contexts = await Promise.all(configs.map((c) => esbuild.context(c)));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  await import('./copy-fonts.mjs');
  console.log('[build] watching...');
} else {
  await Promise.all(configs.map((c) => esbuild.build(c)));
  await import('./copy-fonts.mjs');
}
