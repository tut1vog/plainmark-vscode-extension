import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { locate_table_extraction } from './table.js';
import { find_differing_cell } from './table_undo_rebase.js';

function make_state(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdown({ extensions: [GFM] })] });
}

// Build (state, extraction) for the single table starting at doc offset 0.
function extract(doc: string): { state: EditorState; ext: NonNullable<ReturnType<typeof locate_table_extraction>> } {
  const state = make_state(doc);
  const ext = locate_table_extraction(state, 0);
  if (!ext) throw new Error(`no table at 0 for: ${JSON.stringify(doc)}`);
  return { state, ext };
}

function differ(pre_doc: string, post_doc: string) {
  const pre = extract(pre_doc);
  const post = extract(post_doc);
  return find_differing_cell(pre.state, pre.ext, post.state, post.ext);
}

describe('find_differing_cell — normal differing-cell detection', () => {
  it('returns the cell whose trimmed text changed between pre and post', () => {
    const pre = '| A | B |\n|---|---|\n| 1 | 2 |\n';
    const post = '| A | B |\n|---|---|\n| 1 | 9 |\n';
    expect(differ(pre, post)).toEqual({ row: 1, col: 1 });
  });

  it('detects a header cell change', () => {
    const pre = '| A | B |\n|---|---|\n| 1 | 2 |\n';
    const post = '| A | Z |\n|---|---|\n| 1 | 2 |\n';
    expect(differ(pre, post)).toEqual({ row: 0, col: 1 });
  });

  it('ignores whitespace-only differences (cell text is compared trimmed)', () => {
    const pre = '| A | B |\n|---|---|\n| 1 | 2 |\n';
    const post = '| A | B |\n|---|---|\n|  1  |   2 |\n';
    expect(differ(pre, post)).toBeNull();
  });

  it('returns null when pre and post are identical', () => {
    const doc = '| A | B |\n|---|---|\n| 1 | 2 |\n';
    expect(differ(doc, doc)).toBeNull();
  });
});

describe('find_differing_cell — removed-cells landing branch (undo shrank the table)', () => {
  it('reactivates the nearest surviving row, clamping a removed trailing row', () => {
    // pre has 2 body rows; post lost the last one. All surviving cells match,
    // so the diff loop finds no change — the pre-only cells (row 2) drive the
    // landing, clamped to the last surviving row (post row_count - 1 = 1).
    const pre = '| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n';
    const post = '| A | B |\n|---|---|\n| 1 | 2 |\n';
    expect(differ(pre, post)).toEqual({ row: 1, col: 0 });
  });

  it('reactivates the nearest surviving column, clamping a removed trailing column', () => {
    // pre has 3 columns; post lost the last one. Pre-only cells sit at col 2,
    // clamped to the last surviving column (post col_count - 1 = 1).
    const pre = '| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |\n';
    const post = '| A | B |\n|---|---|\n| 1 | 2 |\n';
    expect(differ(pre, post)).toEqual({ row: 0, col: 1 });
  });
});
