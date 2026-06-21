import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { build_inline_decorations, build_registry } from './inline_decorations.js';
import { text_style_handlers } from './text_styles.js';

function make_state(doc: string, anchor: number, head: number = anchor): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM] })],
    selection: { anchor, head },
  });
}

interface DecoSnapshot {
  from: number;
  to: number;
  kind: 'mark' | 'replace';
  class: string | undefined;
}

const registry = build_registry(text_style_handlers);

function snapshot(state: EditorState): DecoSnapshot[] {
  const set = build_inline_decorations(
    state,
    [{ from: 0, to: state.doc.length }],
    registry,
  );
  const out: DecoSnapshot[] = [];
  set.between(0, state.doc.length, (from, to, deco) => {
    const cls = (deco.spec as { class?: string }).class;
    out.push({ from, to, kind: cls === undefined ? 'replace' : 'mark', class: cls });
  });
  // RangeSet.between gives no positional-order guarantee across nested ranges.
  out.sort((a, b) => a.from - b.from || a.to - b.to || a.kind.localeCompare(b.kind));
  return out;
}

const mark = (from: number, to: number, cls: string): DecoSnapshot => ({
  from,
  to,
  kind: 'mark',
  class: cls,
});
const hide = (from: number, to: number): DecoSnapshot => ({
  from,
  to,
  kind: 'mark',
  class: 'plainmark-inline-marker-hidden',
});

// Each case: construct on line 1, a bare line 2 to park the caret off-line.
const cases = [
  {
    name: 'strong',
    ids: 'EMPH-R-1 EMPH-R-5 EMPH-I-1 EMPH-I-2 EMPH-I-3 EMPH-I-4',
    doc: 'x **bold** y\nzz\n',
    cls: 'plainmark-strong',
    content: [4, 8] as const,
    open: [2, 4] as const,
    close: [8, 10] as const,
    caret_inside: 5,
    caret_off: 13,
  },
  {
    name: 'em',
    ids: 'EMPH-R-2 EMPH-R-5 EMPH-I-1 EMPH-I-2 EMPH-I-3 EMPH-I-4',
    doc: 'x *it* y\nzz\n',
    cls: 'plainmark-em',
    content: [3, 5] as const,
    open: [2, 3] as const,
    close: [5, 6] as const,
    caret_inside: 4,
    caret_off: 9,
  },
  {
    name: 'strikethrough',
    ids: 'EMPH-R-3 EMPH-R-5 EMPH-I-1 EMPH-I-2 EMPH-I-3 EMPH-I-4',
    doc: 'x ~~s~~ y\nzz\n',
    cls: 'plainmark-strikethrough',
    content: [4, 5] as const,
    open: [2, 4] as const,
    close: [5, 7] as const,
    caret_inside: 4,
    caret_off: 10,
  },
  {
    name: 'inline code',
    ids: 'CODE-R-1 CODE-R-4 CODE-R-6 CODE-I-1 CODE-I-2 CODE-I-3 CODE-I-4',
    doc: 'x `c` y\nzz\n',
    cls: 'plainmark-inline-code',
    content: [3, 4] as const,
    open: [2, 3] as const,
    close: [4, 5] as const,
    caret_inside: 3,
    caret_off: 8,
  },
];

for (const c of cases) {
  describe(`${c.name} ${c.ids}`, () => {
    it('renders a content mark and hides both markers when the caret is off the line', () => {
      const state = make_state(c.doc, c.caret_off);
      expect(snapshot(state)).toEqual([
        hide(c.open[0], c.open[1]),
        mark(c.content[0], c.content[1], c.cls),
        hide(c.close[0], c.close[1]),
      ]);
    });

    it('keeps the markers hidden when the caret is on the line but off the construct', () => {
      const state = make_state(c.doc, 0);
      expect(snapshot(state)).toEqual([
        hide(c.open[0], c.open[1]),
        mark(c.content[0], c.content[1], c.cls),
        hide(c.close[0], c.close[1]),
      ]);
    });

    it('reveals the markers (mark only, no replace) when the caret is on the construct', () => {
      const state = make_state(c.doc, c.caret_inside);
      expect(snapshot(state)).toEqual([mark(c.content[0], c.content[1], c.cls)]);
    });

    it('restores marker-hiding after the caret leaves the construct', () => {
      let state = make_state(c.doc, c.caret_inside);
      expect(snapshot(state)).toEqual([mark(c.content[0], c.content[1], c.cls)]);
      state = state.update({ selection: { anchor: c.caret_off } }).state;
      expect(snapshot(state)).toEqual([
        hide(c.open[0], c.open[1]),
        mark(c.content[0], c.content[1], c.cls),
        hide(c.close[0], c.close[1]),
      ]);
    });

    it('reveals the markers when the caret touches the opening edge', () => {
      const state = make_state(c.doc, c.open[0]);
      expect(snapshot(state)).toEqual([mark(c.content[0], c.content[1], c.cls)]);
    });

    it('reveals the markers when the caret touches the closing edge', () => {
      const state = make_state(c.doc, c.close[1]);
      expect(snapshot(state)).toEqual([mark(c.content[0], c.content[1], c.cls)]);
    });

    it('reveals the markers under a selection inside the content area (rule 3)', () => {
      const state = make_state(c.doc, c.content[0], c.content[1]);
      expect(snapshot(state)).toEqual([mark(c.content[0], c.content[1], c.cls)]);
    });

    it('reveals the markers under a selection exactly covering the construct (equality is not strict-outside)', () => {
      const state = make_state(c.doc, c.open[0], c.close[1]);
      expect(snapshot(state)).toEqual([mark(c.content[0], c.content[1], c.cls)]);
    });

    it('keeps the markers hidden under a selection strictly extending past on both sides (rule 1)', () => {
      // Selection from doc start (0, before opening marker) to end-of-line
      // (past closing marker) — strict outside on both sides.
      const line_end = c.doc.indexOf('\n');
      const state = make_state(c.doc, 0, line_end);
      expect(snapshot(state)).toEqual([
        hide(c.open[0], c.open[1]),
        mark(c.content[0], c.content[1], c.cls),
        hide(c.close[0], c.close[1]),
      ]);
    });

    it('reveals the markers when the selection ends inside (partial overlap from left)', () => {
      // Anchor before the opening marker, head one char into the content.
      const state = make_state(c.doc, 0, c.content[0] + 1);
      expect(snapshot(state)).toEqual([mark(c.content[0], c.content[1], c.cls)]);
    });

    it('reveals the markers when the selection starts inside (partial overlap from right)', () => {
      // Anchor inside content, head past the closing marker (rule 2: one side
      // intersecting → reveal).
      const line_end = c.doc.indexOf('\n');
      const state = make_state(c.doc, c.content[0], line_end);
      expect(snapshot(state)).toEqual([mark(c.content[0], c.content[1], c.cls)]);
    });

    it('reveals the markers when the selection extends past on left and ends at the closing boundary (rule 2)', () => {
      const state = make_state(c.doc, 0, c.close[1]);
      expect(snapshot(state)).toEqual([mark(c.content[0], c.content[1], c.cls)]);
    });
  });
}

