import { Annotation, type StateEffect, Transaction, type TransactionSpec } from '@codemirror/state';
import type { EditorView, ViewUpdate } from '@codemirror/view';
import type { WebviewToHostMessage } from '../sync/protocol.js';
import { create_logger } from '../log.js';

export type {
  HostToWebviewMessage,
  WebviewToHostMessage,
} from '../sync/protocol.js';

const log = create_logger('init');

export const syncAnnotation = Annotation.define<boolean>();

export type PostMessage = (message: WebviewToHostMessage) => void;

export type DeferScheduler = (cb: () => void, delay_ms: number) => void;

// Grace budget covering CM6's 50ms post-`compositionend` window
// (compositionPendingChange + compositionEndedAt). Used to defer an inbound
// host `sync` and to flush the outbound `update` once composition ends.
const COMPOSITION_DEFER_MS = 60;

// Outbound webview→host forwarding. CM6 fires a docChanged transaction per
// intermediate IME composition step; posting each one churns the host applyEdit
// (and its multi-fire echo) mid-composition — the churn that manufactures the
// escaped-echo divergent syncs SYNC-H-2 must otherwise absorb. Hold posts while
// composing, flush once after it unwinds (CM6's documented guard).
export function create_update_listener(
  post_message: PostMessage,
  get_base_version: () => number,
  defer: DeferScheduler = (cb, ms) => {
    setTimeout(cb, ms);
  },
): (update: ViewUpdate) => void {
  // Generation token debounces the flush: each composing transaction (and each
  // immediate post) bumps it, so only the latest pending timer survives.
  let flush_gen = 0;

  function schedule_flush(view: EditorView): void {
    const gen = ++flush_gen;
    defer(() => {
      if (gen !== flush_gen) return;
      if (view.composing || view.compositionStarted) {
        schedule_flush(view);
        return;
      }
      post_message({
        type: 'update',
        text: view.state.doc.toString(),
        base_version: get_base_version(),
      });
    }, COMPOSITION_DEFER_MS);
  }

  return (update) => {
    if (!update.docChanged) return;
    for (const tr of update.transactions) {
      if (tr.annotation(syncAnnotation) === true) return;
    }
    const view = update.view;
    if (view.composing || view.compositionStarted) {
      schedule_flush(view);
      return;
    }
    flush_gen++;
    post_message({
      type: 'update',
      text: update.state.doc.toString(),
      base_version: get_base_version(),
    });
  };
}

// Smallest single contiguous replacement that turns `current` into `incoming`,
// found by trimming the shared prefix and suffix. Dispatching this instead of a
// whole-doc replace is what preserves the caret: CM6 maps the selection through
// a change that does not span it, so an external/echo `sync` no longer collapses
// the cursor to offset 0 (the default `SelectionRange.map(_, assoc=-1)` only
// dumps an in-range cursor to the change's start, and the cursor is outside the
// trimmed range for any edit that doesn't touch it). Code-unit based, matching
// CM6's UTF-16 offset space.
export function compute_min_diff(
  current: string,
  incoming: string,
): { from: number; to: number; insert: string } {
  const max = Math.min(current.length, incoming.length);
  let prefix = 0;
  while (prefix < max && current.charCodeAt(prefix) === incoming.charCodeAt(prefix)) {
    prefix++;
  }
  let suffix = 0;
  const max_suffix = max - prefix;
  while (
    suffix < max_suffix &&
    current.charCodeAt(current.length - 1 - suffix) ===
      incoming.charCodeAt(incoming.length - 1 - suffix)
  ) {
    suffix++;
  }
  return {
    from: prefix,
    to: current.length - suffix,
    insert: incoming.slice(prefix, incoming.length - suffix),
  };
}

