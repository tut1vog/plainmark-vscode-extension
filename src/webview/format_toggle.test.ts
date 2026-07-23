import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { toggle_inline_style_spec, type InlineStyle } from './format_toggle.js';

function make_state(doc: string, anchor: number, head: number): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM] })],
    selection: { anchor, head },
  });
}

function apply(
  doc: string,
  anchor: number,
  head: number,
  style: InlineStyle,
): { doc: string; from: number; to: number } {
  const state = make_state(doc, anchor, head);
  const spec = toggle_inline_style_spec(state, style);
  if (!spec) throw new Error('toggle returned null');
  const next = state.update(spec).state;
  return {
    doc: next.doc.toString(),
    from: next.selection.main.from,
    to: next.selection.main.to,
  };
}

describe('CTX-I-5 CTX-I-6 toggle_inline_style_spec — wrap', () => {
  it('wraps a plain selection in the canonical marker and keeps the selection on the content', () => {
    expect(apply('hello world', 6, 11, 'bold')).toEqual({
      doc: 'hello **world**',
      from: 8,
      to: 13,
    });
    expect(apply('hello world', 6, 11, 'italic')).toEqual({
      doc: 'hello *world*',
      from: 7,
      to: 12,
    });
    expect(apply('hello world', 6, 11, 'strikethrough')).toEqual({
      doc: 'hello ~~world~~',
      from: 8,
      to: 13,
    });
    expect(apply('hello world', 6, 11, 'inline_code')).toEqual({
      doc: 'hello `world`',
      from: 7,
      to: 12,
    });
  });

  it('italic inside bold wraps (never strips one `*` per side off the bold markers)', () => {
    expect(apply('a **bold** z', 4, 8, 'italic')).toEqual({
      doc: 'a ***bold*** z',
      from: 5,
      to: 9,
    });
  });

  it('whitespace-padded selection: markers land inside the whitespace, bytes untouched', () => {
    expect(apply('hello world ', 5, 12, 'bold')).toEqual({
      doc: 'hello **world** ',
      from: 8,
      to: 13,
    });
    expect(apply('one\ntwo\n', 0, 4, 'italic')).toEqual({
      doc: '*one*\ntwo\n',
      from: 1,
      to: 4,
    });
    expect(apply('a\n\nb\n', 1, 4, 'bold')).toEqual({
      doc: 'a\n\n**b**\n',
      from: 5,
      to: 6,
    });
  });

  it('all-whitespace selection is a no-op', () => {
    expect(apply('a  b', 1, 3, 'bold')).toEqual({ doc: 'a  b', from: 1, to: 3 });
  });

  it('whitespace-padded selection around an existing construct unwraps it', () => {
    expect(apply(' **bold** ', 0, 10, 'bold')).toEqual({ doc: ' bold ', from: 0, to: 6 });
  });

  it('reversed selection (head before anchor) wraps and stays reversed over the content', () => {
    const state = make_state('hello world', 11, 6);
    const next = state.update(toggle_inline_style_spec(state, 'bold')!).state;
    expect(next.doc.toString()).toBe('hello **world**');
    expect(next.selection.main.anchor).toBe(13);
    expect(next.selection.main.head).toBe(8);
  });
});

describe('CTX-I-5 toggle_inline_style_spec — unwrap', () => {
  it('content selection inside the construct removes both markers', () => {
    expect(apply('a **bold** z', 4, 8, 'bold')).toEqual({ doc: 'a bold z', from: 2, to: 6 });
    expect(apply('a ~~gone~~ z', 4, 8, 'strikethrough')).toEqual({
      doc: 'a gone z',
      from: 2,
      to: 6,
    });
    expect(apply('a `code` z', 3, 7, 'inline_code')).toEqual({ doc: 'a code z', from: 2, to: 6 });
  });

  it('selection including the markers unwraps to the bare content', () => {
    expect(apply('a **bold** z', 2, 10, 'bold')).toEqual({ doc: 'a bold z', from: 2, to: 6 });
  });

  it('partial selection inside the construct still unwraps the whole construct', () => {
    expect(apply('a **bold** z', 5, 7, 'bold')).toEqual({ doc: 'a bold z', from: 3, to: 5 });
  });

  it('unwraps underscore emphasis as written', () => {
    expect(apply('a _ital_ z', 3, 7, 'italic')).toEqual({ doc: 'a ital z', from: 2, to: 6 });
    expect(apply('a __bold__ z', 4, 8, 'bold')).toEqual({ doc: 'a bold z', from: 2, to: 6 });
  });

  it('wrap → toggle again restores the original bytes', () => {
    const wrapped = apply('hello world', 6, 11, 'bold');
    expect(apply(wrapped.doc, wrapped.from, wrapped.to, 'bold')).toEqual({
      doc: 'hello world',
      from: 6,
      to: 11,
    });
  });
});

describe('CTX-I-5 CTX-I-6 toggle_inline_style_spec — no-ops', () => {
  it('returns null for an empty selection', () => {
    const state = make_state('hello', 2, 2);
    expect(toggle_inline_style_spec(state, 'bold')).toBeNull();
  });
});
