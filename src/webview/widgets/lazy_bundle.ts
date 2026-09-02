export interface LazyBundle {
  load(): Promise<void>;
  // True when a render can still land: API ready, load in flight, or the host
  // bootstrap is available to start one and the attempt cap is not spent.
  loadable(): boolean;
}

export interface LazyBundleSpec {
  name: string;
  ready(): boolean;
  boot(): { url: string; nonce: string } | undefined;
}

// Script injections that failed; past the cap the rejected promise stays cached
// so a persistent failure stops re-injecting a <script> on every update.
const MAX_SCRIPT_ATTEMPTS = 3;

// One-shot lazy loader for a nonce'd bundle injected on first encounter
// (MathJax, Mermaid). Correct only for the single production webview realm;
// a second realm would share the one-shot promise.
export function create_lazy_bundle(spec: LazyBundleSpec): LazyBundle {
  let load_promise: Promise<void> | null = null;
  let script_failures = 0;

  function load(): Promise<void> {
    if (spec.ready()) return Promise.resolve();
    if (load_promise) return load_promise;
    let injected = false;
    const promise = new Promise<void>((resolve, reject) => {
      const boot = spec.boot();
      if (!boot) {
        reject(new Error(`${spec.name} bootstrap missing`));
        return;
      }
      const script = document.createElement('script');
      script.nonce = boot.nonce;
      script.src = boot.url;
      script.addEventListener('load', () => {
        if (spec.ready()) resolve();
        else reject(new Error(`${spec.name} bundle exposed no API`));
      });
      script.addEventListener('error', () => {
        script.remove();
        reject(new Error(`${spec.name} bundle failed to load`));
      });
      document.head.appendChild(script);
      injected = true;
    });
    load_promise = promise;
    // a transient load failure must not poison the cache — clear so the next schedule retries
    promise.catch(() => {
      if (injected) script_failures++;
      if (script_failures < MAX_SCRIPT_ATTEMPTS) load_promise = null;
    });
    return promise;
  }

  function loadable(): boolean {
    if (spec.ready()) return true;
    if (script_failures >= MAX_SCRIPT_ATTEMPTS) return false;
    return load_promise !== null || !!spec.boot();
  }

  return { load, loadable };
}
