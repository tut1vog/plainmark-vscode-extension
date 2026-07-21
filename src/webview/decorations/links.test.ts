import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { build_inline_decorations, build_registry } from './inline_decorations.js';
import { link_handlers } from './links.js';

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
  kind: 'link' | 'marker' | 'hidden' | 'definition';
  href?: string;
}

const registry = build_registry(link_handlers);

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
    };
    if (spec.class === 'plainmark-link') {
      out.push({
        from,
        to,
        kind: 'link',
        href: spec.attributes?.['data-plainmark-href'] ?? '',
      });
    } else if (spec.class === 'plainmark-link-marker') {
      out.push({ from, to, kind: 'marker' });
    } else if (spec.class === 'plainmark-link-definition') {
      out.push({ from, to, kind: 'definition' });
    } else {
      out.push({ from, to, kind: 'hidden' });
    }
  });
  out.sort((a, b) => a.from - b.from || a.to - b.to || a.kind.localeCompare(b.kind));
  return out;
}

const link = (from: number, to: number, href: string): DecoSnapshot => ({
  from,
  to,
  kind: 'link',
  href,
});
const marker = (from: number, to: number): DecoSnapshot => ({
  from,
  to,
  kind: 'marker',
});
const hide = (from: number, to: number): DecoSnapshot => ({
  from,
  to,
  kind: 'hidden',
});
const def = (from: number, to: number): DecoSnapshot => ({
  from,
  to,
  kind: 'definition',
});

describe('LINK-R-1 LINK-R-2 LINK-R-3 Link `[text](url)`', () => {
  // doc: 'see [t](u) end\nzz\n'
  //       0123456789012345
  // Link spans [4, 10); '[' at 4, ']' at 6, '(' at 7, URL 'u' at 8, ')' at 9.
  const doc = 'see [t](u) end\nzz\n';
  const caret_off = 16; // on the 'zz' line
  const caret_inside = 5; // inside the link bracketed text
  const caret_same_line_outside = 13; // on link's line but outside [4, 10)

  it('LINK-R-3: hides brackets+target when caret is outside the link', () => {
    const state = make_state(doc, caret_off);
    expect(snapshot(state)).toEqual([
      hide(4, 5),
      link(5, 6, 'u'),
      hide(6, 10),
    ]);
  });

  it('LINK-I-1 LINK-I-5: reveals all markers when caret is inside the link', () => {
    const state = make_state(doc, caret_inside);
    expect(snapshot(state)).toEqual([
      marker(4, 5),
      link(5, 6, 'u'),
      marker(6, 7),
      marker(7, 8),
      marker(9, 10),
    ]);
  });

  it('LINK-I-2: keeps markers hidden when caret is on the link line but outside the link (caret-reveal, not line-reveal)', () => {
    const state = make_state(doc, caret_same_line_outside);
    expect(snapshot(state)).toEqual([
      hide(4, 5),
      link(5, 6, 'u'),
      hide(6, 10),
    ]);
  });

  it('LINK-I-4: keeps markers hidden when selection strictly covers the link on both sides (rule 1)', () => {
    // anchor before the link (0 < 4), head past the closing ')' (14 > 10).
    const state = EditorState.create({
      doc,
      extensions: [markdown({ extensions: [GFM] })],
      selection: { anchor: 0, head: 14 },
    });
    expect(snapshot(state)).toEqual([
      hide(4, 5),
      link(5, 6, 'u'),
      hide(6, 10),
    ]);
  });

  it('LINK-I-3: reveals markers when selection is exactly at construct boundaries (equality is not strict-outside)', () => {
    // anchor at link's '[' (4), head past the closing ')' (10) — equality both sides.
    const state = EditorState.create({
      doc,
      extensions: [markdown({ extensions: [GFM] })],
      selection: { anchor: 4, head: 10 },
    });
    expect(snapshot(state)).toEqual([
      marker(4, 5),
      link(5, 6, 'u'),
      marker(6, 7),
      marker(7, 8),
      marker(9, 10),
    ]);
  });

  it('reveals markers when selection lands inside the bracketed text (rule 3)', () => {
    // anchor + head both at position 5 (just inside `[`), to position 6.
    const state = EditorState.create({
      doc,
      extensions: [markdown({ extensions: [GFM] })],
      selection: { anchor: 5, head: 6 },
    });
    expect(snapshot(state)).toEqual([
      marker(4, 5),
      link(5, 6, 'u'),
      marker(6, 7),
      marker(7, 8),
      marker(9, 10),
    ]);
  });

  it('reveals markers when selection partially overlaps from the right (rule 2)', () => {
    // anchor inside bracketed text, head past closing ')'.
    const state = EditorState.create({
      doc,
      extensions: [markdown({ extensions: [GFM] })],
      selection: { anchor: 5, head: 14 },
    });
    expect(snapshot(state)).toEqual([
      marker(4, 5),
      link(5, 6, 'u'),
      marker(6, 7),
      marker(7, 8),
      marker(9, 10),
    ]);
  });

  it('restores marker-hiding after the caret leaves the link', () => {
    let state = make_state(doc, caret_inside);
    expect(snapshot(state)).toEqual([
      marker(4, 5),
      link(5, 6, 'u'),
      marker(6, 7),
      marker(7, 8),
      marker(9, 10),
    ]);
    state = state.update({ selection: { anchor: caret_off } }).state;
    expect(snapshot(state)).toEqual([
      hide(4, 5),
      link(5, 6, 'u'),
      hide(6, 10),
    ]);
  });

  it('LINK-R-1 LINK-R-2: captures the href from the URL child', () => {
    // 'a [Plainmark](https://example.com) b\nzz\n'
    //  0123456789012345678901234567890123456789
    const doc2 = 'a [Plainmark](https://example.com) b\nzz\n';
    const state = make_state(doc2, 38); // off the link
    const decos = snapshot(state);
    const link_deco = decos.find((d) => d.kind === 'link');
    expect(link_deco?.href).toBe('https://example.com');
    expect(link_deco?.from).toBe(3);
    expect(link_deco?.to).toBe(12);
  });
});

