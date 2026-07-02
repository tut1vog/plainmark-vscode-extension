// Caret / selection invariant oracles layered on the monkey-fuzzer action alphabet.
// Three oracle layers asserted after every action:
//
//   A. Mechanical — `selection.main` is in [0, doc.length] with from ≤ to,
//      and both anchor / head are in bounds. Catches the worst-case state
//      corruption (selection pointing outside the doc, swapped from/to).
//   B. Round-trip — when a typed-character action lands with an empty
//      pre-action caret on the main view AND the type was "clean" (doc
//      grew by exactly 1 byte AND caret advanced by exactly 1 column),
//      immediately fire {Backspace} and assert the doc bytes + selection
//      equal the pre-type state. Five eligibility gates scope this to
//      the cases where strict identity is the contract:
//        (i) main view directly focused (cell subviews go through the
//            table rebase pipeline per docs/spec/tables.md);
//        (ii) the chars before the pre-action caret on the line are NOT
//            all whitespace — `@codemirror/commands` `deleteCharBackward`
//            takes its indent-unit branch (commands/dist/index.js line
//            1189) when they are, deleting a whole indent unit;
//            intentional CM6 UX inherited from code-editor context,
//            switching to `deleteCharBackwardStrict` is a separate UX
//            decision out of scope for this suite;
//        (iii) the pre-action line is NOT a structurally-empty marker
//            line (`> `, `- `, `* `, `+ `, `1. `, `1) ` — possibly with
//            extra whitespace). Plainmark's `blockquote_empty_line_-
//            backspace_exit` / `list_empty_bullet_backspace` (T16.2c +
//            friends) intentionally collapse the marker on Backspace
//            there — designed UX, not a bug;
//        (iv) the post-type doc grew by exactly 1 byte AND caret
//            advanced by exactly 1 column (any other delta means
//            widget-mediated work — table rebase, callout autocomplete,
//            or lazy-continuation filter);
//        (v) NO Table node has been observed in the syntax tree at any
//            point in the current sequence (latched per sequence). The
//            table widget's editing pipeline is async by design — cell
//            subview creation is rAF-deferred (table.ts T19.23 gate),
//            focusout teardown is setTimeout(0)-deferred, and a cell
//            edit re-emits the WHOLE table source (P3 column padding +
//            TA2 newline injection — the table carve-out in the
//            invariants spec). Any of those hops can interleave between
//            this oracle's gate
//            check, the typed char, and the round-trip Backspace —
//            sending the two keystrokes into different views (the
//            captured 2026-06-01 flake: "w" landed in the main doc
//            while Backspace deleted a char inside a cell subview and
//            triggered a whole-table re-pad). Identity is simply not
//            the contract while a table exists in the doc; gate (i)'s
//            instantaneous focus check cannot close that window.
//      The original lang-markdown `deleteMarkupBackward` content-loss
//      bug that surfaced Oracle B's first runs IS the fix landed in
//      this commit — `marker_aware_backspace` at Prec.highest (see
//      `src/webview/decorations/marker_aware_backspace.ts`). All the
//      remaining gates above scope around intentional behaviors, not
//      bugs.
//   C. Reveal sanity — for every `.plainmark-inline-marker-hidden`
//      element whose offsetWidth is 0 (T19.26's hide mechanism: display:
//      inline-block; width: 0; overflow: hidden), assert the main caret
//      is NOT inside the marker's source range. Catches the worst-case
//      T19.23 regression: a marker stays hidden while the caret sits on
//      top of it. (Weaker than recomputing the full predicate against the
//      parent construct's node range — that would duplicate production
//      logic; deferred. This subset still catches the strict violation.)
//      Markers inside NESTED editors (table cell subviews live inside the
//      main view's contentDOM) are excluded: they answer to the subview's
//      own selection, and mapping them through the main view's posAtDOM
//      yields the widget's position — a phantom range around the main
//      caret, not a real reveal violation.
//
// Action alphabet, PRNG, and iteration budget mirror monkey.spec.ts so
// findings here are comparable. A different SEED selects a non-overlapping
// sub-walk so we don't replay the exact same trace under two oracle sets.
//
// Determinism: the seed drives every action. Failures print seed + seq +
// action index + the failing oracle so the run can be reproduced.

