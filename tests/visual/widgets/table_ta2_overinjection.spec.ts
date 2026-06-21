import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { mount_editor } from '../util.js';

async function next_frame(): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

async function settle(): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, 20));
  await next_frame();
  await next_frame();
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

function active_subview_view(): EditorView {
  const sub = document.querySelector('.plainmark-table-cell-edit') as HTMLElement | null;
  if (!sub) throw new Error('no active subview');
  const root = sub.querySelector('.cm-editor') as HTMLElement | null;
  if (!root) throw new Error('no .cm-editor in subview');
  const view = EditorView.findFromDOM(root);
  if (!view) throw new Error('EditorView.findFromDOM returned null');
  return view;
}

async function activate(container: HTMLElement, row: number, col: number): Promise<void> {
  const td = get_cell(container, row, col);
  td.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await next_frame();
  await next_frame();
  if (!document.querySelector('.plainmark-table-cell-edit')) {
    throw new Error('subview did not mount');
  }
}

describe('T10.6.6i — TA2 over-injection on cell edit', () => {
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

  // Initial: table immediately followed by a single-line paragraph `a`, with
  // one `\n` between table and `a` (no blank line). User reports: editing the
  // last cell pushes `a` down by inserting an extra `\n`.
  it('TBL-SP-7: editing the last row does not push the line below away from the table', async () => {
    const initial =
      '| Column A | Column B | Column C |\n' +
      '| -------- | -------- | -------- |\n' +
      '|          |          |          |\n' +
      '|          |          |          |\n' +
      'a';
    view = mount_editor(container, initial);
    await activate(container, 2, 2);
    const sub = active_subview_view();

    // Insert 's' into the last cell of the last row.
    sub.dispatch({
      changes: { from: 0, to: sub.state.doc.length, insert: 's' },
      userEvent: 'input.type',
    });
    await settle();

    const doc_after = view.state.doc.toString();
    // Expect single `\n` between the last pipe-row and the `a` line — no
    // injected blank line. (Column widths are 8 — header 'Column A' wins —
    // so the inserted 's' renders as ` s        ` between pipes.)
    expect(doc_after.endsWith('|\na')).toBe(true);
    expect(doc_after.includes('|\n\na')).toBe(false);
  });

  it('TBL-SP-7: editing a cell preserves an existing blank line below the table', async () => {
    const initial =
      '| Column A | Column B | Column C |\n' +
      '| -------- | -------- | -------- |\n' +
      '|          |          |          |\n' +
      '|          |          |          |\n' +
      '\n' +
      'a';
    view = mount_editor(container, initial);
    await activate(container, 2, 2);
    const sub = active_subview_view();

    sub.dispatch({
      changes: { from: 0, to: sub.state.doc.length, insert: 's' },
      userEvent: 'input.type',
    });
    await settle();

    // Blank line is preserved — no triple newline injected.
    const doc_after = view.state.doc.toString();
    expect(doc_after.endsWith('|\n\na')).toBe(true);
    expect(doc_after.includes('|\n\n\na')).toBe(false);
  });

  it('TBL-SP-7: editing a cell when the table is at the end of the doc still injects a target line', async () => {
    const initial =
      '| Column A | Column B | Column C |\n' +
      '| -------- | -------- | -------- |\n' +
      '|          |          |          |';
    view = mount_editor(container, initial);
    await activate(container, 1, 2);
    const sub = active_subview_view();

    sub.dispatch({
      changes: { from: 0, to: sub.state.doc.length, insert: 's' },
      userEvent: 'input.type',
    });
    await settle();

    // End-of-doc case: serializer doesn't add trailing newline, so we need
    // to inject one so the user has a target line below the table.
    const doc_after = view.state.doc.toString();
    expect(doc_after.endsWith('\n')).toBe(true);
  });
});
