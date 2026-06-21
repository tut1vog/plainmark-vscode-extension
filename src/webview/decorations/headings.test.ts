import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { build_inline_decorations, build_registry } from './inline_decorations.js';
import { heading_handlers } from './headings.js';

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
  kind: 'line' | 'mark' | 'replace';
  class: string | undefined;
}

const registry = build_registry(heading_handlers);

// Discrimination: line decorations have from === to (and a class); mark
// decorations have to > from and a class; replace decorations have no class.
function classify(from: number, to: number, cls: string | undefined): DecoSnapshot['kind'] {
  if (from === to) return 'line';
  return cls === undefined ? 'replace' : 'mark';
}

function snapshot(state: EditorState): DecoSnapshot[] {
  const set = build_inline_decorations(
    state,
    [{ from: 0, to: state.doc.length }],
    registry,
  );
  const out: DecoSnapshot[] = [];
  set.between(0, state.doc.length, (from, to, deco) => {
    const cls = (deco.spec as { class?: string }).class;
    out.push({ from, to, kind: classify(from, to, cls), class: cls });
  });
  out.sort((a, b) => a.from - b.from || a.to - b.to || a.kind.localeCompare(b.kind));
  return out;
}

const line = (from: number, cls: string): DecoSnapshot => ({
  from,
  to: from,
  kind: 'line',
  class: cls,
});
// The ATX marker is hidden with a zero-font-size mark (not a replace) so the
// line does not begin with a contenteditable=false widget — see headings.ts.
const hide = (from: number, to: number): DecoSnapshot => ({
  from,
  to,
  kind: 'mark',
  class: 'plainmark-heading-marker',
});

interface HeadingCase {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  doc: string;
  cls: string;
  hide_from: number;
  hide_to: number;
  caret_inside: number;
  caret_off: number;
}

const cases: HeadingCase[] = [
  { level: 1, doc: '# Title\nzz\n', cls: 'plainmark-h1 plainmark-collapse-adjacent', hide_from: 0, hide_to: 2, caret_inside: 3, caret_off: 8 },
  { level: 2, doc: '## Title\nzz\n', cls: 'plainmark-h2 plainmark-collapse-adjacent', hide_from: 0, hide_to: 3, caret_inside: 4, caret_off: 9 },
  { level: 3, doc: '### Title\nzz\n', cls: 'plainmark-h3 plainmark-collapse-adjacent', hide_from: 0, hide_to: 4, caret_inside: 5, caret_off: 10 },
  { level: 4, doc: '#### Title\nzz\n', cls: 'plainmark-h4 plainmark-collapse-adjacent', hide_from: 0, hide_to: 5, caret_inside: 6, caret_off: 11 },
  { level: 5, doc: '##### Title\nzz\n', cls: 'plainmark-h5 plainmark-collapse-adjacent', hide_from: 0, hide_to: 6, caret_inside: 7, caret_off: 12 },
  { level: 6, doc: '###### Title\nzz\n', cls: 'plainmark-h6 plainmark-collapse-adjacent', hide_from: 0, hide_to: 7, caret_inside: 8, caret_off: 13 },
];

for (const c of cases) {
  describe(`HEAD-R-1 HEAD-R-2 h${c.level}`, () => {
    it('HEAD-R-3: hides the leading marker for a heading with text when the caret is off-line', () => {
      const state = make_state(c.doc, c.caret_off);
      expect(snapshot(state)).toEqual([
        line(0, c.cls),
        hide(c.hide_from, c.hide_to),
      ]);
    });

    it('HEAD-R-4 HEAD-I-1: keeps the marker hidden when the caret is past the start of the text', () => {
      const state = make_state(c.doc, c.caret_inside);
      expect(snapshot(state)).toEqual([
        line(0, c.cls),
        hide(c.hide_from, c.hide_to),
      ]);
    });

    it('HEAD-R-4 HEAD-I-1: reveals the marker when the caret is at the start of the heading text', () => {
      const state = make_state(c.doc, c.hide_to);
      expect(snapshot(state)).toEqual([line(0, c.cls)]);
    });

    it('HEAD-R-4 HEAD-I-1: reveals the marker when the caret is within the collapsed marker run', () => {
      const state = make_state(c.doc, c.hide_from);
      expect(snapshot(state)).toEqual([line(0, c.cls)]);
    });

    it('HEAD-R-4: reveals the marker when a selection begins at the start of the text', () => {
      const state = make_state(c.doc, c.hide_to, c.caret_off);
      expect(snapshot(state)).toEqual([line(0, c.cls)]);
    });

    it('HEAD-R-4: keeps the marker hidden when a selection begins past the start of the text', () => {
      const state = make_state(c.doc, c.caret_inside, c.caret_off);
      expect(snapshot(state)).toEqual([
        line(0, c.cls),
        hide(c.hide_from, c.hide_to),
      ]);
    });
  });
}

describe('HEAD-E-1: empty heading', () => {
  const h1 = 'plainmark-h1 plainmark-collapse-adjacent';

  it('shows the marker when there is no text after it (caret on the line)', () => {
    const state = make_state('# \nzz\n', 2);
    expect(snapshot(state)).toEqual([line(0, h1)]);
  });

  it('shows the marker when there is no text after it (caret off the line)', () => {
    const state = make_state('# \nzz\n', 4);
    expect(snapshot(state)).toEqual([line(0, h1)]);
  });

  it('shows the marker for a bare hash with no trailing space', () => {
    const state = make_state('#\nzz\n', 1);
    expect(snapshot(state)).toEqual([line(0, h1)]);
  });
});
