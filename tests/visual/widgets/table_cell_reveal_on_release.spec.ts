// A cell-activation click must NOT reveal markers on press — neither in the
// activated cell nor in other inactive cells; markers stay hidden until mouseup.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { mount_editor } from '../util.js';

function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}

function get_cell(
  container: HTMLElement,
  row_index: number,
  col_index: number,
): HTMLTableCellElement {
  const td = container.querySelector(
    `[data-row-index="${row_index}"][data-col-index="${col_index}"]`,
  ) as HTMLTableCellElement | null;
  if (!td) throw new Error(`no cell at (${row_index}, ${col_index})`);
  return td;
}

function active_subview(): { view: EditorView; container: HTMLElement } {
  const c = document.querySelector('.plainmark-table-cell-edit') as HTMLElement | null;
  if (!c) throw new Error('no active subview');
  const root = c.querySelector('.cm-editor') as HTMLElement | null;
  if (!root) throw new Error('no .cm-editor');
  const view = EditorView.findFromDOM(root);
  if (!view) throw new Error('null view');
  return { view, container: c };
}

const TABLE = '| **bold** | x | y |\n|---|---|---|\n| 1 | 2 | 3 |\n';

describe('cell activation click suppresses reveal until mouseup', () => {
  let container: HTMLElement;
  let view: EditorView;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    view?.destroy();
    container.remove();
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  it('after activation click while main pointer is held, cell markers stay hidden until mouseup', async () => {
    view = mount_editor(container, TABLE);
    await next_frame();
    await next_frame();

    // Activate cell (0, 0) which contains `**bold**`. Dispatch a SINGLE
    // mousedown on the td that bubbles up — this matches the natural event
    // flow where one user click hits both td's direct handler AND
    // main.contentDOM's CM6 mousedown handler via bubble.
    const td = get_cell(container, 0, 0);
    const rect = td.getBoundingClientRect();
    td.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + 10,
        clientY: rect.top + rect.height / 2,
      }),
    );
    await next_frame();
    await next_frame();

    // Inspect the cell subview's hidden markers.
    const { container: cell_container } = active_subview();
    const hidden_during_press = cell_container.querySelectorAll(
      '.plainmark-inline-marker-hidden',
    ).length;
    expect(hidden_during_press).toBeGreaterThan(0);

    // Release: document mouseup. Cell should reveal markers.
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await next_frame();

    const hidden_after_release = cell_container.querySelectorAll(
      '.plainmark-inline-marker-hidden',
    ).length;
    expect(hidden_after_release).toBe(0);
  });
});
