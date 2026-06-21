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
  const block = container.querySelector('.plainmark-table-block') as HTMLElement | null;
  if (!block) throw new Error('no .plainmark-table-block');
  const td = block.querySelector(
    `[data-row-index="${row_index}"][data-col-index="${col_index}"]`,
  ) as HTMLTableCellElement | null;
  if (!td) throw new Error(`no cell at (${row_index}, ${col_index})`);
  return td;
}

function press(td: HTMLTableCellElement): void {
  const rect = td.getBoundingClientRect();
  td.dispatchEvent(
    new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + 10,
      clientY: rect.top + rect.height / 2,
    }),
  );
}

const TABLE = '| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |\n';

describe('TBL-I-1 — cell activation race (rAF supersession)', () => {
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

  it('two cell activations in one frame leave exactly one live subview', async () => {
    view = mount_editor(container, TABLE);
    await next_frame();
    await next_frame();

    const first = get_cell(container, 1, 0);
    const second = get_cell(container, 1, 1);

    // Both presses land before any rAF runs (same frame). The earlier
    // activation must abort so it never builds a leaked subview.
    press(first);
    press(second);
    await next_frame();
    await next_frame();

    expect(document.querySelectorAll('.plainmark-table-cell-edit')).toHaveLength(1);
    expect(first.querySelector('.plainmark-table-cell-edit')).toBeNull();

    const first_root = first.querySelector('.cm-editor') as HTMLElement | null;
    expect(first_root ? EditorView.findFromDOM(first_root) : null).toBeNull();

    const second_sub = second.querySelector('.plainmark-table-cell-edit');
    expect(second_sub).not.toBeNull();
  });

  it('activation pending when the widget is destroyed never mounts a subview', async () => {
    view = mount_editor(container, TABLE);
    await next_frame();
    await next_frame();

    const td = get_cell(container, 1, 0);
    press(td);
    // Same frame as the press: a dimension change makes updateDOM decline,
    // so CM destroys the old widget DOM and rebuilds via toDOM — while the
    // activation rAF is still pending against the old td.
    view.dispatch({
      changes: { from: view.state.doc.length, insert: '| 4 | 5 | 6 |\n' },
    });
    await next_frame();
    await next_frame();

    expect(td.isConnected).toBe(false);
    expect(td.querySelector('.plainmark-table-cell-edit')).toBeNull();
    expect(document.querySelectorAll('.plainmark-table-cell-edit')).toHaveLength(0);
    expect(view.dom.hasAttribute('data-plainmark-cell-active')).toBe(false);
  });
});
