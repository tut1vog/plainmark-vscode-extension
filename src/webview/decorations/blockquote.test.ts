import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { blockquote_handlers } from './blockquote.js';
import { build_inline_decorations, build_registry } from './inline_decorations.js';

function make_state(doc: string, anchor: number): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM] })],
    selection: { anchor },
  });
}

interface DecoSnapshot {
  from: number;
  to: number;
  kind: 'line' | 'mark' | 'widget';
  class?: string;
  depth?: number;
  side?: number;
}

const registry = build_registry(blockquote_handlers);

function snapshot(state: EditorState): DecoSnapshot[] {
  const set = build_inline_decorations(
    state,
    [{ from: 0, to: state.doc.length }],
    registry,
  );
  const out: DecoSnapshot[] = [];
  set.between(0, state.doc.length, (from, to, deco) => {
    const spec = deco.spec as {
      class?: string;
      attributes?: Record<string, string>;
      widget?: unknown;
      side?: number;
    };
    if (from === to) {
      if (spec.widget) {
        out.push({ from, to, kind: 'widget', side: spec.side });
      } else {
        const depth_attr = spec.attributes?.['data-blockquote-depth'];
        out.push({
          from,
          to,
          kind: 'line',
          class: spec.class,
          ...(depth_attr !== undefined ? { depth: Number(depth_attr) } : {}),
        });
      }
    } else {
      out.push({ from, to, kind: 'mark', class: spec.class });
    }
  });
  out.sort(
    (a, b) =>
      a.from - b.from ||
      a.to - b.to ||
      a.kind.localeCompare(b.kind) ||
      (a.class ?? '').localeCompare(b.class ?? '') ||
      (a.side ?? 0) - (b.side ?? 0),
  );
  return out;
}

// `first` — the OUTERMOST quote's first line carries plainmark-blockquote-first
// (PARA-R-7: the theme keys the block's paragraph-gap rendering on it). Every
// doc in this file starts its (first) quote at offset 0, so it defaults from
// that; a second quote's first line passes `true` explicitly.
const line = (from: number, depth = 1, first = from === 0): DecoSnapshot => ({
  from,
  to: from,
  kind: 'line',
  class: `plainmark-blockquote plainmark-collapse-adjacent${first ? ' plainmark-blockquote-first' : ''}`,
  depth,
});
const hide = (from: number, to: number): DecoSnapshot => ({
  from,
  to,
  kind: 'mark',
  class: 'plainmark-quote-marker',
});
// On the caret's line the `>` is shown but still in its indent-pinned slot
// (visible variant), so the active line keeps the same geometry — no reflow.
const reveal = (from: number, to: number): DecoSnapshot => ({
  from,
  to,
  kind: 'mark',
  class: 'plainmark-quote-marker-revealed',
});

// Per-line reveal: a blockquote line's `>` is hidden ONLY when the caret is
// off that line; the caret's line shows its marker as editable text. No
// caret-anchor widgets are emitted (the always-hide stack is retired).

describe('BQ-R-1 BQ-R-2: single-line blockquote', () => {
  const doc = '> a\n\nzz\n';
  const caret_off = 6; // on the "zz" line
  const caret_on = 2; // inside "> a"

  it('emits a depth-1 line decoration and hides the `> ` marker when caret is off-line', () => {
    expect(snapshot(make_state(doc, caret_off))).toEqual([line(0, 1), hide(0, 2)]);
  });

  it('reveals the `> ` marker (visible pinned slot) when caret is on the line', () => {
    expect(snapshot(make_state(doc, caret_on))).toEqual([line(0, 1), reveal(0, 2)]);
  });

  it('toggles hide <-> visible-pinned slot on caret transition onto / off the line', () => {
    let state = make_state(doc, caret_on);
    expect(snapshot(state)).toEqual([line(0, 1), reveal(0, 2)]);
    state = state.update({ selection: { anchor: caret_off } }).state;
    expect(snapshot(state)).toEqual([line(0, 1), hide(0, 2)]);
  });
});