describe('composition with the scaffold', () => {
  it('EMPH-R-4 EMPH-E-1: emits both strong and em decorations for a nested construct', () => {
    // **a *b* c**  -> StrongEmphasis [0,11], inner Emphasis *b* at [4,7]
    const state = make_state('**a *b* c**\nzz\n', 12);
    expect(snapshot(state)).toEqual([
      hide(0, 2),
      mark(2, 9, 'plainmark-strong'),
      hide(4, 5),
      mark(5, 6, 'plainmark-em'),
      hide(6, 7),
      hide(9, 11),
    ]);
  });

  it('CODE-R-8 EMPH-E-7: does not decorate emphasis markers that sit inside an inline code span', () => {
    // `**x**` is opaque to the emphasis parser; only the inline-code decoration applies.
    const state = make_state('`**x**`\nzz\n', 8);
    expect(snapshot(state)).toEqual([
      hide(0, 1),
      mark(1, 6, 'plainmark-inline-code'),
      hide(6, 7),
    ]);
  });
});

// Exercises the patched @lezer/markdown (patches/@lezer__markdown.patch); vanilla CommonMark
// flanking rules would emit no node for any of the EMPH-E-9 / EMPH-E-11 inputs.
describe('CJK-friendly flanking', () => {
  it('EMPH-E-9: strong closes after CJK punctuation followed by a CJK character', () => {
    // 前**粗体（x）**后 -> StrongEmphasis [1,10), content [3,8)
    const state = make_state('前**粗体（x）**后\nzz\n', 12);
    expect(snapshot(state)).toEqual([
      hide(1, 3),
      mark(3, 8, 'plainmark-strong'),
      hide(8, 10),
    ]);
  });

  it('EMPH-E-9: strong spans mixed CJK + Latin content with full-width brackets', () => {
    // 我构建的是一套**主控器（director） + 六个子代理（subagent）**的架构：
    // -> StrongEmphasis [7,42), content [9,40)
    const state = make_state('我构建的是一套**主控器（director） + 六个子代理（subagent）**的架构：\nzz\n', 47);
    expect(snapshot(state)).toEqual([
      hide(7, 9),
      mark(9, 40, 'plainmark-strong'),
      hide(40, 42),
    ]);
  });

  it('EMPH-E-9: emphasis (single asterisk) closes after CJK punctuation', () => {
    // 前*斜体（x）*后 -> Emphasis [1,8), content [2,7)
    const state = make_state('前*斜体（x）*后\nzz\n', 10);
    expect(snapshot(state)).toEqual([
      hide(1, 2),
      mark(2, 7, 'plainmark-em'),
      hide(7, 8),
    ]);
  });

  it('EMPH-E-11: strikethrough closes after CJK punctuation', () => {
    // 前~~删除（x）~~后 -> Strikethrough [1,10), content [3,8)
    const state = make_state('前~~删除（x）~~后\nzz\n', 12);
    expect(snapshot(state)).toEqual([
      hide(1, 3),
      mark(3, 8, 'plainmark-strikethrough'),
      hide(8, 10),
    ]);
  });

  it('EMPH-E-12: underscore intraword prohibition is unchanged for CJK text', () => {
    const state = make_state('前__粗体（x）__后\nzz\n', 14);
    expect(snapshot(state)).toEqual([]);
  });

  it('EMPH-E-10: non-CJK punctuation flanking still blocks emphasis (CommonMark unchanged)', () => {
    // a**(x)**b stays literal — the amendment only activates on CJK adjacency.
    const state = make_state('a**(x)**b\nzz\n', 11);
    expect(snapshot(state)).toEqual([]);
  });
});
