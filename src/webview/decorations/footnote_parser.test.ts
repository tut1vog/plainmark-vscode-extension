import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { Footnote } from './footnote_parser.js';

function dump(doc: string): string[] {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM, Footnote] })],
  });
  const out: string[] = [];
  syntaxTree(state).iterate({
    enter(n) {
      out.push(`${n.name}[${n.from},${n.to}]`);
    },
  });
  return out;
}

function names_of(doc: string): string[] {
  return dump(doc).map((s) => s.replace(/\[\d+,\d+\]$/, ''));
}

function count_of(doc: string, name: string): number {
  return names_of(doc).filter((n) => n === name).length;
}

describe('footnote parser FN-R-1 FN-R-6', () => {
  it('FN-R-1: parses an inline reference', () => {
    const tree = dump('See [^1] note.');
    expect(tree.some((s) => s.startsWith('FootnoteReference['))).toBe(true);
    // No dangling LinkMark pair from the failed Link parse.
    expect(tree.some((s) => s.startsWith('LinkMark['))).toBe(false);
  });

  it('FN-R-6: parses a block definition', () => {
    const tree = dump('[^1]: definition body');
    expect(tree.some((s) => s.startsWith('FootnoteDefinition['))).toBe(true);
  });

  it('FN-R-6: definition beats LinkReference precedence', () => {
    // Without `before: "LinkReference"`, the second line parses as LinkReference.
    const tree = dump('[link]: https://example.com\n[^fn]: footnote body');
    expect(tree.some((s) => s.startsWith('FootnoteDefinition['))).toBe(true);
    expect(tree.some((s) => s.startsWith('LinkReference['))).toBe(true);
    // The footnote definition must not be parsed as a LinkReference.
    const link_refs = tree.filter((s) => s.startsWith('LinkReference['));
    expect(link_refs.length).toBe(1);
  });

  it('parses multiple references to the same definition', () => {
    expect(count_of('text [^1] and [^1] again', 'FootnoteReference')).toBe(2);
  });

  it('FN-E-6: definition before reference still parses both', () => {
    const tree = dump('[^1]: defined here\n\nuse [^1] here');
    expect(tree.some((s) => s.startsWith('FootnoteDefinition['))).toBe(true);
    expect(tree.some((s) => s.startsWith('FootnoteReference['))).toBe(true);
  });

  it('FN-R-4: emits FootnoteReference for an undefined ref (resolution is render-time)', () => {
    expect(count_of('no def for [^missing] ref', 'FootnoteReference')).toBe(1);
  });

  it('FN-E-1: duplicate definitions both parse as FootnoteDefinition', () => {
    expect(count_of('[^1]: first\n\n[^1]: second', 'FootnoteDefinition')).toBe(2);
  });

  it('FN-E-2: stacked definitions on adjacent lines all parse (no blank lines between)', () => {
    // Regression: prior implementation used `nextLine: true` which abandons
    // the leaf without calling `finish` — only the last consecutive def emitted.
    const doc = '[^a]: one\n[^b]: two\n[^c]: three\n[^d]: four';
    expect(count_of(doc, 'FootnoteDefinition')).toBe(4);
  });

  it('definition interrupts a preceding paragraph (endLeaf)', () => {
    const doc = 'A normal paragraph line.\n[^a]: definition';
    expect(count_of(doc, 'FootnoteDefinition')).toBe(1);
    expect(count_of(doc, 'Paragraph')).toBe(1);
  });

  it('numeric and string labels both parse', () => {
    const tree = dump('[^1] and [^foo] and [^bar-2]');
    expect(count_of('[^1] and [^foo] and [^bar-2]', 'FootnoteReference')).toBe(3);
    void tree;
  });

  it('FN-E-5: reference inside a code span is suppressed', () => {
    expect(count_of('code `[^1]` here', 'FootnoteReference')).toBe(0);
  });

  it('FN-E-5: reference inside a fenced code block is suppressed', () => {
    expect(count_of('```\n[^1]\n```\n', 'FootnoteReference')).toBe(0);
  });

  it('does not match empty label `[^]`', () => {
    expect(count_of('empty [^] label', 'FootnoteReference')).toBe(0);
  });

  it('FN-E-4: does not match label containing whitespace `[^foo bar]`', () => {
    expect(count_of('[^foo bar]', 'FootnoteReference')).toBe(0);
  });

  it('reference emits FootnoteMark + FootnoteLabel + FootnoteMark children', () => {
    const tree = dump('x [^abc] y');
    const ref = tree.find((s) => s.startsWith('FootnoteReference['));
    expect(ref).toBeDefined();
    expect(tree.some((s) => s.startsWith('FootnoteMark['))).toBe(true);
    expect(tree.some((s) => s.startsWith('FootnoteLabel['))).toBe(true);
  });

  it('definition body inline-parses (emphasis is recognized)', () => {
    const tree = dump('[^1]: *italic* body');
    expect(tree.some((s) => s.startsWith('Emphasis['))).toBe(true);
  });
});
