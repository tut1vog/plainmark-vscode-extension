import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { math_extension as math_grammar_extension } from '../grammar/math.js';
import { math_content_select_range } from './math_click_select.js';

function make_state(doc: string, cursor: number = doc.length): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM, math_grammar_extension] })],
    selection: { anchor: cursor },
  });
}

describe('math_content_select_range MATH-I-15', () => {
  describe('inline math', () => {
    const doc = 'a $x^2$ b'; // InlineMath `$x^2$` at [2, 7); content `x^2` at [3, 6)

    it('selects the inner LaTeX of a rendered inline math, delimiters excluded', () => {
      const range = math_content_select_range(make_state(doc, 0), 4);
      expect(range).toEqual({ from: 3, to: 6 });
      expect(doc.slice(3, 6)).toBe('x^2');
    });

    it('returns null when the inline math is already revealed (caret inside)', () => {
      expect(math_content_select_range(make_state(doc, 4), 4)).toBeNull();
    });

    it('returns null when the position is not on math', () => {
      expect(math_content_select_range(make_state(doc, 0), 0)).toBeNull();
      expect(math_content_select_range(make_state(doc, 0), 8)).toBeNull();
    });
  });

  describe('block math', () => {
    it('selects the inner content lines of a rendered multi-line block', () => {
      const doc = 'x\n$$\na=b\n$$'; // BlockMath at [2, 11); content `a=b` at [5, 8)
      const range = math_content_select_range(make_state(doc, 0), 6);
      expect(range).toEqual({ from: 5, to: 8 });
      expect(doc.slice(5, 8)).toBe('a=b');
    });

    it('selects the inner content of a rendered single-line block', () => {
      const doc = 'x\n$$a=b$$'; // BlockMath at [2, 9); content `a=b` at [4, 7)
      const range = math_content_select_range(make_state(doc, 0), 5);
      expect(range).toEqual({ from: 4, to: 7 });
      expect(doc.slice(4, 7)).toBe('a=b');
    });

    it('returns null when the block math is already revealed (caret inside)', () => {
      const doc = 'x\n$$\na=b\n$$';
      expect(math_content_select_range(make_state(doc, 6), 6)).toBeNull();
    });
  });

  describe('quote-nested block math (MATH-E-13)', () => {
    it('resolves a click on the quote prefix of a replaced line to the block content', () => {
      const doc = 'x\n\n> $$a=b$$'; // BlockMath at [5, 12); widget replaces [3, 12)
      // pos 3 sits on the `> ` prefix — outside the node, inside the widget range.
      const range = math_content_select_range(make_state(doc, 0), 3);
      expect(range).toEqual({ from: 7, to: 10 });
      expect(doc.slice(7, 10)).toBe('a=b');
    });

    it('returns null when the quoted block is revealed (caret on the quote prefix)', () => {
      // Caret at 4 — on the prefix, within the widget range: source is revealed,
      // so a click places an ordinary caret instead of selecting.
      const doc = 'x\n\n> $$a=b$$';
      expect(math_content_select_range(make_state(doc, 4), 6)).toBeNull();
    });

    it('does not select math from the prefix of a non-replaced quote line', () => {
      // Inline math in a quote: the line is not widget-replaced, so a click on
      // its `> ` prefix must fall through to ordinary caret placement.
      const doc = '> $x$ words';
      expect(math_content_select_range(make_state(doc, 8), 0)).toBeNull();
    });
  });
});
