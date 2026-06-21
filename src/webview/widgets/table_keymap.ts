import { syntaxTree } from '@codemirror/language';
import { redo, undo } from '@codemirror/commands';
import { type EditorState, type Extension, Prec, Transaction } from '@codemirror/state';
import { EditorView, type KeyBinding, keymap } from '@codemirror/view';
import {
  type TableCellInfo,
  type TableInfo,
  build_model_from_extraction,
  locate_table_extraction,
  request_cell_focus,
} from './table.js';
import { type TableModel, serialize_table } from './table_serialize.js';
import {
  delete_column,
  delete_row,
  insert_column_left,
  insert_column_right,
  insert_row_above,
  insert_row_below,
  model_is_empty,
  set_column_alignment,
  structural_op_target,
  swap_column_left,
  swap_column_right,
  swap_row_down,
  swap_row_up,
  table_removal_range,
} from './table_ops.js';
import { get_table_keybindings } from './table_keybindings_config.js';
import { TABLE_ACTION_IDS, type TableActionId } from '../../common/table_keybindings.js';
import { create_logger } from '../../log.js';

const log = create_logger('widget');

export interface CellKeymapContext {
  main_view: EditorView;
  table_from: number;
  get_active: () => { row_index: number; col_index: number } | null;
  request_focus: (row: number, col: number) => void;
  // Synchronous teardown — bypasses the setTimeout(0) in the focusout handler.
  // The deferred path exists to give cell-to-cell Tab transitions time for the
  // next activate_cell to claim widget.active; keymap-driven cell-to-main
  // exits know teardown is wanted now and should not wait a macrotask.
  teardown_now: () => void;
}

interface DispatchOutcome {
  changed: boolean;
  info: TableInfo | null;
  new_model: TableModel | null;
}

// userEvent 'input' only — syncAnnotation would suppress host-forwarding and break the sync loop.
export function dispatch_table_edit(
  main_view: EditorView,
  table_from: number,
  mutator: (model: TableModel) => TableModel,
): DispatchOutcome {
  try {
    const extraction = locate_table_extraction(main_view.state, table_from);
    if (!extraction) return { changed: false, info: null, new_model: null };
    const model = build_model_from_extraction(extraction, main_view.state.doc);
    const next = mutator(model);
    if (next === model) return { changed: false, info: extraction.info, new_model: null };
    const serialized = serialize_table(next);
    const t_from = extraction.info.from;
    const t_to = extraction.info.to;
    const doc_len = main_view.state.doc.length;
    // TA2 — inject one trailing `\n` only when there's no `\n` immediately
    // after the table (mirrors table.ts handle_cell_edit).
    const next_byte = t_to < doc_len ? main_view.state.doc.sliceString(t_to, t_to + 1) : '';
    const ta2_needed = next_byte !== '\n';
    const insert = ta2_needed ? serialized + '\n' : serialized;
    // Pin the main selection at t_from — mirrors handle_cell_edit (TBL-SP-2/8).
    // Without it CM6's change-mapping drifts a caret before the table to 0 and a
    // caret inside past the table; this is the safety net when the re-focus
    // can't find a target, and is overwritten by the seed when it succeeds.
    main_view.dispatch({
      changes: { from: t_from, to: t_to, insert },
      selection: { anchor: t_from },
      annotations: [Transaction.userEvent.of('input')],
    });
    return { changed: true, info: extraction.info, new_model: next };
  } catch (reason) {
    log.error('table structural op failed', {
      table_from,
      reason: String(reason),
    });
    document.dispatchEvent(
      new CustomEvent('plainmark-table-edit-error', {
        bubbles: true,
        detail: { reason: String(reason) },
      }),
    );
    return { changed: false, info: null, new_model: null };
  }
}

// userEvent 'input' keeps the block-delete on the host-forwarding sync path (mirrors dispatch_table_edit); no re-focus — the cell is gone (TBL-I-33).
export function dispatch_table_remove(main_view: EditorView, table_from: number): boolean {
  const extraction = locate_table_extraction(main_view.state, table_from);
  if (!extraction) return false;
  const doc = main_view.state.doc;
  const t_to = extraction.info.to;
  const trailing_newline = t_to < doc.length && doc.sliceString(t_to, t_to + 1) === '\n';
  const { from, to, anchor } = table_removal_range(
    doc.length,
    extraction.info.from,
    t_to,
    trailing_newline,
  );
  main_view.dispatch({
    changes: { from, to },
    selection: { anchor },
    annotations: [Transaction.userEvent.of('input')],
  });
  main_view.focus();
  return true;
}

