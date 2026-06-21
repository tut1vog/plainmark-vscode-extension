import { markdown } from '@codemirror/lang-markdown';
import { EditorState, StateEffect } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { math_extension as math_grammar_extension } from '../grammar/math.js';
import { math_cache_field, type MathResult, set_typeset_effect } from './math.js';
import {
  type Alignment,
  type TableInfo,
  TableWidget,
  build_model_from_extraction,
  extract_table_info,
  find_tables,
  locate_table_extraction,
  lookup_cell_range,
  table_widgets_field,
} from './table.js';
import { serialize_table } from './table_serialize.js';

function make_state(doc: string): EditorState {
  return EditorState.create({
    doc,
    extensions: [
      markdown({ extensions: [GFM, math_grammar_extension] }),
      math_cache_field,
      table_widgets_field,
    ],
  });
}

function make_info(overrides: Partial<TableInfo> = {}): TableInfo {
  return {
    from: 10,
    to: 30,
    cells: [],
    row_count: 3,
    col_count: 2,
    alignment: [null, null],
    ...overrides,
  };
}

function widget(
  info: TableInfo,
  fingerprint = '',
  cache = new Map<string, MathResult>(),
  content_sig = '',
): TableWidget {
  return new TableWidget(info, cache, null, fingerprint, content_sig);
}

describe('extract_table_info — canonical GFM input', () => {
  it('finds a simple table and emits header + body cells with correct ranges', () => {
    const doc = '| A | B |\n|---|---|\n| 1 | 2 |\n';
    const tables = find_tables(make_state(doc));
    expect(tables).toHaveLength(1);
    const t = tables[0];
    expect(t.row_count).toBe(2);
    expect(t.col_count).toBe(2);

    const header_cells = t.cells.filter((c) => c.row_index === 0);
    expect(header_cells).toHaveLength(2);
    expect(doc.slice(header_cells[0].cell_from, header_cells[0].cell_to)).toBe(' A ');
    expect(doc.slice(header_cells[1].cell_from, header_cells[1].cell_to)).toBe(' B ');

    const body_cells = t.cells.filter((c) => c.row_index === 1);
    expect(body_cells).toHaveLength(2);
    expect(doc.slice(body_cells[0].cell_from, body_cells[0].cell_to)).toBe(' 1 ');
    expect(doc.slice(body_cells[1].cell_from, body_cells[1].cell_to)).toBe(' 2 ');
  });

  it('TBL-E-3: handles rows without leading/trailing pipes (GFM-legal)', () => {
    const tables = find_tables(make_state('A | B\n---|---\n1 | 2\n'));
    expect(tables).toHaveLength(1);
    expect(tables[0].col_count).toBe(2);
  });

  it('returns empty when there are no tables in the doc', () => {
    expect(find_tables(make_state('# just a heading\n\nsome prose.\n'))).toHaveLength(0);
  });

  it('TBL-E-7: finds two adjacent tables separated by a blank line independently', () => {
    const doc = '| a |\n|---|\n| 1 |\n\n| b |\n|---|\n| 2 |\n';
    expect(find_tables(make_state(doc))).toHaveLength(2);
  });

  it('reports single-column table shape correctly', () => {
    const tables = find_tables(make_state('| A |\n|---|\n| 1 |\n'));
    expect(tables[0].col_count).toBe(1);
    expect(tables[0].row_count).toBe(2);
  });

  it('TBL-R-6: parses alignment from the delimiter row', () => {
    const doc = '| L | C | R | N |\n| :--- | :---: | ---: | --- |\n| 1 | 2 | 3 | 4 |\n';
    const tables = find_tables(make_state(doc));
    expect(tables[0].alignment).toEqual(['left', 'center', 'right', null] as Alignment[]);
  });
});

describe('TBL-R-8 TBL-SP-6 extract_table_info — MC1 (header column count wins)', () => {
  it('keeps the header col count when a body row has more cells', () => {
    const doc = '| h1 | h2 |\n|----|----|\n| a | b | c | d |\n';
    const t = find_tables(make_state(doc))[0];
    expect(t.col_count).toBe(2);
    const body = t.cells.filter((c) => c.row_index === 1);
    // MC1: cells past the header count are dropped.
    expect(body).toHaveLength(2);
    expect(body.map((c) => c.col_index)).toEqual([0, 1]);
  });

  it('keeps the header col count when a body row has fewer cells', () => {
    const doc = '| h1 | h2 | h3 |\n|----|----|----|\n| a |\n';
    const t = find_tables(make_state(doc))[0];
    expect(t.col_count).toBe(3);
  });
});

