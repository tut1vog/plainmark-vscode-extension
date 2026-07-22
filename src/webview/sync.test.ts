import { describe, it, expect, vi } from 'vitest';
import { history, historyKeymap } from '@codemirror/commands';
import { ChangeSet, EditorState, Transaction, type TransactionSpec } from '@codemirror/state';
import type { ViewUpdate } from '@codemirror/view';
import {
  compute_min_diff,
  create_update_listener,
  dispatch_host_sync,
  line_char_to_offset,
  make_sync_transaction_spec,
  syncAnnotation,
  type SyncDispatchView,
  type WebviewToHostMessage,
} from './sync.js';

function make_fake_view(initial_text: string, opts?: { composing?: boolean; compositionStarted?: boolean }): {
  view: SyncDispatchView;
  dispatched: TransactionSpec[];
  set_text(t: string): void;
  set_composing(c: boolean): void;
  set_composition_started(c: boolean): void;
} {
  let text = initial_text;
  let composing = opts?.composing ?? false;
  let composition_started = opts?.compositionStarted ?? false;
  const dispatched: TransactionSpec[] = [];
  const view: SyncDispatchView = {
    get composing() {
      return composing;
    },
    get compositionStarted() {
      return composition_started;
    },
    get state() {
      return {
        doc: {
          length: text.length,
          toString: () => text,
        },
      };
    },
    dispatch: (spec: TransactionSpec) => {
      dispatched.push(spec);
    },
  };
  return {
    view,
    dispatched,
    set_text: (t) => {
      text = t;
    },
    set_composing: (c) => {
      composing = c;
    },
    set_composition_started: (c) => {
      composition_started = c;
    },
  };
}

function make_view_update(state_before: EditorState, transactions: Transaction[]): ViewUpdate {
  // Duck-typed ViewUpdate — listener reads docChanged, transactions, state, and
  // view.{composing,compositionStarted} (false here → the immediate-post path).
  let state = state_before;
  let changes = ChangeSet.empty(state.doc.length);
  let docChanged = false;
  for (const tr of transactions) {
    if (tr.docChanged) docChanged = true;
    changes = changes.compose(tr.changes);
    state = tr.state;
  }
  const view = { composing: false, compositionStarted: false, state };
  return { docChanged, transactions, changes, state, view } as unknown as ViewUpdate;
}

describe('create_update_listener — echo suppression guard SYNC-G-1', () => {
  it('skips post_message when any transaction carries syncAnnotation', () => {
    const posted: WebviewToHostMessage[] = [];
    const listener = create_update_listener((m) => posted.push(m), () => 7);

    const state = EditorState.create({ doc: '' });
    const tr = state.update(make_sync_transaction_spec('', 'hello'));
    listener(make_view_update(state, [tr]));

    expect(posted).toEqual([]);
  });

  it('skips when docChanged is false even if transactions exist', () => {
    const posted: WebviewToHostMessage[] = [];
    const listener = create_update_listener((m) => posted.push(m), () => 7);

    const state = EditorState.create({ doc: 'hello' });
    const tr = state.update({ selection: { anchor: 1 } });
    listener(make_view_update(state, [tr]));

    expect(posted).toEqual([]);
  });
});

describe('create_update_listener — user-edit postMessage shape SYNC-W-1 SYNC-W-2', () => {
  it('posts an `update` message containing the new doc text for user-originated transactions', () => {
    const posted: WebviewToHostMessage[] = [];
    const listener = create_update_listener((m) => posted.push(m), () => 7);

    const state = EditorState.create({ doc: 'hello' });
    const tr = state.update({ changes: { from: 5, to: 5, insert: '!' } });
    listener(make_view_update(state, [tr]));

    expect(posted).toEqual([{ type: 'update', text: 'hello!', base_version: 7 }]);
  });

  it('captures multi-character user edits in the same transaction', () => {
    const posted: WebviewToHostMessage[] = [];
    const listener = create_update_listener((m) => posted.push(m), () => 7);

    const state = EditorState.create({ doc: 'hello' });
    const tr = state.update({ changes: { from: 0, to: 5, insert: 'HELLO' } });
    listener(make_view_update(state, [tr]));

    expect(posted).toEqual([{ type: 'update', text: 'HELLO', base_version: 7 }]);
  });
});

