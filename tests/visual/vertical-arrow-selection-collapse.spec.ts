// NAV-N-8: a vertical arrow on a non-empty selection collapses to the edge AND
// moves one line in the same keystroke (stock CM6 collapses without moving).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { mount_editor, next_frame } from './util.js';

describe('vertical arrow collapses selection and moves — NAV-N-8', () => {
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

  // Lines: 1 `alpha one` [0,9] · 2 `bravo two` [10,19] · 3 `charlie three`
  // [20,33] · 4 `delta four` [34,44].
  const doc = 'alpha one\nbravo two\ncharlie three\ndelta four';

  async function mount_with_selection(
    text: string,
    anchor: number,
    head: number,
  ): Promise<EditorView> {
    view?.destroy();
    view = mount_editor(container, text);
    await next_frame();
    await next_frame();
    view.dispatch({ selection: EditorSelection.range(anchor, head) });
    view.focus();
    await next_frame();
    return view;
  }

  async function press(v: EditorView, key: string, shift = false): Promise<void> {
    v.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', {
        key,
        code: key,
        shiftKey: shift,
        bubbles: true,
        cancelable: true,
      }),
    );
    await next_frame();
  }

  it('ArrowDown on a same-line selection lands an empty caret one line below', async () => {
    const v = await mount_with_selection(doc, 10, 15);
    await press(v, 'ArrowDown');
    expect(v.state.selection.main.empty).toBe(true);
    expect(v.state.doc.lineAt(v.state.selection.main.head).number).toBe(3);
  });

  it('ArrowUp on a same-line selection lands an empty caret one line above', async () => {
    const v = await mount_with_selection(doc, 10, 15);
    await press(v, 'ArrowUp');
    expect(v.state.selection.main.empty).toBe(true);
    expect(v.state.doc.lineAt(v.state.selection.main.head).number).toBe(1);
  });

  it('multi-line selection: ArrowDown moves from the end edge, ArrowUp from the start edge', async () => {
    let v = await mount_with_selection(doc, 10, 25);
    await press(v, 'ArrowDown');
    expect(v.state.selection.main.empty).toBe(true);
    expect(v.state.doc.lineAt(v.state.selection.main.head).number).toBe(4);

    v = await mount_with_selection(doc, 10, 25);
    await press(v, 'ArrowUp');
    expect(v.state.selection.main.empty).toBe(true);
    expect(v.state.doc.lineAt(v.state.selection.main.head).number).toBe(1);
  });

  it('a backwards (head-before-anchor) selection collapses by document order, not drag direction', async () => {
    const v = await mount_with_selection(doc, 15, 10);
    await press(v, 'ArrowDown');
    expect(v.state.selection.main.empty).toBe(true);
    expect(v.state.doc.lineAt(v.state.selection.main.head).number).toBe(3);
  });

  it('ArrowDown on a last-line selection falls back to the line end', async () => {
    const two_lines = 'alpha\nbravo';
    const v = await mount_with_selection(two_lines, 6, 9);
    await press(v, 'ArrowDown');
    expect(v.state.selection.main.empty).toBe(true);
    expect(v.state.selection.main.head).toBe(two_lines.length);
  });

  it('an empty caret keeps the stock one-line step', async () => {
    const v = await mount_with_selection(doc, 12, 12);
    await press(v, 'ArrowDown');
    expect(v.state.selection.main.empty).toBe(true);
    expect(v.state.doc.lineAt(v.state.selection.main.head).number).toBe(3);
  });

  it('Shift+ArrowDown still extends the selection instead of collapsing', async () => {
    const v = await mount_with_selection(doc, 10, 15);
    await press(v, 'ArrowDown', true);
    const main = v.state.selection.main;
    expect(main.empty).toBe(false);
    expect(main.anchor).toBe(10);
    expect(v.state.doc.lineAt(main.head).number).toBe(3);
  });
});
