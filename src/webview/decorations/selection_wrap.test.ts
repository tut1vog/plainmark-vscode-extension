import { markdown } from '@codemirror/lang-markdown';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { wrap_selection_input } from './selection_wrap.js';

interface FakeView {
  view: EditorView;
  applied: TransactionSpec[];
  doc: () => string;
  main: () => { from: number; to: number };
}

function make_view(initial_doc: string, anchor: number, head?: number): FakeView {
  let state = EditorState.create({
    doc: initial_doc,
    extensions: [markdown({ extensions: [GFM] })],
    selection: { anchor, head: head ?? anchor },
  });
  const applied: TransactionSpec[] = [];
  const view = {
    get state() {
      return state;
    },
    dispatch(spec: TransactionSpec) {
      applied.push(spec);
      state = state.update(spec).state;
    },
  } as unknown as EditorView;
  return {
    view,
    applied,
    doc: () => state.doc.toString(),
    main: () => {
      const { from, to } = state.selection.main;
      return { from, to };
    },
  };
}

describe('wrap_selection_input EMPH-I-6 EMPH-SP-3 MRS-W-1 MRS-W-2 MRS-W-3 MRS-W-4 MRS-W-5 MRS-W-6', () => {
  it('(a) wraps a selection with `*` and keeps the inner text selected', () => {
    const { view, applied, doc, main } = make_view('hello', 0, 5);
    expect(wrap_selection_input(view, 0, 5, '*')).toBe(true);
    expect(applied).toHaveLength(1);
    expect(doc()).toBe('*hello*');
    expect(main()).toEqual({ from: 1, to: 6 });
  });

  it('(b) a repeated press nests the markers (`*hello*` -> `**hello**`)', () => {
    const { view, doc, main } = make_view('*hello*', 1, 6);
    expect(wrap_selection_input(view, 1, 6, '*')).toBe(true);
    expect(doc()).toBe('**hello**');
    expect(main()).toEqual({ from: 2, to: 7 });
  });

  it('(c) wraps with a backtick', () => {
    const { view, doc } = make_view('hello', 0, 5);
    expect(wrap_selection_input(view, 0, 5, '`')).toBe(true);
    expect(doc()).toBe('`hello`');
  });

  it('(d) wraps with a tilde', () => {
    const { view, doc } = make_view('hello', 0, 5);
    expect(wrap_selection_input(view, 0, 5, '~')).toBe(true);
    expect(doc()).toBe('~hello~');
  });

  it('(e) wraps with a dollar sign', () => {
    const { view, doc } = make_view('hello', 0, 5);
    expect(wrap_selection_input(view, 0, 5, '$')).toBe(true);
    expect(doc()).toBe('$hello$');
  });

  it('(e1) wraps with a square-bracket pair', () => {
    const { view, doc, main } = make_view('hello', 0, 5);
    expect(wrap_selection_input(view, 0, 5, '[')).toBe(true);
    expect(doc()).toBe('[hello]');
    expect(main()).toEqual({ from: 1, to: 6 });
  });

  it('(e2) wraps with a paren pair', () => {
    const { view, doc, main } = make_view('hello', 0, 5);
    expect(wrap_selection_input(view, 0, 5, '(')).toBe(true);
    expect(doc()).toBe('(hello)');
    expect(main()).toEqual({ from: 1, to: 6 });
  });

  it('(e3) wraps with a brace pair', () => {
    const { view, doc, main } = make_view('hello', 0, 5);
    expect(wrap_selection_input(view, 0, 5, '{')).toBe(true);
    expect(doc()).toBe('{hello}');
    expect(main()).toEqual({ from: 1, to: 6 });
  });

  it('(e4) a repeated bracket press nests the pair (`[x]` -> `[[x]]`)', () => {
    const { view, doc, main } = make_view('[hello]', 1, 6);
    expect(wrap_selection_input(view, 1, 6, '[')).toBe(true);
    expect(doc()).toBe('[[hello]]');
    expect(main()).toEqual({ from: 2, to: 7 });
  });

  it('(e5) the close delimiter MUST NOT trigger wrap (only the open does)', () => {
    const { view, applied } = make_view('hello', 0, 5);
    expect(wrap_selection_input(view, 0, 5, ']')).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(f) wraps a sub-range, leaving surrounding text untouched', () => {
    const { view, doc, main } = make_view('hello world', 6, 11);
    expect(wrap_selection_input(view, 6, 11, '*')).toBe(true);
    expect(doc()).toBe('hello *world*');
    expect(main()).toEqual({ from: 7, to: 12 });
  });

  it('(g) wraps a backward selection, normalizing the result range', () => {
    const { view, doc, main } = make_view('hello', 5, 0);
    expect(wrap_selection_input(view, 0, 5, '*')).toBe(true);
    expect(doc()).toBe('*hello*');
    expect(main()).toEqual({ from: 1, to: 6 });
  });

  it('(h) returns false on an empty selection (yields to the plain insert)', () => {
    const { view, applied } = make_view('hello', 2);
    expect(wrap_selection_input(view, 2, 2, '*')).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(i) returns false on a non-wrap character', () => {
    const { view, applied } = make_view('hello', 0, 5);
    expect(wrap_selection_input(view, 0, 5, 'a')).toBe(false);
    expect(applied).toHaveLength(0);
  });
});
