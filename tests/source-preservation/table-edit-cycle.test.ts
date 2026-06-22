import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { math_extension as math_grammar_extension } from '../../src/webview/grammar/math.js';
import { math_cache_field } from '../../src/webview/widgets/math.js';
import {
  build_model_from_extraction,
  find_tables,
  locate_table_extraction,
  table_widgets_field,
} from '../../src/webview/widgets/table.js';
import {
  serialize_table,
  type TableModel,
} from '../../src/webview/widgets/table_serialize.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures_dir = join(__dirname, 'fixtures/tables');

function read_fixture(name: string): string {
  return readFileSync(join(fixtures_dir, name), 'utf8');
}

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

// Mirrors TableWidget.handle_cell_edit's dispatch shape: whole-table replace of
// [info.from, info.to] with the serialized model, plus the TA2 trailing newline
// when the byte after the table is not already '\n'.
function apply_edit_cycle(
  doc: string,
  table_from: number,
  mutate?: (model: TableModel) => void,
): { result: string; from: number; to: number } {
  const state = make_state(doc);
  const extraction = locate_table_extraction(state, table_from);
  if (!extraction) throw new Error(`no table extraction at offset ${table_from}`);
  const model = build_model_from_extraction(extraction, state.doc);
  mutate?.(model);
  const serialized = serialize_table(model);
  const { from, to } = extraction.info;
  const next_byte = to < doc.length ? doc.slice(to, to + 1) : '';
  const insert = next_byte !== '\n' ? serialized + '\n' : serialized;
  return { result: doc.slice(0, from) + insert + doc.slice(to), from, to };
}

const editable_fixtures = [
  'table.md',
  'column-uniform-padding.md',
  'inline-content.md',
  'mismatched-cols.md',
  'multi-line-cell.md',
  'adjacent-paragraph.md',
  'escapes.md',
];

describe('INV-SP-1 INV-SP-2 TBL-SP-1 table edit-cycle: bytes outside the edited table are preserved', () => {
  it('table.md: editing each of the three tables in turn leaves all other bytes byte-identical', () => {
    const doc = read_fixture('table.md');
    const tables = find_tables(make_state(doc));
    expect(tables).toHaveLength(3);

    for (const target of tables) {
      const { result, from, to } = apply_edit_cycle(doc, target.from, (model) => {
        model.rows[1][0] = model.rows[1][0] + ' edited';
      });
      expect(result.slice(0, from)).toBe(doc.slice(0, from));
      expect(result.slice(result.length - (doc.length - to))).toBe(doc.slice(to));
      expect(result).toContain(' edited');
      for (const other of tables) {
        if (other.from === target.from) continue;
        expect(result).toContain(doc.slice(other.from, other.to));
      }
    }
  });

  it('table.md: an edited table re-extracts with the same shape (no phantom rows or columns)', () => {
    const doc = read_fixture('table.md');
    const tables = find_tables(make_state(doc));

    for (let i = 0; i < tables.length; i++) {
      const { result } = apply_edit_cycle(doc, tables[i].from, (model) => {
        model.rows[1][0] += 'x';
      });
      const reparsed = find_tables(make_state(result));
      expect(reparsed).toHaveLength(tables.length);
      expect(reparsed[i].row_count).toBe(tables[i].row_count);
      expect(reparsed[i].col_count).toBe(tables[i].col_count);
    }
  });

  it('table.md: alignment markers survive the edit cycle', () => {
    const doc = read_fixture('table.md');
    const tables = find_tables(make_state(doc));
    const i = tables.findIndex((t) => t.alignment.some((a) => a !== null));
    expect(tables[i].alignment).toEqual(['left', 'center', 'right']);

    const { result } = apply_edit_cycle(doc, tables[i].from, (model) => {
      model.rows[1][1] += 'x';
    });
    const reparsed = find_tables(make_state(result));
    expect(reparsed[i].alignment).toEqual(['left', 'center', 'right']);
  });

  it('inline-content.md: untouched cells keep their inline markup byte-for-byte', () => {
    const doc = read_fixture('inline-content.md');
    const [table] = find_tables(make_state(doc));

    const { result, from } = apply_edit_cycle(doc, table.from, (model) => {
      model.rows[0][0] = 'Styles';
    });
    expect(result.slice(0, from)).toBe(doc.slice(0, from));
    for (const literal of [
      '**bold**',
      '*italic*',
      '[link](https://b.test)',
      '![alt](img.png)',
      '$x^2$',
      '`code`',
    ]) {
      expect(result).toContain(literal);
    }
  });
});

describe('TBL-SP-9 TBL-SP-3 round-trip stability', () => {
  it('column-uniform-padding.md: a table already in canonical P3 form serializes byte-identically', () => {
    const doc = read_fixture('column-uniform-padding.md');
    const [table] = find_tables(make_state(doc));
    const { result } = apply_edit_cycle(doc, table.from);
    expect(result).toBe(doc);
  });

  for (const name of editable_fixtures) {
    it(`${name}: a no-op cycle after the first edit is byte-stable`, () => {
      const doc = read_fixture(name);
      const tables = find_tables(make_state(doc));
      expect(tables.length).toBeGreaterThan(0);

      for (let i = 0; i < tables.length; i++) {
        const first = apply_edit_cycle(doc, tables[i].from, (model) => {
          model.rows[0][0] += 'x';
        });
        const reparsed = find_tables(make_state(first.result));
        const second = apply_edit_cycle(first.result, reparsed[i].from);
        expect(second.result).toBe(first.result);
      }
    });
  }
});

