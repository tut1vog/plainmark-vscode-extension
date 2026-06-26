import { markdown } from '@codemirror/lang-markdown';
import { EditorSelection, EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { compute_double_click_trim, compute_marker_snap } from './selection_snap.js';

function make_state(doc: string, anchor: number, head: number = anchor): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM] })],
    selection: { anchor, head },
  });
}

// Cases mirror text_styles.test.ts. Geometry:
//   open[0]  = node.from
//   open[1]  = first.to (= content_start)
//   content  = [first.to, last.from]
//   close[0] = last.from (= content_end)
//   close[1] = node.to
const cases = [
  {
    name: 'strong',
    doc: 'xx **bold** yy zz\n',
    open: [3, 5] as const,
    content: [5, 9] as const,
    close: [9, 11] as const,
    line_end: 17,
  },
  {
    name: 'em',
    doc: 'xx *it* yy zz\n',
    open: [3, 4] as const,
    content: [4, 6] as const,
    close: [6, 7] as const,
    line_end: 13,
  },
  {
    name: 'strikethrough',
    doc: 'xx ~~st~~ yy zz\n',
    open: [3, 5] as const,
    content: [5, 7] as const,
    close: [7, 9] as const,
    line_end: 15,
  },
  {
    name: 'inline code',
    doc: 'xx `cd` yy zz\n',
    open: [3, 4] as const,
    content: [4, 6] as const,
    close: [6, 7] as const,
    line_end: 13,
  },
];