describe('LINK-R-3 angle-bracket destinations `[text](<url>)`', () => {
  // CommonMark's only way to write a destination containing spaces. The lezer
  // URL node includes the `<`/`>` delimiters; the href must not.
  // 'see [t](<a b.pdf>) end\nzz\n'
  //  0123456789012345678901 2  3
  // Link [4,18); '[' 4, ']' 6, '(' 7, URL '<a b.pdf>' [8,17), ')' 17.
  const doc = 'see [t](<a b.pdf>) end\nzz\n';

  it('strips the angle brackets from the href (spaces preserved)', () => {
    const state = make_state(doc, 24); // off the link line
    expect(snapshot(state)).toEqual([
      hide(4, 5),
      link(5, 6, 'a b.pdf'),
      hide(6, 18),
    ]);
  });

  it('reveal keeps the raw bytes (brackets included) visible as markers', () => {
    const state = make_state(doc, 5); // caret inside the bracketed text
    expect(snapshot(state)).toEqual([
      marker(4, 5),
      link(5, 6, 'a b.pdf'),
      marker(6, 7),
      marker(7, 8),
      marker(17, 18),
    ]);
  });

  it('strips the brackets from an external angle-bracket destination too', () => {
    // 'go [x](<https://x.io/a b>) now\nzz\n' — URL '<https://x.io/a b>' [7,25).
    const doc2 = 'go [x](<https://x.io/a b>) now\nzz\n';
    const state = make_state(doc2, 32); // off the link line
    const link_deco = snapshot(state).find((d) => d.kind === 'link');
    expect(link_deco).toEqual(link(4, 5, 'https://x.io/a b'));
  });

  it('LINK-E-2: a reference definition with an angle-bracket destination resolves stripped', () => {
    // 'see [t][r] end\n\n[r]: <a b.pdf>\n'
    // Link [4,10): '[' 4, text [5,6)='t', ']' 6, LinkLabel [7,10)='[r]'.
    // LinkReference [16,30); URL '<a b.pdf>' [21,30).
    const ref_doc = 'see [t][r] end\n\n[r]: <a b.pdf>\n';
    const state = make_state(ref_doc, 12); // inside 'end', outside the ref
    expect(snapshot(state)).toEqual([
      hide(4, 5),
      link(5, 6, 'a b.pdf'),
      hide(6, 10),
      def(16, 30),
    ]);
  });
});

