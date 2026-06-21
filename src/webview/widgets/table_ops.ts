import type { TableModel } from './table_serialize.js';
import type { TableActionId } from '../../common/table_keybindings.js';

type Alignment = TableModel['alignment'][number];

function clone_model(model: TableModel): TableModel {
  return {
    rows: model.rows.map((row) => row.slice()),
    alignment: model.alignment.slice(),
    header_row_count: model.header_row_count,
  };
}

function empty_row(col_count: number): string[] {
  return Array.from({ length: col_count }, () => '');
}

export function insert_row_above(model: TableModel, row: number): TableModel {
  if (row < 1) return model;
  const next = clone_model(model);
  const col_count = next.rows[0]?.length ?? 0;
  next.rows.splice(row, 0, empty_row(col_count));
  return next;
}

export function insert_row_below(model: TableModel, row: number): TableModel {
  const next = clone_model(model);
  const col_count = next.rows[0]?.length ?? 0;
  next.rows.splice(row + 1, 0, empty_row(col_count));
  return next;
}

export function insert_column_left(model: TableModel, col: number): TableModel {
  const next = clone_model(model);
  for (const row of next.rows) row.splice(col, 0, '');
  next.alignment.splice(col, 0, null);
  return next;
}

export function insert_column_right(model: TableModel, col: number): TableModel {
  const next = clone_model(model);
  for (const row of next.rows) row.splice(col + 1, 0, '');
  next.alignment.splice(col + 1, 0, null);
  return next;
}

export function delete_row(model: TableModel, row: number): TableModel {
  if (row === 0) return model;
  if (row < 0 || row >= model.rows.length) return model;
  const next = clone_model(model);
  next.rows.splice(row, 1);
  return next;
}

export function delete_column(model: TableModel, col: number): TableModel {
  const col_count = model.alignment.length;
  if (col < 0 || col >= col_count) return model;
  if (col_count <= 1) return model;
  const next = clone_model(model);
  for (const row of next.rows) row.splice(col, 1);
  next.alignment.splice(col, 1);
  return next;
}

// "Empty" = every cell whitespace-only, including the header (Typora empty-table-delete predicate, TBL-I-34).
export function model_is_empty(model: TableModel): boolean {
  return model.rows.every((row) => row.every((cell) => cell.trim() === ''));
}

// Absorbs one table-adjacent trailing `\n` (TA2 rule reversed) so removal strands no blank line; caret lands at the table's first byte, clamped.
export function table_removal_range(
  doc_length: number,
  table_from: number,
  table_to: number,
  trailing_newline: boolean,
): { from: number; to: number; anchor: number } {
  const to = trailing_newline ? table_to + 1 : table_to;
  const new_length = doc_length - (to - table_from);
  return { from: table_from, to, anchor: Math.max(0, Math.min(table_from, new_length)) };
}

export function swap_row_up(model: TableModel, row: number): TableModel {
  if (row <= 1) return model;
  if (row >= model.rows.length) return model;
  const next = clone_model(model);
  [next.rows[row - 1], next.rows[row]] = [next.rows[row], next.rows[row - 1]];
  return next;
}

export function swap_row_down(model: TableModel, row: number): TableModel {
  if (row === 0) return model;
  if (row >= model.rows.length - 1) return model;
  const next = clone_model(model);
  [next.rows[row], next.rows[row + 1]] = [next.rows[row + 1], next.rows[row]];
  return next;
}

export function swap_column_left(model: TableModel, col: number): TableModel {
  if (col <= 0) return model;
  if (col >= model.alignment.length) return model;
  const next = clone_model(model);
  for (const row of next.rows) [row[col - 1], row[col]] = [row[col], row[col - 1]];
  [next.alignment[col - 1], next.alignment[col]] = [next.alignment[col], next.alignment[col - 1]];
  return next;
}

export function swap_column_right(model: TableModel, col: number): TableModel {
  if (col < 0) return model;
  if (col >= model.alignment.length - 1) return model;
  const next = clone_model(model);
  for (const row of next.rows) [row[col], row[col + 1]] = [row[col + 1], row[col]];
  [next.alignment[col], next.alignment[col + 1]] = [next.alignment[col + 1], next.alignment[col]];
  return next;
}

export function set_column_alignment(
  model: TableModel,
  col: number,
  alignment: Alignment,
): TableModel {
  if (col < 0 || col >= model.alignment.length) return model;
  if (model.alignment[col] === alignment) return model;
  const next = clone_model(model);
  next.alignment[col] = alignment;
  return next;
}

// The cell to re-activate after a content-changing structural op (RC2): lands
// in the new/destination cell, same column where sensible, clamped to the
// POST-op dims (`new_rows`/`new_cols`). Align ops return null — they change no
// content or position, so the surviving subview already shows correct content
// and re-focusing would needlessly reset the in-cell caret.
export function structural_op_target(
  action: TableActionId,
  row: number,
  col: number,
  new_rows: number,
  new_cols: number,
): { row: number; col: number } | null {
  const clamp_row = (r: number): number => Math.max(0, Math.min(r, new_rows - 1));
  const clamp_col = (c: number): number => Math.max(0, Math.min(c, new_cols - 1));
  switch (action) {
    case 'insert_row_above':
      return { row: clamp_row(row), col: clamp_col(col) };
    case 'insert_row_below':
      return { row: clamp_row(row + 1), col: clamp_col(col) };
    case 'insert_column_left':
      return { row: clamp_row(row), col: clamp_col(col) };
    case 'insert_column_right':
      return { row: clamp_row(row), col: clamp_col(col + 1) };
    case 'delete_row':
      return { row: clamp_row(row), col: clamp_col(col) };
    case 'delete_column':
      return { row: clamp_row(row), col: clamp_col(col) };
    case 'delete_table':
      return null;
    case 'swap_row_up':
      return { row: clamp_row(row - 1), col: clamp_col(col) };
    case 'swap_row_down':
      return { row: clamp_row(row + 1), col: clamp_col(col) };
    case 'swap_column_left':
      return { row: clamp_row(row), col: clamp_col(col - 1) };
    case 'swap_column_right':
      return { row: clamp_row(row), col: clamp_col(col + 1) };
    case 'align_left':
    case 'align_center':
    case 'align_right':
    case 'align_none':
      return null;
  }
}