function exit_to_main_view(main_view: EditorView, offset: number): void {
  const clamped = Math.max(0, Math.min(main_view.state.doc.length, offset));
  main_view.dispatch({ selection: { anchor: clamped } });
  main_view.focus();
}

// User-action-driven byte injection: ArrowUp / Shift-Tab / ArrowLeft from the top-left of an at-offset-0 table need a real source byte above the block-replace for CM6 to render a visible caret.
function exit_before_table_with_injection(ctx: CellKeymapContext): void {
  ctx.teardown_now();
  if (ctx.table_from === 0) {
    ctx.main_view.dispatch({
      changes: { from: 0, insert: '\n' },
      selection: { anchor: 0 },
      annotations: [Transaction.userEvent.of('input')],
    });
    ctx.main_view.focus();
    return;
  }
  exit_to_main_view(ctx.main_view, ctx.table_from - 1);
}

// ArrowDown / ArrowRight at the bottom-right cell exit through `info.to`, which
// is the position right after the last `|` of the last pipe row — mid-line
// byte-wise but inside the block-replace's visual extent. Selection at that
// position lands inside the widget and CM6's coordsInWidget fallback renders
// the caret at widget-right-bottom (the giant-caret bug). Advance to the start
// of the line strictly after the table; inject a trailing \n if no such line
// exists (same user-action TA2 widening pattern as ArrowDown-at-doc-end).
function exit_after_table_with_injection(ctx: CellKeymapContext): void {
  ctx.teardown_now();
  const t_to = table_to(ctx.main_view, ctx.table_from);
  const doc = ctx.main_view.state.doc;
  const next_line_start = doc.lineAt(t_to).to + 1;
  if (next_line_start > doc.length) {
    ctx.main_view.dispatch({
      changes: { from: doc.length, insert: '\n' },
      selection: { anchor: doc.length + 1 },
      annotations: [Transaction.userEvent.of('input')],
    });
    ctx.main_view.focus();
    return;
  }
  exit_to_main_view(ctx.main_view, next_line_start);
}

// Logical-line, not visual-line, tests: in a word-wrapped single-logical-line
// cell, ArrowUp/Down from a middle visual row still crosses the cell boundary
// rather than moving within the wrap (accepted edge case, TBL-I-7).
function is_first_logical_line(view: EditorView): boolean {
  return view.state.doc.lineAt(view.state.selection.main.head).number === 1;
}

function is_last_logical_line(view: EditorView): boolean {
  const head = view.state.selection.main.head;
  return view.state.doc.lineAt(head).number === view.state.doc.lines;
}

function caret_at_start(view: EditorView): boolean {
  return view.state.selection.main.head === 0;
}

function caret_at_end(view: EditorView): boolean {
  return view.state.selection.main.head === view.state.doc.length;
}

function table_to(main_view: EditorView, table_from: number): number {
  const extraction = locate_table_extraction(main_view.state, table_from);
  return extraction?.info.to ?? table_from;
}

function row_col_count(main_view: EditorView, table_from: number): { rows: number; cols: number } | null {
  const extraction = locate_table_extraction(main_view.state, table_from);
  if (!extraction) return null;
  return { rows: extraction.info.row_count, cols: extraction.info.col_count };
}

function is_table_empty(main_view: EditorView, table_from: number): boolean {
  const extraction = locate_table_extraction(main_view.state, table_from);
  if (!extraction) return false;
  return model_is_empty(build_model_from_extraction(extraction, main_view.state.doc));
}