// Mutable view whose composition flags and doc text can change between an
// intermediate composing update and the later deferred flush.
function make_composition_listener_harness(initial: string) {
  let text = initial;
  let composing = false;
  let composition_started = false;
  const view = {
    get composing() {
      return composing;
    },
    get compositionStarted() {
      return composition_started;
    },
    get state() {
      return { doc: { toString: () => text } };
    },
  };
  const update = (): ViewUpdate =>
    ({
      docChanged: true,
      transactions: [{ annotation: () => undefined }],
      state: { doc: { toString: () => text } },
      view,
    }) as unknown as ViewUpdate;
  return {
    update,
    set_text: (t: string) => {
      text = t;
    },
    set_composing: (c: boolean) => {
      composing = c;
    },
    set_composition_started: (c: boolean) => {
      composition_started = c;
    },
  };
}

describe('create_update_listener — composition gating SYNC-G-8', () => {
  it('holds intermediate posts while composing and schedules a flush', () => {
    const posted: WebviewToHostMessage[] = [];
    const scheduled: Array<() => void> = [];
    const listener = create_update_listener(
      (m) => posted.push(m),
      () => 7,
      (cb) => scheduled.push(cb),
    );
    const h = make_composition_listener_harness('h');
    h.set_composing(true);
    h.set_composition_started(true);
    h.set_text('h你');
    listener(h.update());
    expect(posted).toEqual([]);
    expect(scheduled.length).toBeGreaterThan(0);
  });

  it('flushes the composed text exactly once after composition ends', () => {
    const posted: WebviewToHostMessage[] = [];
    const scheduled: Array<() => void> = [];
    const listener = create_update_listener(
      (m) => posted.push(m),
      () => 7,
      (cb) => scheduled.push(cb),
    );
    const h = make_composition_listener_harness('h');
    h.set_composing(true);
    h.set_composition_started(true);

    h.set_text('h你');
    listener(h.update());
    h.set_text('h你好');
    listener(h.update());
    expect(posted).toEqual([]);

    // compositionend — flags drop, final text committed.
    h.set_composing(false);
    h.set_composition_started(false);
    scheduled[scheduled.length - 1]!();

    expect(posted).toEqual([{ type: 'update', text: 'h你好', base_version: 7 }]);
  });

  it('re-defers when the flush fires while still composing', () => {
    const posted: WebviewToHostMessage[] = [];
    const scheduled: Array<() => void> = [];
    const listener = create_update_listener(
      (m) => posted.push(m),
      () => 7,
      (cb) => scheduled.push(cb),
    );
    const h = make_composition_listener_harness('h');
    h.set_composing(true);
    h.set_composition_started(true);
    h.set_text('h你');
    listener(h.update());

    const before = scheduled.length;
    // Flush fires but composition is still active → reschedule, don't post.
    scheduled[scheduled.length - 1]!();
    expect(posted).toEqual([]);
    expect(scheduled.length).toBe(before + 1);
  });

  it('posts immediately when not composing and supersedes a stale flush', () => {
    const posted: WebviewToHostMessage[] = [];
    const scheduled: Array<() => void> = [];
    const listener = create_update_listener(
      (m) => posted.push(m),
      () => 7,
      (cb) => scheduled.push(cb),
    );
    const h = make_composition_listener_harness('hello');

    // One composing transaction schedules a flush.
    h.set_composing(true);
    h.set_composition_started(true);
    h.set_text('hello你');
    listener(h.update());

    // Composition ends; the committing transaction arrives non-composing.
    h.set_composing(false);
    h.set_composition_started(false);
    h.set_text('hello你好');
    listener(h.update());
    expect(posted).toEqual([{ type: 'update', text: 'hello你好', base_version: 7 }]);

    // The earlier flush timer is now stale and must no-op.
    scheduled[scheduled.length - 1]!();
    expect(posted).toEqual([{ type: 'update', text: 'hello你好', base_version: 7 }]);
  });

  it('does not gate ordinary (non-composition) edits', () => {
    const posted: WebviewToHostMessage[] = [];
    const listener = create_update_listener((m) => posted.push(m), () => 7);
    const state = EditorState.create({ doc: 'hello' });
    const tr = state.update({ changes: { from: 5, to: 5, insert: '!' } });
    listener(make_view_update(state, [tr]));
    expect(posted).toEqual([{ type: 'update', text: 'hello!', base_version: 7 }]);
  });
});

