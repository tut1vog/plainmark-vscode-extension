import { markdown } from '@codemirror/lang-markdown';
import { EditorState, type Extension } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import {
  blockquote_handlers,
  hanging_indent_px,
  type MarkerMetrics,
  marker_metrics_field,
  quote_prefix_counts,
} from './blockquote.js';
import { build_inline_decorations, build_registry } from './inline_decorations.js';

// BQ-R-12: the per-line hanging indent is a lexical scan of the line's leading
// `>`/whitespace run (quote_prefix_counts) turned into an advance
// `gtCount·gt + wsCount·space` (hanging_indent_px), written as an inline
// `padding-left:<x>px;text-indent:-<x>px` on the line decoration.

describe('quote_prefix_counts BQ-R-12', () => {
  it('counts a tight marker with no space (>x)', () => {
    expect(quote_prefix_counts('>x')).toEqual({ gt: 1, ws: 0 });
  });

  it('counts a spaced marker (> x)', () => {
    expect(quote_prefix_counts('> x')).toEqual({ gt: 1, ws: 1 });
  });

  it('counts nested markers and their interleaved spaces (> > x)', () => {
    expect(quote_prefix_counts('> > x')).toEqual({ gt: 2, ws: 2 });
  });

  it('counts a tight nested marker (>>x)', () => {
    expect(quote_prefix_counts('>>x')).toEqual({ gt: 2, ws: 0 });
  });

  it('counts a tab in the prefix as one whitespace advance', () => {
    expect(quote_prefix_counts('>\tx')).toEqual({ gt: 1, ws: 1 });
  });

  it('counts intentional leading content spaces after the marker (>   x)', () => {
    expect(quote_prefix_counts('>   x')).toEqual({ gt: 1, ws: 3 });
  });

  it('stops the scan at the first non-marker, non-space glyph', () => {
    expect(quote_prefix_counts('> a > b')).toEqual({ gt: 1, ws: 1 });
  });

  it('returns zero counts for a line with no leading marker', () => {
    expect(quote_prefix_counts('plain text')).toEqual({ gt: 0, ws: 0 });
  });
});

describe('hanging_indent_px BQ-R-12', () => {
  const metrics: MarkerMetrics = { gt: 7, space: 4 };

  it('sums gtCount·gt + wsCount·space', () => {
    expect(hanging_indent_px(1, 1, metrics)).toBe(11);
    expect(hanging_indent_px(2, 2, metrics)).toBe(22);
  });

  it('is zero when there is no prefix', () => {
    expect(hanging_indent_px(0, 0, metrics)).toBe(0);
  });

  it('weights the two advances independently', () => {
    // 1 `>` glyph only (tight marker) vs 1 space only.
    expect(hanging_indent_px(1, 0, metrics)).toBe(7);
    expect(hanging_indent_px(0, 1, metrics)).toBe(4);
  });

  it('rounds the fractional advance to two decimal places', () => {
    expect(hanging_indent_px(1, 1, { gt: 7.333, space: 4.111 })).toBe(11.44);
  });
});

