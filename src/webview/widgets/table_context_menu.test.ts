import { describe, expect, it } from 'vitest';
import {
  aria_keyshortcut,
  compute_menu_items,
  format_shortcut,
  type MenuItem,
  type MenuItemId,
} from './table_context_menu.js';
import type { TableModel } from './table_serialize.js';

function make_model(
  rows: string[][],
  alignment?: TableModel['alignment'],
): TableModel {
  const col_count = rows[0]?.length ?? 0;
  const align: TableModel['alignment'] = [];
  for (let c = 0; c < col_count; c++) align[c] = alignment?.[c] ?? null;
  return {
    rows: rows.map((row) => row.slice()),
    alignment: align,
    header_row_count: 1,
  };
}

function find_item(
  entries: ReturnType<typeof compute_menu_items>,
  id: MenuItemId,
): MenuItem {
  const entry = entries.find((e) => e.kind === 'item' && e.id === id);
  if (!entry || entry.kind !== 'item') {
    throw new Error(`menu item ${id} not found`);
  }
  return entry;
}

describe('TBL-I-13 compute_menu_items — structure', () => {
  it('returns 18 entries with separators at indices 4, 8, 13', () => {
    const entries = compute_menu_items({ row: 1, col: 1, row_count: 3, col_count: 3 });
    expect(entries).toHaveLength(18);
    expect(entries[4].kind).toBe('separator');
    expect(entries[8].kind).toBe('separator');
    expect(entries[13].kind).toBe('separator');
  });

  it('emits items in the documented canonical order', () => {
    const entries = compute_menu_items({ row: 1, col: 1, row_count: 3, col_count: 3 });
    const ids = entries
      .filter((e): e is MenuItem => e.kind === 'item')
      .map((e) => e.id);
    expect(ids).toEqual([
      'insert_row_above',
      'insert_row_below',
      'insert_column_left',
      'insert_column_right',
      'delete_row',
      'delete_column',
      'delete_table',
      'swap_row_up',
      'swap_row_down',
      'swap_column_left',
      'swap_column_right',
      'align_left',
      'align_center',
      'align_right',
      'align_none',
    ]);
  });

  it('every item has a non-empty label and a unique id', () => {
    const entries = compute_menu_items({ row: 1, col: 1, row_count: 3, col_count: 3 });
    const items = entries.filter((e): e is MenuItem => e.kind === 'item');
    const ids = new Set<string>();
    for (const item of items) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(ids.has(item.id)).toBe(false);
      ids.add(item.id);
    }
    expect(ids.size).toBe(15);
  });

  it('TBL-I-33: delete_table is present, labeled, and never disabled', () => {
    const ctxs = [
      { row: 0, col: 0, row_count: 1, col_count: 1 },
      { row: 0, col: 0, row_count: 3, col_count: 3 },
      { row: 2, col: 2, row_count: 3, col_count: 3 },
    ];
    for (const ctx of ctxs) {
      const item = find_item(compute_menu_items(ctx), 'delete_table');
      expect(item.label).toBe('Delete table');
      expect(item.disabled).toBe(false);
    }
  });
});

describe('TBL-I-14 compute_menu_items — disabled rules', () => {
  it('at (row=0, col=0, 3x3): insert_row_above, delete_row, swap_row_up, swap_column_left disabled; siblings enabled', () => {
    const entries = compute_menu_items({ row: 0, col: 0, row_count: 3, col_count: 3 });
    expect(find_item(entries, 'insert_row_above').disabled).toBe(true);
    expect(find_item(entries, 'delete_row').disabled).toBe(true);
    expect(find_item(entries, 'swap_row_up').disabled).toBe(true);
    expect(find_item(entries, 'swap_column_left').disabled).toBe(true);

    expect(find_item(entries, 'insert_row_below').disabled).toBe(false);
    expect(find_item(entries, 'insert_column_left').disabled).toBe(false);
    expect(find_item(entries, 'insert_column_right').disabled).toBe(false);
    expect(find_item(entries, 'delete_column').disabled).toBe(false);
    expect(find_item(entries, 'swap_column_right').disabled).toBe(false);
  });

  it('at (row=1, col=0, 3x3): swap_row_up disabled (row<=1) and swap_column_left disabled (col===0)', () => {
    const entries = compute_menu_items({ row: 1, col: 0, row_count: 3, col_count: 3 });
    expect(find_item(entries, 'swap_row_up').disabled).toBe(true);
    expect(find_item(entries, 'swap_column_left').disabled).toBe(true);
    expect(find_item(entries, 'swap_row_down').disabled).toBe(false);
    expect(find_item(entries, 'delete_row').disabled).toBe(false);
  });

  it('at (row=2, col=2, 3x3): swap_row_down disabled (last row) and swap_column_right disabled (last col)', () => {
    const entries = compute_menu_items({ row: 2, col: 2, row_count: 3, col_count: 3 });
    expect(find_item(entries, 'swap_row_down').disabled).toBe(true);
    expect(find_item(entries, 'swap_column_right').disabled).toBe(true);
    expect(find_item(entries, 'swap_row_up').disabled).toBe(false);
    expect(find_item(entries, 'swap_column_left').disabled).toBe(false);
  });

  it('at (row=1, col=0, 3x1): delete_column, swap_column_left, swap_column_right all disabled', () => {
    const entries = compute_menu_items({ row: 1, col: 0, row_count: 3, col_count: 1 });
    expect(find_item(entries, 'delete_column').disabled).toBe(true);
    expect(find_item(entries, 'swap_column_left').disabled).toBe(true);
    expect(find_item(entries, 'swap_column_right').disabled).toBe(true);
  });

  it('insert column items and align items are never disabled', () => {
    const ctxs = [
      { row: 0, col: 0, row_count: 1, col_count: 1 },
      { row: 1, col: 0, row_count: 3, col_count: 1 },
      { row: 2, col: 2, row_count: 3, col_count: 3 },
    ];
    for (const ctx of ctxs) {
      const entries = compute_menu_items(ctx);
      expect(find_item(entries, 'insert_column_left').disabled).toBe(false);
      expect(find_item(entries, 'insert_column_right').disabled).toBe(false);
      expect(find_item(entries, 'align_left').disabled).toBe(false);
      expect(find_item(entries, 'align_center').disabled).toBe(false);
      expect(find_item(entries, 'align_right').disabled).toBe(false);
      expect(find_item(entries, 'align_none').disabled).toBe(false);
    }
  });
});

