import { describe, expect, it } from 'vitest';
import {
  TABLE_KEYBINDING_DEFAULTS,
  resolve_table_keybindings,
} from './table_keybindings.js';

describe('TBL-I-29: table keybinding defaults', () => {
  it('resolve_table_keybindings(undefined) returns exactly the defaults', () => {
    const { resolved, warnings } = resolve_table_keybindings(undefined);
    expect(resolved).toEqual(TABLE_KEYBINDING_DEFAULTS);
    expect(warnings).toEqual([]);
  });

  it('delete_row defaults to Mod-Shift-Backspace (Typora parity)', () => {
    expect(resolve_table_keybindings({}).resolved.delete_row).toBe('Mod-Shift-Backspace');
  });

  it('insert_row_below defaults to Mod-Enter (Ctrl/Cmd+Enter)', () => {
    expect(resolve_table_keybindings({}).resolved.insert_row_below).toBe('Mod-Enter');
  });

  it('delete_column, delete_table, and the align ops are unbound by default', () => {
    const { resolved } = resolve_table_keybindings({});
    expect(resolved.delete_column).toBeNull();
    expect(resolved.delete_table).toBeNull();
    expect(resolved.align_left).toBeNull();
    expect(resolved.align_center).toBeNull();
    expect(resolved.align_right).toBeNull();
    expect(resolved.align_none).toBeNull();
  });
});

describe('TBL-I-30: table keybinding resolution and validation', () => {
  it('TBL-I-28: merges a user override per-action, leaving the rest at default', () => {
    const { resolved, warnings } = resolve_table_keybindings({ swap_row_up: 'Mod-Alt-u' });
    expect(resolved.swap_row_up).toBe('Mod-Alt-u');
    expect(resolved.swap_row_down).toBe('Alt-ArrowDown');
    expect(resolved.insert_row_above).toBe('Alt-Shift-ArrowUp');
    expect(warnings).toEqual([]);
  });

  it('assigns a key to a previously-unbound op (add-on)', () => {
    expect(resolve_table_keybindings({ delete_column: 'Mod-Alt-d' }).resolved.delete_column).toBe(
      'Mod-Alt-d',
    );
  });

  it('TBL-I-33: delete_table is user-assignable and reserved-key-validated', () => {
    expect(resolve_table_keybindings({ delete_table: 'Mod-Alt-Backspace' }).resolved.delete_table).toBe(
      'Mod-Alt-Backspace',
    );
    const { resolved, warnings } = resolve_table_keybindings({ delete_table: 'Mod-z' });
    expect(resolved.delete_table).toBeNull();
    expect(warnings.some((w) => w.includes('reserved'))).toBe(true);
  });

  it('treats "" as an explicit unbind', () => {
    const { resolved } = resolve_table_keybindings({ delete_row: '' });
    expect(resolved.delete_row).toBeNull();
  });

  it('ignores an unknown action id, keeping a warning', () => {
    const { resolved, warnings } = resolve_table_keybindings({ frobnicate: 'Mod-x' });
    expect(resolved).toEqual(TABLE_KEYBINDING_DEFAULTS);
    expect(warnings.some((w) => w.includes('unknown action'))).toBe(true);
  });

  it('keeps the default for a non-string value', () => {
    const { resolved, warnings } = resolve_table_keybindings({ delete_row: 42 });
    expect(resolved.delete_row).toBe('Mod-Shift-Backspace');
    expect(warnings.some((w) => w.includes('delete_row'))).toBe(true);
  });

  it('keeps the default for an unparsable combo', () => {
    const { resolved, warnings } = resolve_table_keybindings({ delete_row: 'Foo-Bar' });
    expect(resolved.delete_row).toBe('Mod-Shift-Backspace');
    expect(warnings.some((w) => w.includes('not a valid key combo'))).toBe(true);
  });

  it('requires a modifier', () => {
    const { resolved, warnings } = resolve_table_keybindings({ delete_column: 'Backspace' });
    expect(resolved.delete_column).toBeNull();
    expect(warnings.some((w) => w.includes('needs a modifier'))).toBe(true);
  });

  it('rejects a reserved structural key', () => {
    const { resolved, warnings } = resolve_table_keybindings({ delete_column: 'Mod-z' });
    expect(resolved.delete_column).toBeNull();
    expect(warnings.some((w) => w.includes('reserved'))).toBe(true);
  });

  it('rejects a modifier-less reserved key via the modifier rule', () => {
    const { resolved } = resolve_table_keybindings({ delete_column: 'Tab' });
    expect(resolved.delete_column).toBeNull();
  });

  it('unbinds the later action on a duplicate, by canonical order', () => {
    // align_left (later) collides with insert_row_above's default (earlier).
    const { resolved, warnings } = resolve_table_keybindings({ align_left: 'Alt-Shift-ArrowUp' });
    expect(resolved.insert_row_above).toBe('Alt-Shift-ArrowUp');
    expect(resolved.align_left).toBeNull();
    expect(warnings.some((w) => w.includes('already bound'))).toBe(true);
  });

  it('lets a reassigned key free up its slot for another action', () => {
    const { resolved, warnings } = resolve_table_keybindings({
      insert_row_above: '',
      align_left: 'Alt-Shift-ArrowUp',
    });
    expect(resolved.insert_row_above).toBeNull();
    expect(resolved.align_left).toBe('Alt-Shift-ArrowUp');
    expect(warnings).toEqual([]);
  });

  it('normalizes modifier order when detecting a reserved/duplicate key', () => {
    // Shift-Mod-z is the same combo as the reserved Mod-Shift-z.
    const { resolved } = resolve_table_keybindings({ delete_column: 'Shift-Mod-z' });
    expect(resolved.delete_column).toBeNull();
  });

  it('ignores a non-object setting value', () => {
    const { resolved, warnings } = resolve_table_keybindings('Mod-x');
    expect(resolved).toEqual(TABLE_KEYBINDING_DEFAULTS);
    expect(warnings.some((w) => w.includes('expected an object'))).toBe(true);
  });
});