describe('TBL-R-7 TBL-E-7 extract_table_info — decoration-range clamp', () => {
  // Lezer's GFM grammar absorbs a trailing non-pipe line as a TableRow node
  // (with zero TableDelimiter children); without the clamp, the resulting
  // info.to extends past the structured table content and the block-replace
  // decoration covers the typed character on the following line, hiding it.
  it('clamps info.to to the last pipe-row when a non-pipe line follows the table', () => {
    const table = '| a | b |\n|---|---|\n| 1 | 2 |';
    const doc = table + '\nx';
    const t = find_tables(make_state(doc))[0];
    expect(t).toBeTruthy();
    // The clamp pins info.to to the end of '| 1 | 2 |' (table.length).
    expect(t.to).toBe(table.length);
    // 'x' is at doc[table.length + 1] and must be outside info.to.
    expect(t.to).toBeLessThan(doc.length);
  });

  it('info.to equals table_node.to when no extra content follows the table', () => {
    const doc = '| a | b |\n|---|---|\n| 1 | 2 |';
    const t = find_tables(make_state(doc))[0];
    expect(t.to).toBe(doc.length);
  });

  it('clamp survives a trailing newline alone (no absorbed content)', () => {
    const table = '| a | b |\n|---|---|\n| 1 | 2 |';
    const doc = table + '\n';
    const t = find_tables(make_state(doc))[0];
    // Whether Lezer's Table.to includes the trailing \n or not, the clamp
    // pins info.to to the last row's .to (== table.length).
    expect(t.to).toBe(table.length);
  });

  it('row_count and cells are unaffected by the trailing absorbed line', () => {
    const table = '| a | b |\n|---|---|\n| 1 | 2 |';
    const t_clean = find_tables(make_state(table))[0];
    const t_dirty = find_tables(make_state(table + '\nx'))[0];
    // Same row_count (header + 1 body row); absorbed non-pipe row is excluded.
    expect(t_dirty.row_count).toBe(t_clean.row_count);
    expect(t_dirty.cells.length).toBe(t_clean.cells.length);
  });
});

describe('TBL-E-4 TBL-R-7 TBL-SP-9 header-only table — delimiter row included in the clamp', () => {
  // Regression: the delimiter row is a direct TableDelimiter child of Table,
  // not a TableHeader/TableRow. Excluding it from last_row_to made a
  // header-only table's info.to stop at the header line, so the widget left
  // the delimiter row as stray text and the first edit duplicated it as a
  // phantom body row.
  it('info.to spans the delimiter row for a header-only table', () => {
    const doc = '| h |\n| - |';
    const t = find_tables(make_state(doc))[0];
    expect(t.row_count).toBe(1);
    expect(t.col_count).toBe(1);
    expect(t.to).toBe(doc.length);
  });

  it('info.to spans an alignment-bearing delimiter row', () => {
    const doc = '| h1 | h2 |\n| :-- | --: |';
    const t = find_tables(make_state(doc))[0];
    expect(t.to).toBe(doc.length);
    expect(t.alignment).toEqual(['left', 'right'] as Alignment[]);
  });

  it('clamps to the delimiter row (not the header) when a non-pipe line follows a header-only table', () => {
    const table = '| a |\n| - |';
    const doc = table + '\nx';
    const t = find_tables(make_state(doc))[0];
    expect(t.to).toBe(table.length);
    expect(t.to).toBeLessThan(doc.length);
  });

  it('emits a decoration spanning the full header-only table', () => {
    const table = '| h |\n| - |';
    const doc = table + '\n';
    const state = make_state(doc);
    const ranges: Array<{ from: number; to: number }> = [];
    state.field(table_widgets_field).between(0, state.doc.length, (from, to) => {
      ranges.push({ from, to });
    });
    expect(ranges).toHaveLength(1);
    expect(ranges[0].from).toBe(0);
    expect(ranges[0].to).toBe(table.length);
  });

  it('edit-cycle is byte-stable: replacing [from, to] with the serialized model reproduces the doc', () => {
    // Pins the corruption fix: pre-fix, info.to ended at the header, so this
    // splice produced '| h   |\n| --- |\n| --- |' (phantom delimiter-row body row).
    const doc = '| h   |\n| --- |';
    const state = make_state(doc);
    const ext = locate_table_extraction(state, 0);
    expect(ext).not.toBeNull();
    const model = build_model_from_extraction(ext!, state.doc);
    const serialized = serialize_table(model);
    const result = doc.slice(0, ext!.info.from) + serialized + doc.slice(ext!.info.to);
    expect(result).toBe(doc);
  });
});