describe('compute_marker_snap EMPH-I-7 EMPH-I-8 EMPH-I-9 EMPH-SP-4 MRS-S-1 MRS-S-2 MRS-S-3 MRS-S-4 MRS-S-5 MRS-S-6 MRS-S-7 MRS-S-8', () => {
  for (const c of cases) {
    describe(c.name, () => {
      const node_from = c.open[0];
      const node_to = c.close[1];
      const content_start = c.content[0];
      const content_end = c.content[1];

      it('returns null for an empty caret inside the content', () => {
        expect(compute_marker_snap(make_state(c.doc, content_start))).toBeNull();
      });

      it('Rule C — snaps a selection exactly covering the content area to node bounds', () => {
        const snap = compute_marker_snap(make_state(c.doc, content_start, content_end));
        expect(snap).not.toBeNull();
        expect(snap!.main.from).toBe(node_from);
        expect(snap!.main.to).toBe(node_to);
      });

      it('does NOT snap a strict-inside selection (Issue 1 — `ld` inside `**bold**` stays as-is)', () => {
        // Both edges strictly inside the content area; neither at boundary.
        if (content_end - content_start < 3) return; // skip when content too narrow for strict-inside
        const from = content_start + 1;
        const to = content_end - 1;
        expect(compute_marker_snap(make_state(c.doc, from, to))).toBeNull();
      });

      it('does NOT snap when only the right edge sits at content end and the left is strict-inside', () => {
        // `[ld]` case — Issue 1's exact reproduction. right_at_content_end is
        // true but left_before_content is false → Rule B does not fire.
        if (content_end - content_start < 2) return;
        const from = content_start + 1;
        const to = content_end;
        expect(compute_marker_snap(make_state(c.doc, from, to))).toBeNull();
      });

      it('does NOT snap when only the left edge sits at content start and the right is strict-inside', () => {
        if (content_end - content_start < 2) return;
        const from = content_start;
        const to = content_end - 1;
        expect(compute_marker_snap(make_state(c.doc, from, to))).toBeNull();
      });

      it('Rule A — snaps left when left edge is at content start AND right extends past closing marker (Issue 2)', () => {
        const snap = compute_marker_snap(make_state(c.doc, content_start, c.line_end));
        expect(snap).not.toBeNull();
        expect(snap!.main.from).toBe(node_from);
        expect(snap!.main.to).toBe(c.line_end);
      });

      it('Rule B — snaps right when right edge is at content end AND left extends past opening marker', () => {
        const snap = compute_marker_snap(make_state(c.doc, 0, content_end));
        expect(snap).not.toBeNull();
        expect(snap!.main.from).toBe(0);
        expect(snap!.main.to).toBe(node_to);
      });

      it('does NOT snap when the selection already covers the node exactly', () => {
        expect(compute_marker_snap(make_state(c.doc, node_from, node_to))).toBeNull();
      });

      it('does NOT snap when the selection strictly extends past on both sides', () => {
        expect(compute_marker_snap(make_state(c.doc, 0, c.line_end))).toBeNull();
      });

      it('does NOT snap a selection fully outside the construct', () => {
        expect(compute_marker_snap(make_state(c.doc, 0, 2))).toBeNull();
      });

      it('preserves anchor>head direction (Rule C)', () => {
        const snap = compute_marker_snap(make_state(c.doc, content_end, content_start));
        expect(snap).not.toBeNull();
        expect(snap!.main.anchor).toBe(node_to);
        expect(snap!.main.head).toBe(node_from);
      });

      it('preserves anchor>head direction (Rule A — right-to-left drag, Issue 2 reproduction)', () => {
        const snap = compute_marker_snap(make_state(c.doc, c.line_end, content_start));
        expect(snap).not.toBeNull();
        expect(snap!.main.anchor).toBe(c.line_end);
        expect(snap!.main.head).toBe(node_from);
      });
    });
  }

  describe('nested constructs', () => {
    it('snaps to the inner emphasis when selecting its content exactly inside `**a *b* c**`', () => {
      // **a *b* c** — outer StrongEmphasis [0,11]; inner Emphasis [4,7];
      // inner content area [5,6]; outer content area [2,9].
      const snap = compute_marker_snap(make_state('**a *b* c**\nzz\n', 5, 6));
      expect(snap).not.toBeNull();
      expect(snap!.main.from).toBe(4);
      expect(snap!.main.to).toBe(7);
    });

    it('snaps to the outer strong when selection covers the outer content area exactly', () => {
      const snap = compute_marker_snap(make_state('**a *b* c**\nzz\n', 2, 9));
      expect(snap).not.toBeNull();
      expect(snap!.main.from).toBe(0);
      expect(snap!.main.to).toBe(11);
    });

    it('does NOT snap when selecting just `b` strictly inside inner emphasis', () => {
      // Strict-inside inner content area would only happen if `b` had >=2
      // chars, but the single `b` IS the entire content (Rule C territory).
      // This case asserts the no-snap behavior when the inner selection is
      // not exactly content-cover and not boundary-extends.
      // For inner Emphasis [4,7] with content [5,6], selecting [5,5] is
      // empty (caret) → no snap by definition. The closest illustrative case
      // is a partial within nested strong: `**ab cd**` content [2,7], selecting `b` at [3,4].
      const snap = compute_marker_snap(make_state('**ab cd**\nzz\n', 3, 4));
      expect(snap).toBeNull();
    });
  });

  // `xx [lbl](http://x) yy` — Link [3,18]; marks `[`[3,4] `]`[7,8] `(`[8,9]
  // `)`[17,18]; label content [4,7]; line_end 21.
  describe('inline link (MRS-S-1)', () => {
    const doc = 'xx [lbl](http://x) yy\n';
    const node_from = 3;
    const node_to = 18;
    const content_start = 4;
    const content_end = 7;
    const line_end = 21;

    it('Rule C — snaps a selection exactly covering the label to the full node', () => {
      const snap = compute_marker_snap(make_state(doc, content_start, content_end));
      expect(snap).not.toBeNull();
      expect(snap!.main.from).toBe(node_from);
      expect(snap!.main.to).toBe(node_to);
    });

    it('Rule A — left at label start, right past the label snaps left to node start', () => {
      const snap = compute_marker_snap(make_state(doc, content_start, line_end));
      expect(snap).not.toBeNull();
      expect(snap!.main.from).toBe(node_from);
      expect(snap!.main.to).toBe(line_end);
    });

    it('Rule B — right at label end, left before the label snaps right to node end', () => {
      const snap = compute_marker_snap(make_state(doc, 0, content_end));
      expect(snap).not.toBeNull();
      expect(snap!.main.from).toBe(0);
      expect(snap!.main.to).toBe(node_to);
    });

    it('does NOT snap a strict-inside label selection', () => {
      expect(compute_marker_snap(make_state(doc, content_start + 1, content_end - 1))).toBeNull();
    });

    it('does NOT snap when the selection already equals the node bounds', () => {
      expect(compute_marker_snap(make_state(doc, node_from, node_to))).toBeNull();
    });

    it('preserves anchor>head direction (right-to-left drag of the label)', () => {
      const snap = compute_marker_snap(make_state(doc, content_end, content_start));
      expect(snap).not.toBeNull();
      expect(snap!.main.anchor).toBe(node_to);
      expect(snap!.main.head).toBe(node_from);
    });

    it('snaps to the inner emphasis, not the link, when selecting nested label content', () => {
      // `[**b**](u)` — Link [0,10]; StrongEmphasis [1,6] content [3,4].
      const snap = compute_marker_snap(make_state('[**b**](u)\nzz\n', 3, 4));
      expect(snap).not.toBeNull();
      expect(snap!.main.from).toBe(1);
      expect(snap!.main.to).toBe(6);
    });
  });

  // `xx <http://x> yy` — Autolink [3,13]; `<`[3,4] URL[4,12] `>`[12,13];
  // content [4,12]; line_end 16. Handled by the symmetric rule.
  describe('autolink (MRS-S-1)', () => {
    const doc = 'xx <http://x> yy\n';
    const node_from = 3;
    const node_to = 13;
    const content_start = 4;
    const content_end = 12;
    const line_end = 16;

    it('Rule C — snaps a selection exactly covering the URL to the full node', () => {
      const snap = compute_marker_snap(make_state(doc, content_start, content_end));
      expect(snap).not.toBeNull();
      expect(snap!.main.from).toBe(node_from);
      expect(snap!.main.to).toBe(node_to);
    });

    it('Rule A — left at URL start, right past it snaps left to node start', () => {
      const snap = compute_marker_snap(make_state(doc, content_start, line_end));
      expect(snap).not.toBeNull();
      expect(snap!.main.from).toBe(node_from);
      expect(snap!.main.to).toBe(line_end);
    });

    it('Rule B — right at URL end, left before it snaps right to node end', () => {
      const snap = compute_marker_snap(make_state(doc, 0, content_end));
      expect(snap).not.toBeNull();
      expect(snap!.main.from).toBe(0);
      expect(snap!.main.to).toBe(node_to);
    });

    it('does NOT snap a strict-inside URL selection', () => {
      expect(compute_marker_snap(make_state(doc, content_start + 1, content_end - 1))).toBeNull();
    });
  });

  describe('exclusions', () => {
    it('does not snap a bare URL selection (no markers to include — MRS-S-8)', () => {
      const snap = compute_marker_snap(make_state('http://example.com\nzz\n', 5, 10));
      expect(snap).toBeNull();
    });

    it('does not snap a paragraph selection with no enclosing construct', () => {
      const snap = compute_marker_snap(make_state('plain text\nzz\n', 0, 5));
      expect(snap).toBeNull();
    });
  });

  describe('multi-cursor', () => {
    it('snaps each qualifying range independently and leaves the rest', () => {
      // doc: `**a** **b**` — first StrongEmphasis [0,5] content [2,3];
      // second StrongEmphasis [6,11] content [8,9].
      const doc = '**a** **b**\nzz\n';
      const state = EditorState.create({
        doc,
        extensions: [
          markdown({ extensions: [GFM] }),
          EditorState.allowMultipleSelections.of(true),
        ],
        selection: EditorSelection.create(
          [
            EditorSelection.range(2, 3), // Rule C — snaps to [0, 5]
            EditorSelection.range(12, 13), // outside any construct — no snap
            EditorSelection.range(8, 9), // Rule C — snaps to [6, 11]
          ],
          0,
        ),
      });
      const snap = compute_marker_snap(state);
      expect(snap).not.toBeNull();
      // EditorState.create normalizes the input selection (sorts by `from`),
      // so the snap's output follows the sorted input: [2,3], [8,9], [12,13]
      // → snapped to [0,5], [6,11], [12,13].
      expect(snap!.ranges.length).toBe(3);
      expect({ from: snap!.ranges[0].from, to: snap!.ranges[0].to }).toEqual({
        from: 0,
        to: 5,
      });
      expect({ from: snap!.ranges[1].from, to: snap!.ranges[1].to }).toEqual({
        from: 6,
        to: 11,
      });
      expect({ from: snap!.ranges[2].from, to: snap!.ranges[2].to }).toEqual({
        from: 12,
        to: 13,
      });
    });

    it('returns null when no range qualifies', () => {
      const doc = 'plain text\nzz\n';
      const state = EditorState.create({
        doc,
        extensions: [
          markdown({ extensions: [GFM] }),
          EditorState.allowMultipleSelections.of(true),
        ],
        selection: EditorSelection.create(
          [EditorSelection.range(0, 2), EditorSelection.range(5, 7)],
          0,
        ),
      });
      expect(compute_marker_snap(state)).toBeNull();
    });

    it('preserves the main index when snapping', () => {
      const doc = '**a** **b**\nzz\n';
      const state = EditorState.create({
        doc,
        extensions: [
          markdown({ extensions: [GFM] }),
          EditorState.allowMultipleSelections.of(true),
        ],
        selection: EditorSelection.create(
          [EditorSelection.range(2, 3), EditorSelection.range(8, 9)],
          1,
        ),
      });
      const snap = compute_marker_snap(state);
      expect(snap).not.toBeNull();
      expect(snap!.mainIndex).toBe(1);
    });
  });
});

