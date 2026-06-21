import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { mount_editor } from '../util.js';

async function next_frame(): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

function get_cell(
  container: HTMLElement,
  row_index: number,
  col_index: number,
): HTMLTableCellElement {
  const block = container.querySelector('.plainmark-table-block') as HTMLElement | null;
  if (!block) throw new Error('no .plainmark-table-block');
  const td = block.querySelector(
    `[data-row-index="${row_index}"][data-col-index="${col_index}"]`,
  ) as HTMLTableCellElement | null;
  if (!td) throw new Error(`no cell at (${row_index}, ${col_index})`);
  return td;
}

function active_subview_view(): EditorView {
  const sub = document.querySelector('.plainmark-table-cell-edit') as HTMLElement | null;
  if (!sub) throw new Error('no active subview');
  const root = sub.querySelector('.cm-editor') as HTMLElement | null;
  if (!root) throw new Error('no .cm-editor in subview');
  const view = EditorView.findFromDOM(root);
  if (!view) throw new Error('EditorView.findFromDOM returned null');
  return view;
}

function active_cell_row(): string | null {
  const sub = document.querySelector('.plainmark-table-cell-edit');
  const td = sub?.closest('td, th') as HTMLElement | null;
  return td?.getAttribute('data-row-index') ?? null;
}

async function activate_cell(
  container: HTMLElement,
  row_index: number,
  col_index: number,
): Promise<void> {
  get_cell(container, row_index, col_index).dispatchEvent(
    new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
  );
  // Activation is rAF-deferred — poll for the mounted subview instead of
  // counting frames, which under-waits on a loaded machine.
  await expect
    .poll(() => document.querySelector('.plainmark-table-cell-edit'), {
      timeout: 10000,
      interval: 20,
    })
    .not.toBeNull();
}

function key(target: Element, init: KeyboardEventInit): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
}

// A long unbroken token in the first body cell wraps to several visual rows
// under the narrow container width + word-break: break-word.
const LONG = 'wraplongtoken'.repeat(6);
const TABLE = `| ${LONG} | b | c |\n|---|---|---|\n| ${LONG} | y | z |\n`;

describe('TBL-I-7 — wrapped-cell vertical nav uses logical, not visual, lines', () => {
  let container: HTMLElement;
  let view: EditorView;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '140px';
    document.body.appendChild(container);
  });

  afterEach(() => {
    view?.destroy();
    container.remove();
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  it('ArrowUp from the second visual row of a wrapped body cell crosses to the cell above', async () => {
    view = mount_editor(container, TABLE);
    await next_frame();
    await activate_cell(container, 1, 0);

    const sub = active_subview_view();
    // Setup precondition: one logical line that genuinely wraps (caret end sits
    // on a lower visual row than offset 0). coordsAtPos needs a completed CM
    // measure cycle — poll rather than assume it already ran.
    expect(sub.state.doc.lines).toBe(1);
    await expect
      .poll(
        () => {
          const top0 = sub.coordsAtPos(0)?.top;
          const top_end = sub.coordsAtPos(sub.state.doc.length)?.top;
          return typeof top0 === 'number' && typeof top_end === 'number' && top_end > top0;
        },
        { timeout: 10000, interval: 20 },
      )
      .toBe(true);

    // Caret defaults to end-of-cell → on a wrapped visual row, but still the
    // single logical line. ArrowUp crosses the boundary (logical-line semantics).
    // The crossing chains requestMeasure → activate_cell rAF → focus
    // setTimeout(0) — poll the outcome instead of a fixed settle delay.
    key(sub.contentDOM, { key: 'ArrowUp' });
    await expect
      .poll(() => active_cell_row(), { timeout: 10000, interval: 20 })
      .toBe('0');
  });
});
