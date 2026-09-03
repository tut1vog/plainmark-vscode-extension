import { Annotation } from '@codemirror/state';
import type { TableModel } from './table_serialize.js';

// Tags subview transactions the range machinery issues itself (collapsing the
// anchor caret, refreshing a cleared anchor cell) so they do not dismiss the range.
export const cell_range_annotation = Annotation.define<boolean>();

export interface CellCoord {
  row: number;
  col: number;
}

// Inclusive rectangle of cells.
export interface CellRange {
  from_row: number;
  to_row: number;
  from_col: number;
  to_col: number;
}

export function normalize_cell_range(anchor: CellCoord, head: CellCoord): CellRange {
  return {
    from_row: Math.min(anchor.row, head.row),
    to_row: Math.max(anchor.row, head.row),
    from_col: Math.min(anchor.col, head.col),
    to_col: Math.max(anchor.col, head.col),
  };
}

export function same_cell_range(a: CellRange | null, b: CellRange | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.from_row === b.from_row &&
    a.to_row === b.to_row &&
    a.from_col === b.from_col &&
    a.to_col === b.to_col
  );
}

export function range_contains(range: CellRange, row: number, col: number): boolean {
  return (
    row >= range.from_row && row <= range.to_row && col >= range.from_col && col <= range.to_col
  );
}

// Same reference when nothing in the range holds text, so the caller skips the
// dispatch and no empty undo step is recorded.
export function clear_cells(model: TableModel, range: CellRange): TableModel {
  let changed = false;
  const rows = model.rows.map((row, r) =>
    row.map((cell, c) => {
      if (!range_contains(range, r, c) || cell === '') return cell;
      changed = true;
      return '';
    }),
  );
  return changed ? { rows, alignment: model.alignment.slice() } : model;
}

export function range_cells_text(model: TableModel, range: CellRange): string[][] {
  const rows: string[][] = [];
  for (let r = range.from_row; r <= range.to_row; r++) {
    const row: string[] = [];
    for (let c = range.from_col; c <= range.to_col; c++) row.push(model.rows[r]?.[c] ?? '');
    rows.push(row);
  }
  return rows;
}

// Spreadsheet TSV: a cell holding a tab, newline, or quote is double-quoted with inner quotes doubled.
export function range_to_tsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row.map((cell) => (/[\t\n"]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join('\t'),
    )
    .join('\n');
}

function escape_html(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function range_to_html(rows: string[][]): string {
  const body = rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${escape_html(cell).replace(/\n/g, '<br>')}</td>`).join('')}</tr>`,
    )
    .join('');
  return `<table>${body}</table>`;
}

export interface Band {
  start: number;
  end: number;
}

// Index of the band under `coord`, clamped to the first/last band so a pointer
// dragged past the table's edge keeps extending the range to that edge.
export function locate_band(bands: readonly Band[], coord: number): number {
  for (let i = 0; i < bands.length; i++) {
    if (coord <= bands[i].end) return i;
  }
  return bands.length - 1;
}
