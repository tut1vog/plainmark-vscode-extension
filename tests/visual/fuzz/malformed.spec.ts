// Malformed-document load fidelity. Loads the curated adversarial corpus plus
// seeded mutants into the full production editor (`editor_extensions`) and
// asserts the document reads back byte-identical — no extension may normalize
// malformed input on load (the webview half of INV-SP-4) — while the console
// sentinel fails the test on any unexpected render error.

import { afterAll, beforeAll, describe, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { editor_extensions } from '../../../src/webview/editor_extensions.js';
import { gen_markdown } from '../../fuzz/gen-markdown.js';
import { CURATED, mutate_markdown, type MalformedCase } from '../../fuzz/gen-malformed.js';
import { mulberry32 } from '../../fuzz/rng.js';
import { ensure_mathjax } from '../mathjax-ready.js';
import { allow_console } from '../console-sentinel.js';

const SEED = 0x0ddba11;
const MUTANT_COUNT = 150;

describe('INV-SP-4: malformed-document load fidelity in the production editor', () => {
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

  function check_load_fidelity({ name, text }: MalformedCase): void {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    const loaded = view.state.doc.toString();
    if (loaded !== text) {
      throw new Error(
        `${name}: loaded doc diverges from input at offset ${first_diff(text, loaded)} ` +
          `(input ${text.length} chars, loaded ${loaded.length})`,
      );
    }
  }

  function first_diff(a: string, b: string): number {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
    return n;
  }

  it(`curated corpus: ${CURATED.length} cases`, () => {
    allow_console(/math.*typeset failed/);
    allow_console(/mermaid render failed/);
    allow_console(/mermaid bundle load failed/);
    for (const entry of CURATED) check_load_fidelity(entry);
  }, 60000);

  it(`mutated generator output: ${MUTANT_COUNT} docs — seed=0x${SEED.toString(16)}`, () => {
    allow_console(/math.*typeset failed/);
    allow_console(/mermaid render failed/);
    allow_console(/mermaid bundle load failed/);
    const rng = mulberry32(SEED);
    for (let i = 0; i < MUTANT_COUNT; i++) {
      const doc_seed = ((rng() * 0xffffffff) >>> 0) || 1;
      check_load_fidelity({
        name: `mutant-${i} (doc_seed=0x${doc_seed.toString(16)})`,
        text: mutate_markdown(rng, gen_markdown({ seed: doc_seed })),
      });
    }
  }, 120000);
});
