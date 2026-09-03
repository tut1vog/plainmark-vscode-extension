import { describe, expect, it } from 'vitest';
import {
  clear_cells,
  locate_band,
  normalize_cell_range,
  range_cells_text,
  range_contains,
  range_to_html,
  range_to_tsv,
  same_cell_range,
} from './table_cell_range.js';
import type { TableModel } from './table_serialize.js';

const model: TableModel = {
  rows: [
    ['a', 'b', 'c'],
    ['1', '', '3'],
    ['4', '5', '6'],
  ],
  alignment: [null, 'left', null],
};

describe('TBL-I-41: cell range geometry', () => {
  it('normalizes anchor/head in any drag direction to one inclusive rectangle', () => {
    const range = normalize_cell_range({ row: 2, col: 2 }, { row: 1, col: 0 });
    expect(range).toEqual({ from_row: 1, to_row: 2, from_col: 0, to_col: 2 });
    expect(range_contains(range, 1, 0)).toBe(true);
    expect(range_contains(range, 2, 2)).toBe(true);
    expect(range_contains(range, 0, 1)).toBe(false);
    expect(range_contains(range, 1, 3)).toBe(false);
  });

  it('compares ranges by value and treats null as no range', () => {
    const a = normalize_cell_range({ row: 0, col: 0 }, { row: 1, col: 1 });
    const b = normalize_cell_range({ row: 1, col: 1 }, { row: 0, col: 0 });
    expect(same_cell_range(a, b)).toBe(true);
    expect(same_cell_range(a, null)).toBe(false);
    expect(same_cell_range(null, null)).toBe(true);
  });

  it('locates the band under a coordinate, clamping past either edge', () => {
    const bands = [
      { start: 0, end: 10 },
      { start: 10, end: 20 },
      { start: 20, end: 30 },
    ];
    expect(locate_band(bands, -5)).toBe(0);
    expect(locate_band(bands, 5)).toBe(0);
    expect(locate_band(bands, 15)).toBe(1);
    expect(locate_band(bands, 30)).toBe(2);
    expect(locate_band(bands, 99)).toBe(2);
  });
});

describe('TBL-I-42: clear_cells', () => {
  it('blanks every cell in the range, header included, and leaves the rest', () => {
    const next = clear_cells(model, normalize_cell_range({ row: 0, col: 1 }, { row: 1, col: 2 }));
    expect(next).not.toBe(model);
    expect(next.rows).toEqual([
      ['a', '', ''],
      ['1', '', ''],
      ['4', '5', '6'],
    ]);
    expect(next.alignment).toEqual(model.alignment);
    expect(model.rows[0][1]).toBe('b');
  });

  it('returns the same model when every cell in the range is already empty', () => {
    const next = clear_cells(model, normalize_cell_range({ row: 1, col: 1 }, { row: 1, col: 1 }));
    expect(next).toBe(model);
  });
});

describe('TBL-I-43: range clipboard payloads', () => {
  it('extracts the range as rows of logical cell text', () => {
    const rows = range_cells_text(
      model,
      normalize_cell_range({ row: 1, col: 0 }, { row: 2, col: 1 }),
    );
    expect(rows).toEqual([
      ['1', ''],
      ['4', '5'],
    ]);
  });

  it('serializes TSV, quoting cells that hold tabs, newlines, or quotes', () => {
    expect(
      range_to_tsv([
        ['a', 'b'],
        ['c', 'd'],
      ]),
    ).toBe('a\tb\nc\td');
    expect(range_to_tsv([['x\ny', 'say "hi"', 'p\tq']])).toBe('"x\ny"\t"say ""hi"""\t"p\tq"');
  });

  it('serializes an HTML table with escaped text and <br> for soft breaks', () => {
    expect(
      range_to_html([
        ['<b>&', 'x\ny'],
        ['"q"', ''],
      ]),
    ).toBe(
      '<table><tr><td>&lt;b&gt;&amp;</td><td>x<br>y</td></tr><tr><td>&quot;q&quot;</td><td></td></tr></table>',
    );
  });
});
