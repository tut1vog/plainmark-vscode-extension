// DOM-geometry oracles for the callout construct: normalize.ts strips
// styles and the per-line measured hanging indent, so a callout whose title
// collapsed onto its frame, whose body no longer hugged the accent, or whose
// title/body stacking inverted still passes every snapshot. These relational
// assertions (left-gutter offset, vertical stacking, body-x alignment band,
// content-width fit) fail on gross layout breakage without asserting any
// font-rasterized absolute pixel value.
//
// Note on "body left-aligns with title text": the title is an inline-flex
// icon + label, so its VISIBLE content origin is the icon (the label is inset by
// the icon width). CALL-R-10's contract is that body text hugs the accent at the
// SAME x as the title block's content origin — so the oracle aligns body text
// with the title WIDGET's left edge, not the label span.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor, move_cursor } from '../util.js';

function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}
async function frames(n: number): Promise<void> {
  for (let i = 0; i < n; i++) await next_frame();
}

describe('callout geometry oracles', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '600px';
    document.body.appendChild(container);
  });
  afterEach(() => {
    view?.destroy();
    view = undefined;
    container.remove();
  });

  it('CALL-R-3 CALL-R-5 CALL-R-10: title clears a left gutter, sits above the body, body hugs the title origin, and the frame fits the content width', async () => {
    const doc = '> [!NOTE] Title here\n> body text line here\n\ntail paragraph';
    view = mount_editor(container, doc);
    move_cursor(view, doc.length); // caret off the header line so the title widget renders (CALL-I-1)
    await frames(4);

    const content = view.contentDOM.getBoundingClientRect();
    const header = container
      .querySelector('.plainmark-callout-header')!
      .getBoundingClientRect();
    const body = container
      .querySelector('.plainmark-callout-body')!
      .getBoundingClientRect();
    const title = container
      .querySelector('.plainmark-callout-title')!
      .getBoundingClientRect();
    const icon = container.querySelector('.plainmark-callout-icon')!.getBoundingClientRect();
    const label = container
      .querySelector('.plainmark-callout-title-text')!
      .getBoundingClientRect();

    // Left accent gutter: the icon has real width and the title label is inset
    // from the frame's left edge by a nonzero offset (the accent-bar / icon slot),
    // so the title text never sits flush against the frame edge.
    expect(icon.width).toBeGreaterThan(0);
    expect(label.left).toBeGreaterThan(header.left + 4);
    expect(label.left).toBeGreaterThanOrEqual(icon.right - 1); // label right of the icon

    // Vertical stacking: the title block sits above the body block.
    expect(title.bottom).toBeLessThanOrEqual(body.top + 1);

    // Body text hugs the accent at the same x as the title block's content origin
    // (CALL-R-10). Measure the body line's first VISIBLE glyph (after the
    // transparent `> ` marker) via coordsAtPos and align it with the title widget.
    const body_line = view.state.doc.line(2);
    const body_glyph = view.coordsAtPos(body_line.from + 2)!;
    expect(Math.abs(body_glyph.left - title.left)).toBeLessThanOrEqual(2);

    // The whole frame fits within the editor content width.
    expect(header.left).toBeGreaterThanOrEqual(content.left - 1);
    expect(header.right).toBeLessThanOrEqual(content.right + 1);
    expect(body.left).toBeGreaterThanOrEqual(content.left - 1);
    expect(body.right).toBeLessThanOrEqual(content.right + 1);
  });
});
