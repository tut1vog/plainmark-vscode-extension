import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor } from '../util.js';
import { TABLE_KEYBINDING_DEFAULTS } from '../../../src/common/table_keybindings.js';

function get_table_block(container: HTMLElement): HTMLElement {
  const block = container.querySelector('.plainmark-table-block') as HTMLElement | null;
  if (!block) throw new Error('no .plainmark-table-block in DOM');
  return block;
}

function get_cell(
  container: HTMLElement,
  row_index: number,
  col_index: number,
): HTMLTableCellElement {
  const sel = `[data-row-index="${row_index}"][data-col-index="${col_index}"]`;
  const td = get_table_block(container).querySelector(sel) as HTMLTableCellElement | null;
  if (!td) throw new Error(`no cell at (${row_index}, ${col_index})`);
  return td;
}

function right_click(td: Element, x = 10, y = 10): void {
  td.dispatchEvent(
    new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }),
  );
}

function get_menu(): HTMLElement | null {
  return document.querySelector('.plainmark-table-context-menu');
}

function get_menu_item(id: string): HTMLElement | null {
  return document.querySelector(
    `.plainmark-table-context-menu-item[data-menu-item-id="${id}"]`,
  );
}

async function next_frame(): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

const SAMPLE_TABLE = '| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n';

describe('table context menu — DOM behavior', () => {
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
    // Menu lives on document.body, not inside container; remove leftovers.
    document.querySelectorAll('.plainmark-table-context-menu').forEach((el) => el.remove());
    delete window.__plainmark_table_keybindings;
  });

  it('TBL-I-12 TBL-I-13: right-click on a body cell opens the menu with 15 items and 3 separators', () => {
    view = mount_editor(container, SAMPLE_TABLE);
    right_click(get_cell(container, 1, 0));

    const menu = get_menu();
    expect(menu).not.toBeNull();
    const items = menu!.querySelectorAll('.plainmark-table-context-menu-item');
    const seps = menu!.querySelectorAll('.plainmark-table-context-menu-separator');
    expect(items.length).toBe(15);
    expect(seps.length).toBe(3);
  });

  it('TBL-I-14: right-click on a header cell disables insert_row_above, delete_row, swap_row_up', () => {
    view = mount_editor(container, SAMPLE_TABLE);
    right_click(get_cell(container, 0, 1));

    for (const id of ['insert_row_above', 'delete_row', 'swap_row_up']) {
      const item = get_menu_item(id);
      expect(item, `missing item ${id}`).not.toBeNull();
      expect(item!.classList.contains('plainmark-table-context-menu-item-disabled')).toBe(true);
      expect(item!.getAttribute('aria-disabled')).toBe('true');
    }
  });

  it('TBL-I-14: right-click on a first-column cell disables swap_column_left', () => {
    view = mount_editor(container, SAMPLE_TABLE);
    right_click(get_cell(container, 1, 0));

    const item = get_menu_item('swap_column_left');
    expect(item).not.toBeNull();
    expect(item!.classList.contains('plainmark-table-context-menu-item-disabled')).toBe(true);
    expect(item!.getAttribute('aria-disabled')).toBe('true');
  });

  it('TBL-I-14: right-click on a last-column cell disables swap_column_right', () => {
    view = mount_editor(container, SAMPLE_TABLE);
    right_click(get_cell(container, 1, 2));

    const item = get_menu_item('swap_column_right');
    expect(item).not.toBeNull();
    expect(item!.classList.contains('plainmark-table-context-menu-item-disabled')).toBe(true);
    expect(item!.getAttribute('aria-disabled')).toBe('true');
  });

  it('TBL-I-14: right-click on the last body row disables swap_row_down', () => {
    view = mount_editor(container, SAMPLE_TABLE);
    right_click(get_cell(container, 2, 1));

    const item = get_menu_item('swap_row_down');
    expect(item).not.toBeNull();
    expect(item!.classList.contains('plainmark-table-context-menu-item-disabled')).toBe(true);
    expect(item!.getAttribute('aria-disabled')).toBe('true');
  });

  it('TBL-I-12: Escape dismisses the menu', () => {
    view = mount_editor(container, SAMPLE_TABLE);
    right_click(get_cell(container, 1, 0));
    expect(get_menu()).not.toBeNull();

    document.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }),
    );
    expect(get_menu()).toBeNull();
  });

  it('TBL-I-12: outside mousedown dismisses the menu', () => {
    view = mount_editor(container, SAMPLE_TABLE);
    right_click(get_cell(container, 1, 0));
    expect(get_menu()).not.toBeNull();

    document.body.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
    );
    expect(get_menu()).toBeNull();
  });

  it('TBL-I-12 TBL-SP-2: clicking an enabled item fires one change-bearing main-view transaction and closes the menu', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    const table_from = Number(get_table_block(container).dataset.tableFrom);

    right_click(get_cell(container, 1, 0));
    const dispatch_spy = vi.spyOn(view, 'dispatch');

    const item = get_menu_item('insert_row_below');
    expect(item).not.toBeNull();
    item!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await next_frame();

    // RC2's re-focus + RC3's activation seed add selection-only dispatches; the
    // structural op stays exactly ONE change-bearing dispatch (TBL-SP-2).
    const change_calls = dispatch_spy.mock.calls.filter(
      (c) => (c[0] as { changes?: unknown }).changes !== undefined,
    );
    expect(change_calls.length).toBe(1);
    const arg = change_calls[0][0] as { changes?: { from: number } };
    expect(arg.changes?.from).toBe(table_from);
    expect(get_menu()).toBeNull();
  });

  it('TBL-I-33: clicking Delete table removes the whole block and lands the caret at the table start', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    const table_from = Number(get_table_block(container).dataset.tableFrom);

    right_click(get_cell(container, 1, 0));
    const item = get_menu_item('delete_table');
    expect(item).not.toBeNull();
    expect(item!.classList.contains('plainmark-table-context-menu-item-disabled')).toBe(false);
    item!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await next_frame();

    // SAMPLE_TABLE is the entire document (table + one trailing newline), so a
    // clean removal empties the doc, and the rendered block leaves the DOM.
    expect(view.state.doc.toString()).toBe('');
    expect(container.querySelector('.plainmark-table-block')).toBeNull();
    expect(view.state.selection.main.head).toBe(table_from);
    expect(get_menu()).toBeNull();
  });

  it('TBL-I-12 TBL-I-14: clicking a disabled item does not dispatch and does not dismiss the menu', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    right_click(get_cell(container, 0, 0));
    const dispatch_spy = vi.spyOn(view, 'dispatch');

    const item = get_menu_item('delete_row');
    expect(item).not.toBeNull();
    expect(item!.classList.contains('plainmark-table-context-menu-item-disabled')).toBe(true);
    item!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await next_frame();

    expect(dispatch_spy).not.toHaveBeenCalled();
    expect(get_menu()).not.toBeNull();
  });

  it('TBL-I-12: window scroll dismisses the menu', () => {
    view = mount_editor(container, SAMPLE_TABLE);
    right_click(get_cell(container, 1, 0));
    expect(get_menu()).not.toBeNull();

    window.dispatchEvent(new Event('scroll'));
    expect(get_menu()).toBeNull();
  });

  it('TBL-I-12: opening a second menu dismisses the first (only one menu at a time)', () => {
    view = mount_editor(container, SAMPLE_TABLE);
    right_click(get_cell(container, 1, 0));
    expect(document.querySelectorAll('.plainmark-table-context-menu').length).toBe(1);

    right_click(get_cell(container, 2, 1));
    expect(document.querySelectorAll('.plainmark-table-context-menu').length).toBe(1);
  });

  it('TBL-I-27: bound items render a shortcut hint + aria-keyshortcuts; unbound items render neither', () => {
    view = mount_editor(container, SAMPLE_TABLE);
    right_click(get_cell(container, 1, 1));

    const insert_below = get_menu_item('insert_row_below');
    expect(insert_below).not.toBeNull();
    const hint = insert_below!.querySelector('.plainmark-table-context-menu-item-shortcut');
    expect(hint).not.toBeNull();
    expect(hint!.textContent).toContain('Enter');
    // aria-keyshortcuts is canonical (platform-invariant), unlike the visible text.
    expect(insert_below!.getAttribute('aria-keyshortcuts')).toBe('Control+Enter');

    const swap_left = get_menu_item('swap_column_left');
    expect(swap_left!.getAttribute('aria-keyshortcuts')).toBe('Alt+ArrowLeft');

    // delete_row now ships a default (Mod-Shift-Backspace, Typora parity, TBL-I-29).
    const delete_row = get_menu_item('delete_row');
    expect(
      delete_row!.querySelector('.plainmark-table-context-menu-item-shortcut'),
    ).not.toBeNull();
    expect(delete_row!.getAttribute('aria-keyshortcuts')).toBe('Control+Shift+Backspace');

    for (const id of ['delete_column', 'align_left', 'align_center', 'align_right', 'align_none']) {
      const item = get_menu_item(id);
      expect(item, `missing item ${id}`).not.toBeNull();
      expect(item!.querySelector('.plainmark-table-context-menu-item-shortcut')).toBeNull();
      expect(item!.getAttribute('aria-keyshortcuts')).toBeNull();
    }
  });

  it('TBL-I-27 TBL-I-28: a custom binding is reflected in the menu hint and aria', () => {
    window.__plainmark_table_keybindings = {
      ...TABLE_KEYBINDING_DEFAULTS,
      swap_row_up: 'Mod-Alt-u',
    };
    view = mount_editor(container, SAMPLE_TABLE);
    right_click(get_cell(container, 2, 1));

    const swap_up = get_menu_item('swap_row_up');
    expect(
      swap_up!.querySelector('.plainmark-table-context-menu-item-shortcut')!.textContent,
    ).toContain('U');
    expect(swap_up!.getAttribute('aria-keyshortcuts')).toBe('Control+Alt+u');
  });

  it('TBL-I-8 TBL-I-32 (RC2): clicking an enabled structural item re-activates the destination cell', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    // No cell active and the main caret at document start (the "right-click op →
    // caret to 0" condition).
    view.dispatch({ selection: { anchor: 0 } });
    right_click(get_cell(container, 1, 1));

    get_menu_item('insert_column_right')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    await new Promise((r) => setTimeout(r, 50));
    await next_frame();
    await next_frame();

    const td = document.querySelector('.plainmark-table-cell-edit')?.closest('td') as
      | HTMLTableCellElement
      | undefined;
    expect(td).toBeTruthy();
    expect(Number(td!.dataset.rowIndex)).toBe(1);
    expect(Number(td!.dataset.colIndex)).toBe(2);
  });

  it('TBL-I-32 (RC2): clicking an align item does NOT activate a cell (no re-focus)', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    view.dispatch({ selection: { anchor: 0 } });
    right_click(get_cell(container, 1, 1));

    get_menu_item('align_center')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    await new Promise((r) => setTimeout(r, 50));
    await next_frame();
    await next_frame();

    expect(document.querySelector('.plainmark-table-cell-edit')).toBeNull();
  });
});