describe('make_sync_transaction_spec — minimal-range replace SYNC-H-2', () => {
  it('replaces empty doc with sync text', () => {
    const initial = EditorState.create({ doc: '' });
    const tr = initial.update(make_sync_transaction_spec('', 'hello world'));
    expect(tr.state.doc.toString()).toBe('hello world');
  });

  it('replaces populated doc with new sync text', () => {
    const initial = EditorState.create({ doc: 'previous content' });
    const tr = initial.update(make_sync_transaction_spec(initial.doc.toString(), 'fresh'));
    expect(tr.state.doc.toString()).toBe('fresh');
  });

  it('carries syncAnnotation so the listener does not echo', () => {
    const initial = EditorState.create({ doc: '' });
    const tr = initial.update(make_sync_transaction_spec('', 'hello'));
    expect(tr.annotation(syncAnnotation)).toBe(true);

    const posted: WebviewToHostMessage[] = [];
    const listener = create_update_listener((m) => posted.push(m), () => 7);
    listener(make_view_update(initial, [tr]));
    expect(posted).toEqual([]);
  });

  it('carries addToHistory:false to keep CM6 history off the host-pushed sync', () => {
    const initial = EditorState.create({ doc: '' });
    const tr = initial.update(make_sync_transaction_spec('', 'hello'));
    expect(tr.annotation(Transaction.addToHistory)).toBe(false);
  });
});

