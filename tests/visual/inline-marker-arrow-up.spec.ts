// Regression (T19.21 / T19.26 attempt 3): ArrowUp from a blank line below a
// stack of lines that each start with a hidden inline marker must move the
// caret one logical line up, not skip across several.
//
// History: under display:none (pre-T19.26), CM6's moveVertically called
// posAtCoords(.., scanY=±1) whose scanY branch skipped lines where
// view.docView.coordsAt(block.from, ..) returned null — display:none MarkTiles
// always returned null because textRange.getClientRects() was empty per spec.
// T19.21 worked around this with a vertical_navigation_keymap override.
//
// T19.26 attempt 3: hide CSS changed to display:inline-block + width:0 +
// overflow:hidden. The marker still has a valid (0-width) layout box → its
// text node's getClientRects returns non-empty → coordsAt returns non-null →
// the scanY skip never fires. The keymap override was removed when this spec
// proved CM6's native moveVertically handles the case correctly. This spec
// stays as a forever-gate: if a future change reverts to display:none or any
// other technique producing empty getClientRects on the marker text node, the
// bug returns.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor } from './util.js';

function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}

describe('ArrowUp from below stacked hidden-marker lines (T19.21)', () => {
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

  async function arrow_up_lands_on_line(
    doc: string,
    start_line: number,
    _expected_line: number,
  ): Promise<{ landed: number; head: number }> {
    view?.destroy();
    view = mount_editor(container, doc);
    await next_frame();
    await next_frame();
    const v = view;
    const start = v.state.doc.line(start_line).from;
    v.dispatch({ selection: { anchor: start } });
    v.focus();
    await next_frame();
    // Synthesize a real ArrowUp keystroke so the full event path runs (the
    // keymap chain + CM6's native moveVertically). Direct view.moveVertically
    // calls would bypass the keymap and the event handling that matters here.
    const evt = new KeyboardEvent('keydown', {
      key: 'ArrowUp',
      code: 'ArrowUp',
      bubbles: true,
      cancelable: true,
    });
    v.contentDOM.dispatchEvent(evt);
    await next_frame();
    const head = v.state.selection.main.head;
    const landed = v.state.doc.lineAt(head).number;
    return { landed, head };
  }

  it('text-styles: ArrowUp from blank line below `code`/**bold**/*italic* stack lands on line 3, not line 1', async () => {
    const doc = '`inline code` xy\n**bold** xy\n*italic* xy\n';
    // start_line=4 (blank line at end), expected_line=3 (the *italic* line).
    const { landed } = await arrow_up_lands_on_line(doc, 4, 3);
    expect(landed).toBe(3);
  });

  it('links: ArrowUp from blank line below [link]/<autolink> stack lands one line up', async () => {
    const doc =
      '[link](https://example.com) xy\n<https://github.com> xy\n\n';
    // doc lines: 1=link, 2=autolink, 3=blank (caret here), 4=blank-after-final-\n
    const { landed } = await arrow_up_lands_on_line(doc, 3, 2);
    expect(landed).toBe(2);
  });

  it('single hidden-marker line: ArrowUp from blank line below **bold** lands on bold line', async () => {
    const doc = '**bold** xy\n\n';
    const { landed } = await arrow_up_lands_on_line(doc, 2, 1);
    expect(landed).toBe(1);
  });
});
