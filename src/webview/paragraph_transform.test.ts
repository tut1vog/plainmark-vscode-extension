import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import {
  classify_line,
  paragraph_transform_spec,
  type ParagraphStyle,
} from './paragraph_transform.js';

function apply(
  doc: string,
  anchor: number,
  head: number,
  style: ParagraphStyle,
): string | null {
  const state = EditorState.create({ doc, selection: EditorSelection.single(anchor, head) });
  const spec = paragraph_transform_spec(state, style);
  if (!spec) return null;
  return state.update(spec).state.doc.toString();
}

describe('classify_line', () => {
  it('recognizes headings, list kinds, quotes, and blanks', () => {
    expect(classify_line('## title')).toMatchObject({ kind: 'heading', heading_level: 2 });
    expect(classify_line('- item')).toMatchObject({ kind: 'bulleted' });
    expect(classify_line('3) item')).toMatchObject({ kind: 'numbered' });
    expect(classify_line('- [x] item')).toMatchObject({ kind: 'task' });
    expect(classify_line('2. [ ] item')).toMatchObject({ kind: 'task' });
    expect(classify_line('> quoted')).toMatchObject({ quote_len: 2, kind: 'none' });
    expect(classify_line('> - item')).toMatchObject({ quote_len: 2, kind: 'bulleted' });
    expect(classify_line('   ')).toMatchObject({ blank: true });
    expect(classify_line('>  ')).toMatchObject({ blank: true, quote_len: 2 });
  });

  it('keeps indent out of the marker span', () => {
    const shape = classify_line('  - item');
    expect(shape.marker_start).toBe(2);
    expect(shape.marker_end).toBe(4);
  });
});

describe('paragraph_transform_spec — single line', () => {
  it('caret on a plain line sets the prefix', () => {
    expect(apply('hello', 2, 2, 'heading_2')).toBe('## hello');
    expect(apply('hello', 2, 2, 'bulleted_list')).toBe('- hello');
    expect(apply('hello', 2, 2, 'numbered_list')).toBe('1. hello');
    expect(apply('hello', 2, 2, 'task_list')).toBe('- [ ] hello');
    expect(apply('hello', 2, 2, 'blockquote')).toBe('> hello');
  });

  it('re-applying the active type reverts to plain paragraph', () => {
    expect(apply('## hello', 4, 4, 'heading_2')).toBe('hello');
    expect(apply('- hello', 3, 3, 'bulleted_list')).toBe('hello');
    expect(apply('2. hello', 4, 4, 'numbered_list')).toBe('hello');
    expect(apply('- [ ] hello', 8, 8, 'task_list')).toBe('hello');
    expect(apply('> hello', 3, 3, 'blockquote')).toBe('hello');
  });

  it('swaps any existing prefix for the target', () => {
    expect(apply('## hello', 4, 4, 'heading_3')).toBe('### hello');
    expect(apply('## hello', 4, 4, 'bulleted_list')).toBe('- hello');
    expect(apply('- hello', 3, 3, 'task_list')).toBe('- [ ] hello');
    expect(apply('- [x] hello', 8, 8, 'bulleted_list')).toBe('- hello');
    expect(apply('1. hello', 4, 4, 'heading_1')).toBe('# hello');
  });

  it('marker ops preserve a quote prefix; blockquote removal strips the whole run', () => {
    expect(apply('> - item', 5, 5, 'heading_1')).toBe('> # item');
    expect(apply('> hello', 3, 3, 'heading_2')).toBe('> ## hello');
    expect(apply('> > hello', 6, 6, 'blockquote')).toBe('hello');
  });

  it('list-kind swaps preserve indentation', () => {
    expect(apply('  - item', 4, 4, 'numbered_list')).toBe('  1. item');
    expect(apply('  2. item', 4, 4, 'bulleted_list')).toBe('  - item');
  });

  it('blank-only selection is a no-op', () => {
    expect(apply('   ', 1, 1, 'heading_1')).toBeNull();
    expect(apply('', 0, 0, 'bulleted_list')).toBeNull();
  });
});

describe('paragraph_transform_spec — multi-line', () => {
  const DOC = 'one\ntwo\n\nthree';

  it('sets the prefix on every non-blank touched line', () => {
    expect(apply(DOC, 0, DOC.length, 'bulleted_list')).toBe('- one\n- two\n\n- three');
    expect(apply(DOC, 0, DOC.length, 'blockquote')).toBe('> one\n> two\n\n> three');
  });

  it('numbers sequentially across touched lines, skipping blanks', () => {
    expect(apply(DOC, 0, DOC.length, 'numbered_list')).toBe('1. one\n2. two\n\n3. three');
  });

  it('mixed lines unify onto the target instead of toggling off', () => {
    expect(apply('# one\ntwo', 0, 9, 'heading_1')).toBe('# one\n# two');
  });

  it('all-active lines toggle off together', () => {
    expect(apply('- one\n- two', 0, 11, 'bulleted_list')).toBe('one\ntwo');
    expect(apply('> one\n> two', 0, 11, 'blockquote')).toBe('one\ntwo');
  });

  it('partially quoted selection quotes only the unquoted lines', () => {
    expect(apply('> one\ntwo', 0, 9, 'blockquote')).toBe('> one\n> two');
  });

  it('a selection ending exactly at a line start does not touch that line', () => {
    expect(apply('one\ntwo\n', 0, 4, 'heading_1')).toBe('# one\ntwo\n');
  });
});
