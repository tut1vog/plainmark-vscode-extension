// Triple-click line selection ends at line.to (no trailing newline), so the
// caret rests at the clicked line's end rather than CM6's default next-line
// start. Exercises the real mouseSelectionStyle path with real coordinates.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor } from './util.js';

function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}

// Real triple-click at the rendered coordinates of a document position, then
// release. CM6's mousedown handler reads event.detail to pick the click type.
function triple_click_at(view: EditorView, pos: number): void {
  const coords = view.coordsAtPos(pos);
  if (!coords) throw new Error(`no coords for pos ${pos}`);
  const clientX = coords.left + 1;
  const clientY = (coords.top + coords.bottom) / 2;
  view.contentDOM.dispatchEvent(
    new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      detail: 3,
      clientX,
      clientY,
    }),
  );
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}

describe('MRS-L-1: triple-click line selection (Obsidian-style, no trailing newline)', () => {
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

  it('selects the line up to line.to and leaves the caret at line end', async () => {
    view = mount_editor(container, 'first line\nsecond line\nthird line\n');
    await next_frame();
    const line = view.state.doc.line(1); // 'first line', from 0 to 10
    triple_click_at(view, line.from + 3);
    await next_frame();
    const main = view.state.selection.main;
    expect(main.from).toBe(line.from);
    expect(main.to).toBe(line.to);
    // The caret (head) sits at the line's end, NOT the next line's start.
    expect(main.head).toBe(line.to);
    expect(main.head).not.toBe(line.to + 1);
  });

  it('does not swallow the newline on a middle line', async () => {
    view = mount_editor(container, 'first line\nsecond line\nthird line\n');
    await next_frame();
    const line = view.state.doc.line(2); // 'second line'
    triple_click_at(view, line.from + 4);
    await next_frame();
    const main = view.state.selection.main;
    expect(main.from).toBe(line.from);
    expect(main.to).toBe(line.to);
  });

  it('selects the last line correctly (no trailing newline to exclude)', async () => {
    view = mount_editor(container, 'first line\nlast line');
    await next_frame();
    const line = view.state.doc.line(2); // 'last line'
    triple_click_at(view, line.from + 2);
    await next_frame();
    const main = view.state.selection.main;
    expect(main.from).toBe(line.from);
    expect(main.to).toBe(line.to);
    expect(main.to).toBe(view.state.doc.length);
  });

  it('leaves single-click caret placement to CM6 (no full-line select)', async () => {
    view = mount_editor(container, 'first line\nsecond line\n');
    await next_frame();
    const line = view.state.doc.line(1);
    const coords = view.coordsAtPos(line.from + 3);
    if (!coords) throw new Error('no coords');
    view.contentDOM.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        detail: 1,
        clientX: coords.left + 1,
        clientY: (coords.top + coords.bottom) / 2,
      }),
    );
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await next_frame();
    // A plain click collapses to a caret; it must not select the whole line.
    expect(view.state.selection.main.empty).toBe(true);
  });
});