export function make_cell_keymap(ctx: CellKeymapContext): KeyBinding[] {
  const focus = (row: number, col: number): void => ctx.request_focus(row, col);

  const move_to = (row: number, col: number): boolean => {
    focus(row, col);
    return true;
  };

  const next_cell = (): boolean => {
    const active = ctx.get_active();
    const dims = row_col_count(ctx.main_view, ctx.table_from);
    if (!active || !dims) return false;
    const { row_index: r, col_index: c } = active;
    if (c + 1 < dims.cols) return move_to(r, c + 1);
    if (r + 1 < dims.rows) return move_to(r + 1, 0);
    const out = dispatch_table_edit(ctx.main_view, ctx.table_from, (m) =>
      insert_row_below(m, r),
    );
    if (out.changed) focus(r + 1, 0);
    return true;
  };

  const prev_cell = (): boolean => {
    const active = ctx.get_active();
    const dims = row_col_count(ctx.main_view, ctx.table_from);
    if (!active || !dims) return false;
    const { row_index: r, col_index: c } = active;
    if (c > 0) return move_to(r, c - 1);
    if (r > 0) return move_to(r - 1, dims.cols - 1);
    exit_before_table_with_injection(ctx);
    return true;
  };

  const enter_next_row_or_exit = (): boolean => {
    const active = ctx.get_active();
    const dims = row_col_count(ctx.main_view, ctx.table_from);
    if (!active || !dims) return false;
    const { row_index: r, col_index: c } = active;
    if (r + 1 < dims.rows) return move_to(r + 1, c);
    exit_after_table_with_injection(ctx);
    return true;
  };

  // Mod-z / Mod-Shift-z / Mod-y route to the main view's history. The subview
  // keeps focus across the command; CM6 history's restored selection (pinned at
  // table_from by handle_cell_edit) renders visibly inside the cell via coordsAt.
  const route_to_main = (command: (view: EditorView) => boolean): boolean => {
    return command(ctx.main_view);
  };

  // Structural-op bindings are built from the resolved config (TBL-I-8 / TBL-I-28);
  // the nav and history keys below stay hardcoded (and are reserved, TBL-I-30).
  const resolved = get_table_keybindings();
  // delete_table is excluded — it removes the whole block (handled in the loop), not a model mutator.
  const op_for: Record<
    Exclude<TableActionId, 'delete_table'>,
    (m: TableModel, a: { row_index: number; col_index: number }) => TableModel
  > = {
    insert_row_above: (m, a) => insert_row_above(m, a.row_index),
    insert_row_below: (m, a) => insert_row_below(m, a.row_index),
    insert_column_left: (m, a) => insert_column_left(m, a.col_index),
    insert_column_right: (m, a) => insert_column_right(m, a.col_index),
    delete_row: (m, a) => delete_row(m, a.row_index),
    delete_column: (m, a) => delete_column(m, a.col_index),
    swap_row_up: (m, a) => swap_row_up(m, a.row_index),
    swap_row_down: (m, a) => swap_row_down(m, a.row_index),
    swap_column_left: (m, a) => swap_column_left(m, a.col_index),
    swap_column_right: (m, a) => swap_column_right(m, a.col_index),
    align_left: (m, a) => set_column_alignment(m, a.col_index, 'left'),
    align_center: (m, a) => set_column_alignment(m, a.col_index, 'center'),
    align_right: (m, a) => set_column_alignment(m, a.col_index, 'right'),
    align_none: (m, a) => set_column_alignment(m, a.col_index, null),
  };
  const structural_bindings: KeyBinding[] = [];
  for (const action of TABLE_ACTION_IDS) {
    const key = resolved[action];
    if (key === null) continue;
    if (action === 'delete_table') {
      structural_bindings.push({
        key,
        run: () => {
          if (!ctx.get_active()) return true;
          ctx.teardown_now();
          dispatch_table_remove(ctx.main_view, ctx.table_from);
          return true;
        },
      });
      continue;
    }
    const mutate = op_for[action];
    structural_bindings.push({
      key,
      run: () => {
        const active = ctx.get_active();
        if (!active) return true;
        const out = dispatch_table_edit(ctx.main_view, ctx.table_from, (m) => mutate(m, active));
        // RC2: a content-changing op re-activates the destination cell so the
        // caret follows the content; align ops + no-ops return null → no focus.
        if (out.changed && out.new_model) {
          const target = structural_op_target(
            action,
            active.row_index,
            active.col_index,
            out.new_model.rows.length,
            out.new_model.rows[0]?.length ?? 0,
          );
          if (target) focus(target.row, target.col);
        }
        return true;
      },
    });
  }

  return [
    {
      key: 'Mod-z',
      run: () => route_to_main(undo),
    },
    {
      key: 'Mod-Shift-z',
      run: () => route_to_main(redo),
    },
    {
      key: 'Mod-y',
      run: () => route_to_main(redo),
    },
    {
      key: 'Tab',
      run: () => next_cell(),
    },
    {
      key: 'Shift-Tab',
      run: () => prev_cell(),
    },
    {
      key: 'Enter',
      run: () => enter_next_row_or_exit(),
    },
    {
      key: 'Shift-Enter',
      run: (view) => {
        const { from, to } = view.state.selection.main;
        view.dispatch({
          changes: { from, to, insert: '\n' },
          selection: { anchor: from + 1 },
          userEvent: 'input',
        });
        return true;
      },
    },
    {
      // Typora parity: bare Backspace at the start of an all-empty table's first cell removes the table; any cell content → normal in-cell delete (TBL-I-34).
      key: 'Backspace',
      run: (view) => {
        if (!caret_at_start(view)) return false;
        const active = ctx.get_active();
        if (!active || active.row_index !== 0 || active.col_index !== 0) return false;
        if (!is_table_empty(ctx.main_view, ctx.table_from)) return false;
        ctx.teardown_now();
        dispatch_table_remove(ctx.main_view, ctx.table_from);
        return true;
      },
    },
    {
      key: 'ArrowUp',
      run: (view) => {
        if (!is_first_logical_line(view)) return false;
        const active = ctx.get_active();
        if (!active) return false;
        if (active.row_index === 0) {
          exit_before_table_with_injection(ctx);
          return true;
        }
        focus(active.row_index - 1, active.col_index);
        return true;
      },
    },
    {
      key: 'ArrowDown',
      run: (view) => {
        if (!is_last_logical_line(view)) return false;
        const active = ctx.get_active();
        const dims = row_col_count(ctx.main_view, ctx.table_from);
        if (!active || !dims) return false;
        if (active.row_index === dims.rows - 1) {
          exit_after_table_with_injection(ctx);
          return true;
        }
        focus(active.row_index + 1, active.col_index);
        return true;
      },
    },
    {
      key: 'ArrowLeft',
      run: (view) => {
        if (!caret_at_start(view)) return false;
        const active = ctx.get_active();
        const dims = row_col_count(ctx.main_view, ctx.table_from);
        if (!active || !dims) return false;
        const { row_index: r, col_index: c } = active;
        if (c > 0) return move_to(r, c - 1);
        if (r > 0) return move_to(r - 1, dims.cols - 1);
        exit_before_table_with_injection(ctx);
        return true;
      },
    },
    {
      key: 'ArrowRight',
      run: (view) => {
        if (!caret_at_end(view)) return false;
        const active = ctx.get_active();
        const dims = row_col_count(ctx.main_view, ctx.table_from);
        if (!active || !dims) return false;
        const { row_index: r, col_index: c } = active;
        if (c + 1 < dims.cols) return move_to(r, c + 1);
        if (r + 1 < dims.rows) return move_to(r + 1, 0);
        exit_after_table_with_injection(ctx);
        return true;
      },
    },
    ...structural_bindings,
  ];
}

