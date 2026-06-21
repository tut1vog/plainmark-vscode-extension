import { markdown } from '@codemirror/lang-markdown';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { math_extension } from '../grammar/math.js';
import {
  block_delimiter_autoclose,
  block_empty_backspace,
  fence_autopair_input,
} from './block_autoclose.js';

interface FakeView {
  view: EditorView;
  applied: TransactionSpec[];
  doc: () => string;
  head: () => number;
}

function make_view(initial_doc: string, anchor: number, head?: number): FakeView {
  let state = EditorState.create({
    doc: initial_doc,
    extensions: [markdown({ extensions: [GFM, math_extension] })],
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

describe('block_delimiter_autoclose — fenced code CBLK-I-6 CBLK-I-7 CBLK-E-2 CBLK-SP-4', () => {
  it('(a) Enter on an unclosed ```js fence appends ``` and lands on the empty line', () => {
    const { view, applied, doc, head } = make_view('```js', 5);
    expect(block_delimiter_autoclose(view)).toBe(true);
    expect(applied).toHaveLength(1);
    expect(doc()).toBe('```js\n\n```');
    expect(head()).toBe(6);
  });

  it('(b) Enter on a bare unclosed ``` fence appends ```', () => {
    const { view, applied, doc, head } = make_view('```', 3);
    expect(block_delimiter_autoclose(view)).toBe(true);
    expect(applied).toHaveLength(1);
    expect(doc()).toBe('```\n\n```');
    expect(head()).toBe(4);
  });

  it('(c) closes between the opener and the content that followed it', () => {
    const { view, doc, head } = make_view('```js\nhello', 5);
    expect(block_delimiter_autoclose(view)).toBe(true);
    expect(doc()).toBe('```js\n\n```\nhello');
    expect(head()).toBe(6);
  });

  it('(d) mirrors leading indentation on the closing fence', () => {
    const { view, doc, head } = make_view('  ```js', 7);
    expect(block_delimiter_autoclose(view)).toBe(true);
    expect(doc()).toBe('  ```js\n\n  ```');
    expect(head()).toBe(8);
  });

  it('(e) matches the closing fence length to the opener', () => {
    const { view, doc } = make_view('````js', 6);
    expect(block_delimiter_autoclose(view)).toBe(true);
    expect(doc()).toBe('````js\n\n````');
  });

  it('(f) handles a tilde fence', () => {
    const { view, doc } = make_view('~~~js', 5);
    expect(block_delimiter_autoclose(view)).toBe(true);
    expect(doc()).toBe('~~~js\n\n~~~');
  });

  it('(g) returns false on the opener of an already-closed block', () => {
    const { view, applied } = make_view('```js\ncode\n```', 5);
    expect(block_delimiter_autoclose(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(h) returns false on the closing fence of a closed block', () => {
    const { view, applied } = make_view('```\ncode\n```', 12);
    expect(block_delimiter_autoclose(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(i) returns false when the caret is mid-line', () => {
    const { view, applied } = make_view('```js', 3);
    expect(block_delimiter_autoclose(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });
});

describe('block_delimiter_autoclose — math block MATH-I-7 MATH-SP-3', () => {
  it('(a) Enter on a lone unclosed $$ appends $$ and lands on the empty line', () => {
    const { view, applied, doc, head } = make_view('$$', 2);
    expect(block_delimiter_autoclose(view)).toBe(true);
    expect(applied).toHaveLength(1);
    expect(doc()).toBe('$$\n\n$$');
    expect(head()).toBe(3);
  });

  it('(b) closes between the opener and the content that followed it', () => {
    const { view, doc, head } = make_view('$$\nhello', 2);
    expect(block_delimiter_autoclose(view)).toBe(true);
    expect(doc()).toBe('$$\n\n$$\nhello');
    expect(head()).toBe(3);
  });

  it('(c) returns false on the opening $$ of a closed block', () => {
    const { view, applied } = make_view('$$\nx\n$$', 2);
    expect(block_delimiter_autoclose(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(d) returns false on the closing $$ of a closed block', () => {
    const { view, applied } = make_view('$$\nx\n$$', 7);
    expect(block_delimiter_autoclose(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(e) returns false on the opener of an empty closed block', () => {
    const { view, applied } = make_view('$$\n$$', 2);
    expect(block_delimiter_autoclose(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(f) returns false on a $$ line that already carries content', () => {
    const { view, applied } = make_view('$$x', 3);
    expect(block_delimiter_autoclose(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });
});

describe('block_empty_backspace CBLK-I-8 MATH-SP-3', () => {
  it('(a) deletes a whole empty fenced block (caret on its empty line)', () => {
    const { view, applied, doc, head } = make_view('```python\n\n```', 10);
    expect(block_empty_backspace(view)).toBe(true);
    expect(applied).toHaveLength(1);
    expect(doc()).toBe('');
    expect(head()).toBe(0);
  });

  it('(b) deletes a whole empty math block (caret on its empty line)', () => {
    const { view, applied, doc, head } = make_view('$$\n\n$$', 3);
    expect(block_empty_backspace(view)).toBe(true);
    expect(applied).toHaveLength(1);
    expect(doc()).toBe('');
    expect(head()).toBe(0);
  });

  it('(c) deletes an empty fenced block between surrounding content', () => {
    const { view, doc, head } = make_view('hello\n```js\n\n```\nworld', 12);
    expect(block_empty_backspace(view)).toBe(true);
    expect(doc()).toBe('hello\n\nworld');
    expect(head()).toBe(6);
  });

  it('(d) deletes an empty math block, preserving content after it', () => {
    const { view, doc, head } = make_view('$$\n\n$$\nworld', 3);
    expect(block_empty_backspace(view)).toBe(true);
    expect(doc()).toBe('\nworld');
    expect(head()).toBe(0);
  });

  it('(e) returns false when the content line carries text', () => {
    const { view, applied } = make_view('```js\ncode\n```', 8);
    expect(block_empty_backspace(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(f) returns false on a plain empty line outside any block', () => {
    const { view, applied } = make_view('hello\n\nworld', 6);
    expect(block_empty_backspace(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(g) returns false on the empty line of an unclosed fence', () => {
    const { view, applied } = make_view('```js\n', 6);
    expect(block_empty_backspace(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(h) returns false on a block with more than one blank content line', () => {
    const { view, applied } = make_view('```js\n\n\n```', 6);
    expect(block_empty_backspace(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(i) returns false when the selection is non-empty', () => {
    const { view, applied } = make_view('```python\n\n```', 0, 10);
    expect(block_empty_backspace(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(j) returns false on the blank line between two complete math blocks', () => {
    const { view, applied, doc } = make_view('$$\na\n$$\n\n$$\nb\n$$', 8);
    expect(block_empty_backspace(view)).toBe(false);
    expect(applied).toHaveLength(0);
    expect(doc()).toBe('$$\na\n$$\n\n$$\nb\n$$');
  });
});

describe('fence_autopair_input CBLK-I-11 CBLK-I-12 CBLK-SP-5 CBLK-E-2', () => {
  it('(a) third backtick on an empty line appends a closing fence, caret at opener end', () => {
    const { view, applied, doc, head } = make_view('``', 2);
    expect(fence_autopair_input(view, 2, 2, '`')).toBe(true);
    expect(applied).toHaveLength(1);
    expect(doc()).toBe('```\n```');
    expect(head()).toBe(3);
  });

  it('(b) third tilde appends a tilde closer', () => {
    const { view, doc, head } = make_view('~~', 2);
    expect(fence_autopair_input(view, 2, 2, '~')).toBe(true);
    expect(doc()).toBe('~~~\n~~~');
    expect(head()).toBe(3);
  });

  it('(c) mirrors leading indentation on the closing fence', () => {
    const { view, doc, head } = make_view('  ``', 4);
    expect(fence_autopair_input(view, 4, 4, '`')).toBe(true);
    expect(doc()).toBe('  ```\n  ```');
    expect(head()).toBe(5);
  });

  it('(d) inserts the closer above existing content, caret stays on the opener', () => {
    const { view, doc, head } = make_view('``\nhello', 2);
    expect(fence_autopair_input(view, 2, 2, '`')).toBe(true);
    expect(doc()).toBe('```\n```\nhello');
    expect(head()).toBe(3);
  });

  it('(e) returns false for a non-fence character', () => {
    const { view, applied } = make_view('ab', 2);
    expect(fence_autopair_input(view, 2, 2, 'c')).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(f) returns false on the second backtick (run not yet three)', () => {
    const { view, applied } = make_view('`', 1);
    expect(fence_autopair_input(view, 1, 1, '`')).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(g) returns false on the fourth backtick (run already three)', () => {
    const { view, applied } = make_view('```', 3);
    expect(fence_autopair_input(view, 3, 3, '`')).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(h) returns false when content follows the caret on the line', () => {
    const { view, applied } = make_view('``x', 2);
    expect(fence_autopair_input(view, 2, 2, '`')).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(i) suppresses when the next line is already a matching closer', () => {
    const { view, applied } = make_view('``\n```', 2);
    expect(fence_autopair_input(view, 2, 2, '`')).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(j) still fires when the next line is a closer of a different fence char', () => {
    const { view, doc } = make_view('``\n~~~', 2);
    expect(fence_autopair_input(view, 2, 2, '`')).toBe(true);
    expect(doc()).toBe('```\n```\n~~~');
  });

  it('(k) returns false on a non-empty selection', () => {
    const { view, applied } = make_view('``', 0, 2);
    expect(fence_autopair_input(view, 0, 2, '`')).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(l) returns false past a 3-space indent cap (4 spaces is indented code)', () => {
    const { view, applied } = make_view('    ``', 6);
    expect(fence_autopair_input(view, 6, 6, '`')).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(m) returns false when the typed run closes an unclosed fence above', () => {
    const { view, applied } = make_view('```js\ncode\n``', 13);
    expect(fence_autopair_input(view, 13, 13, '`')).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(n) returns false below an unclosed fence with a blank line between', () => {
    const { view, applied } = make_view('```js\ncode\n\n``', 14);
    expect(fence_autopair_input(view, 14, 14, '`')).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(o) still fires on a fresh opener below a closed fence', () => {
    const { view, doc } = make_view('```js\ncode\n```\n``', 17);
    expect(fence_autopair_input(view, 17, 17, '`')).toBe(true);
    expect(doc()).toBe('```js\ncode\n```\n```\n```');
  });
});

describe('block_delimiter_autoclose — non-triggers', () => {
  it('returns false on a plain paragraph line', () => {
    const { view, applied } = make_view('hello', 5);
    expect(block_delimiter_autoclose(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('returns false when the selection is non-empty', () => {
    const { view, applied } = make_view('```js', 0, 5);
    expect(block_delimiter_autoclose(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });
});