import { afterAll, beforeAll, describe, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { editor_extensions } from '../../../src/webview/editor_extensions.js';
import { gen_markdown } from '../../fuzz/gen-markdown.js';
import { mulberry32, type Rng } from '../../fuzz/rng.js';
import { ensure_mathjax } from '../mathjax-ready.js';
import { allow_console, unexpected_console_snapshot } from '../console-sentinel.js';

const SEED = 0xca4e_1a11e;
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

// `{` and `[` open special syntax in vitest-browser's keyboard DSL; doubling
// each character emits it literally (per @vitest/browser context.d.ts).
function escape_userevent(c: string): string {
  if (c === '{') return '{{';
  if (c === '[') return '[[';
  return c;
}

function serialize_selection(view: EditorView): string {
  const r = view.state.selection.main;
  return `{anchor:${r.anchor},head:${r.head},from:${r.from},to:${r.to}}`;
}

// Mirrors `blockquote_empty_line_backspace_exit` (T16.2c), `list_empty_bullet_backspace`,
// and friends — Plainmark's Prec.highest Backspace overrides that fire on
// structurally-empty marker lines and intentionally collapse the marker. The
// affordances are correct UX; Oracle B's strict-identity contract doesn't hold
// when they fire, so the gate skips type+backspace on these lines.
const EMPTY_MARKER_LINE_RE =
  /^(?:[\s>]*>[\s>]*|\s*[-*+]\s*|\s*\d+[.)]\s*)$/;

// Oracle B gate (v): the table widget's async editing pipeline (rAF-deferred
// cell subviews, setTimeout(0) focus teardown, whole-table re-emit with P3
// padding + TA2 newline injection) is incompatible with the strict-identity
// contract; once a Table node exists the round-trip oracle is off for the
// rest of the sequence (the latch also covers async work outliving deletion).
function tree_has_table(view: EditorView): boolean {
  let found = false;
  syntaxTree(view.state).iterate({
    enter(node) {
      if (found) return false;
      if (node.name === 'Table') {
        found = true;
        return false;
      }
      return undefined;
    },
  });
  return found;
}

function check_oracle_a_mechanical(view: EditorView): string | null {
  const r = view.state.selection.main;
  const len = view.state.doc.length;
  if (r.from < 0) return `selection.from < 0 (${r.from})`;
  if (r.to > len) return `selection.to > doc.length (${r.to} > ${len})`;
  if (r.from > r.to) return `selection.from > selection.to (${r.from} > ${r.to})`;
  if (r.anchor < 0 || r.anchor > len) {
    return `selection.anchor out of bounds (${r.anchor}, doc.length=${len})`;
  }
  if (r.head < 0 || r.head > len) {
    return `selection.head out of bounds (${r.head}, doc.length=${len})`;
  }
  return null;
}

function check_oracle_c_reveal(view: EditorView): string | null {
  const caret = view.state.selection.main.head;
  const els = Array.from(
    view.contentDOM.querySelectorAll<HTMLElement>('.plainmark-inline-marker-hidden'),
  );
  for (const el of els) {
    if (el.offsetWidth !== 0) continue;
    // Cell-subview markers answer to the SUBVIEW's selection; main-view
    // posAtDOM maps them to the table widget's position — a phantom range.
    if (el.closest('.cm-editor') !== view.dom) continue;
    let from: number;
    try {
      from = view.posAtDOM(el);
    } catch {
      // posAtDOM can throw if the element is detached mid-measure; treat
      // as a non-finding rather than a false positive.
      continue;
    }
    const to = from + (el.textContent?.length ?? 0);
    if (from <= caret && caret <= to) {
      return `hidden inline marker [${from},${to}] contains caret ${caret}`;
    }
  }
  return null;
}

