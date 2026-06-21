import { markdown } from '@codemirror/lang-markdown';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import {
  blockquote_empty_line_outdent,
  blockquote_plain_backspace,
} from './blockquote_keymap.js';

interface FakeView {
  view: EditorView;
  applied: TransactionSpec[];
  doc: () => string;
  head: () => number;
}

function make_view(initial_doc: string, anchor: number): FakeView {
  let state = EditorState.create({
    doc: initial_doc,
    extensions: [markdown({ extensions: [GFM] })],
    selection: { anchor },
  });
  const applied: TransactionSpec[] = [];
  const view = {
    get state() {
      return state;
    },
    dispatch(spec: TransactionSpec) {
      applied.push(spec);
      // deleteCharBackward dispatches a ready Transaction (has `.state`); the
      // outdent handlers dispatch a plain spec.
      const maybe_tr = spec as unknown as { state?: EditorState };
      state = maybe_tr.state ?? state.update(spec).state;
    },
  } as unknown as EditorView;
  return {
    view,
    applied,
    doc: () => state.doc.toString(),
    head: () => state.selection.main.head,
  };
}

describe('BQ-I-1 BQ-I-2 BQ-I-3 BQ-SP-1: blockquote_empty_line_outdent', () => {
  it('(a) Enter on a non-empty `> first` line returns false (yields to markdownKeymap continuation)', () => {
    const { view, applied } = make_view('> first', 7);
    expect(blockquote_empty_line_outdent(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(b) Enter on empty `> ` after `> first` outdents to plain in place, no newline', () => {
    const { view, applied, doc, head } = make_view('> first\n> ', 10);
    expect(blockquote_empty_line_outdent(view)).toBe(true);
    expect(applied).toHaveLength(1);
    expect(doc()).toBe('> first\n');
    expect(head()).toBe(8);
  });

  it('(c) Enter on empty `> > ` after `> > foo` peels ONE level to `> `, no newline', () => {
    const { view, applied, doc, head } = make_view('> > foo\n> > ', 12);
    expect(blockquote_empty_line_outdent(view)).toBe(true);
    expect(applied).toHaveLength(1);
    expect(doc()).toBe('> > foo\n> ');
    expect(head()).toBe(10);
  });

  it('(d) Enter on a plain non-quote line returns false (normal Enter behavior)', () => {
    const { view, applied } = make_view('hello', 5);
    expect(blockquote_empty_line_outdent(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('returns false when selection is non-empty (skip range deletions)', () => {
    let state = EditorState.create({
      doc: '> first\n> ',
      extensions: [markdown({ extensions: [GFM] })],
      selection: { anchor: 8, head: 10 },
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
    expect(blockquote_empty_line_outdent(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('handles single-line doc `> ` (empty blockquote at start-of-doc)', () => {
    const { view, applied, doc, head } = make_view('> ', 2);
    expect(blockquote_empty_line_outdent(view)).toBe(true);
    expect(applied).toHaveLength(1);
    expect(doc()).toBe('');
    expect(head()).toBe(0);
  });

  it('peels ONE level of tight nested `>>>` (no spaces) to `>>`', () => {
    const { view, applied, doc, head } = make_view('>>> a\n>>>', 9);
    expect(blockquote_empty_line_outdent(view)).toBe(true);
    expect(applied).toHaveLength(1);
    expect(doc()).toBe('>>> a\n>>');
    expect(head()).toBe(8);
  });
});

describe('BQ-I-4 BQ-I-5: blockquote_plain_backspace (plain single-char delete in blockquote/callout)', () => {
  it('(a) Backspace after `> ` on a content line removes only the space, keeping `>`', () => {
    const { view, doc, head } = make_view('> hello', 2);
    expect(blockquote_plain_backspace(view)).toBe(true);
    expect(doc()).toBe('>hello');
    expect(head()).toBe(1);
  });

  it('(b) a second Backspace then removes the lone `>` (one char per press)', () => {
    const { view, doc, head } = make_view('>hello', 1);
    expect(blockquote_plain_backspace(view)).toBe(true);
    expect(doc()).toBe('hello');
    expect(head()).toBe(0);
  });

  it('(c) Backspace on an empty `> ` line removes the space, NOT the whole line', () => {
    const { view, doc, head } = make_view('> first\n> ', 10);
    expect(blockquote_plain_backspace(view)).toBe(true);
    expect(doc()).toBe('> first\n>');
    expect(head()).toBe(9);
  });

  it('(d) nested `> > ` deletes one space per press, never the whole prefix', () => {
    const { view, doc, head } = make_view('> > foo', 4);
    expect(blockquote_plain_backspace(view)).toBe(true);
    expect(doc()).toBe('> >foo');
    expect(head()).toBe(3);
  });

  it('(e) inside a callout body (a Blockquote node) it removes one char', () => {
    const { view, doc, head } = make_view('> [!NOTE]\n> body', 4);
    expect(blockquote_plain_backspace(view)).toBe(true);
    expect(doc()).toBe('> [NOTE]\n> body');
    expect(head()).toBe(3);
  });

  it('(f) returns false at column 0 (yields to the default line-join)', () => {
    const { view, applied } = make_view('a\n> hello', 2);
    expect(blockquote_plain_backspace(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(g) returns false on a plain (non-blockquote) line', () => {
    const { view, applied } = make_view('hello', 3);
    expect(blockquote_plain_backspace(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(h) returns false for a non-empty selection (range delete is default)', () => {
    const { view, applied } = make_view('> hello', 2);
    view.dispatch({ selection: { anchor: 2, head: 4 } });
    applied.length = 0;
    expect(blockquote_plain_backspace(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });
});
