import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { math_extension } from './math.js';

function parse(doc: string): { name: string; from: number; to: number }[] {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM, math_extension] })],
  });
  const tree = syntaxTree(state);
  const nodes: { name: string; from: number; to: number }[] = [];
  tree.iterate({
    enter(node) {
      nodes.push({ name: node.name, from: node.from, to: node.to });
    },
  });
  return nodes;
}

function nodes_of(doc: string, name: string): { from: number; to: number }[] {
  return parse(doc)
    .filter((n) => n.name === name)
    .map(({ from, to }) => ({ from, to }));
}

function block_math_ranges(doc: string): { from: number; to: number }[] {
  return nodes_of(doc, 'BlockMath');
}

function inline_math_ranges(doc: string): { from: number; to: number }[] {
  return nodes_of(doc, 'InlineMath');
}

describe('math grammar — block MATH-R-1 MATH-E-2', () => {
  it('tokenizes a simple $$...$$ block as BlockMath', () => {
    const doc = '$$\na = b\n$$\n';
    const blocks = block_math_ranges(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].from).toBe(0);
    expect(blocks[0].to).toBe(doc.indexOf('$$\n', 1) + 2);
  });

  it('tokenizes a single-line $$...$$ block when an opening and closing line are present', () => {
    const doc = '$$\nx\n$$\n';
    expect(block_math_ranges(doc)).toHaveLength(1);
  });

  it('emits two BlockMathMark children (open + close)', () => {
    const doc = '$$\na\n$$\n';
    const marks = parse(doc).filter((n) => n.name === 'BlockMathMark');
    expect(marks).toHaveLength(2);
  });

  it('does not tokenize $$...$$ inside a fenced code block', () => {
    const doc = '```\n$$\na = b\n$$\n```\n';
    expect(block_math_ranges(doc)).toHaveLength(0);
  });

  it('does not tokenize an unclosed $$ opener as BlockMath', () => {
    const doc = '$$\na = b\n';
    expect(block_math_ranges(doc)).toHaveLength(0);
  });

  it('lets markdown below an unclosed $$ opener parse normally (no swallow to EOF)', () => {
    const doc = '$$\n# Heading\n- item\n';
    expect(block_math_ranges(doc)).toHaveLength(0);
    const names = parse(doc).map((n) => n.name);
    expect(names).toContain('ATXHeading1');
    expect(names).toContain('BulletList');
  });

  it('falls back to no BlockMath when a $$ block contains a blank line before its close', () => {
    const doc = '$$\na\n\nb\n$$\n';
    expect(block_math_ranges(doc)).toHaveLength(0);
  });

  it('does not crash on a bare $$ line with no following content', () => {
    const doc = '$$\n';
    expect(() => parse(doc)).not.toThrow();
  });

  it('does not crash on `$` alone (not a $$ opening)', () => {
    const doc = '$ a = b $\n';
    expect(() => parse(doc)).not.toThrow();
    expect(block_math_ranges(doc)).toHaveLength(0);
  });

  it('accepts $$ with leading whitespace (line.pos advances past indent) — documents grammar behavior', () => {
    const doc = '  $$\na\n$$\n';
    expect(block_math_ranges(doc)).toHaveLength(1);
  });

  it('parses two consecutive $$...$$ blocks independently', () => {
    const doc = '$$\na\n$$\n\n$$\nb\n$$\n';
    expect(block_math_ranges(doc)).toHaveLength(2);
  });

  it('MATH-E-10 parses two adjacent multi-line $$...$$ blocks with no blank line between them as separate BlockMath nodes', () => {
    const doc = '$$\na\n$$\n$$\nb\n$$\n';
    const blocks = block_math_ranges(doc);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ from: 0, to: 7 });
    expect(blocks[1]).toEqual({ from: 8, to: 15 });
  });

  it('MATH-E-10 keeps blank-line-separated multi-line $$...$$ blocks as two BlockMath nodes', () => {
    const doc = '$$\na\n$$\n\n$$\nb\n$$\n';
    expect(block_math_ranges(doc)).toHaveLength(2);
  });

  it('MATH-E-11 interrupts an open paragraph: a multi-line $$ opener on the line below text parses as BlockMath', () => {
    const doc = 'text\n$$\na\n$$\n';
    expect(block_math_ranges(doc)).toHaveLength(1);
  });

  it('MATH-E-11 interrupts an open paragraph: a single-line $$...$$ on the line below text parses as BlockMath', () => {
    const doc = 'text\n$$x$$\n';
    expect(block_math_ranges(doc)).toHaveLength(1);
  });

  it('MATH-E-11 interrupts a list line: a $$ opener directly below a list item parses as BlockMath', () => {
    const doc = '- item\n$$\na\n$$\n';
    expect(block_math_ranges(doc)).toHaveLength(1);
  });

  it('MATH-E-11 parses block-paragraph-block (paragraph between two blocks) as two BlockMath nodes', () => {
    const doc = '$$\na\n$$\ntext\n$$\nb\n$$\n';
    expect(block_math_ranges(doc)).toHaveLength(2);
  });

  it('MATH-E-11 does not treat an inline-math continuation line as a block interrupt (one $ then non-$)', () => {
    const doc = 'text\n$x$ more\n';
    expect(block_math_ranges(doc)).toHaveLength(0);
    expect(inline_math_ranges(doc)).toHaveLength(1);
  });

  it('parses $$...$$ with multi-line body', () => {
    const doc = '$$\n\\sum_{i=1}^n\n  x_i^2\n$$\n';
    expect(block_math_ranges(doc)).toHaveLength(1);
  });

  it('tokenizes a single-line $$x$$ (open and close on the same line) as BlockMath', () => {
    const doc = '$$x$$\n';
    const blocks = block_math_ranges(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({ from: 0, to: 5 });
  });

  it('emits two BlockMathMark children for single-line $$...$$ (open + close)', () => {
    const doc = '$$x$$\n';
    const marks = parse(doc).filter((n) => n.name === 'BlockMathMark');
    expect(marks).toHaveLength(2);
    expect(marks[0]).toEqual({ name: 'BlockMathMark', from: 0, to: 2 });
    expect(marks[1]).toEqual({ name: 'BlockMathMark', from: 3, to: 5 });
  });

  it('tokenizes a single-line $$...$$ with structured TeX content', () => {
    const doc = "$$g'(c) = \\lim_{x \\to c} \\frac{g(x) - g(c)}{x - c}.$$\n";
    const blocks = block_math_ranges(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].from).toBe(0);
    expect(blocks[0].to).toBe(doc.indexOf('\n'));
  });

  it('allows trailing whitespace after the closing $$ on a single line', () => {
    const doc = '$$x$$   \n';
    const blocks = block_math_ranges(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({ from: 0, to: 5 });
  });

  it('allows leading indent before single-line $$...$$', () => {
    const doc = '  $$x$$\n';
    const blocks = block_math_ranges(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({ from: 2, to: 7 });
  });

  it('does not consume the next line when single-line $$...$$ closes (inline math on the next line still parses)', () => {
    const doc = "$$g'(c)=\\lim.$$\n$(g(x)-g(c))/(x-c)$\n";
    expect(block_math_ranges(doc)).toHaveLength(1);
    expect(inline_math_ranges(doc)).toHaveLength(1);
  });

  it('parses two adjacent single-line $$...$$ blocks as separate BlockMath nodes', () => {
    const doc = '$$x$$\n$$y$$\n';
    expect(block_math_ranges(doc)).toHaveLength(2);
  });

  it('parses a single-line $$...$$ followed immediately by a multi-line block as two BlockMath nodes', () => {
    const doc = '$$x$$\n$$\nb\n$$\n';
    expect(block_math_ranges(doc)).toHaveLength(2);
  });

  it('closes a single-line $$...$$ on its own line even when the next line starts with $$', () => {
    const doc = '$$x$$\n$$y$$\n';
    const blocks = block_math_ranges(doc);
    expect(blocks[0]).toEqual({ from: 0, to: 5 });
  });

  it('does not single-line tokenize `$$$$` (no content between markers — defers to the leaf parser)', () => {
    // Empty body is rejected as single-line block math (requires at least one char between
    // markers); the leaf parser then finds no closing `$$` and falls back to a paragraph.
    const doc = '$$$$\nstuff\n';
    expect(block_math_ranges(doc)).toHaveLength(0);
  });
});

