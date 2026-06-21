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

async function click_cell_at(td: HTMLTableCellElement, coords: { x: number; y: number }): Promise<void> {
  td.dispatchEvent(
    new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: coords.x,
      clientY: coords.y,
    }),
  );
  await next_frame();
  await next_frame();
}

const SAMPLE_TABLE = '| a | b | c |\n|---|---|---|\n| hello | world | test |\n| 4 | 5 | 6 |\n';

describe('T10.6.6h — cell caret landing on activation', () => {
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

  it('TBL-I-2: activate via mousedown at TD center puts caret at end of cell when click is past last char', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    const td = get_cell(container, 1, 0);
    const rect = td.getBoundingClientRect();
    // Click on the far right of the TD — past the 'hello' text in a wide column.
    await click_cell_at(td, { x: rect.right - 2, y: rect.top + rect.height / 2 });
    await settle();

    const sub = active_subview_view();
    expect(sub.state.doc.toString()).toBe('hello');
    // Caret lands at the position nearest the click; with the click past the
    // last char, that's doc.length (end of cell).
    expect(sub.state.selection.main.head).toBe(sub.state.doc.length);
  });

  it('TBL-I-2: activate via mousedown near the start of the text puts caret near the start', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    const td = get_cell(container, 1, 0);
    const rect = td.getBoundingClientRect();
    // Click near the very left of the TD — should land at position 0 or 1.
    await click_cell_at(td, { x: rect.left + 1, y: rect.top + rect.height / 2 });
    await settle();

    const sub = active_subview_view();
    expect(sub.state.doc.toString()).toBe('hello');
    // Caret should be near the start (0 or 1), NOT at the end.
    const head = sub.state.selection.main.head;
    expect(head).toBeLessThan(sub.state.doc.length);
  });

  it('TBL-I-2 TBL-I-5: non-click activation (programmatic via Tab from a previous cell) defaults to end of cell', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    // First activate (0, 0) via click.
    const td_00 = get_cell(container, 0, 0);
    const rect_00 = td_00.getBoundingClientRect();
    await click_cell_at(td_00, { x: rect_00.right - 2, y: rect_00.top + rect_00.height / 2 });
    await settle();

    // Tab to (0, 1) — non-click activation path.
    const cm_dom = active_subview_view().contentDOM;
    cm_dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    await settle();

    const sub = active_subview_view();
    expect(sub.state.doc.toString()).toBe('b');
    // Default caret landing post-T10.6.6h: end of cell.
    expect(sub.state.selection.main.head).toBe(sub.state.doc.length);
  });
});
