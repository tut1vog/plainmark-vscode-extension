import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { compact_paragraph_seams_spec, expand_paragraph_seams_spec } from './paragraph_seams.js';

function run(spec_fn: typeof expand_paragraph_seams_spec, doc: string): string | null {
  const state = EditorState.create({ doc, extensions: [markdown({ extensions: [GFM] })] });
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

  it('touches only document-level paragraphs, not list or quote interiors', () => {
    expect(expand('- a\n  b\n')).toBeNull();
    expect(expand('- a\nlazy\n')).toBeNull();
    expect(expand('> a\n> b\n')).toBeNull();
    expect(expand('> a\nlazy\n')).toBeNull();
  });

  it('separates paragraphs and ATX headings that sit directly adjacent', () => {
    expect(expand('# h\npara\n')).toBe('# h\n\npara\n');
    expect(expand('para\n# h\n')).toBe('para\n\n# h\n');
    expect(expand('# a\n## b\n')).toBe('# a\n\n## b\n');
    expect(expand('# t\none\ntwo\n## s\nthree\n')).toBe('# t\n\none\n\ntwo\n\n## s\n\nthree\n');
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

  it('touches only paragraph and ATX-heading blank runs', () => {
    expect(compact('a\n\n- x\n')).toBeNull();
    expect(compact('a\n\n```\nx\n```\n')).toBeNull();
    expect(compact('> a\n>\n> b\n')).toBeNull();
    expect(compact('\n\na\n')).toBeNull();
    expect(compact('a\n\n')).toBeNull();
  });

  it('never merges a paragraph into a setext heading', () => {
    expect(compact('a\n\ntitle\n===\n')).toBeNull();
    expect(compact('# h\n\ntitle\n===\n')).toBeNull();
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
