import { markdown } from '@codemirror/lang-markdown';
import { EditorState, type Extension } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { blockquote_handlers, marker_metrics_field, nest_indent_len } from './blockquote.js';
import { build_inline_decorations, build_registry } from './inline_decorations.js';

interface LineDeco {
  from: number;
  class?: string;
  style?: string;
}
interface MarkDeco {
  from: number;
  to: number;
  class?: string;
}

function build(
  doc: string,
  opts: { anchor?: number; measured?: boolean } = {},
): { lines: LineDeco[]; nest_marks: MarkDeco[] } {
  const extensions: Extension[] = [markdown({ extensions: [GFM] })];
  extensions.push(
    opts.measured === false
      ? marker_metrics_field
      : marker_metrics_field.init(() => ({ gt: 7, space: 4 })),
  );
  const state = EditorState.create({
    doc,
    extensions,
    selection: { anchor: opts.anchor ?? doc.length },
  });
  const set = build_inline_decorations(
    state,
    [{ from: 0, to: state.doc.length }],
    build_registry(blockquote_handlers),
  );
  const lines: LineDeco[] = [];
  const nest_marks: MarkDeco[] = [];
  set.between(0, state.doc.length, (from, to, deco) => {
    const spec = deco.spec as { class?: string; attributes?: Record<string, string> };
    if (from === to) {
      lines.push({ from, class: spec.class, style: spec.attributes?.style });
    } else if (!spec.class && !(spec as { widget?: unknown }).widget) {
      // The nest-indent hide is the handler's only widgetless, classless replace.
      nest_marks.push({ from, to });
    }
  });
  lines.sort((a, b) => a.from - b.from);
  nest_marks.sort((a, b) => a.from - b.from);
  return { lines, nest_marks };
}

describe('nest_indent_len BQ-R-14', () => {
  it('measures the whitespace run before the first `>`', () => {
    expect(nest_indent_len('  > q')).toBe(2);
    expect(nest_indent_len('\t> q')).toBe(1);
    expect(nest_indent_len('> q')).toBe(0);
  });

  it('is zero on a marker-less line — leading spaces there are content', () => {
    expect(nest_indent_len('   lazy')).toBe(0);
    expect(nest_indent_len('')).toBe(0);
  });
});

