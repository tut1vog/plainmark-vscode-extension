// DOM-geometry oracles for the table widget: normalize.ts strips
// styles, so a table whose columns lost their alignment, whose grid overlapped,
// or that overflowed the editor still passes every snapshot. These relational
// assertions (shared edges within a tolerance band, monotonic non-overlapping
// columns, text inside its padded cell, block within content width) fail on gross
// layout breakage without asserting any font-rasterized absolute pixel value.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor } from '../util.js';

function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}
async function frames(n: number): Promise<void> {
  for (let i = 0; i < n; i++) await next_frame();
}

const ALIGN_TOL = 1.5; // shared-edge tolerance band (sub-pixel AA / collapsed border)

describe('table widget geometry oracles', () => {
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

  // 3 rows (header + 2 body) × 3 columns.
  const DOC =
    '| H1 | H2 | H3 |\n|----|----|----|\n| a1 | b1 | c1 |\n| a2 | b2 | c2 |\n';

  function cell(row: number, col: number): HTMLElement {
    const el = container.querySelector<HTMLElement>(
      `.plainmark-table-block [data-row-index="${row}"][data-col-index="${col}"]`,
    );
    if (!el) throw new Error(`no cell (${row}, ${col})`);
    return el;
  }

  it('TBL-R-2 TBL-R-10: columns share a left edge, rows share top/height, the grid is contiguous without overlap, and cell text sits inside its padded cell', async () => {
    view = mount_editor(container, DOC);
    await frames(4);

    // Column alignment: every cell of a column shares its left edge.
    for (let col = 0; col < 3; col++) {
      const lefts = [0, 1, 2].map((row) => cell(row, col).getBoundingClientRect().left);
      for (const l of lefts) expect(Math.abs(l - lefts[0])).toBeLessThanOrEqual(ALIGN_TOL);
    }

    // Row alignment: every cell of a row shares its top and its height.
    for (let row = 0; row < 3; row++) {
      const rects = [0, 1, 2].map((col) => cell(row, col).getBoundingClientRect());
      for (const rc of rects) {
        expect(Math.abs(rc.top - rects[0].top)).toBeLessThanOrEqual(ALIGN_TOL);
        expect(Math.abs(rc.height - rects[0].height)).toBeLessThanOrEqual(ALIGN_TOL);
      }
    }

    // Contiguous grid: columns advance left→right, and each column starts at (or
    // after) the previous column's right edge — no gross overlap. (border-collapse
    // makes adjacent edges meet, hence the tolerance band rather than a hard >.)
    const col_left = [0, 1, 2].map((col) => cell(0, col).getBoundingClientRect().left);
    const col_right = [0, 1, 2].map((col) => cell(0, col).getBoundingClientRect().right);
    expect(col_left[1]).toBeGreaterThan(col_left[0]);
    expect(col_left[2]).toBeGreaterThan(col_left[1]);
    expect(col_left[1]).toBeGreaterThanOrEqual(col_right[0] - ALIGN_TOL);
    expect(col_left[2]).toBeGreaterThanOrEqual(col_right[1] - ALIGN_TOL);

    // Cell text sits strictly inside its cell rect (non-zero padding on all sides).
    const target = cell(1, 0);
    const cell_rect = target.getBoundingClientRect();
    const rg = document.createRange();
    rg.selectNodeContents(target);
    const text = rg.getBoundingClientRect();
    expect(text.left).toBeGreaterThan(cell_rect.left);
    expect(text.right).toBeLessThan(cell_rect.right);
    expect(text.top).toBeGreaterThan(cell_rect.top);
    expect(text.bottom).toBeLessThan(cell_rect.bottom);
  });

  it('TBL-R-10: the table block fits within the editor content width (no silent overflow)', async () => {
    view = mount_editor(container, DOC);
    await frames(4);

    const content = view.contentDOM.getBoundingClientRect();
    const block = container
      .querySelector('.plainmark-table-block')!
      .getBoundingClientRect();

    expect(block.width).toBeGreaterThan(0);
    expect(block.left).toBeGreaterThanOrEqual(content.left - 1);
    expect(block.right).toBeLessThanOrEqual(content.right + 1);
  });
});
