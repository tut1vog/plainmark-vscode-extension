// One chokepoint for the `[namespace]` log prefixes that were previously
// hand-typed at every call site. `debug` is gated behind the runtime
// `__PLAINMARK_DEBUG__` flag so dev/smoke (build:dev) builds stay quiet unless
// explicitly enabled; `warn`/`error` always emit. Prod (build) additionally
// tree-shakes console.log/warn via esbuild `pure:`, leaving only console.error.

export interface Logger {
  // function args are thunks evaluated only when debug is enabled, so call
  // sites can defer expensive payloads (e.g. full-doc reads)
  debug(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

// Flip `globalThis.__PLAINMARK_DEBUG__ = true` (e.g. from the webview DevTools)
// to surface debug output in a dev/smoke build.
function debug_enabled(): boolean {
  return (globalThis as { __PLAINMARK_DEBUG__?: unknown }).__PLAINMARK_DEBUG__ === true;
}

export function create_logger(namespace: string): Logger {
  const tag = `[${namespace}]`;
  return {
    debug(...args: unknown[]): void {
      if (!debug_enabled()) return;
      console.log(tag, ...args.map((a) => (typeof a === 'function' ? (a as () => unknown)() : a)));
    },
    warn(...args: unknown[]): void {
      console.warn(tag, ...args);
    },
    error(...args: unknown[]): void {
      console.error(tag, ...args);
    },
  };
}
