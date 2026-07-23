import type { EditorView } from '@codemirror/view';
import { dispatch_table_edit, dispatch_table_remove } from './table_keymap.js';
import { request_cell_focus } from './table.js';
import {
  delete_column,
  delete_row,
  insert_column_left,
  insert_column_right,
  insert_row_above,
  insert_row_below,
  set_column_alignment,
  structural_op_target,
  swap_column_left,
  swap_column_right,
  swap_row_down,
  swap_row_up,
} from './table_ops.js';
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
  return [
    {
      kind: 'item',
      id: 'insert_row_above',
      label: 'Insert row above',
      disabled: row === 0,
      mutate: (m) => insert_row_above(m, row),
    },
    {
      kind: 'item',
      id: 'insert_row_below',
      label: 'Insert row below',
      disabled: false,
      mutate: (m) => insert_row_below(m, row),
    },
    {
      kind: 'item',
      id: 'insert_column_left',
      label: 'Insert column left',
      disabled: false,
      mutate: (m) => insert_column_left(m, col),
    },
    {
      kind: 'item',
      id: 'insert_column_right',
      label: 'Insert column right',
      disabled: false,
      mutate: (m) => insert_column_right(m, col),
    },
    { kind: 'separator' },
    {
      kind: 'item',
      id: 'delete_row',
      label: 'Delete row',
      disabled: row === 0,
      mutate: (m) => delete_row(m, row),
    },
    {
      kind: 'item',
      id: 'delete_column',
      label: 'Delete column',
      disabled: col_count <= 1,
      mutate: (m) => delete_column(m, col),
    },
    {
      kind: 'item',
      id: 'delete_table',
      label: 'Delete table',
      disabled: false,
      // delete_table removes the block in run_action; identity keeps the MenuItem shape uniform.
      mutate: (m) => m,
    },
    { kind: 'separator' },
    {
      kind: 'item',
      id: 'swap_row_up',
      label: 'Swap row up',
      disabled: row <= 1,
      mutate: (m) => swap_row_up(m, row),
    },
    {
      kind: 'item',
      id: 'swap_row_down',
      label: 'Swap row down',
      disabled: row === 0 || row >= row_count - 1,
      mutate: (m) => swap_row_down(m, row),
    },
    {
      kind: 'item',
      id: 'swap_column_left',
      label: 'Swap column left',
      disabled: col === 0,
      mutate: (m) => swap_column_left(m, col),
    },
    {
      kind: 'item',
      id: 'swap_column_right',
      label: 'Swap column right',
      disabled: col >= col_count - 1,
      mutate: (m) => swap_column_right(m, col),
    },
    { kind: 'separator' },
    {
      kind: 'item',
      id: 'align_left',
      label: 'Align column left',
      disabled: false,
      mutate: (m) => set_column_alignment(m, col, 'left'),
    },
    {
      kind: 'item',
      id: 'align_center',
      label: 'Align column center',
      disabled: false,
      mutate: (m) => set_column_alignment(m, col, 'center'),
    },
    {
      kind: 'item',
      id: 'align_right',
      label: 'Align column right',
      disabled: false,
      mutate: (m) => set_column_alignment(m, col, 'right'),
    },
    {
      kind: 'item',
      id: 'align_none',
      label: 'Align column none',
      disabled: false,
      mutate: (m) => set_column_alignment(m, col, null),
    },
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
