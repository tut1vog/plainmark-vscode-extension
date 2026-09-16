import { markdown } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { markdown_grammar_extensions } from './markdown_config.js';

function top_level(doc: string): string[] {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ extensions: markdown_grammar_extensions })],
  });
  const tree = ensureSyntaxTree(state, doc.length, 5000)!;
  const names: string[] = [];
  for (let c = tree.topNode.firstChild; c; c = c.nextSibling) names.push(c.name);
  return names;
}

describe('ordered_list_interrupt LIST-E-7', () => {
  it('an ordered item numbered other than 1 starts a list directly below a paragraph line', () => {
    expect(top_level('d\n5. abc')).toEqual(['Paragraph', 'OrderedList']);
    expect(top_level('d\n5) abc')).toEqual(['Paragraph', 'OrderedList']);
    expect(top_level('d\n2019. was a year')).toEqual(['Paragraph', 'OrderedList']);
  });

  it('numbered 1 keeps interrupting as before', () => {
    expect(top_level('d\n1. abc')).toEqual(['Paragraph', 'OrderedList']);
  });

  it('an empty item, a marker without a space, and a 10-digit number do not interrupt', () => {
    expect(top_level('d\n5.')).toEqual(['Paragraph']);
    expect(top_level('d\n5. ')).toEqual(['Paragraph']);
    expect(top_level('d\n5.abc')).toEqual(['Paragraph']);
    expect(top_level('d\n1234567890. abc')).toEqual(['Paragraph']);
  });

  it('an indented marker line stays paragraph text', () => {
    expect(top_level('d\n    5. abc')).toEqual(['Paragraph']);
  });

  it('applies inside a quote and inside a list item', () => {
    const quoted = EditorState.create({
      doc: '> d\n> 5. abc',
      extensions: [markdown({ extensions: markdown_grammar_extensions })],
    });
    const tree = ensureSyntaxTree(quoted, 12, 5000)!;
    const quote = tree.topNode.firstChild!;
    const inner: string[] = [];
    for (let c = quote.firstChild; c; c = c.nextSibling) inner.push(c.name);
    expect(quote.name).toBe('Blockquote');
    expect(inner).toContain('OrderedList');

    const nested = EditorState.create({
      doc: '- d\n  5. abc',
      extensions: [markdown({ extensions: markdown_grammar_extensions })],
    });
    const item = ensureSyntaxTree(nested, 12, 5000)!.topNode.firstChild!.firstChild!;
    const children: string[] = [];
    for (let c = item.firstChild; c; c = c.nextSibling) children.push(c.name);
    expect(children).toEqual(['ListMark', 'Paragraph', 'OrderedList']);
  });
});