function find_table_starting_at(state: EditorState, line_from: number): number | null {
  let result: number | null = null;
  syntaxTree(state).iterate({
    from: line_from,
    to: line_from + 1,
    enter(node) {
      if (result !== null) return false;
      if (node.name === 'Table' && node.from === line_from) {
        result = line_from;
        return false;
      }
      return;
    },
  });
  return result;
}

// True iff `line_from` is the start of the line immediately after a Table's
// CLAMPED extent. Raw Lezer Table.to can extend past the last pipe row when
// GFM absorbs a trailing non-pipe paragraph; we check against
// `extract_table_full`'s clamped info.to so absorbed real-source lines (e.g.
// a `$a=b$` line directly after the table) are treated as caret-targetable
// content between the table and `line_from`, not as part of the table.
function find_table_just_above(
  state: EditorState,
  line_from: number,
): { from: number; to: number } | null {
  let result: { from: number; to: number } | null = null;
  const search_from = Math.max(0, line_from - 2);
  syntaxTree(state).iterate({
    from: search_from,
    to: line_from,
    enter(node) {
      if (result !== null) return false;
      if (node.name === 'Table') {
        const extraction = locate_table_extraction(state, node.from);
        if (!extraction) return;
        const clamped_to = extraction.info.to;
        const last_replaced_line_end = state.doc.lineAt(clamped_to).to + 1;
        if (line_from === last_replaced_line_end) {
          result = { from: node.from, to: clamped_to };
          return false;
        }
      }
      return;
    },
  });
  return result;
}

// Skip non-widgetized tables (IL1 nested-in-list/blockquote): DOM presence under the rendered widget is the canonical check.
function table_widget_rendered(view: EditorView, table_from: number): boolean {
  return (
    view.dom.querySelector(`.plainmark-table-block[data-table-from="${table_from}"]`) !== null
  );
}