describe('TBL-SP-6 TBL-R-8 MC1 normalization (mismatched-cols.md)', () => {
  it('first edit normalizes every row to the header column count; bytes outside the table are preserved', () => {
    const doc = read_fixture('mismatched-cols.md');
    const [table] = find_tables(make_state(doc));
    expect(table.col_count).toBe(3);
    expect(table.row_count).toBe(4);

    const { result, from } = apply_edit_cycle(doc, table.from, (model) => {
      model.rows[0][0] = 'A2';
    });
    expect(result.slice(0, from)).toBe(doc.slice(0, from));

    const [reparsed] = find_tables(make_state(result));
    expect(reparsed.col_count).toBe(3);
    expect(reparsed.row_count).toBe(4);
    // MC1: cells past the header column count are dropped (sanctioned data loss).
    const table_text = result.slice(from);
    expect(table_text).not.toContain('4');
    expect(table_text).not.toContain('5');
  });
});

describe('TBL-SP-5 N4 multi-line cells (multi-line-cell.md)', () => {
  it('<br> variants parse to logical newlines and re-serialize as <br>', () => {
    const doc = read_fixture('multi-line-cell.md');
    const [table] = find_tables(make_state(doc));
    const state = make_state(doc);
    const model = build_model_from_extraction(
      locate_table_extraction(state, table.from)!,
      state.doc,
    );
    expect(model.rows[1][0]).toBe('line1\nline2');
    expect(model.rows[2][0]).toBe('top\nbot');
    expect(model.rows[2][1]).toBe('one\ntwo');

    const { result, from } = apply_edit_cycle(doc, table.from, (model) => {
      model.rows[1][1] = 'y';
    });
    expect(result.slice(0, from)).toBe(doc.slice(0, from));
    expect(result).toContain('line1<br>line2');
    expect(result).toContain('top<br>bot');
    expect(result).toContain('one<br>two');
  });
});

describe('TBL-E-7 TBL-SP-6 GFM absorption of a trailing pipe-bearing line (adjacent-paragraph.md)', () => {
  it('the pipe-bearing line is a table row; first edit re-serializes it through MC1 (accepted)', () => {
    const doc = read_fixture('adjacent-paragraph.md');
    const [table] = find_tables(make_state(doc));
    expect(table.row_count).toBe(3);
    expect(table.col_count).toBe(2);

    const { result, from } = apply_edit_cycle(doc, table.from, (model) => {
      model.rows[1][0] = '1x';
    });
    expect(result.slice(0, from)).toBe(doc.slice(0, from));
    expect(result).toContain('| pipe | in');
    // MC1: the absorbed row's third cell exceeds the 2-column header and is dropped.
    expect(result).not.toContain('text follows immediately');
  });
});

describe('TBL-SP-4 ESC-R-1: backslash escapes in cells survive the edit cycle (escapes.md)', () => {
  it('a no-op edit cycle reproduces the escape-bearing table byte-for-byte', () => {
    const doc = read_fixture('escapes.md');
    const [table] = find_tables(make_state(doc));
    const { result } = apply_edit_cycle(doc, table.from);
    expect(result).toBe(doc);
  });

  it('editing a sibling cell never doubles an escape backslash (\\$ stays \\$, not \\\\$)', () => {
    const doc = read_fixture('escapes.md');
    const [table] = find_tables(make_state(doc));
    const { result, from } = apply_edit_cycle(doc, table.from, (model) => {
      model.rows[1][0] = 'Gadget';
    });
    expect(result.slice(0, from)).toBe(doc.slice(0, from));
    // A markdown escape must keep its single backslash through an edit; doubling
    // it to \\$ would re-render as a literal backslash plus the character.
    expect(result).toContain('\\$38-\\$45');
    expect(result).not.toContain('\\\\$38');
    expect(result).toContain('rate \\| range');
    expect(result).toContain('\\*firm\\*');
    expect(result).not.toContain('\\\\*firm');
    // A genuine literal backslash (\\ -> one backslash) is still preserved as \\.
    expect(result).toContain('C:\\\\temp');
  });

  it('the cell model is verbatim markdown source (escapes intact, soft breaks only)', () => {
    const doc = read_fixture('escapes.md');
    const state = make_state(doc);
    const [table] = find_tables(state);
    const model = build_model_from_extraction(
      locate_table_extraction(state, table.from)!,
      state.doc,
    );
    expect(model.rows[1][1]).toBe('\\$38-\\$45');
    expect(model.rows[1][2]).toBe('rate \\| range');
    expect(model.rows[2][1]).toBe('C:\\\\temp');
  });
});

describe('TBL-E-1 TBL-R-12 IL1: a list-nested table is render-only (nested-in-list.md)', () => {
  it('emits zero table widgets, so no edit path can rewrite its source', () => {
    const doc = read_fixture('nested-in-list.md');
    const state = make_state(doc);
    const ranges: Array<{ from: number; to: number }> = [];
    state.field(table_widgets_field).between(0, state.doc.length, (from, to) => {
      ranges.push({ from, to });
    });
    expect(ranges).toHaveLength(0);
  });
});
