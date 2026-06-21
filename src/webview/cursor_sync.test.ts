import { describe, expect, it } from 'vitest';
import { ChangeSet, EditorState, Transaction, type TransactionSpec } from '@codemirror/state';
import type { ViewUpdate } from '@codemirror/view';
import {
  create_cursor_sync_listener,
  cursor_position_from_state,
} from './cursor_sync.js';
import type { WebviewToHostMessage } from './sync.js';

function make_view_update(
  state_before: EditorState,
  transactions: Transaction[],
): ViewUpdate {
  let state = state_before;
  let changes = ChangeSet.empty(state.doc.length);
  let docChanged = false;
  let selectionSet = false;
  for (const tr of transactions) {
    if (tr.docChanged) docChanged = true;
    if (tr.selection) selectionSet = true;
    changes = changes.compose(tr.changes);
    state = tr.state;
  }
  return { docChanged, selectionSet, transactions, changes, state } as unknown as ViewUpdate;
}

describe('cursor_position_from_state NAV-S-1', () => {
  it('returns (0, 0) for an empty doc with cursor at 0', () => {
    const state = EditorState.create({ doc: '' });
    expect(cursor_position_from_state(state)).toEqual({ line: 0, character: 0 });
  });
  it('returns (0, 3) for cursor mid-first-line', () => {
    const state = EditorState.create({ doc: 'hello\nworld', selection: { anchor: 3 } });
    expect(cursor_position_from_state(state)).toEqual({ line: 0, character: 3 });
  });
  it('returns (1, 0) for cursor at start of second line', () => {
    const state = EditorState.create({ doc: 'hello\nworld', selection: { anchor: 6 } });
    expect(cursor_position_from_state(state)).toEqual({ line: 1, character: 0 });
  });
  it('returns (1, 4) for cursor mid-second-line', () => {
    const state = EditorState.create({ doc: 'hello\nworld', selection: { anchor: 10 } });
    expect(cursor_position_from_state(state)).toEqual({ line: 1, character: 4 });
  });
});

describe('create_cursor_sync_listener NAV-S-2 NAV-S-3 NAV-S-4', () => {
  it('posts cursor_changed when selection moves', () => {
    const posted: WebviewToHostMessage[] = [];
    const listener = create_cursor_sync_listener((m) => posted.push(m));
    const state = EditorState.create({ doc: 'hello\nworld', selection: { anchor: 0 } });
    const tr = state.update({ selection: { anchor: 7 } } as TransactionSpec);
    listener(make_view_update(state, [tr]));
    expect(posted).toEqual([{ type: 'cursor_changed', line: 1, character: 1 }]);
  });

  it('dedupes consecutive identical positions', () => {
    const posted: WebviewToHostMessage[] = [];
    const listener = create_cursor_sync_listener((m) => posted.push(m));
    const state = EditorState.create({ doc: 'hello', selection: { anchor: 0 } });
    const tr1 = state.update({ selection: { anchor: 2 } } as TransactionSpec);
    listener(make_view_update(state, [tr1]));
    // A second update at the same position (e.g., from a no-op selection event)
    // should not produce a second post.
    const tr2 = tr1.state.update({ selection: { anchor: 2 } } as TransactionSpec);
    listener(make_view_update(tr1.state, [tr2]));
    expect(posted).toEqual([{ type: 'cursor_changed', line: 0, character: 2 }]);
  });

  it('reports the new position after a doc change moves the caret', () => {
    const posted: WebviewToHostMessage[] = [];
    const listener = create_cursor_sync_listener((m) => posted.push(m));
    // Insert BEFORE the cursor — CM6's default assoc=-1 keeps an empty
    // selection on the left of an insert AT the cursor, so we need the change
    // to land strictly upstream to actually shift the caret.
    const state = EditorState.create({ doc: 'hello', selection: { anchor: 5 } });
    const tr = state.update({ changes: { from: 0, to: 0, insert: 'X' } });
    listener(make_view_update(state, [tr]));
    expect(posted).toEqual([{ type: 'cursor_changed', line: 0, character: 6 }]);
  });

  it('skips updates that neither change the doc nor the selection', () => {
    const posted: WebviewToHostMessage[] = [];
    const listener = create_cursor_sync_listener((m) => posted.push(m));
    const state = EditorState.create({ doc: 'hello', selection: { anchor: 2 } });
    // A no-op effect-only update has no selection change.
    const tr = state.update({} as TransactionSpec);
    listener(make_view_update(state, [tr]));
    expect(posted).toEqual([]);
  });
});