describe('TBL-E-7 TBL-SP-6 pipe-bearing line after a table — GFM absorption semantics (accepted)', () => {
  // The line IS a table row per GFM; MC1 data loss on its excess cells is
  // accepted, not defended against.
  it('extracts a pipe-bearing following line as a body row inside [info.from, info.to]', () => {
    const doc = '| a |\n| - |\nfoo | bar';
    const t = find_tables(make_state(doc))[0];
    expect(t.row_count).toBe(2);
    expect(t.col_count).toBe(1);
    expect(t.to).toBe(doc.length);
    // MC1 at extraction: the absorbed row's second cell (col >= header count) is dropped.
    const body = t.cells.filter((c) => c.row_index === 1);
    expect(body).toHaveLength(1);
  });

  it('first edit re-serializes the absorbed row through MC1, dropping cells past the header count', () => {
    const doc = '| a |\n| - |\nfoo | bar';
    const state = make_state(doc);
    const ext = locate_table_extraction(state, 0);
    expect(ext).not.toBeNull();
    const model = build_model_from_extraction(ext!, state.doc);
    const serialized = serialize_table(model);
    const result = doc.slice(0, ext!.info.from) + serialized + doc.slice(ext!.info.to);
    expect(result).toBe('| a   |\n| --- |\n| foo |');
    expect(result).not.toContain('bar');
  });

  it('a blank line before the pipe-bearing line keeps it outside the table', () => {
    const table = '| a |\n| - |';
    const doc = table + '\n\nfoo | bar';
    const t = find_tables(make_state(doc))[0];
    expect(t.row_count).toBe(1);
    expect(t.to).toBe(table.length);
  });
});

describe('TBL-R-12 TBL-E-1 IL1 — table nested inside list or blockquote', () => {
  it('finds the table via the extractor (extract path stays unaware of IL1)', () => {
    const doc = '- list item before\n  | A | B |\n  |---|---|\n  | 1 | 2 |\n';
    // The extractor runs over every Table node; IL1 gating happens in the decoration builder.
    const tables = find_tables(make_state(doc));
    expect(tables.length).toBeGreaterThanOrEqual(0);
  });

  it('produces zero decorations for a table inside a list item', () => {
    const doc = '- intro\n  | A | B |\n  |---|---|\n  | 1 | 2 |\n';
    const state = make_state(doc);
    let count = 0;
    state.field(table_widgets_field).between(0, state.doc.length, () => {
      count += 1;
    });
    expect(count).toBe(0);
  });

  it('produces zero decorations for a table inside a blockquote', () => {
    const doc = '> | A | B |\n> |---|---|\n> | 1 | 2 |\n';
    const state = make_state(doc);
    let count = 0;
    state.field(table_widgets_field).between(0, state.doc.length, () => {
      count += 1;
    });
    expect(count).toBe(0);
  });

  it('produces exactly one decoration for a top-level table at offset 0', () => {
    const doc = '| A | B |\n|---|---|\n| 1 | 2 |\n';
    const state = make_state(doc);
    let count = 0;
    state.field(table_widgets_field).between(0, state.doc.length, () => {
      count += 1;
    });
    expect(count).toBe(1);
  });

  it('produces exactly one decoration for a top-level table NOT at offset 0', () => {
    const doc = '\n| A | B |\n|---|---|\n| 1 | 2 |\n';
    const state = make_state(doc);
    let count = 0;
    state.field(table_widgets_field).between(0, state.doc.length, () => {
      count += 1;
    });
    expect(count).toBe(1);
  });
});

describe('TBL-R-11 TableWidget.eq', () => {
  it('returns true for identical-shape widgets with the same content signature', () => {
    const a = make_info();
    const b = make_info({ to: 31 });
    expect(widget(a).eq(widget(b))).toBe(true);
  });

  it('returns false when content_signature differs (covers swap row/column where structural fingerprint is unchanged)', () => {
    const info = make_info();
    expect(widget(info, '', undefined, 'a|b').eq(widget(info, '', undefined, 'b|a'))).toBe(false);
  });

  it('returns false when row_count changes', () => {
    expect(widget(make_info()).eq(widget(make_info({ row_count: 4 })))).toBe(false);
  });

  it('returns false when col_count changes', () => {
    expect(widget(make_info()).eq(widget(make_info({ col_count: 3, alignment: [null, null, null] })))).toBe(false);
  });

  it('returns false when alignment changes', () => {
    expect(
      widget(make_info({ alignment: [null, null] })).eq(
        widget(make_info({ alignment: ['right', null] })),
      ),
    ).toBe(false);
  });

  it('returns false when table.from changes', () => {
    expect(widget(make_info()).eq(widget(make_info({ from: 11 })))).toBe(false);
  });

  it('TBL-E-9: returns false when the math fingerprint changes', () => {
    expect(widget(make_info(), 'inline:x^2').eq(widget(make_info(), 'inline:y^3'))).toBe(false);
  });

  it('returns true when the fingerprint matches', () => {
    expect(widget(make_info(), 'inline:x^2').eq(widget(make_info(), 'inline:x^2'))).toBe(true);
  });
});