describe('math grammar — inline MATH-R-1 MATH-E-3 MATH-E-4 MATH-E-6 MATH-E-7', () => {
  it('tokenizes a simple $x$ as InlineMath', () => {
    const doc = '$x$\n';
    const inline = inline_math_ranges(doc);
    expect(inline).toHaveLength(1);
    expect(inline[0].from).toBe(0);
    expect(inline[0].to).toBe(3);
  });

  it('tokenizes math with internal spaces', () => {
    const doc = 'value: $x = y$ end\n';
    const inline = inline_math_ranges(doc);
    expect(inline).toHaveLength(1);
    expect(doc.slice(inline[0].from, inline[0].to)).toBe('$x = y$');
  });

  it('emits two InlineMathMark children at the dollar positions', () => {
    const doc = '$x$\n';
    const marks = parse(doc).filter((n) => n.name === 'InlineMathMark');
    expect(marks).toHaveLength(2);
    expect(marks[0]).toEqual({ name: 'InlineMathMark', from: 0, to: 1 });
    expect(marks[1]).toEqual({ name: 'InlineMathMark', from: 2, to: 3 });
  });

  it('parses multiple inline math nodes in one paragraph', () => {
    const doc = '$a$ and $b$ and $c$\n';
    const inline = inline_math_ranges(doc);
    expect(inline).toHaveLength(3);
  });

  it('does not parse a single `$` with no closing `$`', () => {
    const doc = 'cost is $10\n';
    expect(inline_math_ranges(doc)).toHaveLength(0);
  });

  it('does not parse `$` across a line break', () => {
    const doc = '$x\ny$\n';
    expect(inline_math_ranges(doc)).toHaveLength(0);
  });

  it('does not parse `$$` (empty inline) as InlineMath', () => {
    const doc = 'empty $$ here\n';
    expect(inline_math_ranges(doc)).toHaveLength(0);
  });

  it('does not parse `$` inside a code span', () => {
    const doc = '`$x$`\n';
    expect(inline_math_ranges(doc)).toHaveLength(0);
  });

  it('does not parse `$` inside a fenced code block', () => {
    const doc = '```\n$x$\n```\n';
    expect(inline_math_ranges(doc)).toHaveLength(0);
  });

  it('does not parse `\\$` as the opening of math (Escape consumes \\$ first)', () => {
    const doc = 'price \\$5 and \\$10\n';
    expect(inline_math_ranges(doc)).toHaveLength(0);
  });

  it('parses `$5.00 + $3.00` permissively as InlineMath spanning the first two dollars', () => {
    // Typora-style rule: any pair of `$` on the same line is math.
    // Users escape literal dollars with `\$`. Verifies the chosen disambiguation behavior.
    const doc = '$5.00 + $3.00\n';
    const inline = inline_math_ranges(doc);
    expect(inline).toHaveLength(1);
    expect(doc.slice(inline[0].from, inline[0].to)).toBe('$5.00 + $');
  });

  it('parses inline and block math in the same document independently', () => {
    const doc = 'see $a$ below\n\n$$\nb\n$$\n\nand $c$\n';
    expect(inline_math_ranges(doc)).toHaveLength(2);
    expect(block_math_ranges(doc)).toHaveLength(1);
  });
});
