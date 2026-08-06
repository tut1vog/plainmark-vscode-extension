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

describe('fenced-only dialect: no CodeBlock is ever produced', () => {
  it('a classic indented code block parses as one lazily-continued paragraph', () => {
    expect(names_of('para\n\n    code\n    more\n')).not.toContain('CodeBlock');
    expect(nodes_of('para\n\n    code\n    more\n', 'Paragraph')).toEqual([
      { from: 0, to: 4 },
      { from: 10, to: 23 },
    ]);
  });

  it('a tab-indented line behind a blank parses as a paragraph', () => {
    expect(names_of('para\n\n\tcode\n')).not.toContain('CodeBlock');
    expect(nodes_of('para\n\n\tcode\n', 'Paragraph')).toEqual([
      { from: 0, to: 4 },
      { from: 7, to: 11 },
    ]);
  });
});

describe('construct activation at ≥4-indent behind a blank', () => {
  it('`    - x` becomes a live bullet list', () => {
    expect(nodes_of('a\n\n    - x\n', 'BulletList')).toEqual([{ from: 3, to: 10 }]);
  });

  it('`    > q` becomes a live blockquote', () => {
    expect(nodes_of('a\n\n    > q\n', 'Blockquote')).toEqual([{ from: 7, to: 10 }]);
  });

  it('`    # h` becomes a live heading', () => {
    expect(nodes_of('a\n\n    # h\n', 'ATXHeading1')).toEqual([{ from: 7, to: 10 }]);
  });

  it('a 4-indent ``` line opens a live fence', () => {
    expect(nodes_of('a\n\n    ```js\nx\n    ```\n', 'FencedCode')).toEqual([{ from: 7, to: 23 }]);
    expect(names_of('a\n\n    ```js\nx\n    ```\n')).not.toContain('CodeBlock');
  });

  it('`    ---` becomes a live horizontal rule', () => {
    expect(nodes_of('a\n\n    ---\n', 'HorizontalRule')).toEqual([{ from: 7, to: 10 }]);
  });
});

describe('mid-paragraph absorption is unchanged', () => {
  it('a ≥4-indent line under an open paragraph lazily continues it', () => {
    expect(nodes_of('a\n    b\n', 'Paragraph')).toEqual([{ from: 0, to: 7 }]);
  });

  it('an indented line under a quote paragraph still absorbs (BQ-E-12)', () => {
    expect(nodes_of('> a\n    b', 'Blockquote')).toEqual([{ from: 0, to: 9 }]);
    expect(nodes_of('> a\n    b', 'Paragraph')).toEqual([{ from: 2, to: 9 }]);
  });
});

describe('the list papercut is gone (CBLK-E-1)', () => {
  it('a 4-space continuation line inside a list stays prose', () => {
    expect(names_of('- a\n\n    b\n')).not.toContain('CodeBlock');
    expect(nodes_of('- a\n\n    b\n', 'Paragraph')).toEqual([
      { from: 2, to: 3 },
      { from: 9, to: 10 },
    ]);
    expect(nodes_of('- a\n\n    b\n', 'ListItem')).toEqual([{ from: 0, to: 10 }]);
  });
});