describe('AUTO-R-1 AUTO-R-2 Autolink `<url>`', () => {
  // 'see <https://x.io> end\nzz\n'
  //  0123456789012345678901
  // Autolink at [4, 18); '<' at 4, URL at 5..17, '>' at 17.
  const doc = 'see <https://x.io> end\nzz\n';
  const caret_off = 24; // on 'zz' line
  const caret_inside = 6; // inside the autolink
  const caret_same_line_outside = 21; // on autolink's line but outside [4, 18)

  it('AUTO-R-2: hides the angle brackets when caret is outside the autolink', () => {
    const state = make_state(doc, caret_off);
    expect(snapshot(state)).toEqual([
      hide(4, 5),
      link(5, 17, 'https://x.io'),
      hide(17, 18),
    ]);
  });

  it('AUTO-I-1: reveals the brackets when caret is inside the autolink', () => {
    const state = make_state(doc, caret_inside);
    expect(snapshot(state)).toEqual([
      marker(4, 5),
      link(5, 17, 'https://x.io'),
      marker(17, 18),
    ]);
  });

  it('AUTO-I-2: keeps brackets hidden when caret is on the line but outside the autolink (caret-reveal, not line-reveal)', () => {
    const state = make_state(doc, caret_same_line_outside);
    expect(snapshot(state)).toEqual([
      hide(4, 5),
      link(5, 17, 'https://x.io'),
      hide(17, 18),
    ]);
  });

  it('restores marker-hiding after the caret leaves the autolink', () => {
    let state = make_state(doc, caret_inside);
    expect(snapshot(state)).toEqual([
      marker(4, 5),
      link(5, 17, 'https://x.io'),
      marker(17, 18),
    ]);
    state = state.update({ selection: { anchor: caret_off } }).state;
    expect(snapshot(state)).toEqual([
      hide(4, 5),
      link(5, 17, 'https://x.io'),
      hide(17, 18),
    ]);
  });
});

describe('relative-path link', () => {
  it('LINK-R-1: captures a relative href verbatim (host resolves against document.uri)', () => {
    // 'go [docs](./README.md) read\nzz\n'
    const doc = 'go [docs](./README.md) read\nzz\n';
    const state = make_state(doc, 30); // off the link line
    const link_deco = snapshot(state).find((d) => d.kind === 'link');
    expect(link_deco?.href).toBe('./README.md');
  });
});

// GFM bare-URL autolink — the Lezer parser emits a top-level `URL` node (no
// `Autolink` wrap); regression for bare URLs rendered as plain text
// because the autolink_handler only matched the `Autolink` shape.
describe('AUTO-R-4 AUTO-R-5 GFM bare-URL autolink', () => {
  it('AUTO-R-4: decorates a bare URL in a paragraph', () => {
    // 'see https://x.io end\nzz\n'
    //  012345678901234567890123
    // URL parses at [4, 16) — bare, no Autolink wrap, no LinkMark children.
    const doc = 'see https://x.io end\nzz\n';
    const state = make_state(doc, 22); // off-line
    expect(snapshot(state)).toEqual([link(4, 16, 'https://x.io')]);
  });

  it('AUTO-I-3 AUTO-I-5: renders identically whether the caret is inside or outside the bare URL', () => {
    const doc = 'see https://x.io end\nzz\n';
    const inside = snapshot(make_state(doc, 6));
    const outside = snapshot(make_state(doc, 22));
    // Bare URL has no syntactic markers to hide/reveal.
    expect(inside).toEqual(outside);
    expect(inside).toEqual([link(4, 16, 'https://x.io')]);
  });

  it('AUTO-E-2: decorates a www-prefixed bare URL', () => {
    const doc = 'www.example.com\nzz\n';
    const state = make_state(doc, 17); // off-line
    expect(snapshot(state)).toEqual([link(0, 15, 'www.example.com')]);
  });

  it('AUTO-E-3: decorates a bare email autolink', () => {
    const doc = 'mail user@example.com here\nzz\n';
    const state = make_state(doc, 28); // off-line
    const link_deco = snapshot(state).find((d) => d.kind === 'link');
    expect(link_deco?.href).toBe('user@example.com');
  });

  it('AUTO-E-8 AUTO-R-5: does NOT double-decorate the URL inside `<url>` angle-bracket autolink', () => {
    // The Autolink wrapper's URL child must not be claimed by the bare-URL handler.
    const doc = 'see <https://x.io> end\nzz\n';
    const state = make_state(doc, 24); // off-line
    const link_decos = snapshot(state).filter((d) => d.kind === 'link');
    expect(link_decos).toEqual([link(5, 17, 'https://x.io')]);
  });

  it('LINK-R-5: does NOT decorate the URL inside `[text](url)` inline link', () => {
    // The inline link decorates the bracketed text, not the URL child.
    const doc = 'a [t](https://x.io) b\nzz\n';
    const state = make_state(doc, 23); // off-line
    const link_decos = snapshot(state).filter((d) => d.kind === 'link');
    // One link decoration over the bracketed text at [3, 4), href from the URL child.
    expect(link_decos).toEqual([link(3, 4, 'https://x.io')]);
  });

  it('does NOT decorate the URL inside an `![alt](url)` image', () => {
    const doc = '![a](pic.png)\nzz\n';
    const state = make_state(doc, 15); // off-line
    const link_decos = snapshot(state).filter((d) => d.kind === 'link');
    expect(link_decos).toEqual([]);
  });

  it('AUTO-E-6: does NOT decorate the URL inside a `[label]: url` reference definition', () => {
    const doc = '[r]: https://x.io\nzz\n';
    const state = make_state(doc, 19); // off-line
    const link_decos = snapshot(state).filter((d) => d.kind === 'link');
    expect(link_decos).toEqual([]);
  });
});

