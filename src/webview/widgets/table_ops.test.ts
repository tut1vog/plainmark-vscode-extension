import { describe, expect, it } from 'vitest';
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

describe('TBL-I-11 insert_row_above', () => {
  it('inserts an empty row at the given index', () => {
    const m = make_model([
      ['h1', 'h2'],
      ['a', 'b'],
    ]);
    const out = insert_row_above(m, 1);
    expect(out.rows).toEqual([
      ['h1', 'h2'],
      ['', ''],
      ['a', 'b'],
    ]);
  });

  it('returns the same reference when row === 0 (header protection)', () => {
    const m = make_model([
      ['h1', 'h2'],
      ['a', 'b'],
    ]);
    const out = insert_row_above(m, 0);
    expect(out).toBe(m);
  });

  it('does not mutate the input rows', () => {
    const m = make_model([
      ['h1', 'h2'],
      ['a', 'b'],
    ]);
    const before = m.rows.map((r) => r.slice());
    insert_row_above(m, 1);
    expect(m.rows).toEqual(before);
  });
});

describe('insert_row_below', () => {
  it('inserts an empty row after the given index', () => {
    const m = make_model([
      ['h1', 'h2'],
      ['a', 'b'],
    ]);
    const out = insert_row_below(m, 0);
    expect(out.rows).toEqual([
      ['h1', 'h2'],
      ['', ''],
      ['a', 'b'],
    ]);
  });

  it('appends a row when called on the last row index', () => {
    const m = make_model([
      ['h1', 'h2'],
      ['a', 'b'],
    ]);
    const out = insert_row_below(m, 1);
    expect(out.rows).toEqual([
      ['h1', 'h2'],
      ['a', 'b'],
      ['', ''],
    ]);
  });
});

describe('insert_column_left', () => {
  it('adds a column on the left of the given index', () => {
    const m = make_model([
      ['h1', 'h2'],
      ['a', 'b'],
    ]);
    const out = insert_column_left(m, 1);
    expect(out.rows).toEqual([
      ['h1', '', 'h2'],
      ['a', '', 'b'],
    ]);
  });

  it('inserts a null alignment slot at the new column position', () => {
    const m = make_model(
      [
        ['h1', 'h2'],
        ['a', 'b'],
      ],
      ['left', 'right'],
    );
    const out = insert_column_left(m, 1);
    expect(out.alignment).toEqual(['left', null, 'right']);
  });
});

describe('insert_column_right', () => {
  it('adds a column on the right of the given index', () => {
    const m = make_model([
      ['h1', 'h2'],
      ['a', 'b'],
    ]);
    const out = insert_column_right(m, 0);
    expect(out.rows).toEqual([
      ['h1', '', 'h2'],
      ['a', '', 'b'],
    ]);
  });

  it('inserts a null alignment slot at the new column position', () => {
    const m = make_model(
      [
        ['h1', 'h2'],
        ['a', 'b'],
      ],
      ['left', 'right'],
    );
    const out = insert_column_right(m, 0);
    expect(out.alignment).toEqual(['left', null, 'right']);
  });
});

describe('delete_row', () => {
  it('removes the row at the given index', () => {
    const m = make_model([
      ['h1', 'h2'],
      ['a', 'b'],
      ['c', 'd'],
    ]);
    const out = delete_row(m, 1);
    expect(out.rows).toEqual([
      ['h1', 'h2'],
      ['c', 'd'],
    ]);
  });

  it('returns the same reference when row === 0 (header protection)', () => {
    const m = make_model([
      ['h1', 'h2'],
      ['a', 'b'],
    ]);
    const out = delete_row(m, 0);
    expect(out).toBe(m);
  });
});

describe('delete_column', () => {
  it('removes the column at the given index and the matching alignment slot', () => {
    const m = make_model(
      [
        ['h1', 'h2', 'h3'],
        ['a', 'b', 'c'],
      ],
      ['left', 'center', 'right'],
    );
    const out = delete_column(m, 1);
    expect(out.rows).toEqual([
      ['h1', 'h3'],
      ['a', 'c'],
    ]);
    expect(out.alignment).toEqual(['left', 'right']);
  });

  it('returns the same reference when col_count === 1', () => {
    const m = make_model([['only'], ['a'], ['b']]);
    const out = delete_column(m, 0);
    expect(out).toBe(m);
  });
});

