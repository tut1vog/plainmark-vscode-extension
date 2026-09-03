// Multi-cell selection (TBL-I-41..43, TBL-R-18): a press that starts in one
// cell and moves into another highlights the rectangle between them, Shift+click
// extends from the active cell, Backspace/Delete blank the range, and copy/cut
// put the cells on the clipboard as TSV plus an HTML table.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { undoDepth } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import { get_cell, get_table_block, mount_editor, next_frame } from '../util.js';

const TABLE = '| a | b | c |\n|---|---|---|\n| hello world | x | y |\n| 4 | 5 | 6 |\n';
const SELECTED = 'plainmark-table-cell-selected';

function active_subview_view(): EditorView {
  const root = document.querySelector(
    '.plainmark-table-cell-edit .cm-editor',
  ) as HTMLElement | null;
  const view = root ? EditorView.findFromDOM(root) : null;
  if (!view) throw new Error('no active subview');
  return view;
}

function center(el: Element): { clientX: number; clientY: number } {
  const rect = el.getBoundingClientRect();
  return { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
}

function selected_cells(container: HTMLElement): string[] {
  return Array.from(get_table_block(container).querySelectorAll(`.${SELECTED}`)).map(
    (td) => `${(td as HTMLElement).dataset.rowIndex},${(td as HTMLElement).dataset.colIndex}`,
  );
}

// The td press bubbles through the main view's capture-phase pointer latch, so
// the widget sees the button as held and drives the drag (TBL-I-26).
async function press(td: HTMLTableCellElement, init: MouseEventInit = {}): Promise<void> {
  const rect = td.getBoundingClientRect();
  td.dispatchEvent(
    new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + 3,
      clientY: rect.top + rect.height / 2,
      ...init,
    }),
  );
  await next_frame();
  await next_frame();
}

function drag_to(target: Element): void {
  document.dispatchEvent(
    new MouseEvent('mousemove', { bubbles: true, buttons: 1, ...center(target) }),
  );
}

function release(): void {
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}

function key(target: Element, init: KeyboardEventInit): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
}

function clipboard_event(type: 'copy' | 'cut'): ClipboardEvent {
  return new ClipboardEvent(type, {
    clipboardData: new DataTransfer(),
    bubbles: true,
    cancelable: true,
  });
}

async function select_range(view: EditorView, container: HTMLElement): Promise<EditorView> {
  await press(get_cell(container, 1, 0));
  drag_to(get_cell(container, 2, 1));
  release();
  await next_frame();
  return active_subview_view();
}

