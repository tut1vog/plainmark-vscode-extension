// Clicking in the blank area right of a line whose trailing syntax is hidden
// (a collapsed link's `](url)`) hit-tests to the last visible position; the
// release remap must land the caret at the true line end instead. Clicks ON
// the text keep the default mapping.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor } from './util.js';

function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}

const LINK = '[anthropics:defending-code-reference-harness](https://github.com/anthropics/defending-code-reference-harness)';
const DOC = `x\n${LINK}\ny\n`;

describe('NAV-N-9: click past a collapsed trailing run lands the caret at line end', () => {
  let container: HTMLElement;
  let view: EditorView;

  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    view = mount_editor(container, DOC);
    await next_frame();
    await next_frame();
  });
  afterEach(() => {
    view.destroy();
    container.remove();
  });

  async function click_at(x: number, y: number, detail = 1): Promise<void> {
    const opts = {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0,
      detail,
    };
    view.contentDOM.dispatchEvent(new MouseEvent('mousedown', opts));
    await next_frame();
    document.dispatchEvent(new MouseEvent('mouseup', opts));
    await next_frame();
    await next_frame();
  }

  function link_line(): { text_to: number; line_to: number; x_end: number; y: number } {
    const line = view.state.doc.line(2);
    const text_to = line.from + LINK.indexOf('](');
    const c = view.coordsAtPos(text_to, -1)!;
    return { text_to, line_to: line.to, x_end: c.right, y: (c.top + c.bottom) / 2 };
  }

  it('click in blank space right of the line → caret at line end', async () => {
    const { line_to, x_end, y } = link_line();
    await click_at(x_end + 60, y);
    expect(view.state.selection.main.head).toBe(line_to);
    expect(view.state.selection.main.empty).toBe(true);
  });

  it('click on the last visible glyph → caret stays at the text position', async () => {
    const { text_to, x_end, y } = link_line();
    await click_at(x_end - 3, y);
    expect(view.state.selection.main.head).toBe(text_to);
  });

  it('double-click in blank space keeps the default word selection', async () => {
    const { line_to, x_end, y } = link_line();
    await click_at(x_end + 60, y);
    expect(view.state.selection.main.head).toBe(line_to);
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    await next_frame();
    await click_at(x_end + 60, y, 2);
    expect(view.state.selection.main.empty).toBe(false);
  });

  it('visible trailing text after the link is unaffected', async () => {
    view.destroy();
    view = mount_editor(container, 'x\n[a](https://e.co) tail\ny\n');
    await next_frame();
    await next_frame();
    const line = view.state.doc.line(2);
    const c = view.coordsAtPos(line.to, -1)!;
    await click_at(c.right + 60, (c.top + c.bottom) / 2);
    expect(view.state.selection.main.head).toBe(line.to);
  });
});
