import { markdown } from '@codemirror/lang-markdown';
import { syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { enclosing } from '../tree_ancestors.js';
import {
  continuation_hidden_indent,
  item_content_column,
  list_continuation_caret_filter,
} from './list_continuation.js';

function make_state(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdown({ extensions: [GFM] })] });
}

function hidden(doc: string, line_number: number): { from: number; to: number } | null {
  const state = make_state(doc);
  return continuation_hidden_indent(state, state.doc.line(line_number));
}

describe('item_content_column LIST-R-12', () => {
  function column(doc: string): number | null {
    const state = make_state(doc);
    const item = enclosing(syntaxTree(state).resolveInner(0, 1), 'ListItem');
    return item ? item_content_column(state, item) : null;
  }

  it('bullet with one space → 2', () => {
    expect(column('- a')).toBe(2);
  });

  it('ordered marker `5. ` → 3, `10. ` → 4', () => {
    expect(column('5. a')).toBe(3);
    expect(column('10. a')).toBe(4);
  });

  it('up to four spaces after the marker count', () => {
    expect(column('-    a')).toBe(5);
  });

  it('five or more spaces after the marker count as one', () => {
    expect(column('-      a')).toBe(2);
  });

  it('nested marker counts its own indent', () => {
    const state = make_state('- a\n  - b');
    const item = enclosing(syntaxTree(state).resolveInner(6, 1), 'ListItem');
    expect(item && item_content_column(state, item)).toBe(4);
  });
});

describe('continuation_hidden_indent LIST-R-12', () => {
  it('indented continuation → the whole indent up to the content column', () => {
    expect(hidden('- a\n  b', 2)).toEqual({ from: 4, to: 6 });
    expect(hidden('5. abc\n   我们', 2)).toEqual({ from: 7, to: 10 });
  });

  it('indent beyond the content column stays visible', () => {
    expect(hidden('- a\n      b', 2)).toEqual({ from: 4, to: 6 });
  });

  it('indent short of the content column is hidden whole', () => {
    expect(hidden('5. abc\n xyz', 2)).toEqual({ from: 7, to: 8 });
  });

  it("a loose item's later paragraph", () => {
    expect(hidden('- a\n\n  b', 3)).toEqual({ from: 5, to: 7 });
  });

  it('null on a lazy continuation with no indent', () => {
    expect(hidden('- a\nb', 2)).toBeNull();
  });

  it('null on the marker line and on a nested marker line', () => {
    expect(hidden('  - a\n    b', 1)).toBeNull();
    expect(hidden('- a\n  - b', 2)).toBeNull();
  });

  it('null on an indent-only line', () => {
    expect(hidden('- a\n  ', 2)).toBeNull();
  });

  it('null outside a list and inside a quoted item', () => {
    expect(hidden('hello\n   world', 2)).toBeNull();
    expect(hidden('> - a\n>   b', 2)).toBeNull();
  });
});

describe('list_continuation_caret_filter LIST-I-17', () => {
  function filtered(doc: string, anchor: number, head?: number): EditorState {
    const state = EditorState.create({
      doc,
      extensions: [markdown({ extensions: [GFM] }), list_continuation_caret_filter],
    });
    return state.update({ selection: { anchor, head: head ?? anchor } }).state;
  }

  it('an empty caret at or inside the hidden run rests at its end', () => {
    expect(filtered('5. abc\n   我们', 7).selection.main.head).toBe(10);
    expect(filtered('5. abc\n   我们', 8).selection.main.head).toBe(10);
  });

  it('leaves the hidden end, later positions, and other lines alone', () => {
    expect(filtered('5. abc\n   我们', 10).selection.main.head).toBe(10);
    expect(filtered('5. abc\n   我们', 11).selection.main.head).toBe(11);
    expect(filtered('5. abc\n   我们', 0).selection.main.head).toBe(0);
    expect(filtered('hello\n   world', 6).selection.main.head).toBe(6);
  });

  it('leaves a non-empty selection alone', () => {
    const sel = filtered('5. abc\n   我们', 7, 12).selection.main;
    expect([sel.anchor, sel.head]).toEqual([7, 12]);
  });

  it('keeps the document unchanged', () => {
    expect(filtered('5. abc\n   我们', 8).doc.toString()).toBe('5. abc\n   我们');
  });
});
