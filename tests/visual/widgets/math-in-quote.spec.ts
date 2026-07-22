// MATH-E-13 / MATH-R-2 / INV-SP-1: display math nested in a blockquote renders
// as a NON-block whole-line replace widget inside the quote line's own chrome
// (bar, tint) — Obsidian's own widget shape, legal for mid-line and
// line-crossing ranges — with interior `> ` quote markup stripped from the
// LaTeX before typesetting. The byte-safety cases regress the pre-fix
// corruption: a partial-line block:true replace made CM6 mis-map DOM-side
// edits around the widget into document edits (whole-block deletion, widget
// unicode text written into the source). List-nested math has no legal shape
// and stays suppressed; whitespace-only margins (MATH-E-5) extend the
// block:true range to full lines instead.
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

describe('quote-nested block math — rendered widget, byte safety', () => {
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

  it('renders the typeset math inside the quote line chrome, with no stub line', async () => {
    view = mount_editor(container, QUOTED);
    move_cursor(view, QUOTED.length);
    await expect
      .poll(() => container.querySelectorAll('mjx-container[display="true"]').length, {
        timeout: 30000,
        interval: 100,
      })
      .toBeGreaterThan(0);
    await frames(5);
    // The widget lives INSIDE the quote line element — quote bar and tint wrap it.
    const quote_line = container.querySelector<HTMLElement>('.cm-line.plainmark-blockquote');
    expect(quote_line).not.toBeNull();
    expect(quote_line?.querySelector('.plainmark-math-block mjx-container')).not.toBeNull();
    // No residual stub: the quote line must not be a bare `> ` next to an
    // out-of-quote widget (the pre-fix breakage).
    expect((quote_line?.textContent ?? '').trim()).not.toBe('>');
    // VISIBLE, not merely present: the zero-width regression rendered the
    // widget at 0px (marker-metrics poisoning collapsed the line content box).
    const widget = container.querySelector<HTMLElement>('.plainmark-math-block')!;
    expect(widget.getBoundingClientRect().width).toBeGreaterThan(100);
    // The line-level quote bar substitutes for the per-marker bar (which
    // cannot draw — the marker is inside the replaced range). The bar color
    // chain resolves only where --vscode-foreground exists (production), so
    // assert the pseudo-element's existence and bar-width geometry instead.
    const before = getComputedStyle(quote_line as HTMLElement, '::before');
    expect(before.content).toBe('""');
    expect(parseFloat(before.width)).toBeGreaterThan(0);
  });

  it('marker-metrics poisoning regression: prose above, math line is the only quote', async () => {
    // The probe's first-in-viewport QuoteMark sits INSIDE the replaced range;
    // measuring it via coordsAtPos returned the widget's box edges (~the full
    // line width) as the `>` advance, which became the line's padding-left
    // and collapsed the widget to width 0.
    const doc = 'before math in blockquote\n> $$\\frac{a}{b}$$\nafter math';
    view = mount_editor(container, doc);
    move_cursor(view, doc.length);
    await expect
      .poll(() => container.querySelectorAll('.plainmark-math-block mjx-container').length, {
        timeout: 30000,
        interval: 100,
      })
      .toBeGreaterThan(0);
    // Let the probe's retry/measure cycles settle before judging.
    await frames(12);
    const widget = container.querySelector<HTMLElement>('.plainmark-math-block')!;
    expect(widget.getBoundingClientRect().width).toBeGreaterThan(100);
    const line = widget.parentElement as HTMLElement;
    expect(parseFloat(getComputedStyle(line).paddingLeft)).toBeLessThan(100);
  });

  it('renders with the caret parked at offset 0 — the file-open state', async () => {
    // The production webview opens documents with the caret at 0 (no
    // initial_cursor on a plain open). The `> ` prefix must not count as
    // caret-inside, or a doc-start quoted block opens permanently revealed.
    view = mount_editor(container, QUOTED);
    view.dispatch({ selection: { anchor: 0 } });
    await expect
      .poll(() => container.querySelectorAll('.plainmark-math-block mjx-container').length, {
        timeout: 30000,
        interval: 100,
      })
      .toBeGreaterThan(0);
  });

  it('a resolved widget carries no min-height — natural height only (cache ratchet regression)', async () => {
    view = mount_editor(container, QUOTED);
    move_cursor(view, QUOTED.length);
    await expect
      .poll(() => container.querySelectorAll('.plainmark-math-block mjx-container').length, {
        timeout: 30000,
        interval: 100,
      })
      .toBeGreaterThan(0);
    await frames(5);
    // A min-height on the RESOLVED widget makes remember_block_height measure
    // its own floor (measured >= min-height), so a transient over-measurement
    // (e.g. pre-font-load typeset) would lock in an oversized box for the
    // session. Only the pending placeholder reserves height.
    const widget = container.querySelector<HTMLElement>('.plainmark-math-block')!;
    expect(widget.style.minHeight).toBe('');
  });

  it('strips `> ` markup from a multi-line quoted block before typesetting', async () => {
    const doc = '> $$\n> \\frac{c}{d}\n> $$\n\ntail';
    view = mount_editor(container, doc);
    move_cursor(view, doc.length);
    await expect
      .poll(() => container.querySelectorAll('.plainmark-math-block mjx-container').length, {
        timeout: 30000,
        interval: 100,
      })
      .toBeGreaterThan(0);
    await frames(5);
    // MathJax v4 CHTML carries the formula's characters as real DOM text — a
    // leaked quote marker would typeset as a `>` relational operator glyph.
    const widget = container.querySelector<HTMLElement>('.plainmark-math-block')!;
    expect(widget.textContent ?? '').not.toContain('>');
  });

  it('Backspace at the blank line below the quote deletes one newline, not the block (INV-SP-1 regression)', async () => {
    view = mount_editor(container, QUOTED);
    move_cursor(view, QUOTED.length);
    await expect
      .poll(() => container.querySelectorAll('mjx-container').length, {
        timeout: 30000,
        interval: 100,
      })
      .toBeGreaterThan(0);
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

  it('a DOM selection reaching into the widget text cannot alter the math source bytes', async () => {
    view = mount_editor(container, QUOTED);
    move_cursor(view, QUOTED.length);
    await expect
      .poll(() => container.querySelectorAll('mjx-container').length, {
        timeout: 30000,
        interval: 100,
      })
      .toBeGreaterThan(0);
    await frames(5);
    view.focus();
    const widget = container.querySelector('.plainmark-math-block')!;
    const walker = document.createTreeWalker(widget, NodeFilter.SHOW_TEXT);
    const wtext = walker.nextNode() as Text | null;
    expect(wtext).not.toBeNull();
    window.getSelection()?.setBaseAndExtent(wtext!, 0, wtext!, wtext!.length);
    await frames(2);
    document.execCommand('insertText', false, 'Z');
    await frames(5);
    // The math construct's bytes stay verbatim (pre-fix: the widget's unicode
    // DOM text replaced source bytes). A stray char at a defined position
    // outside the construct is CM6's normal widget-adjacent attribution.
    expect(view.state.doc.toString()).toContain('> $$\\underbrace{x}_{y}$$');
  });

  it('list-nested math stays suppressed: raw source, no widget', async () => {
    const doc = '- $$\\frac{a}{b}$$\n\ntail';
    view = mount_editor(container, doc);
    move_cursor(view, doc.length);
    await frames(10);
    expect(container.querySelectorAll('.plainmark-math-block').length).toBe(0);
    const first_line = container.querySelector<HTMLElement>('.cm-line');
    expect(first_line?.textContent).toContain('$$\\frac{a}{b}$$');
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