describe('compute_double_click_trim MRS-S-11', () => {
  it('trims the swept-in underscores of `_it_` to the content area', () => {
    // `_it_` node [3,7]; underscores at 3 and 6; content `it` = [4,6].
    const sel = compute_double_click_trim(make_state('xx _it_ yy\n', 3, 7));
    expect(sel).not.toBeNull();
    expect(sel!.main.from).toBe(4);
    expect(sel!.main.to).toBe(6);
  });

  it('trims the double underscores of `__st__`', () => {
    // `__st__` node [3,9]; content `st` = [5,7].
    const sel = compute_double_click_trim(make_state('xx __st__ yy\n', 3, 9));
    expect(sel).not.toBeNull();
    expect(sel!.main.from).toBe(5);
    expect(sel!.main.to).toBe(7);
  });

  it('trims only the swept marker for multi-word `_big text_`', () => {
    // Double-click `big` selects `_big` [0,4]; content [1,9]; trim → `big` [1,4].
    const sel = compute_double_click_trim(make_state('_big text_\n', 0, 4));
    expect(sel).not.toBeNull();
    expect(sel!.main.from).toBe(1);
    expect(sel!.main.to).toBe(4);
  });

  it('preserves anchor>head direction when trimming', () => {
    const sel = compute_double_click_trim(make_state('xx _it_ yy\n', 7, 3));
    expect(sel).not.toBeNull();
    expect(sel!.main.anchor).toBe(6);
    expect(sel!.main.head).toBe(4);
  });

  it('returns null when the selection is already the content (asterisk `*it*`)', () => {
    expect(compute_double_click_trim(make_state('xx *it* yy\n', 4, 6))).toBeNull();
  });

  it('returns null for a selection outside any construct', () => {
    expect(compute_double_click_trim(make_state('plain text\n', 0, 5))).toBeNull();
  });
});