export function make_sync_transaction_spec(
  current_text: string,
  incoming_text: string,
  effects: StateEffect<unknown>[] = [],
  selection_anchor?: number,
): TransactionSpec {
  const spec: TransactionSpec = {
    changes: compute_min_diff(current_text, incoming_text),
    annotations: [syncAnnotation.of(true), Transaction.addToHistory.of(false)],
    effects,
  };
  if (selection_anchor !== undefined) {
    spec.selection = { anchor: selection_anchor };
  }
  return spec;
}

// Map (line, character) — both zero-based, VS Code semantics — to a byte
// offset in `text` (LF). Clamps past-end positions so over-shoot values from
// the host land at the last legal offset rather than throwing.
export function line_char_to_offset(text: string, line: number, character: number): number {
  let i = 0;
  let current_line = 0;
  while (i < text.length && current_line < line) {
    if (text.charCodeAt(i) === 10) current_line++;
    i++;
  }
  let chars = 0;
  while (i < text.length && chars < character) {
    if (text.charCodeAt(i) === 10) break;
    i++;
    chars++;
  }
  return i;
}

// Minimal EditorView surface used by dispatch_host_sync — keeps the function
// testable from a node env without a real CM6 instance.
export interface SyncDispatchView {
  readonly composing: boolean;
  readonly compositionStarted: boolean;
  readonly state: { doc: { length: number; toString(): string } };
  dispatch(spec: TransactionSpec): void;
}

// Newest-sync-wins coalescing: every dispatch bumps the view's
// generation; a sync deferred behind composition re-checks it on retry and
// drops itself once a newer sync exists. Without this, the stale retry
// regresses the doc to older host text after the newer sync applied — and the
// next keystroke's update writes that regression back to the host.
const sync_dispatch_generation = new WeakMap<SyncDispatchView, number>();

// Apply a host-pushed `sync` to the webview's CM6 view as a minimal-range
// change (`compute_min_diff`) so the caret survives an external/echo sync.
// The composition guard remains: a change dispatched while CM6 is composing (or
// inside the 50ms post-`compositionend` grace window) can still null CM6's
// tracked composition range (DocView.update at @codemirror/view
// dist/index.js:2911), so defer per CM6's `view.composing || compositionStarted`
// pattern (matches Obsidian v1.5.12's fix for the same bug class).
export function dispatch_host_sync(
  view: SyncDispatchView,
  text: string,
  effects: StateEffect<unknown>[] = [],
  selection_anchor?: number,
  // Fires once the sync is actually in effect (dispatched, or already
  // identical) — NOT while deferred behind composition, and never for a
  // superseded sync. The caller's base-version bookkeeping must track
  // applied syncs only.
  on_applied?: () => void,
  defer: DeferScheduler = (cb, ms) => {
    setTimeout(cb, ms);
  },
): void {
  const generation = (sync_dispatch_generation.get(view) ?? 0) + 1;
  sync_dispatch_generation.set(view, generation);
  const attempt = (): void => {
    if (sync_dispatch_generation.get(view) !== generation) {
      log.debug('sync: superseded while deferred — dropping stale sync');
      return;
    }
    if (view.composing || view.compositionStarted) {
      log.debug('sync: deferring — composition active');
      defer(attempt, COMPOSITION_DEFER_MS);
      return;
    }
    const current = view.state.doc.toString();
    if (text === current) {
      if (selection_anchor !== undefined) {
        view.dispatch({ selection: { anchor: selection_anchor }, effects });
      } else if (effects.length > 0) {
        view.dispatch({ effects });
      }
      on_applied?.();
      return;
    }
    view.dispatch(make_sync_transaction_spec(current, text, effects, selection_anchor));
    on_applied?.();
  };
  attempt();
}

// Adapter — narrows a real CM6 EditorView to the SyncDispatchView surface so
// the production call site stays a one-liner.
export function dispatch_host_sync_to_view(
  view: EditorView,
  text: string,
  effects: StateEffect<unknown>[] = [],
  selection_anchor?: number,
  on_applied?: () => void,
): void {
  dispatch_host_sync(
    view as unknown as SyncDispatchView,
    text,
    effects,
    selection_anchor,
    on_applied,
  );
}
