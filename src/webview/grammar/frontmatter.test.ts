import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { frontmatter_extension } from './frontmatter.js';

function parse(doc: string): { name: string; from: number; to: number }[] {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM, frontmatter_extension] })],
  });
  const nodes: { name: string; from: number; to: number }[] = [];
  syntaxTree(state).iterate({
    enter(n) {
      nodes.push({ name: n.name, from: n.from, to: n.to });
    },
  });
  return nodes;
}

function nodes_of(doc: string, name: string): { from: number; to: number }[] {
  return parse(doc)
    .filter((n) => n.name === name)
    .map(({ from, to }) => ({ from, to }));
}

describe('frontmatter grammar — detection', () => {
  it('FM-R-1 FM-R-2: parses a minimal frontmatter at doc start', () => {
    const doc = '---\nfoo: bar\n---\n# Heading\n';
    const fm = nodes_of(doc, 'FrontMatter');
    expect(fm).toHaveLength(1);
    expect(fm[0].from).toBe(0);
    expect(fm[0].to).toBe(doc.indexOf('---\n# Heading') + 3);
  });

  it('FM-R-3: preempts HorizontalRule for the opening ---', () => {
    const doc = '---\nfoo: bar\n---\n';
    expect(nodes_of(doc, 'HorizontalRule')).toHaveLength(0);
  });

  it('FM-R-2: emits two FrontMatterMark nodes (open + close)', () => {
    const doc = '---\nfoo: bar\n---\n';
    expect(nodes_of(doc, 'FrontMatterMark')).toHaveLength(2);
  });

  it('FM-R-2: emits a FrontMatterContent node spanning the body', () => {
    const doc = '---\nfoo: bar\n---\n';
    const content = nodes_of(doc, 'FrontMatterContent');
    expect(content).toHaveLength(1);
    expect(doc.slice(content[0].from, content[0].to)).toBe('foo: bar');
  });

  it('FM-R-1 FM-E-3: does not parse frontmatter on line 2+ (mid-document --- ignored)', () => {
    const doc = '# Heading\n---\nfoo: bar\n---\n';
    expect(nodes_of(doc, 'FrontMatter')).toHaveLength(0);
  });

  it('FM-R-1 FM-E-3: does not parse frontmatter after a blank-line gap', () => {
    const doc = 'text\n\n---\nfoo: bar\n---\n';
    expect(nodes_of(doc, 'FrontMatter')).toHaveLength(0);
  });
});

describe('frontmatter grammar — closing markers', () => {
  it('FM-E-1: accepts --- as closer', () => {
    expect(nodes_of('---\nfoo: bar\n---\n', 'FrontMatter')).toHaveLength(1);
  });

  it('FM-E-1: accepts ... as closer (Pandoc/MkDocs)', () => {
    expect(nodes_of('---\nfoo: bar\n...\n', 'FrontMatter')).toHaveLength(1);
  });

  it('FM-E-1: accepts trailing whitespace on fence lines', () => {
    expect(nodes_of('---  \nfoo: bar\n---\t\n', 'FrontMatter')).toHaveLength(1);
  });
});

describe('frontmatter grammar — edge cases', () => {
  it('FM-E-2: accepts empty frontmatter (--- immediately followed by ---)', () => {
    const doc = '---\n---\n';
    const fm = nodes_of(doc, 'FrontMatter');
    expect(fm).toHaveLength(1);
    expect(nodes_of(doc, 'FrontMatterMark')).toHaveLength(2);
  });

  it('FM-E-4: does not crash on unclosed frontmatter', () => {
    const doc = '---\nfoo: bar\nno-closer-here\n';
    expect(() => parse(doc)).not.toThrow();
    expect(nodes_of(doc, 'FrontMatter')).toHaveLength(0);
  });

  it('FM-E-4: an unclosed opener leaves every line below it parsing normally', () => {
    const doc = '---\nfoo: bar\n# Heading\n- item\n\n| a | b |\n|---|---|\n| 1 | 2 |\n';
    const names = parse(doc).map((n) => n.name);
    expect(names).not.toContain('FrontMatter');
    expect(names).toContain('HorizontalRule');
    expect(names).toContain('Paragraph');
    expect(names).toContain('ATXHeading1');
    expect(names).toContain('BulletList');
    expect(names).toContain('Table');
  });

  it('FM-E-4: an unclosed opener with a blank line below still parses the rest', () => {
    const doc = '---\n\n**bold** text\n';
    const names = parse(doc).map((n) => n.name);
    expect(names).not.toContain('FrontMatter');
    expect(names).toContain('StrongEmphasis');
  });

  it('FM-E-1: a closer far below the opener is still found', () => {
    const body = Array.from({ length: 200 }, (_, i) => `k${i}: v${i}`).join('\n');
    const doc = `---\n${body}\n---\n# H\n`;
    expect(nodes_of(doc, 'FrontMatter')).toHaveLength(1);
    expect(parse(doc).map((n) => n.name)).toContain('ATXHeading1');
  });

  it('FM-E-4: does not parse a single --- on line 1 with no closer (no FrontMatter)', () => {
    const doc = '---\nfoo\n';
    expect(nodes_of(doc, 'FrontMatter')).toHaveLength(0);
  });

  it('FM-E-5: tolerates CRLF line endings reaching the parser', () => {
    // EditorState splits CRLF before parsing, so only the raw parser sees `\r`.
    const parser = markdown({ extensions: [GFM, frontmatter_extension] }).language.parser;
    const doc = '---\r\nfoo: bar\r\n---\r\n# H\r\n';
    const tree = parser.parse(doc);
    const fm: { from: number; to: number }[] = [];
    tree.iterate({
      enter(n) {
        if (n.name === 'FrontMatter') fm.push({ from: n.from, to: n.to });
      },
    });
    expect(fm).toEqual([{ from: 0, to: doc.indexOf('\n# H') }]);
  });
});