describe('blockquote line decoration — measured-indent branch BQ-R-12', () => {
  function line_decos(doc: string, metrics: MarkerMetrics | null) {
    const extensions: Extension[] = [markdown({ extensions: [GFM] })];
    // metrics.gt > 0 selects the measured inline-style branch; the default
    // { gt: 0 } field value keeps the class-only pre-measure fallback.
    extensions.push(metrics ? marker_metrics_field.init(() => metrics) : marker_metrics_field);
    const state = EditorState.create({ doc, extensions, selection: { anchor: doc.length } });
    const set = build_inline_decorations(
      state,
      [{ from: 0, to: state.doc.length }],
      build_registry(blockquote_handlers),
    );
    const out: { from: number; class?: string; depth?: string; style?: string }[] = [];
    set.between(0, state.doc.length, (from, to, deco) => {
      if (from !== to) return; // line decorations are zero-width
      const spec = deco.spec as {
        class?: string;
        attributes?: Record<string, string>;
      };
      out.push({
        from,
        class: spec.class,
        depth: spec.attributes?.['data-blockquote-depth'],
        style: spec.attributes?.style,
      });
    });
    return out;
  }

  it('writes the measured px as an inline padding-left/text-indent once metrics are known', () => {
    // `> quote` → gt 1, ws 1 → 1·7 + 1·4 = 11px.
    const decos = line_decos('> quote\n', { gt: 7, space: 4 });
    expect(decos).toHaveLength(1);
    expect(decos[0].depth).toBe('1');
    expect(decos[0].style).toBe('--plainmark-quote-bar-step:11px;padding-left:11px;text-indent:-11px');
  });

  it('falls back to the class-only decoration (no inline style) before measurement', () => {
    const decos = line_decos('> quote\n', null);
    expect(decos).toHaveLength(1);
    expect(decos[0].depth).toBe('1');
    expect(decos[0].style).toBeUndefined();
  });
});

describe('quoted list line indent — depth-driven units BQ-R-12 LIST-R-11', () => {
  function line_styles(doc: string): Array<string | undefined> {
    const state = EditorState.create({
      doc,
      extensions: [
        markdown({ extensions: [GFM] }),
        marker_metrics_field.init(() => ({ gt: 7, space: 4 })),
      ],
      selection: { anchor: doc.length },
    });
    const set = build_inline_decorations(
      state,
      [{ from: 0, to: state.doc.length }],
      build_registry(blockquote_handlers),
    );
    const out: Array<string | undefined> = [];
    set.between(0, state.doc.length, (from, to, deco) => {
      if (from !== to) return;
      out.push((deco.spec as { attributes?: Record<string, string> }).attributes?.style);
    });
    return out;
  }

  it('adds one indent unit on a depth-0 list line, counting only the quote prefix', () => {
    // '> - a' — prefix '> ' → 1·7 + 1·4 = 11px, plus 1 unit for the marker slot
    expect(line_styles('> - a\n')).toEqual([
      '--plainmark-quote-bar-step:11px;padding-left:calc(11px + 1 * var(--plainmark-list-indent, 1em));text-indent:calc(-1 * calc(11px + 1 * var(--plainmark-list-indent, 1em)))',
    ]);
  });

  it('adds depth+1 units on a nested list line, excluding the nesting spaces from the px', () => {
    // line 2 '>   - n' — prefix-only counts stay gt 1, ws 1 (11px); 2 units
    expect(line_styles('> - a\n>   - n\n')).toEqual([
      '--plainmark-quote-bar-step:11px;padding-left:calc(11px + 1 * var(--plainmark-list-indent, 1em));text-indent:calc(-1 * calc(11px + 1 * var(--plainmark-list-indent, 1em)))',
      '--plainmark-quote-bar-step:11px;padding-left:calc(11px + 2 * var(--plainmark-list-indent, 1em));text-indent:calc(-1 * calc(11px + 2 * var(--plainmark-list-indent, 1em)))',
    ]);
  });

  it('keeps the plain px form on a non-list quote line, counting the full literal run', () => {
    // '>   x' — not a list; intentional content spaces stay counted: 1·7 + 3·4 = 19px
    expect(line_styles('>   x\n')).toEqual(['--plainmark-quote-bar-step:11px;padding-left:19px;text-indent:-19px']);
  });

  it('keeps the plain px form on a list item continuation line', () => {
    // line 2 '>   cont' is ListItem content but has no ListMark of its own
    expect(line_styles('> - a\n>   cont\n')).toEqual([
      '--plainmark-quote-bar-step:11px;padding-left:calc(11px + 1 * var(--plainmark-list-indent, 1em));text-indent:calc(-1 * calc(11px + 1 * var(--plainmark-list-indent, 1em)))',
      '--plainmark-quote-bar-step:11px;padding-left:19px;text-indent:-19px',
    ]);
  });
});
