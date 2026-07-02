import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor } from '../util.js';
import { get_active_cell_snapshot } from '../../../src/webview/widgets/table.js';

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

async function activate_cell(
  container: HTMLElement,
  view: EditorView,
  row_index: number,
  col_index: number,
): Promise<EditorView> {
  const td = get_cell(container, row_index, col_index);
  td.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  // activate_cell defers subview creation by one requestAnimationFrame.
  await next_frame();
  await next_frame();
  const snap = get_active_cell_snapshot(view);
  if (!snap) throw new Error('cell did not activate');
  return snap.sub_view;
}

const SAMPLE = '| col one | b |\n|---|---|\n| cell r1 | x |\n';

// A cell subview is its own EditorView nested inside the main editor's
// `.cm-content`. The main editor's prose-column theme rule must not reach the
// nested subview's `.cm-content`, or cell text picks up the prose-column
// constraint on activation.
describe('table cell subview — prose-column inset must not leak in', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    // A narrow pane — where the leaked inset was most visible.
    container.style.width = '320px';
    document.body.appendChild(container);
  });

  afterEach(() => {
    view?.destroy();
    view = undefined;
    container.remove();
  });

  it('main editor keeps the prose-column constraint', async () => {
    view = mount_editor(container, SAMPLE);
    await next_frame();
    await next_frame();

    // The prose-column inset rides max-width (a calc folding the side gap in),
    // not padding — see prose_column_theme. The main editor's content is
    // constrained; a cell subview's max-width stays `none` (asserted below).
    const cs = getComputedStyle(view.contentDOM);
    expect(cs.maxWidth).not.toBe('none');
    expect(cs.paddingLeft).toBe('0px');
  });

  it('cell subview content has no prose-column inset or max-width', async () => {
    view = mount_editor(container, SAMPLE);
    await next_frame();
    await next_frame();

    const sub = await activate_cell(container, view, 1, 0);
    const cs = getComputedStyle(sub.contentDOM);
    expect(cs.paddingLeft).toBe('0px');
    expect(cs.paddingRight).toBe('0px');
    expect(cs.maxWidth).toBe('none');
  });

  it('cell text sits flush against the cell content box, not indented', async () => {
    view = mount_editor(container, SAMPLE);
    await next_frame();
    await next_frame();

    const sub = await activate_cell(container, view, 1, 0);
    const td = get_cell(container, 1, 0);
    const line = sub.contentDOM.querySelector('.cm-line') as HTMLElement;
    const td_pad = parseFloat(getComputedStyle(td).paddingLeft);
    const gap = line.getBoundingClientRect().left - td.getBoundingClientRect().left;

    // Text starts at the cell's content-box edge — only the <td> padding. A
    // leaked prose-column rule would shift the gap beyond the <td> padding.
    expect(gap).toBeGreaterThanOrEqual(td_pad - 1);
    expect(gap).toBeLessThan(td_pad + 8);
  });

  it('cell text does not shift horizontally when the caret moves', async () => {
    view = mount_editor(container, SAMPLE);
    await next_frame();
    await next_frame();

    const sub = await activate_cell(container, view, 1, 0);
    const line_left = (): number =>
      (sub.contentDOM.querySelector('.cm-line') as HTMLElement).getBoundingClientRect()
        .left;

    const before = line_left();
    sub.dispatch({ selection: { anchor: 0 } });
    await next_frame();
    await next_frame();

    expect(Math.abs(line_left() - before)).toBeLessThan(0.5);
  });
});