describe('swap_row_up', () => {
  it('swaps the given body row with the body row above it', () => {
    const m = make_model([
      ['h1'],
      ['r1'],
      ['r2'],
      ['r3'],
    ]);
    const out = swap_row_up(m, 2);
    expect(out.rows).toEqual([['h1'], ['r2'], ['r1'], ['r3']]);
  });

  it('returns the same reference when row <= 1 (cannot cross header)', () => {
    const m = make_model([
      ['h1'],
      ['r1'],
      ['r2'],
    ]);
    expect(swap_row_up(m, 0)).toBe(m);
    expect(swap_row_up(m, 1)).toBe(m);
  });
});

describe('swap_row_down', () => {
  it('swaps the given body row with the body row below it', () => {
    const m = make_model([
      ['h1'],
      ['r1'],
      ['r2'],
      ['r3'],
    ]);
    const out = swap_row_down(m, 1);
    expect(out.rows).toEqual([['h1'], ['r2'], ['r1'], ['r3']]);
  });

  it('returns the same reference when row === 0 (header is fixed)', () => {
    const m = make_model([
      ['h1'],
      ['r1'],
    ]);
    expect(swap_row_down(m, 0)).toBe(m);
  });

  it('returns the same reference when row is the last row', () => {
    const m = make_model([
      ['h1'],
      ['r1'],
      ['r2'],
    ]);
    expect(swap_row_down(m, 2)).toBe(m);
  });
});

describe('swap_column_left', () => {
  it('swaps the given column with the column to its left, including alignment', () => {
    const m = make_model(
      [
        ['h1', 'h2', 'h3'],
        ['a', 'b', 'c'],
      ],
      ['left', 'center', 'right'],
    );
    const out = swap_column_left(m, 2);
    expect(out.rows).toEqual([
      ['h1', 'h3', 'h2'],
      ['a', 'c', 'b'],
    ]);
    expect(out.alignment).toEqual(['left', 'right', 'center']);
  });

  it('returns the same reference when col === 0', () => {
    const m = make_model([
      ['h1', 'h2'],
      ['a', 'b'],
    ]);
    expect(swap_column_left(m, 0)).toBe(m);
  });
});

describe('swap_column_right', () => {
  it('swaps the given column with the column to its right, including alignment', () => {
    const m = make_model(
      [
        ['h1', 'h2', 'h3'],
        ['a', 'b', 'c'],
      ],
      ['left', 'center', 'right'],
    );
    const out = swap_column_right(m, 0);
    expect(out.rows).toEqual([
      ['h2', 'h1', 'h3'],
      ['b', 'a', 'c'],
    ]);
    expect(out.alignment).toEqual(['center', 'left', 'right']);
  });

  it('returns the same reference when col is the last column', () => {
    const m = make_model([
      ['h1', 'h2'],
      ['a', 'b'],
    ]);
    expect(swap_column_right(m, 1)).toBe(m);
  });
});

describe('set_column_alignment', () => {
  it('sets the alignment for the given column', () => {
    const m = make_model(
      [
        ['h1', 'h2'],
        ['a', 'b'],
      ],
      [null, null],
    );
    const out = set_column_alignment(m, 1, 'center');
    expect(out.alignment).toEqual([null, 'center']);
  });

  it('returns the same reference when the alignment is unchanged', () => {
    const m = make_model(
      [
        ['h1', 'h2'],
        ['a', 'b'],
      ],
      ['left', 'right'],
    );
    expect(set_column_alignment(m, 0, 'left')).toBe(m);
    expect(set_column_alignment(m, 1, 'right')).toBe(m);
  });
});

describe('TBL-I-11 immutability across all operations', () => {
  it('returned models do not share their rows arrays with the input', () => {
    const m = make_model([
      ['h1', 'h2'],
      ['a', 'b'],
    ]);
    const out = insert_row_below(m, 1);
    expect(out.rows).not.toBe(m.rows);
    out.rows[0][0] = 'mutated';
    expect(m.rows[0][0]).toBe('h1');
  });

  it('returned models do not share their alignment array with the input', () => {
    const m = make_model(
      [
        ['h1', 'h2'],
        ['a', 'b'],
      ],
      ['left', 'right'],
    );
    const out = insert_column_right(m, 0);
    expect(out.alignment).not.toBe(m.alignment);
    out.alignment[0] = 'center';
    expect(m.alignment[0]).toBe('left');
  });
});