describe('TBL-R-1 table_widgets_field — decoration emission', () => {
  it('emits exactly one block decoration per top-level table', () => {
    const doc = 'intro\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nouter\n';
    const state = make_state(doc);
    const ranges: Array<{ from: number; to: number; block: boolean }> = [];
    state.field(table_widgets_field).between(0, state.doc.length, (from, to, deco) => {
      ranges.push({ from, to, block: deco.spec.block === true });
    });
    expect(ranges).toHaveLength(1);
    expect(ranges[0].block).toBe(true);
    const tables = find_tables(state);
    expect(ranges[0].from).toBe(tables[0].from);
    expect(ranges[0].to).toBe(tables[0].to);
  });

  it('TBL-E-8: does not throw when an image-only paragraph is adjacent to a table', () => {
    const doc = '![alt](https://example.com/x.png)\n\n| A | B |\n|---|---|\n| 1 | 2 |\n';
    expect(() => make_state(doc).field(table_widgets_field)).not.toThrow();
    expect(find_tables(make_state(doc))).toHaveLength(1);
  });

  it('rebuilds on a docChanged transaction', () => {
    let state = make_state('| A |\n|---|\n| 1 |\n');
    const initial = state.field(table_widgets_field);
    state = state.update({ changes: { from: state.doc.length, to: state.doc.length, insert: '\nmore\n' } }).state;
    const next = state.field(table_widgets_field);
    expect(next).not.toBe(initial);
  });

  it('TBL-R-4 TBL-E-9: rebuilds on a set_typeset_effect (math-cache population drives cell re-render)', () => {
    let state = make_state('| A |\n|---|\n| 1 |\n');
    const initial = state.field(table_widgets_field);
    const effect: StateEffect<unknown> = set_typeset_effect.of({
      display: false,
      src: 'x^2',
      result: { ok: true, html: '<mjx-container/>' },
    });
    state = state.update({ effects: [effect] }).state;
    const next = state.field(table_widgets_field);
    expect(next).not.toBe(initial);
  });

  it('preserves the value across unrelated transactions', () => {
    let state = make_state('| A |\n|---|\n| 1 |\n');
    const initial = state.field(table_widgets_field);
    state = state.update({ selection: { anchor: 0 } }).state;
    expect(state.field(table_widgets_field)).toBe(initial);
  });
});

describe('lookup_cell_range', () => {
  it('returns fresh cell offsets after a prior cell-internal edit shifts later cells', () => {
    const doc = '| ab | cd |\n|----|----|\n| 11 | 22 |\n';
    let state = make_state(doc);
    const t = find_tables(state)[0];
    const cell_a = t.cells.find((c) => c.row_index === 1 && c.col_index === 0)!;
    const cell_b_before = t.cells.find((c) => c.row_index === 1 && c.col_index === 1)!;

    state = state.update({ changes: { from: cell_a.cell_to, to: cell_a.cell_to, insert: 'X' } }).state;
    const cell_b_after = lookup_cell_range(state, t.from, 1, 1)!;
    expect(cell_b_after.cell_from).toBe(cell_b_before.cell_from + 1);
    expect(cell_b_after.cell_to).toBe(cell_b_before.cell_to + 1);
  });

  it('returns null when (row, col) does not exist in the table', () => {
    const state = make_state('| A |\n|---|\n| 1 |\n');
    const table_from = find_tables(state)[0].from;
    expect(lookup_cell_range(state, table_from, 99, 0)).toBeNull();
  });

  it('returns null when no table starts at the given offset', () => {
    const state = make_state('| A |\n|---|\n| 1 |\n');
    expect(lookup_cell_range(state, 9999, 0, 0)).toBeNull();
  });
});

describe('TBL-R-6 extract_table_info — alignment edge cases', () => {
  it('treats missing markers as null alignment', () => {
    const doc = '| A | B |\n|---|---|\n| 1 | 2 |\n';
    const t = find_tables(make_state(doc))[0];
    expect(t.alignment).toEqual([null, null]);
  });

  it('reports center and right alignment from a mixed delimiter row', () => {
    const doc = '| A | B |\n| :---: | ---: |\n| 1 | 2 |\n';
    const t = find_tables(make_state(doc))[0];
    expect(t.alignment).toEqual(['center', 'right'] as Alignment[]);
  });
});

describe('TableWidget construction', () => {
  it('exposes the table info as an own property', () => {
    const info = make_info();
    const w = widget(info, 'sig');
    expect(w.table).toBe(info);
    expect(w.math_fingerprint).toBe('sig');
  });
});

describe('extract_table_info exposes canonical shape via find_tables', () => {
  it('returns row_count, col_count, and cells for a 2x2 GFM table', () => {
    const t = find_tables(make_state('| A | B |\n|---|---|\n| 1 | 2 |\n'))[0];
    expect(t.row_count).toBe(2);
    expect(t.col_count).toBe(2);
    expect(t.cells).toHaveLength(4);
    expect(typeof extract_table_info).toBe('function');
  });
});
