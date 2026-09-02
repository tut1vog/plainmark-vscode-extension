import { create_lazy_bundle } from './lazy_bundle.js';

declare global {
  interface Window {
    __plainmark_mathjax?: { url: string; nonce: string };
  }
}

// dist/mathjax.js (1.9 MB) is injected on first math encounter — math-free docs never load it.
const bundle = create_lazy_bundle({
  name: 'mathjax',
  ready: () => !!window.MathJax?.tex2chtmlPromise,
  boot: () => window.__plainmark_mathjax,
});

export function load_mathjax(): Promise<void> {
  return bundle.load();
}

// True when a typeset can still land. Widgets show the pending style while
// this holds and fall back to raw source only when it is false.
export function mathjax_loadable(): boolean {
  return bundle.loadable();
}
