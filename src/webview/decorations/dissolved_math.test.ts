import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { math_extension } from '../grammar/math.js';
import { closed_math_fence_regions } from './dissolved_math.js';
import { escape_handlers } from './escapes.js';
import { build_inline_decorations, build_registry } from './inline_decorations.js';

function make_state(doc: string, anchor: number = 0): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM, math_extension] })],
    selection: { anchor },
  });
}

describe('closed_math_fence_regions', () => {
  it('pairs an opener with its close across a blank line', () => {
    const doc = '$$\n\\begin{align}\n  &a = b\\\\\n\n\\end{align}\n$$\n';
    const state = make_state(doc);
    expect(closed_math_fence_regions(state)).toEqual([
      { from: 0, to: doc.length - 1 },
    ]);
  });

  it('yields no region for an unclosed opener (MATH-E-6 preserved)', () => {
    const state = make_state('$$\na = b\n\n# heading\n');
    expect(closed_math_fence_regions(state)).toEqual([]);
  });

  it('does not open a region on a self-contained $$x$$ line', () => {
    const state = make_state('$$x$$\nprose *em* here\n');
    expect(closed_math_fence_regions(state)).toEqual([]);
  });

  it('a self-contained $$x$$ line is a block of its own and never closes a dissolved opener', () => {
    const state = make_state('$$\na\n\n$$x$$\n');
    expect(closed_math_fence_regions(state)).toEqual([]);
  });

  it('MATH-E-6: a stray opener does not pair with the opener of a later real block', () => {
    const doc = '$$\na = b\n\n# Heading **bold**\n\n$$\nc = d\n$$\n';
    expect(closed_math_fence_regions(make_state(doc))).toEqual([]);
  });

  it('MATH-E-6: a stray opener above two real blocks yields no region and no cascade', () => {
    const doc = '$$\nstray\n\ntext\n\n$$\na\n$$\n\nmore **x**\n\n$$\nb\n$$\n';
    expect(closed_math_fence_regions(make_state(doc))).toEqual([]);
  });

  it('ignores $$ lines inside a fenced code block (MATH-E-7)', () => {
    const state = make_state('```\n$$\na\n$$\n```\n');
    expect(closed_math_fence_regions(state)).toEqual([]);
  });

  it('pairs multiple dissolved blocks into separate regions', () => {
    const doc = '$$\na\n\n$$\n\ntext\n\n$$\nb\n\n$$\n';
    const second = doc.indexOf('$$', 10);
    expect(closed_math_fence_regions(make_state(doc))).toEqual([
      { from: 0, to: doc.indexOf('$$', 1) + 2 },
      { from: second, to: doc.indexOf('$$', second + 2) + 2 },
    ]);
  });
});

describe('inline decoration suppression inside a dissolved block (MATH-E-14)', () => {
  const registry = build_registry(escape_handlers);

  function hidden_marker_count(state: EditorState): number {
    const set = build_inline_decorations(
      state,
      [{ from: 0, to: state.doc.length }],
      registry,
    );
    let count = 0;
    set.between(0, state.doc.length, () => {
      count++;
    });
    return count;
  }

  it('keeps a trailing \\\\ fully visible in the transient blank-line state', () => {
    // Enter pressed after `\\` inside an autoclosed block: blank caret line
    // dissolves the BlockMath; the Escape node must not be marker-hidden.
    const doc = '$$\n\\begin{align}\n  &a = b\\\\\n\n\\end{align}\n$$\n';
    const state = make_state(doc, doc.indexOf('\n\n') + 1);
    expect(hidden_marker_count(state)).toBe(0);
  });

  it('keeps a \\\\ below the caret visible when Enter lands mid-block', () => {
    const body = '  &a = b\\\\\n\n  &c = d\\\\\n\\end{align}\n';
    // Control: the same lines outside a fence pair do produce Escape hiding.
    expect(hidden_marker_count(make_state(body))).toBeGreaterThan(0);
    const doc = `$$\n${body}$$\n`;
    const state = make_state(doc, doc.indexOf('\n\n') + 1);
    expect(hidden_marker_count(state)).toBe(0);
  });

  it('still hides escapes in ordinary prose outside any fence pair', () => {
    const doc = 'pay \\$5 now\nzz\n';
    const state = make_state(doc, doc.length - 1);
    expect(hidden_marker_count(state)).toBe(1);
  });

  it('still hides escapes below an unclosed opener', () => {
    const doc = '$$\nno close here\n\npay \\$5 now\n';
    const state = make_state(doc, 0);
    expect(hidden_marker_count(state)).toBe(1);
  });

  it('still hides escapes between an unclosed opener and a later real block', () => {
    const doc = '$$\nno close here\n\npay \\$5 now\n\n$$\nc = d\n$$\n';
    const state = make_state(doc, 0);
    expect(hidden_marker_count(state)).toBe(1);
  });
});