describe('BQ-R-2 BQ-I-11: multi-line blockquote — only the caret line reveals', () => {
  const doc = '> a\n> b\n\nzz\n';
  const caret_off = 10; // on the "zz" line
  const caret_line1 = 2;
  const caret_line2 = 6;

  it('hides every marker when the caret is off the blockquote', () => {
    expect(snapshot(make_state(doc, caret_off))).toEqual([
      line(0, 1),
      hide(0, 2),
      line(4, 1),
      hide(4, 6),
    ]);
  });

  it('reveals only line 1 marker when the caret is on line 1', () => {
    expect(snapshot(make_state(doc, caret_line1))).toEqual([
      line(0, 1),
      reveal(0, 2),
      line(4, 1),
      hide(4, 6),
    ]);
  });

  it('reveals only line 2 marker when the caret is on line 2', () => {
    expect(snapshot(make_state(doc, caret_line2))).toEqual([
      line(0, 1),
      hide(0, 2),
      line(4, 1),
      reveal(4, 6),
    ]);
  });
});

describe('BQ-R-4: nested blockquote', () => {
  // '> > a\n\nzz\n' — outer Blockquote[0,5], inner Blockquote[2,5]; QuoteMarks at 0 and 2.
  const doc = '> > a\n\nzz\n';
  const caret_off = 8;
  const caret_on = 3;

  it('emits depth-2 line decoration and hides both QuoteMarks when caret off-line', () => {
    expect(snapshot(make_state(doc, caret_off))).toEqual([
      line(0, 2),
      hide(0, 2),
      hide(2, 4),
    ]);
  });

  it('reveals both QuoteMarks on the caret line (one reveal axis per line)', () => {
    expect(snapshot(make_state(doc, caret_on))).toEqual([
      line(0, 2),
      reveal(0, 2),
      reveal(2, 4),
    ]);
  });
});

describe('BQ-E-1: lazy continuation', () => {
  // '> a\nb' — Blockquote[0,5], QuoteMark[0,1], Paragraph[2,5] spans both lines.
  // Both lines are inside the blockquote; caret at 5 sits on the continuation
  // line (line 2), so line 1's marker stays hidden.
  const doc = '> a\nb';

  it('applies depth-1 chrome to both lines; line-1 marker hidden when caret on line 2', () => {
    expect(snapshot(make_state(doc, 5))).toEqual([
      line(0, 1),
      hide(0, 2),
      line(4, 1),
    ]);
  });
});

describe('BQ-E-11 BQ-E-2: empty single-level `> ` line', () => {
  // Caret-off uses a multi-line doc so the empty `> ` line is not the caret line.
  const multi = '> a\n> \n> b\n\nzz';

  it('hides the empty line marker (no caret-anchor widget) when caret is off it', () => {
    // caret at 12 → on the "zz" line; every quote marker hidden.
    expect(snapshot(make_state(multi, 12))).toEqual([
      line(0, 1),
      hide(0, 2),
      line(4, 1),
      hide(4, 6),
      line(7, 1),
      hide(7, 9),
    ]);
  });

  it('reveals the `> ` on the empty line when the caret is on it', () => {
    // line 2 is "> " at [4,6]; caret at 6 → revealed (visible pinned slot).
    expect(snapshot(make_state(multi, 6))).toEqual([
      line(0, 1),
      hide(0, 2),
      line(4, 1),
      reveal(4, 6),
      line(7, 1),
      hide(7, 9),
    ]);
  });
});

describe('BQ-E-3: empty nested blockquote', () => {
  // '> > \n\nzz' — outer Blockquote, QuoteMarks at 0 and 2; caret off the line.
  const doc = '> > \n\nzz';

  it('emits depth-2 chrome and hides both `> ` markers (no widget) when caret off-line', () => {
    expect(snapshot(make_state(doc, 7))).toEqual([
      line(0, 2),
      hide(0, 2),
      hide(2, 4),
    ]);
  });
});