describe('caret/selection invariants under monkey fuzz NAV-M-1 NAV-M-2 NAV-M-3 NAV-M-4 NAV-M-5 NAV-M-6', () => {
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

      // Oracle B gate (v) latch — set the moment a Table node is observed,
      // never cleared within the sequence.
      let sequence_saw_table = false;

      const trace: string[] = [];
      for (let a = 0; a < ACTIONS_PER_SEQUENCE; a++) {
        const action = pick_action(rng);
        let typed = action.keys();
        if (action.name.startsWith('type:') && typed.length > 1) {
          typed = typed[Math.floor(rng() * typed.length)];
        }
        const display_typed = typed;
        if (action.name.startsWith('type:')) typed = escape_userevent(typed);
        trace.push(
          action.name +
            (action.name.startsWith('type:') ? `(${JSON.stringify(display_typed)})` : ''),
        );

        // Oracle B prerequisites (captured pre-action):
        //   (1) action is type:*;
        //   (2) main view's selection is an empty caret;
        //   (3) main view is the directly-focused element (not a cell subview
        //       — the table rebase pipeline owns its own selection contract
        //       per docs/spec/tables.md);
        //   (4) the line content from line.from to pre_caret is NOT entirely
        //       whitespace — when it is, @codemirror/commands `deleteCharBackward`
        //       takes its indent-unit branch (commands/dist/index.js line 1189),
        //       deleting back to the nearest indent boundary in one stroke.
        //       That's intentional CM6 UX inherited from code-editor context,
        //       not a Plainmark bug; whether Plainmark should override to
        //       `deleteCharBackwardStrict` for a more prose-flavored Backspace
        //       is a separate UX decision out of scope for this suite;
        //   (5) no Table node observed this sequence (latched) — the table
        //       pipeline's rAF/setTimeout hops and whole-table re-emit can
        //       interleave with the round trip regardless of where focus
        //       sits at this instant (see header gate (v)).
        const is_type = action.name.startsWith('type:');
        const main_view_directly_focused = document.activeElement === view.contentDOM;
        sequence_saw_table ||= tree_has_table(view);
        const pre_caret = view.state.selection.main.head;
        const pre_doc_len = view.state.doc.length;
        const pre_line = view.state.doc.lineAt(pre_caret);
        const before_caret = pre_line.text.slice(0, pre_caret - pre_line.from);
        const all_whitespace_before_caret = !/[^ \t]/.test(before_caret);
        const empty_marker_line = EMPTY_MARKER_LINE_RE.test(pre_line.text);
        const round_trip_eligible =
          is_type &&
          view.state.selection.main.empty &&
          main_view_directly_focused &&
          !sequence_saw_table &&
          !all_whitespace_before_caret &&
          !empty_marker_line;
        const pre_doc = round_trip_eligible ? view.state.doc.toString() : '';
        const pre_sel = round_trip_eligible ? serialize_selection(view) : '';

        try {
          await userEvent.keyboard(typed);
        } catch (err) {
          throw new Error(
            `caret-invariants: action threw — seed=0x${SEED.toString(16)} ` +
              `seq=${s} seq_seed=0x${seq_seed.toString(16)} action=${a} (${action.name}): ` +
              `${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n` +
              `seq_initial=${JSON.stringify(initial)}\n` +
              `trace: ${trace.join(' → ')}`,
          );
        }

        const a_err = check_oracle_a_mechanical(view);
        if (a_err) {
          throw new Error(
            `Oracle A (mechanical): ${a_err} — seed=0x${SEED.toString(16)} ` +
              `seq=${s} seq_seed=0x${seq_seed.toString(16)} action=${a} (${action.name})\n` +
              `seq_initial=${JSON.stringify(initial)}\n` +
              `trace: ${trace.join(' → ')}`,
          );
        }

        const c_err = check_oracle_c_reveal(view);
        if (c_err) {
          throw new Error(
            `Oracle C (reveal): ${c_err} — seed=0x${SEED.toString(16)} ` +
              `seq=${s} seq_seed=0x${seq_seed.toString(16)} action=${a} (${action.name})\n` +
              `caret=${view.state.selection.main.head} doc.length=${view.state.doc.length}\n` +
              `seq_initial=${JSON.stringify(initial)}\n` +
              `trace: ${trace.join(' → ')}`,
          );
        }

        // Oracle B — clean-type-then-Backspace identity. Only enforce when the
        // keystroke was a simple +1-byte insert that advanced the caret by 1
        // column; any other delta means the type was widget-mediated (table
        // rebase, callout autocomplete) and identity is not the contract.
        const post_type_clean =
          round_trip_eligible &&
          view.state.doc.length === pre_doc_len + 1 &&
          view.state.selection.main.empty &&
          view.state.selection.main.head === pre_caret + 1;
        if (post_type_clean) {
          try {
            await userEvent.keyboard('{Backspace}');
          } catch (err) {
            throw new Error(
              `Oracle B (round-trip): backspace threw after clean type — ` +
                `seed=0x${SEED.toString(16)} seq=${s} action=${a} (${action.name}): ` +
                `${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n` +
                `seq_initial=${JSON.stringify(initial)}\n` +
                `trace: ${trace.join(' → ')} → Backspace`,
            );
          }
          const post_doc = view.state.doc.toString();
          const post_sel = serialize_selection(view);
          if (post_doc !== pre_doc || post_sel !== pre_sel) {
            throw new Error(
              `Oracle B (round-trip): clean type+backspace ≠ identity — ` +
                `seed=0x${SEED.toString(16)} seq=${s} seq_seed=0x${seq_seed.toString(16)} ` +
                `action=${a} (${action.name})\n` +
                `pre_doc.len=${pre_doc.length} post_doc.len=${post_doc.length}\n` +
                `pre_sel=${pre_sel}\npost_sel=${post_sel}\n` +
                `pre_doc=${JSON.stringify(pre_doc)}\n` +
                `post_doc=${JSON.stringify(post_doc)}\n` +
                `seq_initial=${JSON.stringify(initial)}\n` +
                `trace: ${trace.join(' → ')} → Backspace`,
            );
          }
        }

        const captured = unexpected_console_snapshot();
        if (captured.length > 0) {
          throw new Error(
            `caret-invariants: console error/warn fired — seed=0x${SEED.toString(16)} ` +
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
