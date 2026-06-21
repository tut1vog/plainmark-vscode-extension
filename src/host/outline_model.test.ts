import { describe, expect, it } from 'vitest';
import {
  build_heading_tree,
  clean_label,
  find_enclosing_heading,
  type HeadingNode,
  type RawSymbol,
} from './outline_model.js';

function node(label: string, line: number, children: HeadingNode[] = []): HeadingNode {
  return { label, line, character: 0, children };
}

describe('clean_label OUT-R-4', () => {
  it('strips leading # markers and trailing space', () => {
    expect(clean_label('# My Heading')).toBe('My Heading');
    expect(clean_label('###  Spaced')).toBe('Spaced');
    expect(clean_label('###### h6')).toBe('h6');
  });

  it('leaves marker-free names unchanged', () => {
    expect(clean_label('My Heading')).toBe('My Heading');
  });

  it('only strips a leading run of up to six #', () => {
    expect(clean_label('# a # b')).toBe('a # b');
  });
});

describe('build_heading_tree OUT-R-3 OUT-R-4', () => {
  it('preserves the symbol nesting and order', () => {
    const symbols: RawSymbol[] = [
      {
        name: '# A',
        range: { start: { line: 0, character: 0 } },
        children: [
          { name: '## B', range: { start: { line: 1, character: 0 } }, children: [] },
          {
            name: '## C',
            range: { start: { line: 2, character: 0 } },
            children: [
              { name: '### D', range: { start: { line: 3, character: 0 } }, children: [] },
            ],
          },
        ],
      },
    ];
    const tree = build_heading_tree(symbols);
    expect(tree).toHaveLength(1);
    expect(tree[0].label).toBe('A');
    expect(tree[0].children.map((c) => c.label)).toEqual(['B', 'C']);
    expect(tree[0].children[1].children.map((c) => c.label)).toEqual(['D']);
  });

  it('carries the heading start line and character', () => {
    const symbols: RawSymbol[] = [
      { name: '# A', range: { start: { line: 5, character: 2 } }, children: [] },
    ];
    const [node] = build_heading_tree(symbols);
    expect(node.line).toBe(5);
    expect(node.character).toBe(2);
  });

  // line/character on the wire keeps CRLF host docs and the LF webview doc in agreement.
  it('carries CRLF-document symbol positions unchanged', () => {
    const text = '# A\r\nbody one\r\nbody two\r\n## B\r\nafter\r\n';
    const lines = text.split('\r\n');
    const b_line = lines.indexOf('## B');
    const symbols: RawSymbol[] = [
      {
        name: '# A',
        range: { start: { line: 0, character: 0 } },
        children: [
          { name: '## B', range: { start: { line: b_line, character: 0 } }, children: [] },
        ],
      },
    ];
    const [root] = build_heading_tree(symbols);
    expect(root.children[0].line).toBe(3);
    expect(root.children[0].character).toBe(0);
  });

  it('returns an empty tree for no symbols', () => {
    expect(build_heading_tree([])).toEqual([]);
  });
});

describe('find_enclosing_heading OUT-I-4', () => {
  // # A(0) / ## B(2) / ## C(5) { ### D(7) }
  const roots: HeadingNode[] = [
    node('A', 0, [node('B', 2), node('C', 5, [node('D', 7)])]),
  ];

  it('returns the last heading at or before the caret line', () => {
    expect(find_enclosing_heading(roots, 0)?.label).toBe('A');
    expect(find_enclosing_heading(roots, 1)?.label).toBe('A');
    expect(find_enclosing_heading(roots, 2)?.label).toBe('B');
    expect(find_enclosing_heading(roots, 4)?.label).toBe('B');
    expect(find_enclosing_heading(roots, 5)?.label).toBe('C');
    expect(find_enclosing_heading(roots, 6)?.label).toBe('C');
    expect(find_enclosing_heading(roots, 7)?.label).toBe('D');
    expect(find_enclosing_heading(roots, 999)?.label).toBe('D');
  });

  it('returns null when the caret precedes the first heading', () => {
    const offset_roots: HeadingNode[] = [node('First', 3)];
    expect(find_enclosing_heading(offset_roots, 1)).toBeNull();
  });

  it('returns null for an empty tree', () => {
    expect(find_enclosing_heading([], 5)).toBeNull();
  });
});
