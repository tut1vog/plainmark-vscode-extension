import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { math_extension as math_grammar_extension } from '../grammar/math.js';
import { find_math_context_at } from './math_preview.js';

function make_state(
  doc: string,
  selection: number | { anchor: number; head: number } = doc.length,
): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM, math_grammar_extension] })],
    selection:
      typeof selection === 'number' ? { anchor: selection } : selection,
  });
}

describe('find_math_context_at MATH-I-5 MATH-I-6', () => {
  it('returns the context when the caret sits inside inline math', () => {
    const doc = 'see $x = y$ here\n';
    const from = doc.indexOf('$');
    const ctx = find_math_context_at(make_state(doc, from + 1));
    expect(ctx).not.toBeNull();
    expect(ctx?.display).toBe(false);
    expect(ctx?.from).toBe(from);
    expect(ctx?.to).toBe(from + '$x = y$'.length);
    expect(ctx?.src).toBe('x = y');
  });

  it('returns null when the caret is outside any inline math', () => {
    const doc = 'see $x$ here\n';
    expect(find_math_context_at(make_state(doc, 0))).toBeNull();
    expect(find_math_context_at(make_state(doc, doc.length))).toBeNull();
  });

  it('returns the context at the leading `$` boundary (head === from)', () => {
    const doc = 'see $x$ here\n';
    const from = doc.indexOf('$');
    const ctx = find_math_context_at(make_state(doc, from));
    expect(ctx).not.toBeNull();
    expect(ctx?.from).toBe(from);
  });

  it('returns the context at the trailing `$` boundary (head === to)', () => {
    const doc = 'see $x$ here\n';
    const from = doc.indexOf('$');
    const to = from + '$x$'.length;
    const ctx = find_math_context_at(make_state(doc, to));
    expect(ctx).not.toBeNull();
    expect(ctx?.to).toBe(to);
  });

  it('returns the context for a non-empty selection covering inline math', () => {
    const doc = 'see $x = y$ here\n';
    const from = doc.indexOf('$');
    const to = from + '$x = y$'.length;
    const state = make_state(doc, { anchor: from, head: to });
    const ctx = find_math_context_at(state);
    expect(ctx).not.toBeNull();
    expect(ctx?.from).toBe(from);
    expect(ctx?.to).toBe(to);
  });

  it('returns the context for a selection inside inline math (the `$` revealed)', () => {
    const doc = 'see $x = y$ here\n';
    const from = doc.indexOf('$');
    const state = make_state(doc, { anchor: from + 1, head: from + 4 });
    const ctx = find_math_context_at(state);
    expect(ctx).not.toBeNull();
    expect(ctx?.from).toBe(from);
  });

  it('returns null for a select-all strictly covering inline math (preview stays hidden, matching the widget)', () => {
    const doc = 'see $x$ here\n';
    const state = make_state(doc, { anchor: 0, head: doc.length });
    expect(find_math_context_at(state)).toBeNull();
  });

  it('returns null when the caret sits inside block math', () => {
    const doc = 'before\n\n$$a = b$$\n\nafter\n';
    const from = doc.indexOf('$$');
    expect(find_math_context_at(make_state(doc, from + 3))).toBeNull();
  });
});
