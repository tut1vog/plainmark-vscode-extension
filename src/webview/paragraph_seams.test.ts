import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { Footnote } from './decorations/footnote_parser.js';
import { frontmatter_extension } from './grammar/frontmatter.js';
import { math_extension } from './grammar/math.js';
import { quote_exit_extension } from './grammar/quote_exit.js';
import { compact_paragraph_seams_spec, expand_paragraph_seams_spec } from './paragraph_seams.js';

function run(spec_fn: typeof expand_paragraph_seams_spec, doc: string): string | null {
  const state = EditorState.create({
    doc,
    extensions: [
      // Mirrors the editor's grammar list (editor_extensions.ts) — a reduced
      // grammar reclassifies seams (a `$$` block would split as a paragraph).
      markdown({
        extensions: [GFM, math_extension, Footnote, frontmatter_extension, quote_exit_extension],
      }),
    ],
  });
  const spec = spec_fn(state);
  if (!spec) return null;
  return state.update(spec).state.doc.toString();
}

const expand = (doc: string) => run(expand_paragraph_seams_spec, doc);
const compact = (doc: string) => run(compact_paragraph_seams_spec, doc);

describe('PARA-I-5 expand_paragraph_seams_spec', () => {
  it('inserts a blank line at each single-newline seam of a top-level paragraph', () => {
    expect(expand('a\nb\n')).toBe('a\n\nb\n');
    expect(expand('a\nb\nc\n')).toBe('a\n\nb\n\nc\n');
  });

  it('leaves already blank-separated paragraphs alone', () => {
    expect(expand('a\n\nb\n')).toBeNull();
  });

  it('preserves hard-break seams (trailing double space or backslash)', () => {
    expect(expand('a  \nb\n')).toBeNull();
    expect(expand('a\\\nb\n')).toBeNull();
    expect(expand('a  \nb\nc\n')).toBe('a  \nb\n\nc\n');
  });

  it('skips seams whose next line would re-parse as another block after a blank', () => {
    expect(expand('a\n    indented\n')).toBeNull();
    expect(expand('a\n\tindented\n')).toBeNull();
    expect(expand('a\n2. not-a-list\n')).toBeNull();
    expect(expand('a\n<custom>\n')).toBeNull();
    expect(expand('a\n| row |\n')).toBeNull();
  });

  it('never splits list interiors or lazy continuations inside containers', () => {
    expect(expand('- a\n  b\n')).toBeNull();
    expect(expand('- a\nlazy\n')).toBeNull();
    expect(expand('> - a\n> - b\n')).toBeNull();
    expect(expand('> - a\n> b\n')).toBeNull();
    expect(expand('- > a\n  > b\n')).toBeNull();
  });

  it('splits quote-interior paragraph seams with a quoted blank line', () => {
    expect(expand('> a\n> b\n')).toBe('> a\n>\n> b\n');
    expect(expand('> a\n> b\n> c\n')).toBe('> a\n>\n> b\n>\n> c\n');
    expect(expand('> > a\n> > b\n')).toBe('> > a\n> >\n> > b\n');
  });

  it('keeps the callout marker tight above its first body line', () => {
    expect(expand('> [!note] t\n> a\n> b\n')).toBe('> [!note] t\n> a\n>\n> b\n');
    expect(expand('> [!note]\n> body\n')).toBeNull();
  });

  it('applies the intra-paragraph guards to marker-stripped quote content', () => {
    expect(expand('> a  \n> b\n')).toBeNull();
    expect(expand('> a\n> 2. x\n')).toBeNull();
    expect(expand('> a\n> | x |\n')).toBeNull();
    expect(expand('> a\n> <custom>\n')).toBeNull();
    expect(expand('> a\n>     code\n')).toBeNull();
    expect(expand('> a\n> *\n')).toBeNull();
  });

  it('separates a nested quote from its parent-quote exit line', () => {
    expect(expand('> > a\n> b\n')).toBe('> > a\n>\n> b\n');
    expect(expand('> > > a\n> > b\n')).toBe('> > > a\n> >\n> > b\n');
  });

  it('never turns a lone `+`/`*` paragraph line into a list', () => {
    expect(expand('a\n+\n')).toBeNull();
    expect(expand('a\n*\n')).toBeNull();
  });

  it('classifies under the full editor grammar (math and footnotes intact)', () => {
    expect(expand('$$\nE = mc^2\n$$\nafter\n')).toBeNull();
    expect(expand('prose\n[^1]: def\n')).toBeNull();
  });

  it('inserts the conventional blank at a quote-exit seam', () => {
    expect(expand('> a\nb\n')).toBe('> a\n\nb\n');
    expect(expand('> a\n> b\nc\n')).toBe('> a\n>\n> b\n\nc\n');
    expect(expand('> [!note] t\nx\n')).toBe('> [!note] t\n\nx\n');
    expect(expand('> - a\nb\n')).toBe('> - a\n\nb\n');
    expect(expand('> a\n# h\n')).toBe('> a\n\n# h\n');
  });

  it('quote-exit insertion ignores the intra-paragraph guards', () => {
    // Trailing whitespace on the quote's last line is not hard-break
    // continuation, and the next line parses in a fresh block context behind
    // the blank — same as the house parse — so neither guard applies.
    expect(expand('> a  \nb\n')).toBe('> a  \n\nb\n');
    expect(expand('> a\n2. x\n')).toBe('> a\n\n2. x\n');
  });

  it('leaves non-exit quote seams alone', () => {
    // Already separated, doc-final, and the BQ-E-12 interior carve-out (the
    // marker-less indented line stays inside the node).
    expect(expand('> a\n\nb\n')).toBeNull();
    expect(expand('> a\n')).toBeNull();
    expect(expand('> a\n    b\n')).toBeNull();
  });

  it('quote entry seams stay untouched (deferred residual)', () => {
    expect(expand('para\n> q\n\nafter\n')).toBeNull();
  });

  it('separates paragraphs and ATX headings that sit directly adjacent', () => {
    expect(expand('# h\npara\n')).toBe('# h\n\npara\n');
    expect(expand('para\n# h\n')).toBe('para\n\n# h\n');
    expect(expand('# a\n## b\n')).toBe('# a\n\n## b\n');
    expect(expand('# t\none\ntwo\n## s\nthree\n')).toBe('# t\n\none\n\ntwo\n\n## s\n\nthree\n');
  });

  it('separates lists from adjacent paragraphs and headings', () => {
    expect(expand('para\n- x\n')).toBe('para\n\n- x\n');
    expect(expand('para\n1. x\n')).toBe('para\n\n1. x\n');
    expect(expand('# h\n- a\n- b\n')).toBe('# h\n\n- a\n- b\n');
    expect(expand('- a\n# h\n')).toBe('- a\n\n# h\n');
  });

  it('never splits a list interior or a lazy continuation', () => {
    expect(expand('- a\n- b\n')).toBeNull();
    expect(expand('1. a\n2. b\n')).toBeNull();
    expect(expand('- a\n\n- b\n')).toBeNull();
    expect(expand('- a\ncont\n')).toBeNull();
  });

  it('leaves setext headings and other constructs alone', () => {
    expect(expand('title\n===\n')).toBeNull();
    expect(expand('title\n===\npara\n')).toBeNull();
    expect(expand('```\na\nb\n```\n')).toBeNull();
    expect(expand('para\n```\nx\n```\n')).toBeNull();
  });

  it('is idempotent', () => {
    const once = expand('a\nb\nc\n');
    expect(once).toBe('a\n\nb\n\nc\n');
    expect(expand(once as string)).toBeNull();
    const headings = expand('# h\npara\n');
    expect(expand(headings as string)).toBeNull();
    const quotes = expand('> a\n> b\nc\n');
    expect(expand(quotes as string)).toBeNull();
    const nested = expand('> > a\n> b\n');
    expect(expand(nested as string)).toBeNull();
  });
});

