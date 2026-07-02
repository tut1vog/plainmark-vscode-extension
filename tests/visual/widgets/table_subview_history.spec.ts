import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { undoDepth } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import { mount_editor } from '../util.js';

async function next_frame(): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

function get_table_block(container: HTMLElement): HTMLElement {
  const block = container.querySelector('.plainmark-table-block') as HTMLElement | null;
  if (!block) throw new Error('no .plainmark-table-block');
  return block;
}

function get_cell(
  container: HTMLElement,
  row_index: number,
  col_index: number,
): HTMLTableCellElement {
  const sel = `[data-row-index="${row_index}"][data-col-index="${col_index}"]`;
  const block = get_table_block(container);
  const td = block.querySelector(sel) as HTMLTableCellElement | null;
  if (!td) throw new Error(`no cell at (${row_index}, ${col_index})`);
  return td;
}

function active_subview_container(): HTMLElement | null {
  return document.querySelector('.plainmark-table-cell-edit');
}

function active_subview_view(): EditorView {
  const sub = active_subview_container();
  if (!sub) throw new Error('no active subview container');
  const root = sub.querySelector('.cm-editor') as HTMLElement | null;
  if (!root) throw new Error('no .cm-editor inside subview');
  const sub_view = EditorView.findFromDOM(root);
  if (!sub_view) throw new Error('EditorView.findFromDOM returned null for subview root');
  return sub_view;
}

async function activate_cell(
  container: HTMLElement,
  row_index: number,
  col_index: number,
): Promise<void> {
  const td = get_cell(container, row_index, col_index);
  td.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await next_frame();
  await next_frame();
  if (!active_subview_container()) throw new Error('subview did not mount');
}

const SAMPLE_TABLE = '| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n';

describe('subview history is empty (addToHistory.of(false) extender)', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    view?.destroy();
    view = undefined;
    container.remove();
  });

  it('TBL-I-9: subview undoDepth is 0 immediately after mount', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    await activate_cell(container, 1, 0);
    const sub_view = active_subview_view();
    expect(undoDepth(sub_view.state)).toBe(0);
  });

  it('TBL-I-9: subview undoDepth stays 0 after the user types 3 characters', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    await activate_cell(container, 1, 0);
    const sub_view = active_subview_view();

    for (const ch of 'abc') {
      sub_view.dispatch({
        changes: { from: sub_view.state.doc.length, insert: ch },
        userEvent: 'input.type',
      });
      await next_frame();
    }

    // With the transactionExtender stamping addToHistory.of(false)
    // on every non-sync subview transaction, the subview's local history
    // never grows. (Main view's history grew by 3 — that's where undo lives.)
    expect(undoDepth(sub_view.state)).toBe(0);
  });

  it('TBL-I-9: main-view history grows with cell edits (control: confirms main is the history owner)', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    const before = undoDepth(view.state);
    await activate_cell(container, 1, 0);
    const sub_view = active_subview_view();

    sub_view.dispatch({
      changes: { from: 0, to: 0, insert: 'X' },
      userEvent: 'input.type',
    });
    await next_frame();

    // The cell_edit_listener dispatches a main_view transaction per keystroke.
    // Main view history grew by at least one event.
    expect(undoDepth(view.state)).toBeGreaterThan(before);
  });
});
