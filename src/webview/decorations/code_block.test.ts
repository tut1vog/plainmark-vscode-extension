import { HighlightStyle } from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { build_inline_decorations, build_registry } from './inline_decorations.js';
import { code_block_handlers, plainmark_highlight_style } from './code_block.js';

function make_state(doc: string, anchor: number): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM] })],
    selection: { anchor },
  });
}

function make_state_sel(doc: string, anchor: number, head: number): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM] })],
    selection: { anchor, head },
  });
}

interface DecoSnapshot {
  from: number;
  to: number;
  class: string | undefined;
  data_language: string | null;
}

const registry = build_registry(code_block_handlers);

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

function lines(state: EditorState): DecoSnapshot[] {
  return snapshot(state).filter((d) => !d.class?.includes('marker'));
}

function markers(state: EditorState): DecoSnapshot[] {
  return snapshot(state).filter((d) => d.class?.includes('marker'));
}

describe('fenced code block — basic ts block', () => {
  it('emits header + body + footer line decorations with data-language="ts"', () => {
    const doc = '```ts\nfoo\n```\n';
    const state = make_state(doc, 0);
    const out = lines(state);

    expect(out.length).toBe(3);
    expect(out[0].class).toContain('plainmark-fenced-code-header');
    expect(out[0].data_language).toBe('ts');
    expect(out[1].class).toContain('plainmark-fenced-code');
    expect(out[1].class).not.toContain('plainmark-fenced-code-header');
    expect(out[1].class).not.toContain('plainmark-fenced-code-footer');
    expect(out[2].class).toContain('plainmark-fenced-code-footer');
  });
});

describe('fenced code block — empty info string', () => {
  it('omits data-language when no info string is present', () => {
    const doc = '```\nfoo\n```\n';
    const state = make_state(doc, 0);
    const out = lines(state);

    expect(out.length).toBe(3);
    expect(out[0].class).toContain('plainmark-fenced-code-header');
    expect(out[0].data_language).toBeNull();
  });
});

describe('fenced code block — whole-node fence reveal CBLK-I-1 CBLK-I-2', () => {
  // 'a'=0, '```ts'=2..7, 'foo'=8..11, '```'=12..15, 'b'=16
  const doc = 'a\n```ts\nfoo\n```\nb\n';

  it('hides both fences when the caret is outside the block (before)', () => {
    const m = markers(make_state(doc, 0));
    expect(m.length).toBe(2);
    expect(m[0].from).toBe(2);
    expect(m[0].to).toBe(7);
    expect(m[1].from).toBe(12);
    expect(m[1].to).toBe(15);
  });

  it('hides both fences when the caret is outside the block (after)', () => {
    expect(markers(make_state(doc, 16)).length).toBe(2);
  });

  it('reveals both fences when the caret is in the code body', () => {
    expect(markers(make_state(doc, 9)).length).toBe(0);
  });

  it('reveals both fences when the caret is on the opening fence', () => {
    expect(markers(make_state(doc, 4)).length).toBe(0);
  });

  it('reveals both fences when the caret is on the closing fence', () => {
    expect(markers(make_state(doc, 13)).length).toBe(0);
  });

  it('never emits the collapsed line class (reserved-space hide)', () => {
    for (const d of lines(make_state(doc, 0))) {
      expect(d.class).not.toContain('plainmark-fenced-code-collapsed');
    }
  });

  it('hides only the opening fence in an unclosed block when outside', () => {
    const m = markers(make_state('a\n```ts\nfoo\n', 0));
    expect(m.length).toBe(1);
    expect(m[0].from).toBe(2);
  });

  it('reveals the opening fence in an unclosed block when the caret is inside', () => {
    expect(markers(make_state('a\n```ts\nfoo\n', 9)).length).toBe(0);
  });
});

describe('fenced code block — selection-driven fence reveal CBLK-I-1 CBLK-I-3', () => {
  // 'a'=0, '```ts'=2..7, 'foo'=8..11, '```'=12..15, 'b'=16; FencedCode node = 2..15
  const doc = 'a\n```ts\nfoo\n```\nb\n';

  it('reveals both fences when the opening fence text is selected', () => {
    expect(markers(make_state_sel(doc, 2, 7)).length).toBe(0);
  });

  it('reveals both fences when the closing fence text is selected', () => {
    expect(markers(make_state_sel(doc, 12, 15)).length).toBe(0);
  });

  it('reveals both fences for a selection inside the code body', () => {
    expect(markers(make_state_sel(doc, 8, 11)).length).toBe(0);
  });

  it('reveals both fences for a selection partially overlapping the block', () => {
    expect(markers(make_state_sel(doc, 0, 9)).length).toBe(0);
  });

  it('reveals both fences for a selection exactly covering the block', () => {
    expect(markers(make_state_sel(doc, 2, 15)).length).toBe(0);
  });

  it('keeps both fences hidden under a strictly-covering selection (select-all)', () => {
    expect(markers(make_state_sel(doc, 0, 16)).length).toBe(2);
  });

  it('keeps both fences hidden for a selection entirely outside the block', () => {
    expect(markers(make_state_sel(doc, 16, 17)).length).toBe(2);
  });
});

describe('fenced code block — unknown language', () => {
  it('renders the raw user info string verbatim on data-language', () => {
    const doc = '```doesnotexist\nfoo\n```\n';
    const state = make_state(doc, 0);
    const out = snapshot(state);

    expect(out[0].data_language).toBe('doesnotexist');
  });

  it('preserves the user raw bytes — `ts` stays `ts`, not canonicalized', () => {
    const doc = '```ts\nfoo\n```\n';
    const state = make_state(doc, 0);
    const out = snapshot(state);
    expect(out[0].data_language).toBe('ts');
  });
});

describe('indented (4-space) code block', () => {
  it('emits plainmark-indented-code line decorations', () => {
    // A blank line is required before an indented code block per CommonMark.
    const doc = 'paragraph\n\n    const x = 1;\n    const y = 2;\n';
    const state = make_state(doc, 0);
    const out = snapshot(state);

    expect(out.length).toBe(2);
    expect(out[0].class).toContain('plainmark-indented-code');
    expect(out[0].class).toContain('plainmark-indented-code-first');
    expect(out[1].class).toContain('plainmark-indented-code');
    expect(out[1].class).toContain('plainmark-indented-code-last');
  });

  it('single-line indented block uses the first-line class', () => {
    const doc = 'paragraph\n\n    const x = 1;\n';
    const state = make_state(doc, 0);
    const out = snapshot(state);

    expect(out.length).toBe(1);
    expect(out[0].class).toContain('plainmark-indented-code-first');
  });
});

describe('plainmark_highlight_style', () => {
  it('is a defined HighlightStyle', () => {
    expect(plainmark_highlight_style).toBeInstanceOf(HighlightStyle);
  });
});
