declare global {
  interface Window {
    __plainmark_mathjax?: { url: string; nonce: string };
  }
}

// Correct only for the single production webview / single EditorView realm; a second realm would share this one-shot load promise.
let mathjax_load_promise: Promise<void> | null = null;

export function mathjax_ready(): boolean {
  return !!window.MathJax?.tex2chtmlPromise;
}

// True when a typeset can still land: bundle ready, load in flight, or the
// host bootstrap is available to start one. Widgets show the pending style in
// any of these states and fall back to raw source only when this is false.
export function mathjax_loadable(): boolean {
  return mathjax_ready() || mathjax_load_promise !== null || !!window.__plainmark_mathjax;
}

// dist/mathjax.js (1.9 MB) is injected on first math encounter — math-free docs never load it.
export function load_mathjax(): Promise<void> {
  if (mathjax_load_promise) return mathjax_load_promise;
  const promise = new Promise<void>((resolve, reject) => {
    if (mathjax_ready()) {
      resolve();
      return;
    }
    const boot = window.__plainmark_mathjax;
    if (!boot) {
      reject(new Error('mathjax bootstrap missing'));
      return;
    }
    const script = document.createElement('script');
    script.nonce = boot.nonce;
    script.src = boot.url;
    script.addEventListener('load', () => {
      if (mathjax_ready()) resolve();
      else reject(new Error('mathjax bundle exposed no API'));
    });
    script.addEventListener('error', () => {
      script.remove();
      reject(new Error('mathjax bundle failed to load'));
    });
    document.head.appendChild(script);
  });
  mathjax_load_promise = promise;
  // a transient load failure must not poison the cache — clear so the next schedule retries
  promise.catch(() => {
    mathjax_load_promise = null;
  });
  return promise;
}
