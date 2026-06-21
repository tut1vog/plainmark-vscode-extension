// T19.24 — Typora-style auto-include-markers-in-selection. End-to-end check
// that the snap rules fire on document mouseup in the SAME transaction that
// clears the pointer_down latch.
//
// Three rules:
//   C — exact content-area cover (e.g., double-click `bold`) → snap to whole node
//   A — left edge at content start AND right extends past closing marker → extend left
//   B — symmetric for the right side
// Strict-inside selections (`ld` inside `bold`) do NOT snap.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  pointer_down_field,
  set_pointer_down,
} from '../../src/webview/decorations/pointer_state.js';
import { mount_editor } from './util.js';

function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}

// Simulate the press-drag-release sequence: latch pointer_down via the
// exported effect (a real mousedown on contentDOM would do the same), then
// position the selection as if the drag landed there, then fire the
// document-level mouseup.
function press_drag_release(view: EditorView, anchor: number, head: number): void {
  view.dispatch({
    selection: EditorSelection.single(anchor, head),
    effects: set_pointer_down.of(true),
  });
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}

describe('selection-snap on document mouseup (T19.24)', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    view?.destroy();
    container.remove();
  });

  it('Rule C — exact content-area cover snaps to node bounds and clears pointer_down', async () => {
    view = mount_editor(container, 'xx **bold** yy\nzz\n');
    await next_frame();
    // content area = [5, 9]; node bounds = [3, 11].
    press_drag_release(view, 5, 9);
    await next_frame();
    expect(view.state.selection.main.from).toBe(3);
    expect(view.state.selection.main.to).toBe(11);
    expect(view.state.field(pointer_down_field)).toBe(false);
  });

  it('Issue 1 — strict-inside selection (`ld` in `**bold**`) does NOT snap', async () => {
    view = mount_editor(container, 'xx **bold** yy\nzz\n');
    await next_frame();
    // `ld` is at [7, 9]; left edge (7) is strictly inside content, right edge
    // (9) is at content end — Rule B requires the left edge to be BEFORE the
    // opening marker, which it isn't. No snap.
    press_drag_release(view, 7, 9);
    await next_frame();
    expect(view.state.selection.main.from).toBe(7);
    expect(view.state.selection.main.to).toBe(9);
  });

  it('Issue 1 — fully strict-inside selection (`ol` in `**bold**`) does NOT snap', async () => {
    view = mount_editor(container, 'xx **bold** yy\nzz\n');
    await next_frame();
    // `ol` at [6, 8] — both edges strict-inside content area [5, 9].
    press_drag_release(view, 6, 8);
    await next_frame();
    expect(view.state.selection.main.from).toBe(6);
    expect(view.state.selection.main.to).toBe(8);
  });

  it('Issue 2 — right-to-left drag past opening marker snaps left to include it', async () => {
    view = mount_editor(container, '**bold** at start\nzz\n');
    await next_frame();
    // `**bold**` at [0, 8]; line length = 17. User drags right-to-left from
    // end of line — anchor=17, head=2 (lands at content start because opening
    // `**` is display:none and visually collapsed). Rule A extends left to 0.
    press_drag_release(view, 17, 2);
    await next_frame();
    expect(view.state.selection.main.anchor).toBe(17);
    expect(view.state.selection.main.head).toBe(0);
  });

  it('Rule B — left edge before opening marker, right edge at content end → extend right', async () => {
    view = mount_editor(container, 'xx **bold** yy\nzz\n');
    await next_frame();
    // Selection [0, 9] — from=0 (before opening), to=9 (content end). Rule B
    // extends right to node.to=11.
    press_drag_release(view, 0, 9);
    await next_frame();
    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(11);
  });

  it('does NOT snap when the selection extends past on both sides', async () => {
    view = mount_editor(container, 'xx **bold** yy\nzz\n');
    await next_frame();
    // [0, 14] — both edges past the construct [3, 11]. No snap.
    press_drag_release(view, 0, 14);
    await next_frame();
    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(14);
  });

  it('does NOT snap an empty caret', async () => {
    view = mount_editor(container, 'xx **bold** yy\nzz\n');
    await next_frame();
    press_drag_release(view, 6, 6);
    await next_frame();
    expect(view.state.selection.main.from).toBe(6);
    expect(view.state.selection.main.to).toBe(6);
  });

  it('snaps to inner emphasis for nested `**a *b* c**`', async () => {
    view = mount_editor(container, '**a *b* c**\nzz\n');
    await next_frame();
    // Inner Emphasis content area [5, 6].
    press_drag_release(view, 5, 6);
    await next_frame();
    expect(view.state.selection.main.from).toBe(4);
    expect(view.state.selection.main.to).toBe(7);
  });

  it('snaps an inline link label to the full node (MRS-S-1)', async () => {
    // `[text](http://x)` — Link [0,16]; label content [1,5]; node bounds [0,16].
    view = mount_editor(container, '[text](http://x)\nzz\n');
    await next_frame();
    press_drag_release(view, 1, 5);
    await next_frame();
    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(16);
  });

  it('snaps an autolink URL to the full node (MRS-S-1)', async () => {
    // `<http://x>` — Autolink [0,10]; URL content [1,9]; node bounds [0,10].
    view = mount_editor(container, '<http://x>\nzz\n');
    await next_frame();
    press_drag_release(view, 1, 9);
    await next_frame();
    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(10);
  });

  it('snap + pointer_down clear arrive in a single transaction', async () => {
    const v = mount_editor(container, 'xx **bold** yy\nzz\n');
    view = v;
    await next_frame();
    v.dispatch({
      selection: EditorSelection.single(5, 9),
      effects: set_pointer_down.of(true),
    });
    let transactions = 0;
    const original = v.dispatch.bind(v);
    v.dispatch = ((...args: Parameters<typeof v.dispatch>) => {
      transactions += 1;
      return original(...args);
    }) as typeof v.dispatch;
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(transactions).toBe(1);
    expect(v.state.selection.main.from).toBe(3);
    expect(v.state.selection.main.to).toBe(11);
    expect(v.state.field(pointer_down_field)).toBe(false);
  });

  it('reveals the markers after the snap (T19.23 reveal-on-non-strict-cover)', async () => {
    view = mount_editor(container, 'xx **bold** yy\nzz\n');
    await next_frame();
    press_drag_release(view, 5, 9);
    await next_frame();
    const hidden = container.querySelectorAll('.plainmark-inline-marker-hidden');
    expect(hidden.length).toBe(0);
  });
});