describe('dispatch_host_sync — CJK IME composition guard SYNC-G-7', () => {
  it('dispatches immediately when no composition is active (minimal-range change)', () => {
    const h = make_fake_view('中文');
    dispatch_host_sync(h.view, '中，文');
    expect(h.dispatched).toHaveLength(1);
    const spec = h.dispatched[0] as { changes?: unknown };
    // Common prefix `中` and suffix `文` are trimmed — only the inserted `，` is dispatched.
    expect(spec.changes).toEqual({ from: 1, to: 1, insert: '，' });
  });

  it('skips dispatch when incoming text matches current doc (no effects)', () => {
    const h = make_fake_view('中文');
    dispatch_host_sync(h.view, '中文');
    expect(h.dispatched).toHaveLength(0);
  });

  it('dispatches effects-only transaction when text matches but effects supplied', () => {
    const h = make_fake_view('中文');
    const fake_effect = { dummy: true } as never;
    dispatch_host_sync(h.view, '中文', [fake_effect]);
    expect(h.dispatched).toHaveLength(1);
    expect(h.dispatched[0]).toEqual({ effects: [fake_effect] });
  });

  it('defers dispatch when view.composing is true', () => {
    const h = make_fake_view('中文', { composing: true });
    const calls: { delay: number }[] = [];
    const fake_defer = (_cb: () => void, delay: number) => {
      calls.push({ delay });
    };
    dispatch_host_sync(h.view, '中，文', [], undefined, undefined, fake_defer);
    expect(h.dispatched).toHaveLength(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.delay).toBeGreaterThanOrEqual(50);
  });

  it('defers dispatch when view.compositionStarted is true (post-end 50ms window)', () => {
    const h = make_fake_view('中文', { compositionStarted: true });
    let scheduled: (() => void) | null = null;
    const fake_defer = (cb: () => void) => {
      scheduled = cb;
    };
    dispatch_host_sync(h.view, '中，文', [], undefined, undefined, fake_defer);
    expect(h.dispatched).toHaveLength(0);
    expect(scheduled).not.toBeNull();
  });

  it('preserves the caret: a minimal-range sync maps the cursor through the change, not to start', () => {
    // The former whole-doc replace mapped any in-range cursor to 0 via the
    // default assoc=-1. The minimal-range change inserts `，` at [1,1]; a cursor
    // at 1 (between 中 and 文) sits on the change boundary with assoc=-1, so it
    // stays at 1 instead of collapsing to the document start.
    const state = EditorState.create({ doc: '中文', selection: { anchor: 1 } });
    const tr = state.update(make_sync_transaction_spec(state.doc.toString(), '中，文'));
    expect(tr.state.selection.main.head).toBe(1);
    expect(tr.state.doc.toString()).toBe('中，文');
  });

  it('eventually dispatches once composition ends — re-checks state on retry', () => {
    const h = make_fake_view('中文', { composing: true });
    let scheduled: (() => void) | null = null;
    const fake_defer = (cb: () => void) => {
      scheduled = cb;
    };
    dispatch_host_sync(h.view, '中，文', [], undefined, undefined, fake_defer);
    expect(h.dispatched).toHaveLength(0);

    h.set_composing(false);
    // Simulate the IME flush committing the same bytes before our deferred
    // retry fires — the guard's recursive call should observe the up-to-date
    // doc and short-circuit instead of dispatching a stale replace.
    h.set_text('中，文');
    scheduled!();
    expect(h.dispatched).toHaveLength(0);
  });

  it('dispatches after composition ends when the doc still diverges', () => {
    const h = make_fake_view('中文', { composing: true });
    let scheduled: (() => void) | null = null;
    const fake_defer = (cb: () => void) => {
      scheduled = cb;
    };
    dispatch_host_sync(h.view, 'XYZ', [], undefined, undefined, fake_defer);
    h.set_composing(false);
    scheduled!();
    expect(h.dispatched).toHaveLength(1);
    const spec = h.dispatched[0] as { changes?: unknown };
    expect(spec.changes).toEqual({ from: 0, to: 2, insert: 'XYZ' });
  });

  // Base-version bookkeeping must track APPLIED
  // syncs only — advancing it on receipt would let a composition-deferred
  // sync stamp a base the doc does not yet reflect.
  it('on_applied fires when the sync dispatches', () => {
    const h = make_fake_view('old');
    let applied = 0;
    dispatch_host_sync(h.view, 'new', [], undefined, () => applied++);
    expect(h.dispatched).toHaveLength(1);
    expect(applied).toBe(1);
  });

  it('on_applied fires on the identity no-op (doc already matches)', () => {
    const h = make_fake_view('same');
    let applied = 0;
    dispatch_host_sync(h.view, 'same', [], undefined, () => applied++);
    expect(h.dispatched).toHaveLength(0);
    expect(applied).toBe(1);
  });

  it('on_applied does not fire while deferred behind composition, fires after', () => {
    const h = make_fake_view('中文', { composing: true });
    let scheduled: (() => void) | null = null;
    const fake_defer = (cb: () => void) => {
      scheduled = cb;
    };
    let applied = 0;
    dispatch_host_sync(h.view, '中，文', [], undefined, () => applied++, fake_defer);
    expect(applied).toBe(0);

    h.set_composing(false);
    scheduled!();
    expect(h.dispatched).toHaveLength(1);
    expect(applied).toBe(1);
  });

  // Newest-sync-wins coalescing: a sync deferred
  // behind composition must not apply after a newer sync — its retry would
  // regress the doc to stale host text, and the next keystroke's update
  // (carrying the still-valid base version) would write that regression back
  // to the host, silently reverting the newer external edit.
  it('a deferred sync superseded by a newer sync never applies its stale text', () => {
    const h = make_fake_view('base', { composing: true });
    let scheduled: (() => void) | null = null;
    const fake_defer = (cb: () => void) => {
      scheduled = cb;
    };
    let stale_applied = 0;
    // S1 arrives mid-composition → deferred.
    dispatch_host_sync(h.view, 'S1 external edit', [], undefined, () => stale_applied++, fake_defer);
    expect(h.dispatched).toHaveLength(0);

    // Composition ends; a newer sync S2 arrives and applies immediately.
    h.set_composing(false);
    let s2_applied = 0;
    dispatch_host_sync(h.view, 'S2 newer host text', [], undefined, () => s2_applied++);
    expect(h.dispatched).toHaveLength(1);
    expect(s2_applied).toBe(1);
    h.set_text('S2 newer host text');

    // The stale S1 retry fires last — it must no-op, not clobber S2.
    scheduled!();
    expect(h.dispatched).toHaveLength(1);
    expect(stale_applied).toBe(0);
  });

  it('a deferred sync superseded while STILL composing never applies either', () => {
    const h = make_fake_view('base', { composing: true });
    const scheduled: (() => void)[] = [];
    const fake_defer = (cb: () => void) => {
      scheduled.push(cb);
    };
    dispatch_host_sync(h.view, 'S1', [], undefined, undefined, fake_defer);
    // S2 arrives while composition is still active — both are now deferred.
    dispatch_host_sync(h.view, 'S2', [], undefined, undefined, fake_defer);
    expect(scheduled).toHaveLength(2);

    h.set_composing(false);
    // Retries fire in schedule order: S1 first (must drop), then S2 (applies).
    for (const cb of scheduled.splice(0)) cb();
    expect(h.dispatched).toHaveLength(1);
    const spec = h.dispatched[0] as { changes?: { insert?: string } };
    expect(spec.changes?.insert).toBe('S2');
  });

  it('uses setTimeout by default with a non-zero delay', () => {
    vi.useFakeTimers();
    try {
      const h = make_fake_view('中文', { composing: true });
      dispatch_host_sync(h.view, '中，文');
      expect(h.dispatched).toHaveLength(0);
      h.set_composing(false);
      vi.advanceTimersByTime(100);
      expect(h.dispatched).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('CM6 history owns undo — Mod-z reverts the doc locally without posting to host', () => {
  it('Mod-z runs CM6 history undo: reverts the user edit; no post_message is invoked by the binding', () => {
    const posted: WebviewToHostMessage[] = [];
    const listener = create_update_listener((m) => posted.push(m), () => 7);

    let state = EditorState.create({
      doc: 'hello',
      extensions: [history()],
    });

    const edit_tr = state.update({ changes: { from: 5, to: 5, insert: '!' } });
    listener(make_view_update(state, [edit_tr]));
    state = edit_tr.state;
    expect(state.doc.toString()).toBe('hello!');

    const before_undo_posts = posted.length;

    const undo_binding = historyKeymap.find((b) => b.key === 'Mod-z');
    expect(undo_binding).toBeDefined();

    const view_stub = {
      state,
      dispatch: (tr_or_spec: Transaction | TransactionSpec) => {
        const tr =
          tr_or_spec instanceof Transaction
            ? (tr_or_spec as Transaction)
            : state.update(tr_or_spec as TransactionSpec);
        state = tr.state;
      },
    };
    const consumed = undo_binding!.run!(view_stub as never);
    expect(consumed).toBe(true);

    expect(state.doc.toString()).toBe('hello');
    expect(posted.length).toBe(before_undo_posts);
    expect(posted.some((m) => (m as { type: string }).type === 'undo')).toBe(false);
    expect(posted.some((m) => (m as { type: string }).type === 'redo')).toBe(false);
  });
});

describe('line_char_to_offset', () => {
  it('maps (0, 0) to 0 on a non-empty doc', () => {
    expect(line_char_to_offset('hello\nworld', 0, 0)).toBe(0);
  });
  it('maps (0, 3) to 3', () => {
    expect(line_char_to_offset('hello\nworld', 0, 3)).toBe(3);
  });
  it('maps (1, 0) to the start of the second line', () => {
    expect(line_char_to_offset('hello\nworld', 1, 0)).toBe(6);
  });
  it('maps (1, 4) to mid-line on the second line', () => {
    expect(line_char_to_offset('hello\nworld', 1, 4)).toBe(10);
  });
  it('clamps character past line end to the end of that line', () => {
    expect(line_char_to_offset('hi\nworld', 0, 100)).toBe(2);
  });
  it('clamps line past doc end to doc length', () => {
    expect(line_char_to_offset('hi\nworld', 99, 0)).toBe('hi\nworld'.length);
  });
  it('returns 0 on an empty doc regardless of position', () => {
    expect(line_char_to_offset('', 5, 5)).toBe(0);
  });
  it('handles multibyte characters character-by-character (CM6 native indexing)', () => {
    // CM6's character offset counts UTF-16 code units, like JS string indexing.
    // The function walks chars by JS string indexing, which matches.
    expect(line_char_to_offset('日本語\n', 0, 2)).toBe(2);
  });
});

describe('make_sync_transaction_spec selection passthrough', () => {
  it('omits `selection` when no anchor supplied', () => {
    const spec = make_sync_transaction_spec('', 'hi') as { selection?: unknown };
    expect(spec.selection).toBeUndefined();
  });
  it('includes a collapsed selection when an anchor is supplied', () => {
    const initial = EditorState.create({ doc: '' });
    const tr = initial.update(make_sync_transaction_spec('', 'hello', [], 3));
    expect(tr.state.selection.main.head).toBe(3);
    expect(tr.state.selection.main.anchor).toBe(3);
    expect(tr.state.doc.toString()).toBe('hello');
  });
});

describe('dispatch_host_sync selection passthrough', () => {
  it('forwards selection_anchor in the doc-replace transaction', () => {
    const h = make_fake_view('old');
    dispatch_host_sync(h.view, 'new', [], 2);
    expect(h.dispatched).toHaveLength(1);
    const spec = h.dispatched[0] as { selection?: { anchor: number } };
    expect(spec.selection).toEqual({ anchor: 2 });
  });
  it('applies a selection-only dispatch when text matches but anchor supplied', () => {
    const h = make_fake_view('hello');
    dispatch_host_sync(h.view, 'hello', [], 4);
    expect(h.dispatched).toHaveLength(1);
    const spec = h.dispatched[0] as { selection?: { anchor: number }; changes?: unknown };
    expect(spec.selection).toEqual({ anchor: 4 });
    expect(spec.changes).toBeUndefined();
  });
  it('still no-ops when text matches and no anchor / effects supplied', () => {
    const h = make_fake_view('hello');
    dispatch_host_sync(h.view, 'hello');
    expect(h.dispatched).toHaveLength(0);
  });
});

// Unlike make_fake_view (records specs), this applies each dispatched spec to a
// real EditorState, so dispatch_host_sync drives CM6's real selection mapping
// and the resulting caret can be read back.
function make_state_backed_view(
  doc: string,
  caret: number,
  opts?: { composing?: boolean; compositionStarted?: boolean },
): { view: SyncDispatchView; head: () => number; text: () => string } {
  let current = EditorState.create({ doc, selection: { anchor: caret } });
  const composing = opts?.composing ?? false;
  const composition_started = opts?.compositionStarted ?? false;
  const view: SyncDispatchView = {
    get composing() {
      return composing;
    },
    get compositionStarted() {
      return composition_started;
    },
    get state() {
      return current as unknown as SyncDispatchView['state'];
    },
    dispatch(spec: TransactionSpec) {
      current = current.update(spec).state;
    },
  };
  return {
    view,
    head: () => current.selection.main.head,
    text: () => current.doc.toString(),
  };
}

describe('dispatch_host_sync — caret preservation across a divergent sync (regression, SYNC-H-2)', () => {
  it('keeps the caret when the incoming edit is entirely after it', () => {
    // Caret at offset 3 (inside "hello"); tail "world" → "there" only.
    const v = make_state_backed_view('hello world', 3);
    dispatch_host_sync(v.view, 'hello there');
    expect(v.text()).toBe('hello there');
    expect(v.head()).toBe(3);
  });

  it('shifts the caret to track the same position when the edit is before it', () => {
    // Caret at offset 9; a 3-char prepend pushes the same character to 12.
    const v = make_state_backed_view('hello world', 9);
    dispatch_host_sync(v.view, 'XX hello world');
    expect(v.text()).toBe('XX hello world');
    expect(v.head()).toBe(12);
  });

  it('keeps the caret on the punctuation path where composition flags are down', () => {
    // Full-width punctuation can commit without raising composing/compositionStarted,
    // so the guard does not defer;
    // the minimal-range change is what protects the caret here. Caret at 1, the
    // incoming text inserts ， at offset 2.
    const v = make_state_backed_view('你好世界', 1, {
      composing: false,
      compositionStarted: false,
    });
    dispatch_host_sync(v.view, '你好，世界');
    expect(v.text()).toBe('你好，世界');
    expect(v.head()).toBe(1);
  });
});

describe('compute_min_diff', () => {
  const apply = (current: string, incoming: string): string => {
    const d = compute_min_diff(current, incoming);
    return current.slice(0, d.from) + d.insert + current.slice(d.to);
  };

  it('reconstructs the incoming text for inserts, deletes, and replaces', () => {
    expect(apply('', 'hello')).toBe('hello');
    expect(apply('hello', '')).toBe('');
    expect(apply('hello world', 'hello there')).toBe('hello there');
    expect(apply('hello', 'hello world')).toBe('hello world');
    expect(apply('hello world', 'hello')).toBe('hello');
    expect(apply('你好世界', '你好，世界')).toBe('你好，世界');
  });

  it('trims the shared prefix and suffix to the smallest changed range', () => {
    expect(compute_min_diff('hello world', 'hello there')).toEqual({
      from: 6,
      to: 11,
      insert: 'there',
    });
    expect(compute_min_diff('你好世界', '你好，世界')).toEqual({
      from: 2,
      to: 2,
      insert: '，',
    });
  });

  it('emits an empty change when the texts are identical', () => {
    expect(compute_min_diff('same', 'same')).toEqual({ from: 4, to: 4, insert: '' });
  });
});
