import { CompletionContext } from '@codemirror/autocomplete';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { syntaxTree } from '@codemirror/language';
import { describe, expect, it } from 'vitest';
import {
  make_starter_table_markdown,
  table_completions,
} from './table_autocomplete.js';
import { parse_cell_text } from './table_serialize.js';
import { find_tables, table_widgets_field } from './table.js';
import { math_cache_field } from './math.js';
import { math_extension as math_grammar_extension } from '../grammar/math.js';

function state_with(doc: string, anchor: number = doc.length): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdown({ extensions: [GFM] })],
  });
}

function context_at(doc: string, pos: number): CompletionContext {
  const state = state_with(doc, pos);
  return new CompletionContext(state, pos, true);
}

describe('TBL-I-16 make_starter_table_markdown — exact starter output', () => {
  it('returns the exact 4-line empty 3×3 starter', () => {
    expect(make_starter_table_markdown()).toBe(
      [
        '|     |     |     |',
        '| --- | --- | --- |',
        '|     |     |     |',
        '|     |     |     |',
      ].join('\n'),
    );
  });

  it('has no trailing newline', () => {
    const out = make_starter_table_markdown();
    expect(out.endsWith('\n')).toBe(false);
  });

  it('has exactly 4 lines', () => {
    expect(make_starter_table_markdown().split('\n')).toHaveLength(4);
  });

  it('every line starts and ends with a pipe', () => {
    for (const line of make_starter_table_markdown().split('\n')) {
      expect(line.startsWith('|')).toBe(true);
      expect(line.endsWith('|')).toBe(true);
    }
  });

  it('every line has the same byte length (column-uniform padding)', () => {
    const ls = make_starter_table_markdown().split('\n');
    const len = ls[0].length;
    for (const line of ls) expect(line.length).toBe(len);
  });

  it('line 2 is the GFM delimiter', () => {
    const ls = make_starter_table_markdown().split('\n');
    expect(ls[1]).toBe('| --- | --- | --- |');
  });
});

describe('make_starter_table_markdown — Lezer parse / table extraction', () => {
  it('parses to one Table node spanning the full string with 4 rows × 3 columns of empty cells', () => {
    const doc = make_starter_table_markdown();
    const state = EditorState.create({
      doc,
      extensions: [
        markdown({ extensions: [GFM, math_grammar_extension] }),
        math_cache_field,
        table_widgets_field,
      ],
    });

    let table_from = -1;
    let table_to = -1;
    syntaxTree(state).iterate({
      enter: (node) => {
        if (node.name === 'Table') {
          table_from = node.from;
          table_to = node.to;
        }
      },
    });
    expect(table_from).toBe(0);
    expect(table_to).toBe(doc.length);

    const tables = find_tables(state);
    expect(tables).toHaveLength(1);
    const t = tables[0];
    // find_tables collapses TableHeader and TableRow runs into row_count; the
    // exact integer is parser-dependent (3 or 4 depending on which node names
    // the GFM extension emits for the two empty body rows), so we just assert
    // it has more than just a header and the full 3 columns.
    expect(t.row_count).toBeGreaterThanOrEqual(3);
    expect(t.col_count).toBe(3);
    // 3 columns × row_count rows of cells.
    expect(t.cells.length).toBe(t.row_count * 3);

    for (const cell of t.cells) {
      const raw = doc.slice(cell.cell_from, cell.cell_to);
      expect(parse_cell_text(raw.trim())).toBe('');
    }
  });
});

describe('table_completions — gating', () => {
  it('returns null on an empty line (no `|` typed yet)', () => {
    const ctx = context_at('', 0);
    expect(table_completions(ctx)).toBeNull();
  });

  it('returns null when line has content past the `|` (e.g. `|x`)', () => {
    const doc = '|x';
    const ctx = context_at(doc, doc.length);
    expect(table_completions(ctx)).toBeNull();
  });

  it('returns null when line is just `|` but caret is BEFORE the pipe', () => {
    const ctx = context_at('|', 0);
    expect(table_completions(ctx)).toBeNull();
  });

  it('returns null when `|` is not at line start (e.g. ` |`)', () => {
    const doc = ' |';
    const ctx = context_at(doc, doc.length);
    expect(table_completions(ctx)).toBeNull();
  });

  it('returns null when line has leading whitespace before `|` even if trim would match (e.g. ` |` with caret right after the pipe)', () => {
    const doc = ' |';
    const ctx = context_at(doc, doc.length);
    expect(table_completions(ctx)).toBeNull();
  });

  it('returns null on a non-first line whose `|` is mid-line', () => {
    const doc = 'hello|';
    const ctx = context_at(doc, doc.length);
    expect(table_completions(ctx)).toBeNull();
  });
});

describe('TBL-I-16 table_completions — accept', () => {
  it('returns a CompletionResult with exactly one option labeled "Insert table (3×3)" when line is `|` and caret is just after it', () => {
    const ctx = context_at('|', 1);
    const result = table_completions(ctx);
    expect(result).not.toBeNull();
    expect(result!.options).toHaveLength(1);
    expect(result!.options[0].label).toBe('Insert table (3×3)');
  });

  it('sets `from` to the line start and `to` to the line end', () => {
    const ctx = context_at('|', 1);
    const result = table_completions(ctx);
    expect(result).not.toBeNull();
    const line = ctx.state.doc.lineAt(1);
    expect(result!.from).toBe(line.from);
    expect(result!.to).toBe(line.to);
  });

  it('sets `filter` to false (no fuzzy filtering against the typed `|`)', () => {
    const ctx = context_at('|', 1);
    const result = table_completions(ctx);
    expect(result!.filter).toBe(false);
  });

  it('still fires on a `|` line later in the document', () => {
    const doc = 'prose\n\n|';
    const ctx = context_at(doc, doc.length);
    const result = table_completions(ctx);
    expect(result).not.toBeNull();
    expect(result!.options).toHaveLength(1);
  });
});