describe('TBL-I-11 compute_menu_items — mutate callbacks', () => {
  it('insert_row_below adds a row, delete_row removes a row, align_center sets alignment', () => {
    const entries = compute_menu_items({ row: 0, col: 1, row_count: 2, col_count: 2 });
    const m = make_model([
      ['h1', 'h2'],
      ['a', 'b'],
    ]);

    const inserted = find_item(entries, 'insert_row_below').mutate(m);
    expect(inserted.rows).toHaveLength(3);

    const after_delete_entries = compute_menu_items({ row: 1, col: 0, row_count: 2, col_count: 2 });
    const deleted = find_item(after_delete_entries, 'delete_row').mutate(m);
    expect(deleted.rows).toHaveLength(1);

    const aligned = find_item(entries, 'align_center').mutate(m);
    expect(aligned.alignment[1]).toBe('center');
  });

  it('disabled delete_row built at row=0 returns the model unchanged (op self-guards)', () => {
    const entries = compute_menu_items({ row: 0, col: 0, row_count: 2, col_count: 2 });
    const delete_row_item = find_item(entries, 'delete_row');
    expect(delete_row_item.disabled).toBe(true);
    const m = make_model([
      ['h1', 'h2'],
      ['a', 'b'],
    ]);
    expect(delete_row_item.mutate(m)).toBe(m);
  });

  it('disabled swap_column_left built at col=0 returns the model unchanged', () => {
    const entries = compute_menu_items({ row: 1, col: 0, row_count: 2, col_count: 2 });
    const swap_left_item = find_item(entries, 'swap_column_left');
    expect(swap_left_item.disabled).toBe(true);
    const m = make_model([
      ['h1', 'h2'],
      ['a', 'b'],
    ]);
    expect(swap_left_item.mutate(m)).toBe(m);
  });

  it('each align item sets the corresponding alignment value for the active column', () => {
    const entries = compute_menu_items({ row: 1, col: 0, row_count: 2, col_count: 2 });
    const m = make_model(
      [
        ['h1', 'h2'],
        ['a', 'b'],
      ],
      [null, 'right'],
    );
    expect(find_item(entries, 'align_left').mutate(m).alignment[0]).toBe('left');
    expect(find_item(entries, 'align_center').mutate(m).alignment[0]).toBe('center');
    expect(find_item(entries, 'align_right').mutate(m).alignment[0]).toBe('right');
    expect(find_item(entries, 'align_none').mutate(m).alignment[0]).toBe(null);
  });
});

describe('TBL-I-27 format_shortcut — display text', () => {
  it('non-mac: spells modifiers, arrows render as glyphs', () => {
    expect(format_shortcut('Alt-Shift-ArrowUp', { mac: false })).toBe('Alt+Shift+↑');
    expect(format_shortcut('Alt-ArrowRight', { mac: false })).toBe('Alt+→');
    expect(format_shortcut('Mod-Shift-Backspace', { mac: false })).toBe('Ctrl+Shift+Backspace');
  });

  it('mac: Option for Alt, Cmd for Mod; arrow glyphs unchanged', () => {
    expect(format_shortcut('Alt-Shift-ArrowUp', { mac: true })).toBe('Option+Shift+↑');
    expect(format_shortcut('Mod-Shift-Backspace', { mac: true })).toBe('Cmd+Shift+Backspace');
  });

  it('uppercases a single-letter key', () => {
    expect(format_shortcut('Mod-Alt-d', { mac: false })).toBe('Ctrl+Alt+D');
  });
});

describe('TBL-I-27 aria_keyshortcut — canonical, platform-invariant', () => {
  it('uses W3C modifier names and the raw key value', () => {
    expect(aria_keyshortcut('Alt-Shift-ArrowDown')).toBe('Alt+Shift+ArrowDown');
    expect(aria_keyshortcut('Alt-ArrowLeft')).toBe('Alt+ArrowLeft');
    expect(aria_keyshortcut('Mod-Shift-Backspace')).toBe('Control+Shift+Backspace');
  });
});
