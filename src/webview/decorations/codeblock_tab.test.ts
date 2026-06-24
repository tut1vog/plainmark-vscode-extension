import { markdown } from '@codemirror/lang-markdown';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { codeblock_tab_insert } from './codeblock_tab.js';

interface FakeView {
  view: EditorView;
  applied: TransactionSpec[];
  doc: () => string;
  head: () => number;
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
    head: () => state.selection.main.head,
  };
}

describe('codeblock_tab_insert — Tab caret-indent in fenced code CBLK-I-13', () => {
  it('(a) inserts one indent unit at the caret inside a fenced code body', () => {
    // ```js\nf|oo\n``` — caret between the f and the first o.
    const { view, applied, doc, head } = make_view('```js\nfoo\n```', 7);
    expect(codeblock_tab_insert(view)).toBe(true);
    expect(applied).toHaveLength(1);
    expect(doc()).toBe('```js\nf  oo\n```');
    expect(head()).toBe(9);
  });

  it('(b) declines in a plain prose paragraph so Tab falls through to whole-line indent', () => {
    const { view, applied } = make_view('hello world', 5);
    expect(codeblock_tab_insert(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(c) declines on a non-empty selection inside a fenced code body', () => {
    const { view, applied } = make_view('```js\nfoo\n```', 6, 9);
    expect(codeblock_tab_insert(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(d) declines inside an indented (non-fenced) code block', () => {
    const { view, applied } = make_view('    foo', 5);
    expect(codeblock_tab_insert(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });
});