describe('BQ-E-4: blank-line-inside blockquote', () => {
  // '> a\n>\n> b' — single Blockquote[0,9], QuoteMarks at 0, 4, 6.
  // The middle QuoteMark at [4,5] has no trailing space (byte 5 is '\n').
  const doc = '> a\n>\n> b';

  it('hides the middle empty `>` marker when the caret is on another line', () => {
    // caret at 0 → line 1 revealed; lines 2 and 3 hidden.
    expect(snapshot(make_state(doc, 0))).toEqual([
      line(0, 1),
      reveal(0, 2),
      line(4, 1),
      hide(4, 5),
      line(6, 1),
      hide(6, 8),
    ]);
  });

  it('reveals the middle empty `>` marker when the caret is on it', () => {
    // line 2 is ">" at [4,5]; caret at 5 → revealed.
    expect(snapshot(make_state(doc, 5))).toEqual([
      line(0, 1),
      hide(0, 2),
      line(4, 1),
      reveal(4, 5),
      line(6, 1),
      hide(6, 8),
    ]);
  });
});

describe('BQ-E-5: two adjacent blockquotes separated by blank line', () => {
  // '> a\n\n> b' — two separate Blockquote nodes [0,3] and [5,8].
  const doc = '> a\n\n> b';

  it('hides both markers when the caret is on the blank separator (off both)', () => {
    expect(snapshot(make_state(doc, 4))).toEqual([
      line(0, 1),
      hide(0, 2),
      line(5, 1, true),
      hide(5, 7),
    ]);
  });
});

describe('BQ-R-4: mixed-depth blockquote', () => {
  // '> a\n> > b\n> c\n\nzz' — Line starts 0, 4, 10; trailing "zz" at 15 for an off caret.
  // Line 1 [0,3]: depth 1. Line 2 [4,9]: depth 2. Line 3 [10,13]: depth 1.
  const doc = '> a\n> > b\n> c\n\nzz';

  it('emits depth per line 1,2,1 and hides every marker when caret off-quote', () => {
    expect(snapshot(make_state(doc, 16))).toEqual([
      line(0, 1),
      hide(0, 2),
      line(4, 2),
      hide(4, 6),
      hide(6, 8),
      line(10, 1),
      hide(10, 12),
    ]);
  });

  it('reveals only the depth-2 line markers when the caret is on line 2', () => {
    expect(snapshot(make_state(doc, 6))).toEqual([
      line(0, 1),
      hide(0, 2),
      line(4, 2),
      reveal(4, 6),
      reveal(6, 8),
      line(10, 1),
      hide(10, 12),
    ]);
  });
});

describe('BQ-R-3: no-space marker', () => {
  // '>foo\n\nzz' — Blockquote[0,4], QuoteMark[0,1]; no trailing space.
  const doc = '>foo\n\nzz';

  it('hides only the `>` byte when caret off-line', () => {
    expect(snapshot(make_state(doc, 6))).toEqual([line(0, 1), hide(0, 1)]);
  });

  it('reveals the `>` byte when caret on the line', () => {
    expect(snapshot(make_state(doc, 2))).toEqual([line(0, 1), reveal(0, 1)]);
  });
});

describe('BQ-E-8 BQ-R-4: tight nested marker', () => {
  // '>>foo\n\nzz' — depth 2; QuoteMarks at [0,1] and [1,2], no trailing spaces.
  it('hides every QuoteMark byte and emits depth-2 chrome for `>>foo` (caret off)', () => {
    expect(snapshot(make_state('>>foo\n\nzz', 7))).toEqual([
      line(0, 2),
      hide(0, 1),
      hide(1, 2),
    ]);
  });

  // '>>> a\n\nzz' — 3 QuoteMarks; only the last has a trailing space.
  it('hides every QuoteMark byte and emits depth-3 chrome for `>>> a` (caret off)', () => {
    expect(snapshot(make_state('>>> a\n\nzz', 7))).toEqual([
      line(0, 3),
      hide(0, 1),
      hide(1, 2),
      hide(2, 4),
    ]);
  });
});