describe('LINK-E-2 reference links `[text][ref]` / `[text][]`', () => {
  // 'see [text][ref] end\n\n[ref]: https://x.io\n'
  //  0    5    10   15   20    26        38
  // Link [4,15): '[' 4, text [5,9)='text', ']' 9, LinkLabel [10,15)='[ref]'.
  // LinkReference [21,40): the definition, url 'https://x.io' at [28,40).
  const full = 'see [text][ref] end\n\n[ref]: https://x.io\n';

  it('LINK-E-2 LINK-R-4: full ref off-caret hides `[` and `][ref]` and styles the text with the resolved href', () => {
    const state = make_state(full, 30); // caret on the definition line, off the ref
    expect(snapshot(state)).toEqual([
      hide(4, 5),
      link(5, 9, 'https://x.io'),
      hide(9, 15),
      def(21, 40),
    ]);
  });

  it('LINK-E-2 LINK-I-1: reveals both marker runs when the caret is inside the bracketed text', () => {
    const state = make_state(full, 6);
    expect(snapshot(state)).toEqual([
      marker(4, 5),
      link(5, 9, 'https://x.io'),
      marker(9, 15),
      def(21, 40),
    ]);
  });

  it('LINK-E-2 LINK-I-2: node-scoped — caret on the ref line but outside the ref keeps markers hidden', () => {
    const state = make_state(full, 17); // inside 'end', outside [4,15)
    expect(snapshot(state)).toEqual([
      hide(4, 5),
      link(5, 9, 'https://x.io'),
      hide(9, 15),
      def(21, 40),
    ]);
  });

  it('LINK-E-2 LINK-I-3: a selection strictly covering the ref on both sides keeps markers hidden', () => {
    const state = EditorState.create({
      doc: full,
      extensions: [markdown({ extensions: [GFM] })],
      selection: { anchor: 0, head: 19 }, // 0 < 4 and 19 > 15 (strict cover)
    });
    expect(snapshot(state)).toEqual([
      hide(4, 5),
      link(5, 9, 'https://x.io'),
      hide(9, 15),
      def(21, 40),
    ]);
  });

  it('LINK-E-2 LINK-I-4: moving the caret off the ref restores marker-hiding', () => {
    let state = make_state(full, 6);
    expect(snapshot(state)).toEqual([
      marker(4, 5),
      link(5, 9, 'https://x.io'),
      marker(9, 15),
      def(21, 40),
    ]);
    state = state.update({ selection: { anchor: 30 } }).state;
    expect(snapshot(state)).toEqual([
      hide(4, 5),
      link(5, 9, 'https://x.io'),
      hide(9, 15),
      def(21, 40),
    ]);
  });

  it('LINK-E-2: collapsed ref `[text][]` resolves against the bracketed text', () => {
    // 'go [text][] now\n\n[text]: https://x.io\n'
    // Link [3,11): '[' 3, text [4,8)='text', ']' 8, LinkLabel [9,11)='[]'.
    const collapsed = 'go [text][] now\n\n[text]: https://x.io\n';
    const state = make_state(collapsed, 30); // off the ref
    expect(snapshot(state)).toEqual([
      hide(3, 4),
      link(4, 8, 'https://x.io'),
      hide(8, 11),
      def(17, 37),
    ]);
  });

  it('LINK-E-2: case-insensitive resolution — `[Text][REF]` matches `[ref]:`', () => {
    // 'x [Text][REF] y\n\n[ref]: https://x.io\n'
    // Link [2,13): '[' 2, text [3,7)='Text', ']' 7, LinkLabel [8,13)='[REF]'.
    const doc = 'x [Text][REF] y\n\n[ref]: https://x.io\n';
    const state = make_state(doc, 25); // off the ref
    expect(snapshot(state)).toEqual([
      hide(2, 3),
      link(3, 7, 'https://x.io'),
      hide(7, 13),
      def(17, 36),
    ]);
  });

  it('LINK-E-2: case-insensitive collapsed resolution — `[Text][]` matches `[text]:`', () => {
    // 'x [Text][] y\n\n[text]: https://x.io\n'
    // Link [2,10): '[' 2, text [3,7)='Text', ']' 7, LinkLabel [8,10)='[]'.
    const doc = 'x [Text][] y\n\n[text]: https://x.io\n';
    const state = make_state(doc, 25); // off the ref
    expect(snapshot(state)).toEqual([
      hide(2, 3),
      link(3, 7, 'https://x.io'),
      hide(7, 10),
      def(14, 34),
    ]);
  });

  it('LINK-E-2: multiple definitions of a label — the first wins (CommonMark)', () => {
    // 'x [a][r] y\n\n[r]: https://first.io\n[r]: https://second.io\n'
    // Link [2,8): '[' 2, text [3,4)='a', ']' 4, LinkLabel [5,8)='[r]'.
    const doc = 'x [a][r] y\n\n[r]: https://first.io\n[r]: https://second.io\n';
    const state = make_state(doc, 20); // off the ref, on the first def line
    expect(snapshot(state)).toEqual([
      hide(2, 3),
      link(3, 4, 'https://first.io'),
      hide(4, 8),
      def(12, 33),
      def(34, 56),
    ]);
  });

  it('LINK-E-2: a definition may precede its reference (cross-block, backward resolution)', () => {
    // '[a]: https://early.io\n\nuse [a][a] now\n'
    // LinkReference [0,21); Link [27,33): '[' 27, text [28,29)='a', ']' 29, LinkLabel [30,33)='[a]'.
    const doc = '[a]: https://early.io\n\nuse [a][a] now\n';
    const state = make_state(doc, 10); // off the ref, on the def line
    expect(snapshot(state)).toEqual([
      def(0, 21),
      hide(27, 28),
      link(28, 29, 'https://early.io'),
      hide(29, 33),
    ]);
  });

  it('LINK-E-2: unresolved full ref (no matching definition) stays raw — no decoration', () => {
    const doc = 'see [text][missing] end\n';
    const state = make_state(doc, 22);
    expect(snapshot(state)).toEqual([]);
  });

  it('LINK-E-2: unresolved collapsed ref stays raw — no decoration', () => {
    const doc = 'see [text][] end\n';
    const state = make_state(doc, 15);
    expect(snapshot(state)).toEqual([]);
  });

  it('LINK-E-2: shortcut form `[text]` is excluded — left raw even when a definition exists', () => {
    // lezer emits a `Link` for every `[...]` in prose, so a shortcut is
    // indistinguishable from ordinary bracketed text except by resolution.
    const doc = 'see [text] end\n\n[text]: https://x.io\n';
    const state = make_state(doc, 12); // off the '[text]'
    // Only the definition line is dimmed; the shortcut '[text]' is untouched.
    expect(snapshot(state).filter((d) => d.kind !== 'definition')).toEqual([]);
  });
});

describe('LINK-E-3 reference definition lines `[ref]: url`', () => {
  // '[ref]: https://x.io\nzz\n' — LinkReference [0,19); paragraph 'zz' [20,22).
  const doc = '[ref]: https://x.io\nzz\n';

  it('LINK-E-3: the whole definition span is dimmed, and its URL is not link-decorated', () => {
    const state = make_state(doc, 21); // caret on the 'zz' line, off the definition
    expect(snapshot(state)).toEqual([def(0, 19)]);
  });

  it('LINK-E-3: dimming is caret-invariant — nothing is hidden and there is no reveal transition', () => {
    const on_line = make_state(doc, 3); // caret inside the definition
    expect(snapshot(on_line)).toEqual([def(0, 19)]);
    const off_line = make_state(doc, 21);
    expect(snapshot(off_line)).toEqual([def(0, 19)]);
  });
});
