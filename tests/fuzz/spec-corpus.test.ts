// Spec-corpus crash test (T28.2). Two invariants per entry:
//   1. `parser.parse(markdown)` does not throw.
//   2. Reparsing the same source with `TreeFragment`s derived from the first
//      parse produces a tree structurally identical to a fresh full parse —
//      lezer-markdown's intra-parser differential. Synthetic edit: append one
//      `x` character to the source, then incremental-reparse with the fragment
//      chain and compare against a fresh full parse of the edited text.
//
// Wires the corpora from `load-corpora.ts` (CommonMark 0.31.2: 652 entries,
// cmark-gfm extensions.txt: ~30 entries).

import { describe, expect, it } from 'vitest';
import { TreeFragment } from '@lezer/common';
import { compareTree } from './compare-tree.js';
import { load_commonmark, load_gfm_extensions } from './load-corpora.js';
import { gfm_parser } from './parsers.js';

const commonmark = load_commonmark();
const gfm_extensions = load_gfm_extensions();

describe('spec corpus: lezer-markdown parses without throwing', () => {
  it(`CommonMark 0.31.2: ${commonmark.length} entries`, () => {
    expect(commonmark.length).toBeGreaterThan(600);
    for (const entry of commonmark) {
      try {
        gfm_parser.parse(entry.markdown);
      } catch (err) {
        throw new Error(
          `CommonMark example ${entry.example} (${entry.section}) threw: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  });

  it(`cmark-gfm extensions.txt: ${gfm_extensions.length} entries`, () => {
    expect(gfm_extensions.length).toBeGreaterThan(20);
    for (const entry of gfm_extensions) {
      try {
        gfm_parser.parse(entry.markdown);
      } catch (err) {
        throw new Error(
          `GFM extension example ${entry.example} (${entry.section}) threw: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  });
});

describe('spec corpus: incremental reparse equals full reparse (compareTree)', () => {
  // The edit is a single-character append at the end of the document.
  // Synthetic but representative: it exercises the common "typed a character"
  // path through `TreeFragment.applyChanges`, which is what users do most
  // often in practice. Failures here indicate the incremental parser is
  // returning a tree that diverges from the full parse — a bug in
  // lezer-markdown's fragment-reuse logic for that input shape.
  function check(corpus: { markdown: string; section: string; example: number }[]): void {
    for (const entry of corpus) {
      const tree_a = gfm_parser.parse(entry.markdown);
      const fragments_a = TreeFragment.addTree(tree_a);
      const edited = entry.markdown + 'x';
      const changed = [
        {
          fromA: entry.markdown.length,
          toA: entry.markdown.length,
          fromB: entry.markdown.length,
          toB: entry.markdown.length + 1,
        },
      ];
      const fragments_b = TreeFragment.applyChanges(fragments_a, changed, 2);
      const tree_incremental = gfm_parser.parse(edited, fragments_b);
      const tree_full = gfm_parser.parse(edited);
      try {
        compareTree(tree_incremental, tree_full);
      } catch (err) {
        throw new Error(
          `${entry.section} example ${entry.example}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  it(`CommonMark 0.31.2: ${commonmark.length} entries`, () => {
    check(commonmark);
  });

  it(`cmark-gfm extensions.txt: ${gfm_extensions.length} entries`, () => {
    check(gfm_extensions);
  });
});
