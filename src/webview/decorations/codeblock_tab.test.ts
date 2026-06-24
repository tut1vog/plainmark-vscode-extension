import { markdown } from '@codemirror/lang-markdown';
import { indentUnit } from '@codemirror/language';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { codeblock_backspace, codeblock_tab_dedent, codeblock_tab_indent } from './codeblock_tab.js';

interface FakeView {
  view: EditorView;
  applied: TransactionSpec[];
  doc: () => string;
  head: () => number;
}

function make_view(initial_doc: string, anchor: number, head?: number): FakeView {
  // 2-space indent unit mirrors production; the code-block indent is a fixed 4 regardless.
  let state = EditorState.create({
    doc: initial_doc,
    extensions: [markdown({ extensions: [GFM] }), indentUnit.of('  ')],
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
    head: () => state.selection.main.head,
  };
}

describe('codeblock_tab — 4-space Tab/Shift-Tab in fenced code CBLK-I-13', () => {
  it('(a) Tab inserts four spaces at the caret inside a fenced code body', () => {
    // ```js\nf|oo\n``` — caret between the f and the first o.
    const { view, applied, doc, head } = make_view('```js\nfoo\n```', 7);
    expect(codeblock_tab_indent(view)).toBe(true);
    expect(applied).toHaveLength(1);
    expect(doc()).toBe('```js\nf    oo\n```');
    expect(head()).toBe(11);
  });

  it('(b) Tab prepends four spaces to every line of a selection inside a fence', () => {
    // select "a\nb" across two body lines
    const { view, doc } = make_view('```js\na\nb\n```', 6, 9);
    expect(codeblock_tab_indent(view)).toBe(true);
    expect(doc()).toBe('```js\n    a\n    b\n```');
  });

  it('(c) Shift-Tab strips up to four leading spaces inside a fence', () => {
    const { view, doc, head } = make_view('```js\n    a\n```', 11);
    expect(codeblock_tab_dedent(view)).toBe(true);
    expect(doc()).toBe('```js\na\n```');
    expect(head()).toBe(7);
  });

  it('(d) Tab declines in a plain prose paragraph (falls through to 2-space indent)', () => {
    const { view, applied } = make_view('hello world', 5);
    expect(codeblock_tab_indent(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(e) Shift-Tab declines in plain prose', () => {
    const { view, applied } = make_view('hello world', 5);
    expect(codeblock_tab_dedent(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(f) Tab declines inside an indented (non-fenced) code block', () => {
    const { view, applied } = make_view('    foo', 5);
    expect(codeblock_tab_indent(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });
});

describe('codeblock_backspace — strict single-char Backspace in fenced code CBLK-I-14', () => {
  it('(a) removes exactly one space in fenced-code leading whitespace', () => {
    // ```js\n    |code\n``` — caret after the four-space indent
    const { view, doc, head } = make_view('```js\n    code\n```', 10);
    expect(codeblock_backspace(view)).toBe(true);
    expect(doc()).toBe('```js\n   code\n```');
    expect(head()).toBe(9);
  });

  it('(b) declines in a plain prose paragraph (default Backspace handles it)', () => {
    const { view, applied } = make_view('hello', 3);
    expect(codeblock_backspace(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(c) declines on a non-empty selection', () => {
    const { view, applied } = make_view('```js\n    code\n```', 6, 10);
    expect(codeblock_backspace(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });
});
