import { describe, expect, it } from 'vitest';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, drawSelection } from '@codemirror/view';
import { forceParsing } from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { allow_console } from './console-sentinel.js';
import { editor_extensions } from '../../src/webview/editor_extensions.js';
import { create_update_listener } from '../../src/webview/sync.js';
import { match_code_language } from '../../src/webview/language_aliases.js';
import { math_extension as math_grammar } from '../../src/webview/grammar/math.js';
import { Footnote as footnote_grammar } from '../../src/webview/decorations/footnote_parser.js';
import { frontmatter_extension as frontmatter_grammar } from '../../src/webview/grammar/frontmatter.js';
import { pointer_state_extension } from '../../src/webview/decorations/pointer_state.js';
import large_md from '../source-preservation/fixtures/no-edit/large.md?raw';

// Per-keystroke dispatch budget at ~1 MB. The production extension stack once
// did doc-wide work per transaction in the block-widget StateFields (math,
// mermaid, table, footnote): full-stack dispatch median measured ~2.4x the
// bare-grammar baseline on this fixture; after the incremental-region rebuilds
// it sits ~1.3x. The ratio gate at 2x fails when an extension reintroduces
// O(doc)-per-keystroke work, independently of machine speed; the absolute gate
// only catches catastrophic regressions on any hardware. Medians over 25
// samples after 5 warmup keystrokes, parse forced complete first, so the
// numbers are stable and worst-case (a fully built syntax tree is what
// doc-wide scans pay for).
const RATIO_BUDGET = 2;
const ABSOLUTE_BUDGET_MS = 60;

const bare_grammar_baseline: Extension[] = [
  markdown({
    codeLanguages: match_code_language,
    extensions: [GFM, math_grammar, footnote_grammar, frontmatter_grammar],
  }),
  EditorView.lineWrapping,
  drawSelection(),
  pointer_state_extension,
];

async function settle(view: EditorView): Promise<void> {
  for (let i = 0; i < 2; i++) {
    view.requestMeasure();
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  }
}

async function median_dispatch_ms(extensions: Extension[]): Promise<number> {
  const host = document.createElement('div');
  host.style.width = '800px';
  host.style.height = '900px';
  host.style.overflow = 'hidden';
  document.body.appendChild(host);
  const view = new EditorView({
    state: EditorState.create({
      doc: large_md,
      extensions,
      selection: { anchor: large_md.length },
    }),
    parent: host,
  });
  await settle(view);
  while (!forceParsing(view, view.state.doc.length, 500)) {
    await new Promise((r) => setTimeout(r, 0));
  }
  await settle(view);

  const samples: number[] = [];
  for (let i = 0; i < 30; i++) {
    const pos = view.state.doc.length;
    const t0 = performance.now();
    view.dispatch({
      changes: { from: pos, insert: 'x' },
      selection: { anchor: pos + 1 },
      scrollIntoView: true,
    });
    const dt = performance.now() - t0;
    if (i >= 5) samples.push(dt);
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  }
  view.destroy();
  host.remove();
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

describe('per-keystroke dispatch budget at ~1 MB', () => {
  it('keeps the full stack within budget of the bare-grammar baseline', async () => {
    // perf-only spec: widget bootstrap warnings at this scale are not under test
    allow_console(/[\s\S]*/);
    const channel = new MessageChannel();
    const listener = EditorView.updateListener.of(
      create_update_listener((m) => channel.port1.postMessage(m), () => 1),
    );
    const full_ms = await median_dispatch_ms([...editor_extensions, listener]);
    const base_ms = await median_dispatch_ms(bare_grammar_baseline);

    expect(base_ms).toBeGreaterThan(0);
    expect(full_ms).toBeLessThan(Math.max(base_ms * RATIO_BUDGET, ABSOLUTE_BUDGET_MS / 2));
    expect(full_ms).toBeLessThan(ABSOLUTE_BUDGET_MS);
  }, 240000);
});