// Main-view entry keymap — ArrowDown into the first cell, ArrowUp into the last cell. Symmetric with the exit-from-cell handlers.
const main_view_table_entry_bindings: KeyBinding[] = [
  {
    key: 'ArrowDown',
    run: (view) => {
      const sel = view.state.selection.main;
      if (!sel.empty) return false;
      const line = view.state.doc.lineAt(sel.head);
      if (line.to + 1 > view.state.doc.length) return false;
      const next_line = view.state.doc.lineAt(line.to + 1);
      const table_from = find_table_starting_at(view.state, next_line.from);
      if (table_from === null) return false;
      if (!table_widget_rendered(view, table_from)) return false;
      request_cell_focus(view, table_from, 0, 0);
      return true;
    },
  },
  {
    // ArrowUp: line-position check is `line.from > 0` (caret anywhere on the
    // line is OK — visual-up should still find the table). ArrowLeft and
    // Backspace use the same target cell but require `sel.head === line.from`.
    key: 'ArrowUp',
    run: (view) => {
      const sel = view.state.selection.main;
      if (!sel.empty) return false;
      const line = view.state.doc.lineAt(sel.head);
      if (line.from === 0) return false;
      const table = find_table_just_above(view.state, line.from);
      if (!table) return false;
      if (!table_widget_rendered(view, table.from)) return false;
      const extraction = locate_table_extraction(view.state, table.from);
      if (!extraction) return false;
      const cells = extraction.info.cells;
      if (cells.length === 0) return false;
      const last = last_cell_by_position(cells);
      request_cell_focus(view, table.from, last.row_index, last.col_index);
      return true;
    },
  },
  {
    // ArrowLeft from the start of a line whose previous line is the last
    // pipe row of a table — CM6's default would move the caret one byte
    // back into mid-line of the last pipe row (inside the block-replace's
    // visual extent), triggering the widget-right-bottom coordsAt fallback
    // and rendering a caret the height of the entire table. Symmetric with
    // ArrowUp: activate the last cell instead.
    key: 'ArrowLeft',
    run: enter_last_cell_from_below,
  },
  {
    // Backspace at the same position: CM6's default would delete the \n
    // separating the table's last pipe row from the line below, joining
    // `$a=b$` onto the last pipe row and corrupting the table grammar
    // (post-delete, lezer no longer parses the structure as a Table). Plus
    // the resulting selection lands mid-line inside the block-replace —
    // same giant-caret fallback. Treat Backspace from this position as a
    // navigation key: activate the last cell, no byte deletion.
    key: 'Backspace',
    run: enter_last_cell_from_below,
  },
  {
    // ArrowRight from the end of a line whose NEXT line is the first row
    // of a table — symmetric with ArrowDown.
    key: 'ArrowRight',
    run: (view) => {
      const sel = view.state.selection.main;
      if (!sel.empty) return false;
      const line = view.state.doc.lineAt(sel.head);
      if (sel.head !== line.to) return false;
      if (line.to + 1 > view.state.doc.length) return false;
      const next_line = view.state.doc.lineAt(line.to + 1);
      const table_from = find_table_starting_at(view.state, next_line.from);
      if (table_from === null) return false;
      if (!table_widget_rendered(view, table_from)) return false;
      request_cell_focus(view, table_from, 0, 0);
      return true;
    },
  },
];

// Shared by ArrowLeft and Backspace — both navigate from "start of the line
// strictly after a table's clamped extent" into the table's last cell.
function enter_last_cell_from_below(view: EditorView): boolean {
  const sel = view.state.selection.main;
  if (!sel.empty) return false;
  const line = view.state.doc.lineAt(sel.head);
  if (sel.head !== line.from) return false;
  if (line.from === 0) return false;
  const table = find_table_just_above(view.state, line.from);
  if (!table) return false;
  if (!table_widget_rendered(view, table.from)) return false;
  const extraction = locate_table_extraction(view.state, table.from);
  if (!extraction) return false;
  const cells = extraction.info.cells;
  if (cells.length === 0) return false;
  const last = last_cell_by_position(cells);
  request_cell_focus(view, table.from, last.row_index, last.col_index);
  return true;
}

// Placeholder cells for underfilled rows are appended after the row-then-col
// ordered real cells (table.ts underfill synthesis), so the array's last
// element can be a middle row's placeholder — pick the positional maximum.
// Scanning rendered cells (not row_count) stays robust to lezer's row_count
// over-counting when it absorbs the next paragraph (TA2 case).
function last_cell_by_position(cells: readonly TableCellInfo[]): TableCellInfo {
  let last = cells[0];
  for (const c of cells) {
    if (
      c.row_index > last.row_index ||
      (c.row_index === last.row_index && c.col_index > last.col_index)
    ) {
      last = c;
    }
  }
  return last;
}

export const main_view_table_entry_keymap: Extension = Prec.high(
  keymap.of(main_view_table_entry_bindings),
);

