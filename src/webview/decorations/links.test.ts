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
  kind: 'link' | 'marker' | 'hidden';
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
