import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import {
  MermaidBlockPreviewWidget,
  MermaidWidget,
  find_mermaid_blocks,
  mermaid_cache_field,
  mermaid_cache_key,
  mermaid_theme_field,
  mermaid_widgets_field,
  set_mermaid_result,
  set_mermaid_theme,
  type MermaidResult,
} from './mermaid.js';

function make_state(doc: string, cursor: number = doc.length): EditorState {
  return EditorState.create({
    doc,
    extensions: [
      markdown({ extensions: [GFM] }),
      mermaid_cache_field,
      mermaid_theme_field,
      mermaid_widgets_field,
    ],
    selection: { anchor: cursor },
  });
}

interface DecoSnapshot {
  from: number;
  to: number;
  block: boolean;
  widget: MermaidWidget;
}

function decorations(state: EditorState): DecoSnapshot[] {
  const out: DecoSnapshot[] = [];
  state.field(mermaid_widgets_field).between(0, state.doc.length, (from, to, deco) => {
    const w = (deco.spec as { widget?: unknown }).widget;
    if (w instanceof MermaidWidget) {
      out.push({ from, to, block: deco.spec.block === true, widget: w });
    }
  });
  return out;
}

const DIAGRAM = '```mermaid\ngraph TD\nA-->B\n```\n';

describe('mermaid_cache_key MMD-R-6', () => {
  it('joins theme and src', () => {
    expect(mermaid_cache_key('light', 'graph TD')).toBe('light:graph TD');
  });

  it('produces distinct keys per theme for the same src', () => {
    expect(mermaid_cache_key('light', 'x')).not.toBe(mermaid_cache_key('dark', 'x'));
  });
});

describe('MermaidWidget.ignoreEvent MMD-I-3', () => {
  it('returns false so a click places the caret inside the block', () => {
    expect(new MermaidWidget('x', 'light', null).ignoreEvent()).toBe(false);
  });
});

describe('MermaidWidget.eq MMD-R-7', () => {
  const ok: MermaidResult = { ok: true, svg: '<svg>a</svg>' };

  it('true when src, theme and result match', () => {
    expect(new MermaidWidget('x', 'light', ok).eq(new MermaidWidget('x', 'light', ok))).toBe(true);
  });

  it('true when both results are null placeholders', () => {
    expect(
      new MermaidWidget('x', 'light', null).eq(new MermaidWidget('x', 'light', null)),
    ).toBe(true);
  });

  it('false when src differs', () => {
    expect(
      new MermaidWidget('x', 'light', null).eq(new MermaidWidget('y', 'light', null)),
    ).toBe(false);
  });

  it('false when theme differs', () => {
    expect(
      new MermaidWidget('x', 'light', null).eq(new MermaidWidget('x', 'dark', null)),
    ).toBe(false);
  });

  it('false when one is a placeholder and the other is resolved', () => {
    expect(new MermaidWidget('x', 'light', null).eq(new MermaidWidget('x', 'light', ok))).toBe(
      false,
    );
  });

  it('false when the rendered svg differs', () => {
    const other: MermaidResult = { ok: true, svg: '<svg>b</svg>' };
    expect(new MermaidWidget('x', 'light', ok).eq(new MermaidWidget('x', 'light', other))).toBe(
      false,
    );
  });

  it('false when one result is ok and the other is an error', () => {
    const err: MermaidResult = { ok: false, message: 'bad' };
    expect(new MermaidWidget('x', 'light', ok).eq(new MermaidWidget('x', 'light', err))).toBe(
      false,
    );
  });

  it('false when error messages differ', () => {
    const e1: MermaidResult = { ok: false, message: 'one' };
    const e2: MermaidResult = { ok: false, message: 'two' };
    expect(new MermaidWidget('x', 'light', e1).eq(new MermaidWidget('x', 'light', e2))).toBe(
      false,
    );
  });
});

describe('find_mermaid_blocks MMD-R-2 MMD-E-2', () => {
  it('detects a ```mermaid fenced block and extracts its source', () => {
    const blocks = find_mermaid_blocks(make_state(DIAGRAM));
    expect(blocks).toHaveLength(1);
    expect(blocks[0].src.trim()).toBe('graph TD\nA-->B');
  });

  it('is case-insensitive on the info string', () => {
    expect(find_mermaid_blocks(make_state('```Mermaid\ngraph TD\n```\n'))).toHaveLength(1);
  });

  it('ignores a non-mermaid fenced block', () => {
    expect(find_mermaid_blocks(make_state('```js\nconst x = 1;\n```\n'))).toHaveLength(0);
  });

  it('ignores a fenced block with no info string', () => {
    expect(find_mermaid_blocks(make_state('```\nplain\n```\n'))).toHaveLength(0);
  });
});

