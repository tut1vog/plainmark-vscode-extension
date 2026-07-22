// MATH-E-13 / INV-SP-1: a BlockMath nested in a blockquote (or list) has a
// partial-line range, and a `block: true` replace over it is illegal in CM6 —
// the line splits into a `> ` stub and DOM-side edits around the widget mis-map
// into document edits (observed: one Backspace on the line below deleted the
// whole block; DOM selections into the widget's MathJax unicode text injected
// or removed source bytes). The widget field must emit NO replace widget for
// such nodes; whitespace-only margins (MATH-E-5 indent / trailing spaces)
// instead extend the replaced range to full line boundaries, which is legal.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor, move_cursor } from '../util.js';
import { ensure_mathjax } from '../mathjax-ready.js';

function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}
async function frames(n: number): Promise<void> {
  for (let i = 0; i < n; i++) await next_frame();
}

describe('quote-nested block math — widget suppression and byte safety', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(async () => {
    await ensure_mathjax();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    view?.destroy();
    view = undefined;
    container.remove();
  });

  const QUOTED = '> $$\\underbrace{x}_{y}$$\n\ntail';

  it('renders no block widget for quote-nested math; raw source stays visible in the quote line', async () => {
    view = mount_editor(container, QUOTED);
    move_cursor(view, QUOTED.length);
    await frames(10);
    expect(container.querySelectorAll('.plainmark-math-block').length).toBe(0);
    const quote_line = container.querySelector<HTMLElement>('.cm-line.plainmark-blockquote');
    expect(quote_line).not.toBeNull();
    expect(quote_line?.textContent).toContain('$$\\underbrace{x}_{y}$$');
  });

  it('Backspace at the blank line below the quote deletes one newline, not the block (INV-SP-1 regression)', async () => {
    view = mount_editor(container, QUOTED);
    move_cursor(view, QUOTED.length);
    await frames(5);
    view.focus();
    move_cursor(view, 25); // start of the blank line below the quote
    await frames(2);
    // DOM-mutation deletion (the path IME / mobile input takes) — previously
    // mis-read around the partial-line widget into a whole-block deletion.
    document.execCommand('delete');
    await frames(5);
    expect(view.state.doc.toString()).toBe(QUOTED.slice(0, 24) + QUOTED.slice(25));
  });

  it('whitespace-extended range: indented single-line block renders one widget and leaves no stub line', async () => {
    const doc = '  $$\\frac{a}{b}$$   \n\ntail';
    view = mount_editor(container, doc);
    move_cursor(view, doc.length);
    await expect
      .poll(() => container.querySelectorAll('mjx-container[display="true"]').length, {
        timeout: 30000,
        interval: 100,
      })
      .toBeGreaterThan(0);
    await frames(5);
    expect(container.querySelectorAll('.plainmark-math-block').length).toBe(1);
    // No residual stub: the first rendered child is the widget itself, not a
    // line holding the leading indent.
    const first = container.querySelector<HTMLElement>('.cm-content > :first-child');
    expect(first?.classList.contains('plainmark-math-block')).toBe(true);
  });
});
