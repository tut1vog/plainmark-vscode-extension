import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { frontmatter_extension as frontmatter_grammar } from '../grammar/frontmatter.js';
import { build_inline_decorations, build_registry } from './inline_decorations.js';
import { frontmatter_handlers } from './frontmatter.js';

function make_state(doc: string, anchor: number): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM, frontmatter_grammar] })],
    selection: { anchor },
  });
}

function make_state_sel(doc: string, anchor: number, head: number): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM, frontmatter_grammar] })],
    selection: { anchor, head },
  });
}

interface DecoSnapshot {
  from: number;
  to: number;
  class: string | undefined;
  data_language: string | null;
}

const registry = build_registry(frontmatter_handlers);

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
    out.push({
      from,
      to,
      class: spec.class,
      data_language: spec.attributes?.['data-language'] ?? null,
    });
  });
  out.sort((a, b) => a.from - b.from);
  return out;
}

function markers(state: EditorState): DecoSnapshot[] {
  return snapshot(state).filter((d) => d.class?.includes('marker'));
}

describe('frontmatter decoration handler — basic', () => {
  it('FM-R-4 FM-R-5: emits header (with data-language="yaml") + body + footer line decorations', () => {
    const doc = '---\nfoo: bar\n---\n';
    const out = snapshot(make_state(doc, 0));

    expect(out).toHaveLength(3);
    expect(out[0].class).toBe('plainmark-frontmatter-header');
    expect(out[0].data_language).toBe('yaml');
    expect(out[1].class).toBe('plainmark-frontmatter');
    expect(out[2].class).toBe('plainmark-frontmatter-footer');
  });

  it('FM-R-4: emits multiple body lines for multi-line frontmatter', () => {
    const doc = '---\ntitle: foo\ndate: 2026-05-19\ntags:\n  - a\n---\n';
    const out = snapshot(make_state(doc, 0));

    expect(out[0].class).toBe('plainmark-frontmatter-header');
    expect(out[out.length - 1].class).toBe('plainmark-frontmatter-footer');
    const body_count = out.filter((d) => d.class === 'plainmark-frontmatter').length;
    expect(body_count).toBe(4);
  });

  it('FM-E-2 FM-R-4: emits header + footer with no body for empty frontmatter', () => {
    const doc = '---\n---\n';
    const out = snapshot(make_state(doc, 0));

    // caret at offset 0 sits on the opening fence → block is revealed, no hide-marks
    expect(out).toHaveLength(2);
    expect(out[0].class).toBe('plainmark-frontmatter-header');
    expect(out[0].data_language).toBe('yaml');
    expect(out[1].class).toBe('plainmark-frontmatter-footer');
  });
});

describe('frontmatter — whole-node fence reveal FM-R-6 FM-I-4 FM-I-5', () => {
  // '---'=0..3, 'foo: bar'=4..12, '---'=13..16, '# H'=17..20; FrontMatter node = 0..16
  const doc = '---\nfoo: bar\n---\n# H\n';

  it('FM-I-4: hides both --- fences when the caret is outside the block', () => {
    const m = markers(make_state(doc, 18));
    expect(m.length).toBe(2);
    expect(m[0].from).toBe(0);
    expect(m[0].to).toBe(3);
    expect(m[1].from).toBe(13);
    expect(m[1].to).toBe(16);
  });

  it('FM-I-4: reveals both --- fences when the caret is in the YAML body', () => {
    expect(markers(make_state(doc, 6)).length).toBe(0);
  });

  it('FM-I-4: reveals both --- fences when the caret is on the opening fence', () => {
    expect(markers(make_state(doc, 1)).length).toBe(0);
  });

  it('FM-I-4: reveals both --- fences when the caret is on the closing fence', () => {
    expect(markers(make_state(doc, 14)).length).toBe(0);
  });

  it('FM-I-5: header/footer line decorations still emit while fences are hidden', () => {
    const all = snapshot(make_state(doc, 18));
    expect(all.some((d) => d.class === 'plainmark-frontmatter-header')).toBe(true);
    expect(all.some((d) => d.class === 'plainmark-frontmatter-footer')).toBe(true);
    expect(all.filter((d) => d.class === 'plainmark-frontmatter-marker').length).toBe(2);
  });
});

describe('frontmatter — selection-driven fence reveal FM-I-4 FM-E-9', () => {
  // '---'=0..3, 'foo: bar'=4..12, '---'=13..16, '# H'=17..20; FrontMatter node = 0..16
  const doc = '---\nfoo: bar\n---\n# H\n';

  it('reveals both fences when the opening --- is selected', () => {
    expect(markers(make_state_sel(doc, 0, 3)).length).toBe(0);
  });

  it('reveals both fences for a selection inside the YAML body', () => {
    expect(markers(make_state_sel(doc, 4, 12)).length).toBe(0);
  });

  it('keeps both fences hidden for a selection entirely outside the block', () => {
    expect(markers(make_state_sel(doc, 17, 20)).length).toBe(2);
  });

  it('FM-E-9: select-all reveals the fences (doc-start block can never be strict-covered)', () => {
    expect(markers(make_state_sel(doc, 0, doc.length)).length).toBe(0);
  });
});
