import { markdown } from '@codemirror/lang-markdown';
import { EditorState, type Extension } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { blockquote_handlers, marker_metrics_field } from './blockquote.js';
import { build_inline_decorations, build_registry } from './inline_decorations.js';

interface LineDeco {
  from: number;
  class?: string;
  style?: string;
}
interface MarkDeco {
  from: number;
  to: number;
}

// Caret on the first (non-callout) line keeps every `>` hidden and the title
// widget rendered, so the geometry decorations are the only variable.
function build(
  doc: string,
  opts: { measured?: boolean } = {},
): { lines: LineDeco[]; nest_marks: MarkDeco[] } {
  const extensions: Extension[] = [markdown({ extensions: [GFM] })];
  extensions.push(
    opts.measured === false
      ? marker_metrics_field
      : marker_metrics_field.init(() => ({ gt: 7, space: 4 })),
  );
  const state = EditorState.create({ doc, extensions, selection: { anchor: 0 } });
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
      if (spec.class?.includes('plainmark-callout-header') || spec.class?.includes('plainmark-callout-body')) {
        lines.push({ from, class: spec.class, style: spec.attributes?.style });
      }
    } else if (!spec.class && !(spec as { widget?: unknown }).widget) {
      // The nest-indent hide is the only widgetless, classless replace here.
      nest_marks.push({ from, to });
    }
  });
  lines.sort((a, b) => a.from - b.from);
  nest_marks.sort((a, b) => a.from - b.from);
  return { lines, nest_marks };
}

describe('CALL-R-12: list-nested callout takes content-column geometry', () => {
  it('marks header and body lines nested at depth 1 and hides the indent on each', () => {
    // '- a'=0..3, '  > [!NOTE] t'=4..17, '  > body'=18..26
    const { lines, nest_marks } = build('- a\n  > [!NOTE] t\n  > body\n');
    expect(lines).toEqual([
      {
        from: 4,
        class: 'plainmark-callout plainmark-callout-header plainmark-callout-nested',
        style: '--plainmark-quote-nest:1;padding-left:11px;text-indent:-11px',
      },
      {
        from: 18,
        class: 'plainmark-callout plainmark-callout-body plainmark-callout-nested',
        style: '--plainmark-quote-nest:1;padding-left:11px;text-indent:-11px',
      },
    ]);
    expect(nest_marks).toEqual([
      { from: 4, to: 6 },
      { from: 18, to: 20 },
    ]);
  });

  it('carries the uncapped depth for a callout two list levels down', () => {
    const { lines } = build('- a\n  - b\n    > [!TIP] t\n');
    expect(lines).toHaveLength(1);
    expect(lines[0].style).toBe('--plainmark-quote-nest:2;padding-left:11px;text-indent:-11px');
  });

  it('keeps the nest variable before measurement', () => {
    const { lines } = build('- a\n  > [!NOTE] t\n', { measured: false });
    expect(lines).toHaveLength(1);
    expect(lines[0].class).toContain('plainmark-callout-nested');
    expect(lines[0].style).toBe('--plainmark-quote-nest:1');
  });

  it('emits no nested geometry for a top-level callout', () => {
    const { lines, nest_marks } = build('x\n> [!NOTE] t\n> body\n');
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line.class).not.toContain('plainmark-callout-nested');
      expect(line.style).toBe('padding-left:11px;text-indent:-11px');
    }
    expect(nest_marks).toEqual([]);
  });

  it('hides a top-level callout indent without list geometry', () => {
    const { lines, nest_marks } = build('x\n  > [!NOTE] t\n');
    expect(lines[0].class).not.toContain('plainmark-callout-nested');
    expect(lines[0].style).toBe('padding-left:11px;text-indent:-11px');
    expect(nest_marks).toEqual([{ from: 2, to: 4 }]);
  });

  it('emits no nested geometry for a callout in a list inside a quote', () => {
    const { lines, nest_marks } = build('> - a\n>   > [!NOTE] t\n');
    for (const line of lines) {
      expect(line.class).not.toContain('plainmark-callout-nested');
      expect(line.style ?? '').not.toContain('--plainmark-quote-nest');
    }
    expect(nest_marks).toEqual([]);
  });
});
