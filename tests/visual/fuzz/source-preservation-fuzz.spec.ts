// Source-preservation fuzz (T28.3).
//
// Drives the full production editor (`editor_extensions`) against 500
// randomly generated documents × 20 random edits per document, then asserts
// that the spatial invariant holds for every edit: bytes outside the
// smallest top-level block containing the edit range are byte-identical
// before and after the dispatch. Tables are skipped as edit targets (the
// table widget's `docs/spec/tables.md` carve-out is exhaustively covered
// by `tests/visual/widgets/table.spec.ts`).
//
// Determinism: every random choice is driven by a single seed; failures
// print the seed + doc index + edit index so the offending sequence can be
// reproduced verbatim by re-running with the same seed.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';
import { editor_extensions } from '../../../src/webview/editor_extensions.js';
import { gen_markdown } from '../../fuzz/gen-markdown.js';
import { mulberry32, range, type Rng } from '../../fuzz/rng.js';
import { ensure_mathjax } from '../mathjax-ready.js';
import { allow_console } from '../console-sentinel.js';

const SEED = 0xa11ce_5eed;
const DOC_COUNT = 500;
const EDITS_PER_DOC = 20;

interface BlockRange {
  from: number;
  to: number;
  name: string;
}

function collect_top_blocks(view: EditorView): BlockRange[] {
  const tree = syntaxTree(view.state);
  const result: BlockRange[] = [];
  const top = tree.topNode;
  let child: SyntaxNode | null = top.firstChild;
  while (child) {
    result.push({ from: child.from, to: child.to, name: child.name });
    child = child.nextSibling;
  }
  return result;
}

function set_doc(view: EditorView, text: string): void {
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
}

function pick_edit_target(rng: Rng, blocks: BlockRange[]): BlockRange | null {
  const eligible = blocks.filter((b) => b.name !== 'Table' && b.to > b.from);
  if (eligible.length === 0) return null;
  return eligible[Math.floor(rng() * eligible.length)];
}

function gen_insert(rng: Rng): string {
  const choices = ['x', 'foo', '\n', ' ', 'abc', '', '**b**'];
  return choices[Math.floor(rng() * choices.length)];
}

describe('INV-SP-1 INV-SP-2: source-preservation fuzz: edits leave bytes outside the edited block stable', () => {
  let container: HTMLElement;
  let view: EditorView;

  beforeAll(async () => {
    await ensure_mathjax();
    container = document.createElement('div');
    document.body.appendChild(container);
    view = new EditorView({
      state: EditorState.create({ doc: '', extensions: [...editor_extensions] }),
      parent: container,
    });
  }, 60000);

  afterAll(() => {
    view?.destroy();
    container?.remove();
  });

  it(`${DOC_COUNT} docs × ${EDITS_PER_DOC} edits — seed=0x${SEED.toString(16)}`, () => {
    // The math widgets call `tex2chtmlPromise`; the generator emits random
    // tokens that MathJax sometimes rejects with a thrown error rather than
    // an in-line `mjx-merror`. Those rejections are orthogonal to source
    // preservation — let the sentinel ignore them for this test only.
    allow_console(/math.*typeset failed/);
    allow_console(/mermaid render failed/);
    allow_console(/mermaid bundle load failed/);

    const rng = mulberry32(SEED);

    for (let d = 0; d < DOC_COUNT; d++) {
      const doc_seed = ((rng() * 0xffffffff) >>> 0) || 1;
      const initial = gen_markdown({ seed: doc_seed });
      set_doc(view, initial);

      for (let e = 0; e < EDITS_PER_DOC; e++) {
        const before = view.state.doc.toString();
        const blocks = collect_top_blocks(view);
        const target = pick_edit_target(rng, blocks);
        if (!target) continue;

        const span = Math.max(1, target.to - target.from);
        const from = target.from + Math.floor(rng() * span);
        const to_offset = Math.min(span, Math.floor(rng() * 5));
        const to = Math.min(target.to, from + to_offset);
        const insert = gen_insert(rng);

        view.dispatch({ changes: { from, to, insert } });
        const after = view.state.doc.toString();

        const delta = after.length - before.length;
        const head_before = before.slice(0, target.from);
        const head_after = after.slice(0, target.from);
        const tail_before = before.slice(target.to);
        const tail_after = after.slice(target.to + delta);

        if (head_before !== head_after) {
          throw new Error(
            `T28.3 source-preservation breach (head): seed=0x${SEED.toString(16)} doc=${d} ` +
              `doc_seed=0x${doc_seed.toString(16)} edit=${e} target=${target.name}[${target.from},${target.to}) ` +
              `applied={from:${from},to:${to},insert:${JSON.stringify(insert)}}`,
          );
        }
        if (tail_before !== tail_after) {
          throw new Error(
            `T28.3 source-preservation breach (tail): seed=0x${SEED.toString(16)} doc=${d} ` +
              `doc_seed=0x${doc_seed.toString(16)} edit=${e} target=${target.name}[${target.from},${target.to}) ` +
              `applied={from:${from},to:${to},insert:${JSON.stringify(insert)}} ` +
              `delta=${delta}`,
          );
        }
      }
    }

    expect(view.state.doc.length).toBeGreaterThanOrEqual(0);
  }, 180000);
});