describe('table cell range selection', () => {
  let container: HTMLElement;
  let view: EditorView;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    view?.destroy();
    container.remove();
    release();
  });

  it('TBL-I-41 TBL-R-18: dragging from one cell into another highlights the rectangle between them', async () => {
    view = mount_editor(container, TABLE);
    await next_frame();
    await next_frame();

    await press(get_cell(container, 1, 0));
    const sub = active_subview_view();
    drag_to(get_cell(container, 2, 1));

    expect(selected_cells(container).sort()).toEqual(['1,0', '1,1', '2,0', '2,1']);
    expect(get_table_block(container).classList.contains('plainmark-table-range-active')).toBe(
      true,
    );
    expect(get_cell(container, 1, 0).querySelector('.plainmark-table-cell-edit')).not.toBeNull();
    expect(sub.state.selection.main.empty).toBe(true);

    // A reverse drag (up and left past the anchor) re-anchors the rectangle the other way.
    drag_to(get_cell(container, 0, 2));
    expect(selected_cells(container).sort()).toEqual(['0,0', '0,1', '0,2', '1,0', '1,1', '1,2']);
  });

  it('TBL-I-41: a pointer past the table edge clamps to the last row and column', async () => {
    view = mount_editor(container, TABLE);
    await next_frame();
    await next_frame();

    await press(get_cell(container, 1, 0));
    const rect = get_table_block(container).getBoundingClientRect();
    document.dispatchEvent(
      new MouseEvent('mousemove', {
        bubbles: true,
        buttons: 1,
        clientX: rect.right + 40,
        clientY: rect.bottom + 40,
      }),
    );
    expect(selected_cells(container).sort()).toEqual(['1,0', '1,1', '1,2', '2,0', '2,1', '2,2']);
  });

  it('TBL-I-41: dragging back into the anchor cell drops the range and resumes text selection', async () => {
    view = mount_editor(container, TABLE);
    await next_frame();
    await next_frame();

    await press(get_cell(container, 1, 0));
    const sub = active_subview_view();
    drag_to(get_cell(container, 2, 1));
    expect(selected_cells(container)).toHaveLength(4);

    const text_rect = sub.contentDOM.getBoundingClientRect();
    document.dispatchEvent(
      new MouseEvent('mousemove', {
        bubbles: true,
        buttons: 1,
        clientX: text_rect.right - 3,
        clientY: text_rect.top + text_rect.height / 2,
      }),
    );
    expect(selected_cells(container)).toHaveLength(0);
    expect(get_table_block(container).classList.contains('plainmark-table-range-active')).toBe(
      false,
    );
    expect(sub.state.selection.main.empty).toBe(false);
  });

  it('TBL-I-41: Shift+click on another cell selects the rectangle from the active cell without moving the caret', async () => {
    view = mount_editor(container, TABLE);
    await next_frame();
    await next_frame();

    await press(get_cell(container, 1, 0));
    release();
    await next_frame();
    const sub = active_subview_view();

    const shift_click = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      shiftKey: true,
      ...center(get_cell(container, 2, 2)),
    });
    get_cell(container, 2, 2).dispatchEvent(shift_click);
    await next_frame();
    await next_frame();

    expect(shift_click.defaultPrevented).toBe(true);
    expect(selected_cells(container).sort()).toEqual(['1,0', '1,1', '1,2', '2,0', '2,1', '2,2']);
    expect(active_subview_view()).toBe(sub);

    // Shift+click on the active cell itself clears the range.
    get_cell(container, 1, 0).dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true, shiftKey: true }),
    );
    expect(selected_cells(container)).toHaveLength(0);
  });

  it('TBL-I-42: Backspace blanks every selected cell in one undo step and keeps the range', async () => {
    view = mount_editor(container, TABLE);
    await next_frame();
    await next_frame();

    const sub = await select_range(view, container);
    const depth_before = undoDepth(view.state);
    key(sub.contentDOM, { key: 'Backspace' });
    await next_frame();

    expect(view.state.doc.toString()).toBe(
      '| a   | b   | c   |\n| --- | --- | --- |\n|     |     | y   |\n|     |     | 6   |\n',
    );
    expect(undoDepth(view.state)).toBe(depth_before + 1);
    expect(sub.state.doc.toString()).toBe('');
    expect(selected_cells(container).sort()).toEqual(['1,0', '1,1', '2,0', '2,1']);
    expect(active_subview_view()).toBe(sub);

    // Every cell already empty: Delete writes nothing.
    const state_before = view.state;
    key(sub.contentDOM, { key: 'Delete' });
    await next_frame();
    expect(view.state).toBe(state_before);
  });

  it('TBL-I-43: copy puts the range on the clipboard as TSV and an HTML table', async () => {
    view = mount_editor(container, TABLE);
    await next_frame();
    await next_frame();

    const sub = await select_range(view, container);
    const ev = clipboard_event('copy');
    sub.contentDOM.dispatchEvent(ev);

    expect(ev.defaultPrevented).toBe(true);
    expect(ev.clipboardData?.getData('text/plain')).toBe('hello world\tx\n4\t5');
    expect(ev.clipboardData?.getData('text/html')).toBe(
      '<table><tr><td>hello world</td><td>x</td></tr><tr><td>4</td><td>5</td></tr></table>',
    );
    expect(view.state.doc.toString()).toBe(TABLE);
  });

  it('TBL-I-43: cut copies the range and then blanks it', async () => {
    view = mount_editor(container, TABLE);
    await next_frame();
    await next_frame();

    const sub = await select_range(view, container);
    const ev = clipboard_event('cut');
    sub.contentDOM.dispatchEvent(ev);
    await next_frame();

    expect(ev.clipboardData?.getData('text/plain')).toBe('hello world\tx\n4\t5');
    expect(view.state.doc.toString()).toBe(
      '| a   | b   | c   |\n| --- | --- | --- |\n|     |     | y   |\n|     |     | 6   |\n',
    );
  });

  it('TBL-I-41: moving the caret in the anchor cell dismisses the range', async () => {
    view = mount_editor(container, TABLE);
    await next_frame();
    await next_frame();

    const sub = await select_range(view, container);
    key(sub.contentDOM, { key: 'ArrowRight' });
    await next_frame();
    expect(selected_cells(container)).toHaveLength(0);
    expect(get_table_block(container).classList.contains('plainmark-table-range-active')).toBe(
      false,
    );
    expect(active_subview_view()).toBe(sub);
  });

  it('TBL-I-41: typing into the anchor cell dismisses the range', async () => {
    view = mount_editor(container, TABLE);
    await next_frame();
    await next_frame();

    const sub = await select_range(view, container);
    sub.dispatch({ changes: { from: 0, insert: 'z' }, userEvent: 'input.type' });
    await next_frame();
    expect(selected_cells(container)).toHaveLength(0);
    expect(view.state.doc.toString()).toContain('zhello world');
  });

  it('TBL-I-41: navigating to another cell dismisses the range', async () => {
    view = mount_editor(container, TABLE);
    await next_frame();
    await next_frame();

    const sub = await select_range(view, container);
    key(sub.contentDOM, { key: 'Tab' });
    await next_frame();
    await next_frame();

    expect(get_cell(container, 1, 1).querySelector('.plainmark-table-cell-edit')).not.toBeNull();
    expect(selected_cells(container)).toHaveLength(0);
    expect(get_table_block(container).classList.contains('plainmark-table-range-active')).toBe(
      false,
    );
  });
});