describe('PARA-I-6 compact_paragraph_seams_spec', () => {
  it('removes blank runs between top-level paragraphs', () => {
    expect(compact('a\n\nb\n')).toBe('a\nb\n');
    expect(compact('a\n\n\n\nb\n')).toBe('a\nb\n');
  });

  it('joins wrapped lines of one paragraph with a single space', () => {
    expect(compact('line one\nline two\n')).toBe('line one line two\n');
    expect(compact('a\nb\n\nc\n')).toBe('a b\nc\n');
  });

  it('collapses seam whitespace when joining', () => {
    expect(compact('a \nb\n')).toBe('a b\n');
    expect(compact('a\n    b\n')).toBe('a b\n');
  });

  it('joins CJK-to-CJK seams without inserting a space', () => {
    expect(compact('第一段落\n第二行\n')).toBe('第一段落第二行\n');
    expect(compact('句点。\n続き\n')).toBe('句点。続き\n');
    expect(compact('abc\n中文\n')).toBe('abc 中文\n');
    expect(compact('中文\nabc\n')).toBe('中文 abc\n');
  });

  it('preserves hard-break newlines (trailing double space or backslash)', () => {
    expect(compact('a  \nb\n')).toBeNull();
    expect(compact('a\\\nb\n')).toBeNull();
  });

  it('never creates a setext heading by removing the guarding blank', () => {
    expect(compact('a\n\n===\n')).toBeNull();
    expect(compact('a\n\n---\n')).toBeNull();
  });

  it('removes blank runs on both sides of ATX headings', () => {
    expect(compact('a\n\n# h\n')).toBe('a\n# h\n');
    expect(compact('# h\n\na\n')).toBe('# h\na\n');
    expect(compact('# a\n\n## b\n')).toBe('# a\n## b\n');
    expect(compact('# t\n\none\nwrapped\n\n## s\n\ntwo\n')).toBe('# t\none wrapped\n## s\ntwo\n');
  });

  it('removes the blank before a list that can interrupt a paragraph', () => {
    expect(compact('para\n\n- x\n')).toBe('para\n- x\n');
    expect(compact('para\n\n1. a\n2. b\n')).toBe('para\n1. a\n2. b\n');
    expect(compact('# h\n\n- x\n')).toBe('# h\n- x\n');
  });

  it('keeps the blank before a list that cannot interrupt a paragraph', () => {
    expect(compact('para\n\n2. x\n')).toBeNull();
    expect(compact('para\n\n-\n')).toBeNull();
    // Behind a heading the interrupt rules do not apply.
    expect(compact('# h\n\n2. x\n')).toBe('# h\n2. x\n');
  });

  it('removes the blank between a list and a following heading, never a following paragraph', () => {
    expect(compact('- a\n\n# h\n')).toBe('- a\n# h\n');
    // A paragraph directly after a list lazily continues its last item —
    // that blank is semantic.
    expect(compact('- a\n- b\n\npara\n')).toBeNull();
  });

  it('touches only convertible-block blank runs, never construct or list interiors', () => {
    expect(compact('a\n\n```\nx\n```\n')).toBeNull();
    expect(compact('> a\n>\n> b\n')).toBeNull();
    expect(compact('- a\n\n- b\n')).toBeNull();
    expect(compact('\n\na\n')).toBeNull();
    expect(compact('a\n\n')).toBeNull();
  });

  it('never merges a paragraph into a setext heading', () => {
    expect(compact('a\n\ntitle\n===\n')).toBeNull();
    expect(compact('# h\n\ntitle\n===\n')).toBeNull();
  });

  it('round-trips an AI-shaped document with headings, prose, and lists', () => {
    const foreign = '# t\n\nintro\n\n- a\n- b\n\n## s\n\nmore\n';
    const house = '# t\nintro\n- a\n- b\n## s\nmore\n';
    expect(compact(foreign)).toBe(house);
    expect(run(expand_paragraph_seams_spec, house)).toBe(foreign);
  });

  it('treats every single-newline seam as a wrap — a rerun joins house-style paragraphs', () => {
    // The dialect ambiguity is resolved toward adoption: a single \n inside a
    // top-level CommonMark paragraph reads as a wrap, so running the command
    // on already-compacted (house-style) content joins those seams too. One
    // undo step restores; the command title states the join explicitly.
    const once = compact('one two\nthree\n\nfour\n');
    expect(once).toBe('one two three\nfour\n');
    expect(compact(once as string)).toBe('one two three four\n');
  });
});
