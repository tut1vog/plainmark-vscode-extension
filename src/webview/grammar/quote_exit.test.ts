import { markdown } from '@codemirror/lang-markdown';
import { syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { math_extension } from './math.js';
import { quote_exit_extension } from './quote_exit.js';

function parse(doc: string): { name: string; from: number; to: number }[] {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM, math_extension, quote_exit_extension] })],
  });
  const nodes: { name: string; from: number; to: number }[] = [];
  syntaxTree(state).iterate({
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

describe('BQ-E-1: a marker-less line exits the quote', () => {
  it('`> a\\nb` — the quote ends on its marked line; `b` is a top-level paragraph', () => {
    expect(nodes_of('> a\nb', 'Blockquote')).toEqual([{ from: 0, to: 3 }]);
    expect(nodes_of('> a\nb', 'Paragraph')).toEqual([
      { from: 2, to: 3 },
      { from: 4, to: 5 },
    ]);
  });

  it('`> > a\\n> b` — a partially marked line exits only the unmatched depth', () => {
    expect(nodes_of('> > a\n> b', 'Blockquote')).toEqual([
      { from: 0, to: 9 },
      { from: 2, to: 5 },
    ]);
    expect(nodes_of('> > a\n> b', 'Paragraph')).toEqual([
      { from: 4, to: 5 },
      { from: 8, to: 9 },
    ]);
  });

  it('`> - a\\nb` — the exit crosses a quoted list entirely', () => {
    expect(nodes_of('> - a\nb', 'Blockquote')).toEqual([{ from: 0, to: 5 }]);
    expect(nodes_of('> - a\nb', 'Paragraph')).toEqual([
      { from: 4, to: 5 },
      { from: 6, to: 7 },
    ]);
  });

  it('`> [!NOTE] t\\nx` — callouts share the exit (they are Blockquote nodes)', () => {
    expect(nodes_of('> [!NOTE] t\nx', 'Blockquote')).toEqual([{ from: 0, to: 11 }]);
    expect(nodes_of('> [!NOTE] t\nx', 'Paragraph')).toEqual([
      { from: 2, to: 11 },
      { from: 12, to: 13 },
    ]);
  });

  it('fully marked continuation still continues: `> a\\n> b` is one quote', () => {
    expect(nodes_of('> a\n> b', 'Blockquote')).toEqual([{ from: 0, to: 7 }]);
  });

  it('blank-line separation is unchanged: `> a\\n\\nb`', () => {
    expect(nodes_of('> a\n\nb', 'Blockquote')).toEqual([{ from: 0, to: 3 }]);
    expect(nodes_of('> a\n\nb', 'Paragraph')).toEqual([
      { from: 2, to: 3 },
      { from: 5, to: 6 },
    ]);
  });

  it('list laziness is untouched: `- a\\nb` continues the item', () => {
    expect(nodes_of('- a\nb', 'Paragraph')).toEqual([{ from: 2, to: 5 }]);
  });

  it('quoted-list laziness is untouched: `> - a\\n> b` continues the quoted item', () => {
    expect(nodes_of('> - a\n> b', 'Paragraph')).toEqual([{ from: 4, to: 9 }]);
    expect(nodes_of('> - a\n> b', 'Blockquote')).toEqual([{ from: 0, to: 9 }]);
  });
});

describe('BQ-E-12: absorption carve-outs', () => {
  it('an open quote-nested `$$` leaf keeps its lazy form (MATH-E-13)', () => {
    expect(nodes_of('> $$\nx\n$$', 'BlockMath')).toEqual([{ from: 2, to: 9 }]);
    expect(nodes_of('> $$\nx\n$$', 'Blockquote')).toEqual([{ from: 0, to: 9 }]);
  });

  it('an indented line under a quote paragraph still absorbs', () => {
    expect(nodes_of('> a\n    b', 'Blockquote')).toEqual([{ from: 0, to: 9 }]);
    expect(nodes_of('> a\n    b', 'Paragraph')).toEqual([{ from: 2, to: 9 }]);
  });
});
