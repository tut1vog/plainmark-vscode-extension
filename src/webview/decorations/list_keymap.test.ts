import { markdown } from '@codemirror/lang-markdown';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import {
  list_dangling_indent_backspace,
  list_empty_bullet_backspace,
} from './list_keymap.js';

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

describe('list_empty_bullet_backspace LIST-I-8 LIST-I-9 LIST-SP-2 LIST-SP-3', () => {
  it('(a) removes the marker from a lone empty `- ` line, leaving an empty line', () => {
    const { view, applied, doc, head } = make_view('- ', 2);
    expect(list_empty_bullet_backspace(view)).toBe(true);
    expect(applied).toHaveLength(1);
    expect(doc()).toBe('');
    expect(head()).toBe(0);
  });

  it('(b) removes the marker from an empty `- ` after a populated item', () => {
    // '- a\n- ' — line 2 is the empty bullet
    const { view, applied, doc, head } = make_view('- a\n- ', 6);
    expect(list_empty_bullet_backspace(view)).toBe(true);
    expect(applied).toHaveLength(1);
    expect(doc()).toBe('- a\n');
    expect(head()).toBe(4);
  });

  it('(c) removes only the marker from an empty nested bullet, keeping the indentation', () => {
    // '- a\n  - ' — line 2 is the nested empty bullet; the two-space indent survives
    const { view, applied, doc, head } = make_view('- a\n  - ', 8);
    expect(list_empty_bullet_backspace(view)).toBe(true);
    expect(applied).toHaveLength(1);
    expect(doc()).toBe('- a\n  ');
    expect(head()).toBe(6);
  });

  it('(d) handles `*` and `+` markers', () => {
    const star = make_view('* ', 2);
    expect(list_empty_bullet_backspace(star.view)).toBe(true);
    expect(star.doc()).toBe('');
    const plus = make_view('+ ', 2);
    expect(list_empty_bullet_backspace(plus.view)).toBe(true);
    expect(plus.doc()).toBe('');
  });

  it('(e) handles a `-` marker with no trailing space', () => {
    const { view, applied, doc } = make_view('- a\n-', 5);
    expect(list_empty_bullet_backspace(view)).toBe(true);
    expect(applied).toHaveLength(1);
    expect(doc()).toBe('- a\n');
  });

  it('(f) returns false on a non-empty bullet item (yields to default)', () => {
    const { view, applied } = make_view('- a', 3);
    expect(list_empty_bullet_backspace(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(g) returns false on a plain blank line', () => {
    const { view, applied } = make_view('hello\n', 6);
    expect(list_empty_bullet_backspace(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(h) returns false when the lone `-` is a setext-heading underline', () => {
    // 'text\n-' — the '-' line is a SetextHeading underline, not a list item
    const { view, applied } = make_view('text\n-', 6);
    expect(list_empty_bullet_backspace(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(i) returns false when the selection is non-empty', () => {
    const { view, applied } = make_view('- ', 0, 2);
    expect(list_empty_bullet_backspace(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(j) returns false on an empty ordered-list item', () => {
    // '1. ' — ordered marker, not a bullet
    const { view, applied } = make_view('1. ', 3);
    expect(list_empty_bullet_backspace(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(k) keeps tab indentation when removing a tab-indented empty bullet', () => {
    // '- a\n\t- ' — tab-indented nested empty bullet
    const { view, doc, head } = make_view('- a\n\t- ', 7);
    expect(list_empty_bullet_backspace(view)).toBe(true);
    expect(doc()).toBe('- a\n\t');
    expect(head()).toBe(5);
  });
});

describe('list_dangling_indent_backspace LIST-I-13 LIST-SP-2 LIST-SP-3', () => {
  it('(a) removes an indent-only line below a list item, joining to its end', () => {
    // '- a\n  ' — line 2 is indent-only (the stage-one leftover)
    const { view, applied, doc, head } = make_view('- a\n  ', 6);
    expect(list_dangling_indent_backspace(view)).toBe(true);
    expect(applied).toHaveLength(1);
    expect(doc()).toBe('- a');
    expect(head()).toBe(3);
  });

  it('(b) joins to the end of the deepest item above in a nested list', () => {
    // '- a\n  - b\n    ' — line 3 is indent-only below the nested item
    const { view, doc, head } = make_view('- a\n  - b\n    ', 14);
    expect(list_dangling_indent_backspace(view)).toBe(true);
    expect(doc()).toBe('- a\n  - b');
    expect(head()).toBe(9);
  });

  it('(c) fires with the caret anywhere on the indent-only line', () => {
    // caret between the two indent spaces
    const { view, doc, head } = make_view('- a\n  ', 5);
    expect(list_dangling_indent_backspace(view)).toBe(true);
    expect(doc()).toBe('- a');
    expect(head()).toBe(3);
  });

  it('(d) emits a single transaction annotated as a delete', () => {
    const { view, applied } = make_view('- a\n  ', 6);
    expect(list_dangling_indent_backspace(view)).toBe(true);
    expect(applied).toHaveLength(1);
    const spec = applied[0] as { changes?: { from: number; to: number; insert: string } };
    expect(spec.changes).toEqual({ from: 3, to: 6, insert: '' });
  });

  it('(e) returns false when the previous line is not a list item', () => {
    // 'hello\n  ' — indent-only line below a paragraph keeps default backspace
    const { view, applied } = make_view('hello\n  ', 8);
    expect(list_dangling_indent_backspace(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(f) returns false on a truly empty line (no indentation)', () => {
    // '- a\n' — line 2 is empty, default join applies
    const { view, applied } = make_view('- a\n', 4);
    expect(list_dangling_indent_backspace(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(g) returns false on an indent-only first line', () => {
    const { view, applied } = make_view('  ', 2);
    expect(list_dangling_indent_backspace(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(h) returns false on a non-empty selection', () => {
    const { view, applied } = make_view('- a\n  ', 4, 6);
    expect(list_dangling_indent_backspace(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(i) returns false on a line with non-whitespace content', () => {
    const { view, applied } = make_view('- a\n  b', 7);
    expect(list_dangling_indent_backspace(view)).toBe(false);
    expect(applied).toHaveLength(0);
  });

  it('(j) two presses walk an empty nested bullet up to the parent item end', () => {
    // stage one: '- a\n  - ' → '- a\n  '; stage two: → '- a'
    const { view, doc, head } = make_view('- a\n  - ', 8);
    expect(list_empty_bullet_backspace(view)).toBe(true);
    expect(doc()).toBe('- a\n  ');
    expect(head()).toBe(6);
    expect(list_dangling_indent_backspace(view)).toBe(true);
    expect(doc()).toBe('- a');
    expect(head()).toBe(3);
  });
});