describe('TBL-I-32: structural_op_target (RC2)', () => {
  // Active cell (2, 1) in a post-op 4-row × 3-col grid unless noted.
  it.each([
    ['insert_row_above', 2, 1, 4, 3, { row: 2, col: 1 }],
    ['insert_row_below', 2, 1, 4, 3, { row: 3, col: 1 }],
    ['insert_column_left', 2, 1, 4, 3, { row: 2, col: 1 }],
    ['insert_column_right', 2, 1, 4, 3, { row: 2, col: 2 }],
    ['delete_row', 2, 1, 4, 3, { row: 2, col: 1 }],
    ['delete_column', 2, 1, 4, 3, { row: 2, col: 1 }],
    ['swap_row_up', 2, 1, 4, 3, { row: 1, col: 1 }],
    ['swap_row_down', 2, 1, 4, 3, { row: 3, col: 1 }],
    ['swap_column_left', 2, 1, 4, 3, { row: 2, col: 0 }],
    ['swap_column_right', 2, 1, 4, 3, { row: 2, col: 2 }],
  ] as const)('%s maps (%i, %i) to its destination cell', (action, r, c, rows, cols, expected) => {
    expect(structural_op_target(action, r, c, rows, cols)).toEqual(expected);
  });

  it.each(['align_left', 'align_center', 'align_right', 'align_none'] as const)(
    '%s returns null (no re-focus)',
    (action) => {
      expect(structural_op_target(action, 2, 1, 4, 3)).toBeNull();
    },
  );

  it('delete_table returns null (the block is gone — no surviving cell)', () => {
    expect(structural_op_target('delete_table', 2, 1, 4, 3)).toBeNull();
  });

  it('clamps the destination row to the last row after a delete shrinks the grid', () => {
    // Deleting the last row (was index 3) of a now-3-row grid; clamp 3 → 2.
    expect(structural_op_target('delete_row', 3, 1, 3, 3)).toEqual({ row: 2, col: 1 });
  });

  it('clamps the destination column to the last column after a delete', () => {
    expect(structural_op_target('delete_column', 1, 2, 3, 2)).toEqual({ row: 1, col: 1 });
  });

  it('never returns a negative row/col at the grid edge', () => {
    expect(structural_op_target('swap_row_up', 0, 0, 3, 3)).toEqual({ row: 0, col: 0 });
    expect(structural_op_target('swap_column_left', 0, 0, 3, 3)).toEqual({ row: 0, col: 0 });
  });
});

describe('TBL-I-33: table_removal_range', () => {
  it('absorbs one trailing newline when the table is mid-document', () => {
    // doc: `pre\n` (0..4) + table (4..12) + `\npost` (12..17), length 17.
    expect(table_removal_range(17, 4, 12, true)).toEqual({ from: 4, to: 13, anchor: 4 });
  });

  it('cuts only the block when no trailing newline follows (table at doc end)', () => {
    // doc: `pre\n` (0..4) + table (4..12), length 12, table flush with the end.
    expect(table_removal_range(12, 4, 12, false)).toEqual({ from: 4, to: 12, anchor: 4 });
  });

  it('removes the whole document when the table is the only content', () => {
    // `<table>\n`: length 8, table 0..7, trailing newline absorbed.
    expect(table_removal_range(8, 0, 7, true)).toEqual({ from: 0, to: 8, anchor: 0 });
  });

  it('clamps the caret to the shortened document', () => {
    expect(table_removal_range(8, 0, 8, false).anchor).toBe(0);
  });
});

describe('TBL-I-34: model_is_empty', () => {
  it('is true when every cell (header included) is blank', () => {
    expect(model_is_empty(make_model([[''], ['']]))).toBe(true);
    expect(model_is_empty(make_model([['', ''], ['', '']]))).toBe(true);
  });

  it('treats whitespace-only cells as empty', () => {
    expect(model_is_empty(make_model([['  ', '\t'], [' ', '']]))).toBe(true);
  });

  it('is false when any cell holds non-whitespace content', () => {
    expect(model_is_empty(make_model([['h', ''], ['', '']]))).toBe(false);
    expect(model_is_empty(make_model([['', ''], ['', 'x']]))).toBe(false);
  });
});