describe('mermaid_widgets_field — decoration emission MMD-R-1 MMD-I-1 MMD-SP-1 MMD-SP-3 MMD-E-4', () => {
  it('emits a block widget for a mermaid fence with the caret outside', () => {
    const decos = decorations(make_state(DIAGRAM));
    expect(decos).toHaveLength(1);
    expect(decos[0].block).toBe(true);
    expect(decos[0].widget.src.trim()).toBe('graph TD\nA-->B');
    expect(decos[0].widget.result).toBeNull();
  });

  it('skips the widget when the caret is inside the block', () => {
    const state = make_state(DIAGRAM, DIAGRAM.indexOf('graph'));
    expect(decorations(state)).toHaveLength(0);
  });

  it('emits an in-flow preview widget when a bare caret sits inside the block', () => {
    const state = make_state(DIAGRAM, DIAGRAM.indexOf('graph'));
    let preview: MermaidBlockPreviewWidget | null = null;
    state.field(mermaid_widgets_field).between(0, state.doc.length, (_from, _to, deco) => {
      const w = (deco.spec as { widget?: unknown }).widget;
      if (w instanceof MermaidBlockPreviewWidget) preview = w;
    });
    expect(preview).not.toBeNull();
    expect((preview as unknown as MermaidBlockPreviewWidget).src.trim()).toBe(
      'graph TD\nA-->B',
    );
  });

  it('emits no decoration when a non-empty selection overlaps the block', () => {
    const state = make_state(DIAGRAM).update({
      selection: { anchor: 0, head: DIAGRAM.length },
    }).state;
    let count = 0;
    state.field(mermaid_widgets_field).between(0, state.doc.length, () => {
      count += 1;
    });
    expect(count).toBe(0);
  });

  it('emits no widget for a non-mermaid fenced block', () => {
    expect(decorations(make_state('```js\nconst x = 1;\n```\n'))).toHaveLength(0);
  });

  it('emits widgets for multiple mermaid blocks', () => {
    expect(decorations(make_state(`${DIAGRAM}\n${DIAGRAM}`))).toHaveLength(2);
  });

  it('emits a resolved widget once the cache holds a result for the src', () => {
    let state = make_state(DIAGRAM);
    const src = decorations(state)[0].widget.src;
    const theme = state.field(mermaid_theme_field);
    state = state.update({
      effects: set_mermaid_result.of({ theme, src, result: { ok: true, svg: '<svg>x</svg>' } }),
    }).state;
    expect(decorations(state)[0].widget.result).toEqual({ ok: true, svg: '<svg>x</svg>' });
  });

  it('keeps the placeholder when the cache holds an entry for another theme', () => {
    let state = make_state(DIAGRAM);
    const src = decorations(state)[0].widget.src;
    state = state.update({
      effects: set_mermaid_result.of({ theme: 'other', src, result: { ok: true, svg: '<svg/>' } }),
    }).state;
    expect(decorations(state)[0].widget.result).toBeNull();
  });

  it('rebuilds widgets when the theme changes', () => {
    let state = make_state(DIAGRAM);
    expect(decorations(state)[0].widget.theme).toBe('light');
    state = state.update({ effects: set_mermaid_theme.of('dark') }).state;
    expect(decorations(state)[0].widget.theme).toBe('dark');
  });

  it('does not modify the document text', () => {
    expect(make_state(DIAGRAM).doc.toString()).toBe(DIAGRAM);
  });
});

describe('mermaid_cache_field MMD-R-6', () => {
  it('starts empty', () => {
    expect(make_state('').field(mermaid_cache_field).size).toBe(0);
  });

  it('records a result under the theme:src key', () => {
    let state = make_state(DIAGRAM);
    state = state.update({
      effects: set_mermaid_result.of({
        theme: 'light',
        src: 'g',
        result: { ok: true, svg: '<svg/>' },
      }),
    }).state;
    expect(state.field(mermaid_cache_field).get('light:g')).toEqual({ ok: true, svg: '<svg/>' });
  });

  it('preserves prior entries when a new one lands', () => {
    let state = make_state(DIAGRAM);
    state = state.update({
      effects: set_mermaid_result.of({
        theme: 'light',
        src: 'a',
        result: { ok: false, message: 'e' },
      }),
    }).state;
    state = state.update({
      effects: set_mermaid_result.of({
        theme: 'light',
        src: 'b',
        result: { ok: true, svg: '<svg/>' },
      }),
    }).state;
    const cache = state.field(mermaid_cache_field);
    expect(cache.get('light:a')).toEqual({ ok: false, message: 'e' });
    expect(cache.get('light:b')).toEqual({ ok: true, svg: '<svg/>' });
  });
});
