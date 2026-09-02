import type { EditorView } from '@codemirror/view';
import { dispatch_table_edit, dispatch_table_remove } from './table_keymap.js';
import { request_cell_focus } from './table.js';
import { mutator_for, structural_op_target } from './table_ops.js';
import type { TableModel } from './table_serialize.js';
import { get_table_keybindings } from './table_keybindings_config.js';
import type { TableActionId } from '../../common/table_keybindings.js';
import { show_context_menu, type ShellEntry } from '../context_menu_shell.js';

export type MenuItemId = TableActionId;

export interface MenuItem {
  kind: 'item';
  id: MenuItemId;
  label: string;
  disabled: boolean;
  mutate: (m: TableModel) => TableModel;
}

interface MenuSeparator {
  kind: 'separator';
}

export type MenuEntry = MenuItem | MenuSeparator;

export interface MenuContext {
  row: number;
  col: number;
  row_count: number;
  col_count: number;
}

export function compute_menu_items(ctx: MenuContext): MenuEntry[] {
  const { row, col, row_count, col_count } = ctx;
  const item = (id: MenuItemId, label: string, disabled: boolean): MenuItem => ({
    kind: 'item',
    id,
    label,
    disabled,
    // delete_table removes the block in run_action; identity keeps the MenuItem shape uniform.
    mutate: id === 'delete_table' ? (m) => m : mutator_for(id, row, col),
  });
  return [
    item('insert_row_above', 'Insert row above', row === 0),
    item('insert_row_below', 'Insert row below', false),
    item('insert_column_left', 'Insert column left', false),
    item('insert_column_right', 'Insert column right', false),
    { kind: 'separator' },
    item('delete_row', 'Delete row', row === 0),
    item('delete_column', 'Delete column', col_count <= 1),
    item('delete_table', 'Delete table', false),
    { kind: 'separator' },
    item('swap_row_up', 'Swap row up', row <= 1),
    item('swap_row_down', 'Swap row down', row === 0 || row >= row_count - 1),
    item('swap_column_left', 'Swap column left', col === 0),
    item('swap_column_right', 'Swap column right', col >= col_count - 1),
    { kind: 'separator' },
    item('align_left', 'Align column left', false),
    item('align_center', 'Align column center', false),
    item('align_right', 'Align column right', false),
    item('align_none', 'Align column none', false),
  ];
}

// --- DOM rendering (Tier B-covered) ---

export interface ShowMenuArgs {
  main_view: EditorView;
  table_from: number;
  row: number;
  col: number;
  row_count: number;
  col_count: number;
  anchor: { x: number; y: number };
}

export function show_table_context_menu(args: ShowMenuArgs): () => void {
  const entries = compute_menu_items({
    row: args.row,
    col: args.col,
    row_count: args.row_count,
    col_count: args.col_count,
  });

  const run_action = (entry: MenuItem): void => {
    if (entry.id === 'delete_table') {
      dispatch_table_remove(args.main_view, args.table_from);
      return;
    }
    const out = dispatch_table_edit(args.main_view, args.table_from, entry.mutate);
    // RC2: re-activate the destination cell after a content-changing op (also
    // fixes "right-click op → caret to 0"); align ops + no-ops skip re-focus.
    if (out.changed && out.new_model) {
      const target = structural_op_target(
        entry.id,
        args.row,
        args.col,
        out.new_model.rows.length,
        out.new_model.rows[0]?.length ?? 0,
      );
      if (target) request_cell_focus(args.main_view, args.table_from, target.row, target.col);
    }
  };

  const keybindings = get_table_keybindings();

  return show_context_menu({
    entries: entries.map((entry): ShellEntry => {
      if (entry.kind === 'separator') return { kind: 'separator' };
      return {
        kind: 'item',
        id: entry.id,
        label: entry.label,
        disabled: entry.disabled,
        shortcut: keybindings[entry.id] || undefined,
        run: () => run_action(entry),
      };
    }),
    anchor: args.anchor,
    alias_prefix: 'plainmark-table-context-menu',
  });
}
