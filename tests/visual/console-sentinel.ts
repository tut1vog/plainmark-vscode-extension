// Console-error sentinel for the vitest-browser project.
//
// Patches `console.error` / `console.warn` and listens for `window.error` /
// `unhandledrejection` so any unexpected error-class output fails the test
// that produced it. Tests that deliberately exercise an error/warning path
// call `allow_console(pattern)` to whitelist noise for that test only.
//
// The browser harness evaluates this module twice — once as the vitest setup
// file, once through spec imports (the two resolve to different URLs). All
// mutable state lives on globalThis so a spec's allow_console reaches the
// instance whose afterEach throws; the hook-install guard keeps the second
// evaluation from double-patching the console.

import { afterEach, beforeEach } from 'vitest';

type Pattern = string | RegExp;
type Channel = 'error' | 'warn' | 'window.error' | 'unhandledrejection';

interface CapturedEntry {
  channel: Channel;
  text: string;
}

interface SentinelState {
  captured: CapturedEntry[];
  allowlist: Pattern[];
  hooks_installed: boolean;
}

const SENTINEL_KEY = '__plainmark_console_sentinel__';

function sentinel_state(): SentinelState {
  const g = globalThis as Record<string, unknown>;
  if (!g[SENTINEL_KEY]) {
    g[SENTINEL_KEY] = {
      captured: [],
      allowlist: [],
      hooks_installed: false,
    } satisfies SentinelState;
  }
  return g[SENTINEL_KEY] as SentinelState;
}

function stringify(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return `${a.name}: ${a.message}`;
      if (typeof a === 'string') return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
}

function matches_allow(state: SentinelState, text: string): boolean {
  return state.allowlist.some((p) =>
    typeof p === 'string' ? text.includes(p) : p.test(text),
  );
}

// Suppress a single expected error-class line for the current test. Idiomatic
// usage: call once at the top of the test, before the action that triggers
// the warning. The allowlist resets in beforeEach.
export function allow_console(pattern: Pattern): void {
  sentinel_state().allowlist.push(pattern);
}

// Snapshot of currently-captured error-class entries that are not matched by
// the allowlist. The fuzz tests poll this between actions so they can
// attribute a console.error to the action sequence that triggered it (the
// afterEach throw alone loses that context).
export function unexpected_console_snapshot(): ReadonlyArray<{ channel: Channel; text: string }> {
  const state = sentinel_state();
  return state.captured.filter((e) => !matches_allow(state, e.text));
}

const install_state = sentinel_state();
if (!install_state.hooks_installed) {
  install_state.hooks_installed = true;

  let original_error: typeof console.error | null = null;
  let original_warn: typeof console.warn | null = null;
  let on_window_error: ((ev: ErrorEvent) => void) | null = null;
  let on_unhandled_rejection: ((ev: PromiseRejectionEvent) => void) | null = null;

  beforeEach(() => {
    const state = sentinel_state();
    state.captured = [];
    state.allowlist = [];
    original_error = console.error;
    original_warn = console.warn;
    console.error = (...args: unknown[]) => {
      state.captured.push({ channel: 'error', text: stringify(args) });
      original_error!.apply(console, args);
    };
    console.warn = (...args: unknown[]) => {
      state.captured.push({ channel: 'warn', text: stringify(args) });
      original_warn!.apply(console, args);
    };
    on_window_error = (ev: ErrorEvent) => {
      const msg =
        ev.error instanceof Error
          ? `${ev.error.name}: ${ev.error.message}`
          : (ev.message ?? 'unknown');
      state.captured.push({ channel: 'window.error', text: msg });
    };
    on_unhandled_rejection = (ev: PromiseRejectionEvent) => {
      const reason = ev.reason;
      const msg = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason);
      state.captured.push({ channel: 'unhandledrejection', text: msg });
    };
    window.addEventListener('error', on_window_error);
    window.addEventListener('unhandledrejection', on_unhandled_rejection);
  });

  afterEach(() => {
    if (original_error) console.error = original_error;
    if (original_warn) console.warn = original_warn;
    if (on_window_error) window.removeEventListener('error', on_window_error);
    if (on_unhandled_rejection)
      window.removeEventListener('unhandledrejection', on_unhandled_rejection);
    original_error = null;
    original_warn = null;
    on_window_error = null;
    on_unhandled_rejection = null;

    const state = sentinel_state();
    const unexpected = state.captured.filter((e) => !matches_allow(state, e.text));
    if (unexpected.length > 0) {
      const lines = unexpected.map((e) => `  [${e.channel}] ${e.text}`).join('\n');
      throw new Error(`console-sentinel: unexpected error-class output:\n${lines}`);
    }
  });
}
