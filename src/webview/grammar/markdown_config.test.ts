import { markdown } from '@codemirror/lang-markdown';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { markdown_grammar_extensions } from './markdown_config.js';

function parse(doc: string): { name: string; from: number; to: number }[] {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ extensions: markdown_grammar_extensions })],
  });
  const tree = ensureSyntaxTree(state, state.doc.length, 1000) ?? syntaxTree(state);
  const nodes: { name: string; from: number; to: number }[] = [];
  tree.iterate({
    enter(node) {
      nodes.push({ name: node.name, from: node.from, to: node.to });
    },
  });
  return nodes;
}

function names_of(doc: string): string[] {
  return parse(doc).map((n) => n.name);
}

function nodes_of(doc: string, name: string): { from: number; to: number }[] {
  return parse(doc)
    .filter((n) => n.name === name)
    .map(({ from, to }) => ({ from, to }));
}

describe('the indented-code parser is an inert shield (CBLK-E-1)', () => {
  it('a classic indented region parses as one CodeBlock node', () => {
    expect(nodes_of('para\n\n    code\n    more\n', 'CodeBlock')).toEqual([{ from: 10, to: 23 }]);
  });

  it('a tab-indented line behind a blank is claimed the same way', () => {
    expect(nodes_of('para\n\n\tcode\n', 'CodeBlock')).toEqual([{ from: 7, to: 11 }]);
  });
});

describe('no construct activates at ≥4-indent behind a blank', () => {
  it('`    - x` stays inert — no list', () => {
    expect(names_of('a\n\n    - x\n')).not.toContain('BulletList');
    expect(nodes_of('a\n\n    - x\n', 'CodeBlock')).toEqual([{ from: 7, to: 10 }]);
  });

  it('`    1. x` stays inert — no ordered list', () => {
    expect(names_of('a\n\n    1. x\n')).not.toContain('OrderedList');
  });

  it('`    > q` stays inert — no blockquote', () => {
    expect(names_of('a\n\n    > q\n')).not.toContain('Blockquote');
  });

  it('`    # h` stays inert — no heading', () => {
    expect(names_of('a\n\n    # h\n')).not.toContain('ATXHeading1');
  });

  it('a 4-indent ``` line stays inert — no fence opens', () => {
    expect(names_of('a\n\n    ```js\nx\n    ```\n')).not.toContain('FencedCode');
  });

  it('`    ---` stays inert — no horizontal rule', () => {
    expect(names_of('a\n\n    ---\n')).not.toContain('HorizontalRule');
  });

  it('markers at 0–3 spaces still activate (the CommonMark bound)', () => {
    expect(names_of(' - x\n')).toContain('BulletList');
    expect(names_of('  # h\n')).toContain('ATXHeading1');
    expect(names_of(' > q\n')).toContain('Blockquote');
  });
});

describe('mid-paragraph absorption is unchanged', () => {
  it('a ≥4-indent line under an open paragraph lazily continues it', () => {
    expect(nodes_of('a\n    b\n', 'Paragraph')).toEqual([{ from: 0, to: 7 }]);
  });

  it('an indented marker cannot interrupt an open paragraph either', () => {
    expect(nodes_of('a\n    - x\n', 'Paragraph')).toEqual([{ from: 0, to: 9 }]);
    expect(names_of('a\n    - x\n')).not.toContain('BulletList');
  });

  it('an indented line under a quote paragraph still absorbs (BQ-E-12)', () => {
    expect(nodes_of('> a\n    b', 'Blockquote')).toEqual([{ from: 0, to: 9 }]);
    expect(nodes_of('> a\n    b', 'Paragraph')).toEqual([{ from: 2, to: 9 }]);
  });
});

describe('the list papercut is gone (CBLK-E-1)', () => {
  it('a 4-space continuation line inside a list stays item prose', () => {
    expect(names_of('- a\n\n    b\n')).not.toContain('CodeBlock');
    expect(nodes_of('- a\n\n    b\n', 'Paragraph')).toEqual([
      { from: 2, to: 3 },
      { from: 9, to: 10 },
    ]);
    expect(nodes_of('- a\n\n    b\n', 'ListItem')).toEqual([{ from: 0, to: 10 }]);
  });
});
