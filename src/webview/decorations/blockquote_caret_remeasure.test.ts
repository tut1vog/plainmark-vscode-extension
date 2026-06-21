import { markdown } from '@codemirror/lang-markdown';
import { ChangeSet, EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import {
  caret_on_quote_line,
  changes_insert_quote_mark,
} from './blockquote.js';

function state_of(doc: string, anchor: number): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM] })],
    selection: { anchor },
  });
}

describe('changes_insert_quote_mark', () => {
  it('true when the inserted text contains `>`', () => {
    const cs = ChangeSet.of([{ from: 0, insert: '>' }], 0);
    expect(changes_insert_quote_mark(cs)).toBe(true);
  });

  it('true for a pasted `> ` prefix', () => {
    const cs = ChangeSet.of([{ from: 0, insert: '> ' }], 0);
    expect(changes_insert_quote_mark(cs)).toBe(true);
  });

  it('false for an ordinary character insert', () => {
    const cs = ChangeSet.of([{ from: 0, insert: 'a' }], 0);
    expect(changes_insert_quote_mark(cs)).toBe(false);
  });

  it('false for a pure deletion (no insert)', () => {
    const cs = ChangeSet.of([{ from: 0, to: 1 }], 3);
    expect(changes_insert_quote_mark(cs)).toBe(false);
  });
});

describe('caret_on_quote_line', () => {
  it('true on a `>` line', () => {
    expect(caret_on_quote_line(state_of('>', 1))).toBe(true);
  });

  it('true on a `> ` line with content', () => {
    expect(caret_on_quote_line(state_of('> abc', 3))).toBe(true);
  });

  it('true on a leading-whitespace `>` line', () => {
    expect(caret_on_quote_line(state_of('  > x', 5))).toBe(true);
  });

  it('false on a plain paragraph line', () => {
    expect(caret_on_quote_line(state_of('hello', 3))).toBe(false);
  });

  it('false when `>` is mid-line (not a marker)', () => {
    expect(caret_on_quote_line(state_of('a > b', 3))).toBe(false);
  });

  it('checks the caret line, not other lines', () => {
    // caret on line 2 ("plain"); line 1 is a quote
    expect(caret_on_quote_line(state_of('> q\nplain', 6))).toBe(false);
  });
});
