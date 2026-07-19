// Monkey action fuzzer.
//
// Drives a live `EditorView` running the full production `editor_extensions`
// with a seeded random sequence of user-input actions through
// `@vitest/browser`'s `userEvent` API — type, backspace, enter, arrows,
// select-all, undo, redo. Invariants checked at every step:
//   1. No exception thrown around the action.
//   2. No error-class console output (enforced globally by the console sentinel).
//   3. The syntax tree CM6 maintains incrementally across every keystroke stays
//      byte-position-identical to a from-scratch full parse of the current
//      document text — the live tree every decoration/widget renders from never
//      diverges from ground truth. (lezer's incremental-parse == full-parse
//      guarantee, checked with the same `compareTree` oracle as
//      `tests/fuzz/spec-corpus.test.ts`.)
//
// Determinism: a single seed drives every action. Failures print the seed,
// the sequence index, and the full action list up to the failure so the run
// can be reproduced with the same seed.

import { afterAll, beforeAll, describe, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { ensureSyntaxTree } from '@codemirror/language';
import { editor_extensions } from '../../../src/webview/editor_extensions.js';
import { compareTree } from '../../fuzz/compare-tree.js';
import { gen_markdown } from '../../fuzz/gen-markdown.js';
import { mulberry32, type Rng } from '../../fuzz/rng.js';
import { ensure_mathjax } from '../mathjax-ready.js';
import { allow_console, unexpected_console_snapshot } from '../console-sentinel.js';

const SEED = 0xa11ce_d10e;
const SEQUENCES = 50;
const ACTIONS_PER_SEQUENCE = 30;

const ACTION_ALPHABET = [
  { name: 'type:a-z', weight: 8, keys: () => 'abcdefghijklmnopqrstuvwxyz' },
  { name: 'type:digit', weight: 2, keys: () => '0123456789' },
  { name: 'type:punct', weight: 3, keys: () => '*_`#>-[]()$' },
  { name: 'type:space', weight: 3, keys: () => ' ' },
  { name: 'Backspace', weight: 4, keys: () => '{Backspace}' },
  { name: 'Enter', weight: 2, keys: () => '{Enter}' },
  { name: 'ArrowLeft', weight: 2, keys: () => '{ArrowLeft}' },
  { name: 'ArrowRight', weight: 2, keys: () => '{ArrowRight}' },
  { name: 'ArrowUp', weight: 1, keys: () => '{ArrowUp}' },
  { name: 'ArrowDown', weight: 1, keys: () => '{ArrowDown}' },
  { name: 'Home', weight: 1, keys: () => '{Home}' },
  { name: 'End', weight: 1, keys: () => '{End}' },
  { name: 'Undo', weight: 2, keys: () => '{Control>}z{/Control}' },
  { name: 'Redo', weight: 1, keys: () => '{Control>}{Shift>}z{/Shift}{/Control}' },
] as const;

const TOTAL_WEIGHT = ACTION_ALPHABET.reduce((sum, a) => sum + a.weight, 0);

function pick_action(rng: Rng): (typeof ACTION_ALPHABET)[number] {
  let r = rng() * TOTAL_WEIGHT;
  for (const a of ACTION_ALPHABET) {
    if ((r -= a.weight) <= 0) return a;
  }
  return ACTION_ALPHABET[0];
}

// user-event's keyboard DSL treats `{` and `[` as the openings of special
// syntax (modifier groups and extended key locations). Doubling each
// character emits it literally. See @vitest/browser context.d.ts:
// `await userEvent.keyboard('{{a[[') // translates to: {, a, [`.
function escape_userevent(c: string): string {
  if (c === '{') return '{{';
  if (c === '[') return '[[';
  return c;
}

describe('monkey fuzz: random user-input sequence stays consistent NAV-M-6', () => {
  let container: HTMLElement;
  let view: EditorView;

  beforeAll(async () => {
    await ensure_mathjax();
    container = document.createElement('div');
    container.style.width = '800px';
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

  it(`${SEQUENCES} sequences × ${ACTIONS_PER_SEQUENCE} actions — seed=0x${SEED.toString(16)}`, async () => {
    allow_console(/math.*typeset failed/);
    allow_console(/mermaid render failed/);
    allow_console(/mermaid bundle load failed/);

    const rng = mulberry32(SEED);

    for (let s = 0; s < SEQUENCES; s++) {
      const seq_seed = ((rng() * 0xffffffff) >>> 0) || 1;
      const initial = gen_markdown({ seed: seq_seed, max_blocks: 3 });
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: initial } });
      view.contentDOM.focus();

      const trace: string[] = [];
      for (let a = 0; a < ACTIONS_PER_SEQUENCE; a++) {
        const action = pick_action(rng);
        let typed = action.keys();
        // For multi-char "type:..." groups, pick exactly one char.
        if (action.name.startsWith('type:') && typed.length > 1) {
          typed = typed[Math.floor(rng() * typed.length)];
        }
        const display_typed = typed;
        if (action.name.startsWith('type:')) typed = escape_userevent(typed);
        trace.push(
          action.name + (action.name.startsWith('type:') ? `(${JSON.stringify(display_typed)})` : ''),
        );

        try {
          await userEvent.keyboard(typed);
        } catch (err) {
          throw new Error(
            `monkey: action threw — seed=0x${SEED.toString(16)} ` +
              `seq=${s} seq_seed=0x${seq_seed.toString(16)} action=${a} (${action.name}): ` +
              `${err instanceof Error ? err.stack ?? err.message : String(err)}\n` +
              `trace: ${trace.join(' → ')}`,
          );
        }

        // Content invariant: the live syntax tree CM6 maintains incrementally
        // across every keystroke MUST stay byte-position-identical to a fresh
        // full parse of the current document text. A divergence means the tree
        // the decorations render from no longer matches the source — a real
        // corruption the old `doc.length === doc.toString().length` tautology
        // could never surface (both are UTF-16 code-unit counts of the same
        // rope). Same `compareTree` oracle as tests/fuzz/spec-corpus.test.ts;
        // the standard cursor stays in the outer tree, so async nested
        // code-language mounts do not perturb the comparison.
        const doc_string = view.state.doc.toString();
        const live_tree = ensureSyntaxTree(view.state, doc_string.length, 5000);
        const fresh_state = EditorState.create({
          doc: doc_string,
          extensions: [...editor_extensions],
        });
        const fresh_tree = ensureSyntaxTree(fresh_state, doc_string.length, 5000);
        if (!live_tree || !fresh_tree) {
          throw new Error(
            `monkey: could not compute syntax tree — seed=0x${SEED.toString(16)} ` +
              `seq=${s} seq_seed=0x${seq_seed.toString(16)} action=${a} (${action.name}) ` +
              `live=${live_tree ? 'ok' : 'null'} fresh=${fresh_tree ? 'ok' : 'null'}\n` +
              `trace: ${trace.join(' → ')}`,
          );
        }
        try {
          compareTree(live_tree, fresh_tree);
        } catch (err) {
          throw new Error(
            `monkey: live syntax tree diverged from a full parse — seed=0x${SEED.toString(16)} ` +
              `seq=${s} seq_seed=0x${seq_seed.toString(16)} action=${a} (${action.name})\n` +
              `${err instanceof Error ? err.message : String(err)}\n` +
              `doc=${JSON.stringify(doc_string)}\n` +
              `trace: ${trace.join(' → ')}`,
          );
        }

        const captured = unexpected_console_snapshot();
        if (captured.length > 0) {
          throw new Error(
            `monkey: console error/warn fired — seed=0x${SEED.toString(16)} ` +
              `seq=${s} seq_seed=0x${seq_seed.toString(16)} action=${a} (${action.name})\n` +
              `console:\n  ${captured.map((c) => `[${c.channel}] ${c.text}`).join('\n  ')}\n` +
              `seq_initial=${JSON.stringify(initial)}\n` +
              `trace: ${trace.join(' → ')}`,
          );
        }
      }
    }
  }, 240000);
});
