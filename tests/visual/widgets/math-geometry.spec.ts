// DOM-geometry oracles for the math widgets: tests/visual/normalize.ts
// elides every mjx-container to a placeholder and strips styles, so a visually
// collapsed / mispositioned formula still passes every snapshot. These relational
// assertions (nonzero rects, contained-within, above/below ordering, ratio bands)
// fail on gross layout breakage without ever asserting a font-rasterized absolute
// pixel value, so they hold identically on macOS and ubuntu Chromium.
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
function line_by_text(container: HTMLElement, text: string): HTMLElement {
  const el = Array.from(container.querySelectorAll<HTMLElement>('.cm-line')).find(
    (l) => (l.textContent ?? '').trim() === text,
  );
  if (!el) throw new Error(`no .cm-line with text "${text}"`);
  return el;
}

describe('math widget geometry oracles', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(async () => {
    await ensure_mathjax();
    container = document.createElement('div');
    container.style.width = '600px';
    document.body.appendChild(container);
  });
  afterEach(() => {
    view?.destroy();
    view = undefined;
    container.remove();
  });

  it('MATH-R-3 MATH-R-7: a block mjx-container has nonzero size, sits within the content area, and lands between its neighbor lines', async () => {
    const doc = 'above paragraph\n\n$$\n\\frac{a}{b}\n$$\n\nbelow paragraph';
    view = mount_editor(container, doc);
    move_cursor(view, doc.length); // caret off the block so it renders (MATH-I-2)
    await expect
      .poll(() => container.querySelectorAll('mjx-container[display="true"]').length, {
        timeout: 30000,
        interval: 100,
      })
      .toBeGreaterThan(0);
    await frames(3);

    const content = view.contentDOM.getBoundingClientRect();
    const mjx = container
      .querySelector('mjx-container[display="true"]')!
      .getBoundingClientRect();
    const above = line_by_text(container, 'above paragraph').getBoundingClientRect();
    const below = line_by_text(container, 'below paragraph').getBoundingClientRect();

    // Nonzero rendered size — a collapsed typeset (elided by normalize) would be 0.
    expect(mjx.width).toBeGreaterThan(0);
    expect(mjx.height).toBeGreaterThan(0);

    // Horizontally within the editor content box (1px AA/border tolerance).
    expect(mjx.left).toBeGreaterThanOrEqual(content.left - 1);
    expect(mjx.right).toBeLessThanOrEqual(content.right + 1);

    // Vertically ordered: the paragraph above ends at or before the formula, and
    // the formula ends at or before the paragraph below (a formula that overlapped
    // a neighbor line, or rendered at y=0, would violate this).
    expect(above.bottom).toBeLessThanOrEqual(mjx.top + 1);
    expect(mjx.bottom).toBeLessThanOrEqual(below.top + 1);
  });

  it('MATH-R-7: the block widget padding is the only vertical chrome — the inner mjx-container margin is zeroed', async () => {
    // Src unique to this test: a shared src would seed the widget's reserved
    // min-height from another test's measurement and inflate the box past the
    // padding + container sum this oracle asserts.
    const doc = 'above paragraph\n\n$$\\frac{p_1}{q_2}$$\n\nbelow paragraph';
    view = mount_editor(container, doc);
    move_cursor(view, doc.length);
    await expect
      .poll(() => container.querySelectorAll('mjx-container[display="true"]').length, {
        timeout: 30000,
        interval: 100,
      })
      .toBeGreaterThan(0);
    await frames(3);

    const block = container.querySelector<HTMLElement>('.plainmark-math-block')!;
    const mjx = container.querySelector<HTMLElement>('mjx-container[display="true"]')!;
    const mcs = getComputedStyle(mjx);
    expect(mcs.marginTop).toBe('0px');
    expect(mcs.marginBottom).toBe('0px');

    // Relational: the widget box is exactly its padding plus the typeset
    // container — any re-leaked default margin (MathJax ships `.7em 0`)
    // reopens a gap between the two heights.
    const bcs = getComputedStyle(block);
    const chrome = parseFloat(bcs.paddingTop) + parseFloat(bcs.paddingBottom);
    const gap =
      block.getBoundingClientRect().height - mjx.getBoundingClientRect().height - chrome;
    expect(Math.abs(gap)).toBeLessThanOrEqual(1);
  });

  it('MATH-R-7 MATH-I-6: the in-flow block preview zeroes the inner mjx-container margin too', async () => {
    const doc = '$$\\frac{a}{b}$$\n\ntail';
    view = mount_editor(container, doc);
    move_cursor(view, 3); // caret inside the block — preview surface active
    await expect
      .poll(
        () =>
          container.querySelectorAll('.plainmark-math-block-preview mjx-container').length,
        { timeout: 30000, interval: 100 },
      )
      .toBeGreaterThan(0);
    await frames(3);

    const mjx = container.querySelector<HTMLElement>(
      '.plainmark-math-block-preview mjx-container',
    )!;
    const mcs = getComputedStyle(mjx);
    expect(mcs.marginTop).toBe('0px');
    expect(mcs.marginBottom).toBe('0px');
  });

  it('MATH-R-2 MATH-R-3: inline math height stays within a band of the line text and overlaps the text baseline', async () => {
    const doc = 'reference line here\n\nprose with $x^2$ math here\n\ntail';
    view = mount_editor(container, doc);
    move_cursor(view, doc.length);
    await expect
      .poll(
        () => container.querySelectorAll('.plainmark-math-inline mjx-container').length,
        { timeout: 30000, interval: 100 },
      )
      .toBeGreaterThan(0);
    await frames(3);

    const mjx = container
      .querySelector('.plainmark-math-inline mjx-container')!
      .getBoundingClientRect();
    // The prose text rect on the same visual line, measured from a plain glyph
    // before the math span (relational reference, not an absolute px value).
    const prose_line = view.state.doc.line(3);
    const text = view.coordsAtPos(prose_line.from + 2)!;
    const text_height = text.bottom - text.top;

    expect(mjx.width).toBeGreaterThan(0);
    expect(mjx.height).toBeGreaterThan(0);

    // Height within a generous ratio band of the surrounding text line height.
    // A collapsed (0×) or runaway (multi-line) inline widget falls outside it.
    const ratio = mjx.height / text_height;
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(2.5);

    // Baseline not wildly displaced: the widget's vertical rect overlaps the
    // surrounding text rect (math floated above/below its line would not overlap).
    expect(mjx.top).toBeLessThanOrEqual(text.bottom);
    expect(mjx.bottom).toBeGreaterThanOrEqual(text.top);
  });
});
