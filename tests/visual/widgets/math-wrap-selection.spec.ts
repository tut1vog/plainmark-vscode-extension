import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor } from '../util.js';
import { ensure_mathjax } from '../mathjax-ready.js';

function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}

// SHELL-X-10 / MATH: a long inline `$…$` whose MathJax render breaks across
// visual rows (via the `mjx-break` boxes it inserts at relations/operators) is a
// single atomic replace-widget range. The position-based clipped-selection walk
// has no document position at the wrapped row's left edge, so before the fix it
// seeded that row AFTER the widget and left the wrapped continuation (here the
// `= (1_{n∈T})_n` fragment) with a white, unhighlighted gap. The layer must
// engulf each wrapped-widget box into the selection rectangle on its row.
describe('inline math wrap selection (MATH widget straddling visual rows)', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(async () => {
    await ensure_mathjax();
    container = document.createElement('div');
    // Narrow enough that the inline formula cannot fit on the row it starts on,
    // forcing MathJax to break it across two visual rows.
    container.style.width = '230px';
    document.body.appendChild(container);
  });

  afterEach(() => {
    view?.destroy();
    view = undefined;
    container.remove();
  });

  function selection_rects(): DOMRect[] {
    return Array.from(
      container.querySelectorAll<HTMLElement>(
        '.cm-clippedSelectionLayer .cm-clippedSelectionBackground',
      ),
    ).map((el) => el.getBoundingClientRect());
  }

  it('covers every visual row the wrapped inline-math widget spans', async () => {
    const math = '$\\Phi : \\mathcal{P}(\\mathbb{N}) \\to S, \\Phi(T) = (\\mathbf{1}_{n\\in T})_n$';
    const doc = `The map ${math}, is a bijection: its inverse sends a sequence to the set.`;
    view = mount_editor(container, doc);
    await expect
      .poll(
        () => container.querySelectorAll('.plainmark-math-inline mjx-container').length,
        { timeout: 30000, interval: 100 },
      )
      .toBeGreaterThan(0);
    await next_frame();
    await next_frame();

    view.focus();
    view.dispatch({ selection: { anchor: 0, head: doc.length } });
    await next_frame();
    await next_frame();

    const widget = container.querySelector<HTMLElement>('.plainmark-math-inline')!;
    const widget_rows = Array.from(widget.getClientRects());
    // Precondition: the formula actually wrapped — otherwise the regression this
    // guards can't occur and the assertions below would pass vacuously.
    expect(widget_rows.length).toBeGreaterThan(1);

    const rects = selection_rects();
    for (const [i, wrow] of widget_rows.entries()) {
      const mid_y = (wrow.top + wrow.bottom) / 2;
      const cover = rects.find(
        (r) => r.top <= mid_y && r.bottom >= mid_y && r.left <= wrow.left + 1 && r.right >= wrow.right - 1,
      );
      expect(
        cover,
        `widget row ${i} [${wrow.left.toFixed(1)}, ${wrow.right.toFixed(1)}] should be fully covered by a selection rect`,
      ).toBeDefined();
    }
  });
});