describe('BQ-R-14: list-nested blockquote takes content-column geometry', () => {
  it('marks a quote under a bullet item nested at depth 1 and hides its indent', () => {
    // '- a'=0..3, '  > q'=4..9
    const { lines, nest_marks } = build('- a\n  > q\n');
    expect(lines).toEqual([
      {
        from: 4,
        class:
          'plainmark-blockquote plainmark-collapse-adjacent plainmark-blockquote-first plainmark-blockquote-nested',
        style:
          '--plainmark-quote-bar-step:11px;--plainmark-quote-nest:1;padding-left:11px;text-indent:-11px',
      },
    ]);
    expect(nest_marks).toEqual([{ from: 4, to: 6 }]);
  });

  it('carries the nest on every line of a quote under an ordered item', () => {
    // '1. a'=0..4, '   > q'=5..11, '   > r'=12..18
    const { lines, nest_marks } = build('1. a\n   > q\n   > r\n');
    expect(lines.map((l) => l.from)).toEqual([5, 12]);
    for (const line of lines) {
      expect(line.class).toContain('plainmark-blockquote-nested');
      expect(line.style).toContain('--plainmark-quote-nest:1;');
    }
    expect(nest_marks).toEqual([
      { from: 5, to: 8 },
      { from: 12, to: 15 },
    ]);
  });

  it('carries the uncapped depth for a quote two list levels down', () => {
    // '- a'=0..3, '  - b'=4..9, '    > q'=10..17
    const { lines, nest_marks } = build('- a\n  - b\n    > q\n');
    expect(lines).toHaveLength(1);
    expect(lines[0].style).toBe(
      '--plainmark-quote-bar-step:11px;--plainmark-quote-nest:2;padding-left:11px;text-indent:-11px',
    );
    expect(nest_marks).toEqual([{ from: 10, to: 14 }]);
  });

  it('steps a quoted list line only by the levels inside the quote', () => {
    // '  > - x': the marker has two ListItem ancestors, one of which encloses
    // the quote and is already on the border — one unit remains for the hang.
    const { lines } = build('- a\n  > - x\n');
    expect(lines[0].style).toBe(
      '--plainmark-quote-bar-step:11px;--plainmark-quote-nest:1;padding-left:calc(11px + 1 * var(--plainmark-list-indent, 1em));text-indent:calc(-1 * calc(11px + 1 * var(--plainmark-list-indent, 1em)))',
    );
  });

  it('hides a top-level quote indent without list geometry', () => {
    const { lines, nest_marks } = build('  > q\n');
    expect(lines).toHaveLength(1);
    expect(lines[0].class).not.toContain('plainmark-blockquote-nested');
    expect(lines[0].style).toBe('--plainmark-quote-bar-step:11px;padding-left:11px;text-indent:-11px');
    expect(nest_marks).toEqual([{ from: 0, to: 2 }]);
  });

  it('keeps the nested class and the nest variable before measurement', () => {
    const { lines } = build('- a\n  > q\n', { measured: false });
    expect(lines).toEqual([
      {
        from: 4,
        class:
          'plainmark-blockquote plainmark-collapse-adjacent plainmark-blockquote-first plainmark-blockquote-nested',
        style: '--plainmark-quote-nest:1',
      },
    ]);
  });

  it('never reveals the hidden indent when the caret is on the line', () => {
    const { nest_marks } = build('- a\n  > q\n', { anchor: 8 });
    expect(nest_marks).toEqual([{ from: 4, to: 6 }]);
  });

  it('nests a quote opening on the item marker line and scans the prefix from its `>`', () => {
    // '- > q'=0..5, '  > r'=6..11 — the list handler owns `- `, so only line 2 hides.
    const { lines, nest_marks } = build('- > q\n  > r\n');
    expect(lines.map((l) => l.from)).toEqual([0, 6]);
    for (const line of lines) {
      expect(line.class).toContain('plainmark-blockquote-nested');
      expect(line.style).toBe(
        '--plainmark-quote-bar-step:11px;--plainmark-quote-nest:1;padding-left:11px;text-indent:-11px',
      );
    }
    expect(nest_marks).toEqual([{ from: 6, to: 8 }]);
  });

  it('leaves a nested marker line prefix to the list handler', () => {
    // '  - > q'=4..11 under '- a': the run before `>` is indent + marker, not pure indent.
    const { lines, nest_marks } = build('- a\n  - > q\n');
    expect(lines[0].style).toBe(
      '--plainmark-quote-bar-step:11px;--plainmark-quote-nest:2;padding-left:11px;text-indent:-11px',
    );
    expect(nest_marks).toEqual([]);
  });

  it('emits no nested geometry for a flush top-level quote', () => {
    const { lines, nest_marks } = build('> q\n');
    expect(lines[0].class).not.toContain('plainmark-blockquote-nested');
    expect(lines[0].style).toBe('--plainmark-quote-bar-step:11px;padding-left:11px;text-indent:-11px');
    expect(nest_marks).toEqual([]);
  });
});

describe('BQ-E-14: a quote inside a quoted list keeps quoted geometry', () => {
  it('emits no nested class and no indent hide for the inner quote', () => {
    // '> - a'=0..5, '>   > q'=6..13
    const { lines, nest_marks } = build('> - a\n>   > q\n');
    for (const line of lines) {
      expect(line.class).not.toContain('plainmark-blockquote-nested');
      expect(line.style ?? '').not.toContain('--plainmark-quote-nest');
    }
    expect(nest_marks).toEqual([]);
  });

  it('decorates each line once — the inner quote handler yields to the outer', () => {
    const { lines } = build('> - a\n>   > q\n>   > r\n');
    expect(lines.map((l) => l.from)).toEqual([0, 6, 14]);
    expect(lines[1].class ?? '').not.toContain('plainmark-blockquote-first');
    expect(lines[2].class ?? '').not.toContain('plainmark-blockquote-first');
  });
});
