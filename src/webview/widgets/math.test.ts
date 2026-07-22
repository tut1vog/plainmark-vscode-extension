import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { math_extension as math_grammar_extension } from '../grammar/math.js';
import {
  frozen_reveal_selection_field,
  set_frozen_reveal_selection,
} from '../decorations/pointer_state.js';
import {
  MathBlockPreviewWidget,
  MathWidget,
  find_block_math_source,
  find_inline_math_source,
  math_cache_field,
  math_cache_key,
  math_widgets_field,
  set_typeset_effect,
} from './math.js';

function make_state(doc: string, cursor: number = doc.length): EditorState {
  return EditorState.create({
    doc,
    extensions: [
      markdown({ extensions: [GFM, math_grammar_extension] }),
      math_cache_field,
      math_widgets_field,
    ],
    selection: { anchor: cursor },
  });
}

interface DecoSnapshot {
  from: number;
  to: number;
  block: boolean;
  widget: MathWidget;
}

function decorations(state: EditorState): DecoSnapshot[] {
  const out: DecoSnapshot[] = [];
  state.field(math_widgets_field).between(0, state.doc.length, (from, to, deco) => {
    const w = (deco.spec as { widget?: unknown }).widget;
    if (w instanceof MathWidget) {
      out.push({ from, to, block: deco.spec.block === true, widget: w });
    }
  });
  return out;
}

describe('math_cache_key MATH-R-5', () => {
  it('encodes display flag into the key', () => {
    expect(math_cache_key(true, 'a')).toBe('block:a');
    expect(math_cache_key(false, 'a')).toBe('inline:a');
  });

  it('produces distinct keys for block and inline forms of the same src', () => {
    expect(math_cache_key(true, 'x')).not.toBe(math_cache_key(false, 'x'));
  });
});

describe('MathWidget.ignoreEvent MATH-I-4', () => {
  it('returns false so CM6 places the caret on click (enables click-to-edit reveal)', () => {
    expect(new MathWidget(true, 'a', null).ignoreEvent()).toBe(false);
    expect(new MathWidget(false, 'a', null).ignoreEvent()).toBe(false);
    expect(new MathWidget(true, 'a', { ok: true, html: '<mjx>a</mjx>' }).ignoreEvent()).toBe(false);
  });
});

describe('MathWidget.eq MATH-R-6', () => {
  it('returns true when display, src, and html all match', () => {
    const a = new MathWidget(true, 'a = b', { ok: true, html: '<mjx>a</mjx>' });
    const b = new MathWidget(true, 'a = b', { ok: true, html: '<mjx>a</mjx>' });
    expect(a.eq(b)).toBe(true);
  });

  it('returns true when both src match and both html are null (placeholder pair)', () => {
    const a = new MathWidget(true, 'a = b', null);
    const b = new MathWidget(true, 'a = b', null);
    expect(a.eq(b)).toBe(true);
  });

  it('returns false when display differs (block vs inline)', () => {
    const a = new MathWidget(true, 'x', { ok: true, html: '<mjx>x</mjx>' });
    const b = new MathWidget(false, 'x', { ok: true, html: '<mjx>x</mjx>' });
    expect(a.eq(b)).toBe(false);
  });

  it('returns false when src differs', () => {
    const a = new MathWidget(true, 'a = b', null);
    const b = new MathWidget(true, 'a = c', null);
    expect(a.eq(b)).toBe(false);
  });

  it('returns false when one is placeholder and the other is resolved', () => {
    const a = new MathWidget(true, 'a = b', null);
    const b = new MathWidget(true, 'a = b', { ok: true, html: '<mjx>a</mjx>' });
    expect(a.eq(b)).toBe(false);
  });

  it('returns false when html differs', () => {
    const a = new MathWidget(true, 'a = b', { ok: true, html: '<mjx>a</mjx>' });
    const b = new MathWidget(true, 'a = b', { ok: true, html: '<mjx>b</mjx>' });
    expect(a.eq(b)).toBe(false);
  });

  it('returns false when one result is ok and the other is an error', () => {
    const a = new MathWidget(true, 'a = b', { ok: true, html: '<mjx>a</mjx>' });
    const b = new MathWidget(true, 'a = b', { ok: false, message: 'boom' });
    expect(a.eq(b)).toBe(false);
  });

  it('returns false when error messages differ', () => {
    const a = new MathWidget(true, 'a = b', { ok: false, message: 'one' });
    const b = new MathWidget(true, 'a = b', { ok: false, message: 'two' });
    expect(a.eq(b)).toBe(false);
  });

  it('returns true when error results match', () => {
    const a = new MathWidget(false, 'x', { ok: false, message: 'boom' });
    const b = new MathWidget(false, 'x', { ok: false, message: 'boom' });
    expect(a.eq(b)).toBe(true);
  });
});

describe('math_cache_field — failed typeset results FIX-8', () => {
  it('records an { ok: false } result under the display-aware key', () => {
    let state = make_state('$$\na\n$$\n');
    state = state.update({
      effects: set_typeset_effect.of({
        display: true,
        src: 'a',
        result: { ok: false, message: 'boom' },
      }),
    }).state;
    expect(state.field(math_cache_field).get('block:a')).toEqual({
      ok: false,
      message: 'boom',
    });
  });

  it('emits a widget carrying the error result instead of a pending placeholder', () => {
    let state = make_state('$$\na\n$$\n');
    state = state.update({
      effects: set_typeset_effect.of({
        display: true,
        src: 'a',
        result: { ok: false, message: 'boom' },
      }),
    }).state;
    expect(decorations(state)[0].widget.result).toEqual({ ok: false, message: 'boom' });
  });
});

describe('find_block_math_source MATH-SP-2', () => {
  it('strips leading $$\\n and trailing \\n$$ markers', () => {
    const state = make_state('$$\na = b\n$$\n');
    const decos = decorations(state);
    expect(decos).toHaveLength(1);
    expect(find_block_math_source(state, decos[0].from, decos[0].to)).toBe('a = b');
  });

  it('extracts the body from a single-line $$...$$ block', () => {
    const state = make_state('$$a = b$$\n');
    const decos = decorations(state);
    expect(decos).toHaveLength(1);
    expect(decos[0].widget.display).toBe(true);
    expect(find_block_math_source(state, decos[0].from, decos[0].to)).toBe('a = b');
  });
});

describe('find_inline_math_source MATH-SP-2', () => {
  it('strips a single `$` from each end', () => {
    const doc = 'see $x = y$ here\n';
    const state = make_state(doc, doc.length);
    const decos = decorations(state);
    expect(decos).toHaveLength(1);
    expect(find_inline_math_source(state, decos[0].from, decos[0].to)).toBe('x = y');
  });
});

describe('math_widgets_field — block decoration emission MATH-R-2 MATH-I-2 MATH-I-3 MATH-SP-1', () => {
  it('emits a block decoration for a $$...$$ block (placeholder, no cache entry)', () => {
    const state = make_state('$$\na = b\n$$\n');
    const decos = decorations(state);
    expect(decos).toHaveLength(1);
    expect(decos[0].block).toBe(true);
    expect(decos[0].widget.display).toBe(true);
    expect(decos[0].widget.src).toBe('a = b');
    expect(decos[0].widget.result).toBeNull();
  });

  it('emits an in-flow preview widget (not a MathWidget) when a bare caret sits inside the block', () => {
    const state = make_state('$$\na = b\n$$\n', 0);
    expect(decorations(state)).toHaveLength(0);
    let preview: MathBlockPreviewWidget | null = null;
    state
      .field(math_widgets_field)
      .between(0, state.doc.length, (_from, _to, deco) => {
        const w = (deco.spec as { widget?: unknown }).widget;
        if (w instanceof MathBlockPreviewWidget) preview = w;
      });
    expect(preview).not.toBeNull();
    expect((preview as unknown as MathBlockPreviewWidget).src).toBe('a = b');
  });

  it('emits the in-flow preview widget (not a MathWidget) when a non-empty selection overlaps the block', () => {
    const doc = '$$\na = b\n$$\n';
    const state = make_state(doc, doc.length);
    const ranged = state.update({
      selection: { anchor: 0, head: doc.length },
    }).state;
    expect(decorations(ranged)).toHaveLength(0);
    let preview: MathBlockPreviewWidget | null = null;
    ranged
      .field(math_widgets_field)
      .between(0, ranged.doc.length, (_from, _to, deco) => {
        const w = (deco.spec as { widget?: unknown }).widget;
        if (w instanceof MathBlockPreviewWidget) preview = w;
      });
    expect(preview).not.toBeNull();
    expect((preview as unknown as MathBlockPreviewWidget).src).toBe('a = b');
  });

  it('extends the replaced range to full lines over leading indent and trailing spaces (MATH-E-5)', () => {
    const doc = '  $$x = y$$   \ntail';
    const state = make_state(doc, doc.length);
    const decos = decorations(state);
    expect(decos).toHaveLength(1);
    expect(decos[0].block).toBe(true);
    expect(decos[0].from).toBe(0);
    expect(decos[0].to).toBe(doc.indexOf('\n'));
    expect(decos[0].widget.src).toBe('x = y');
  });

  it('emits a NON-block whole-line replace for a single-line block in a blockquote (MATH-E-13)', () => {
    const doc = '> $$x = y$$\n\ntail';
    const state = make_state(doc);
    const decos = decorations(state);
    expect(decos).toHaveLength(1);
    expect(decos[0].block).toBe(false);
    expect(decos[0].from).toBe(0);
    expect(decos[0].to).toBe(doc.indexOf('\n'));
    expect(decos[0].widget.display).toBe(true);
    expect(decos[0].widget.src).toBe('x = y');
    // The quote's own first-line logic carries the gap (PARA-R-7), not the widget.
    expect(decos[0].widget.gap_above).toBe(false);
  });

  it('emits a NON-block replace with `> `-stripped source for a multi-line quoted block (MATH-E-13)', () => {
    const doc = '> $$\n> a = b\n> $$\n\ntail';
    const state = make_state(doc);
    const decos = decorations(state);
    expect(decos).toHaveLength(1);
    expect(decos[0].block).toBe(false);
    expect(decos[0].from).toBe(0);
    expect(decos[0].to).toBe(doc.indexOf('\n\ntail'));
    expect(decos[0].widget.src).toBe('a = b');
  });

  it('strips every level of a nested-quote block source (MATH-E-13)', () => {
    const state = make_state('> > $$\n> > a = b\n> > $$\n\ntail');
    const decos = decorations(state);
    expect(decos).toHaveLength(1);
    expect(decos[0].widget.src).toBe('a = b');
  });

  it('renders a lazy-continuation quoted block (prefix on the opener line only)', () => {
    const state = make_state('> $$\na = b\n$$\n\ntail');
    const decos = decorations(state);
    expect(decos).toHaveLength(1);
    expect(decos[0].block).toBe(false);
    expect(decos[0].widget.src).toBe('a = b');
  });

  it('emits the caret-inside preview with `> `-stripped source for a quoted block (MATH-I-6)', () => {
    const state = make_state('> $$\n> a = b\n> $$\n\ntail', 8);
    expect(decorations(state)).toHaveLength(0);
    let preview: MathBlockPreviewWidget | null = null;
    state.field(math_widgets_field).between(0, state.doc.length, (_from, _to, deco) => {
      const w = (deco.spec as { widget?: unknown }).widget;
      if (w instanceof MathBlockPreviewWidget) preview = w;
    });
    expect(preview).not.toBeNull();
    expect((preview as unknown as MathBlockPreviewWidget).src).toBe('a = b');
  });

  it('renders (does NOT reveal) with the caret at offset 0 — the freshly-opened-document state', () => {
    // The webview parks the caret at 0 on open; the `> ` prefix before the
    // node must not count as inside, or a doc-start quoted block opens
    // permanently revealed (MATH-I-2 reveal range starts at node.from).
    const state = make_state('> $$x = y$$\n\ntail', 0);
    const decos = decorations(state);
    expect(decos).toHaveLength(1);
    expect(decos[0].widget.src).toBe('x = y');
  });

  it('reveals when the caret touches the node start of a quoted block (MATH-I-2)', () => {
    const state = make_state('> $$x = y$$\n\ntail', 2);
    expect(decorations(state)).toHaveLength(0);
  });

  it('renders a block in a callout body (quote margins, MATH-E-13)', () => {
    const state = make_state('> [!NOTE]\n> $$x = y$$\n\ntail');
    const decos = decorations(state);
    expect(decos).toHaveLength(1);
    expect(decos[0].block).toBe(false);
    expect(decos[0].widget.src).toBe('x = y');
  });

  it('emits NO replace widget for a block nested in a list item (partial-line range)', () => {
    const state = make_state('- $$x = y$$\n\ntail');
    expect(decorations(state)).toHaveLength(0);
  });

  it('emits decorations for multiple $$...$$ blocks in one document', () => {
    const doc = '$$\na\n$$\n\n$$\nb\n$$\n';
    const state = make_state(doc);
    const decos = decorations(state);
    expect(decos).toHaveLength(2);
    expect(decos[0].widget.src).toBe('a');
    expect(decos[1].widget.src).toBe('b');
  });

  it('emits a resolved block widget when the cache has an entry for the src', () => {
    let state = make_state('$$\na = b\n$$\n');
    state = state.update({
      effects: set_typeset_effect.of({
        display: true,
        src: 'a = b',
        result: { ok: true, html: '<mjx-math>a</mjx-math>' },
      }),
    }).state;
    const decos = decorations(state);
    expect(decos).toHaveLength(1);
    expect(decos[0].widget.result).toEqual({ ok: true, html: '<mjx-math>a</mjx-math>' });
  });

  it('still emits a placeholder when the cache has a different src', () => {
    let state = make_state('$$\na = b\n$$\n');
    state = state.update({
      effects: set_typeset_effect.of({
        display: true,
        src: 'c = d',
        result: { ok: true, html: '<mjx-math>c</mjx-math>' },
      }),
    }).state;
    const decos = decorations(state);
    expect(decos[0].widget.result).toBeNull();
  });

  it('does not reuse a block cache entry for an inline widget of the same src', () => {
    // Block + inline keep separate cache entries because MathJax renders them differently
    // (display:true vs display:false produces different HTML).
    const doc = 'inline $x$ here\n\n$$\nx\n$$\n';
    let state = make_state(doc, 0);
    state = state.update({
      effects: set_typeset_effect.of({
        display: true,
        src: 'x',
        result: { ok: true, html: '<mjx-block>x</mjx-block>' },
      }),
    }).state;
    const decos = decorations(state);
    const inline = decos.find((d) => !d.widget.display);
    const block = decos.find((d) => d.widget.display);
    expect(inline?.widget.result).toBeNull();
    expect(block?.widget.result).toEqual({ ok: true, html: '<mjx-block>x</mjx-block>' });
  });

  it('rebuilds decorations when a cache entry lands via set_typeset_effect', () => {
    let state = make_state('$$\na = b\n$$\n');
    expect(decorations(state)[0].widget.result).toBeNull();
    state = state.update({
      effects: set_typeset_effect.of({
        display: true,
        src: 'a = b',
        result: { ok: true, html: '<mjx-math>a</mjx-math>' },
      }),
    }).state;
    expect(decorations(state)[0].widget.result).toEqual({ ok: true, html: '<mjx-math>a</mjx-math>' });
  });

  it('does not modify the document text', () => {
    const doc = '$$\na = b\n$$\n';
    const state = make_state(doc);
    expect(state.doc.toString()).toBe(doc);
  });
});

describe('math_widgets_field — inline decoration emission MATH-R-3 MATH-I-1 MATH-SP-1', () => {
  it('emits an inline (non-block) decoration for `$x$` with cursor outside', () => {
    const doc = 'value: $x = y$\n';
    const state = make_state(doc, doc.length);
    const decos = decorations(state);
    expect(decos).toHaveLength(1);
    expect(decos[0].block).toBe(false);
    expect(decos[0].widget.display).toBe(false);
    expect(decos[0].widget.src).toBe('x = y');
    expect(decos[0].widget.result).toBeNull();
  });

  it('skips inline decoration when the selection overlaps the inline range', () => {
    const doc = 'value: $x$\n';
    // Cursor between the two `$`s.
    const state = make_state(doc, doc.indexOf('x'));
    expect(decorations(state)).toHaveLength(0);
  });

  it('skips inline decoration when the selection is exactly at the leading `$`', () => {
    const doc = 'value: $x$\n';
    const state = make_state(doc, doc.indexOf('$'));
    expect(decorations(state)).toHaveLength(0);
  });

  it('keeps the inline widget rendered when a selection strictly covers the whole `$x$` (select-all)', () => {
    const doc = 'value: $x$\n';
    const state = make_state(doc, doc.length).update({
      selection: { anchor: 0, head: doc.length },
    }).state;
    expect(decorations(state)).toHaveLength(1);
    expect(decorations(state)[0].widget.display).toBe(false);
  });

  it('reveals the inline source when a non-empty selection overlaps without strictly covering', () => {
    const doc = 'value: $x$\n';
    // Selection starts inside the math and runs to the line end (left edge not covered).
    const state = make_state(doc, doc.length).update({
      selection: { anchor: doc.indexOf('x'), head: doc.length },
    }).state;
    expect(decorations(state)).toHaveLength(0);
  });

  it('emits a resolved inline widget when the cache has an entry for the inline src', () => {
    let state = make_state('see $x$ now');
    state = state.update({
      effects: set_typeset_effect.of({
        display: false,
        src: 'x',
        result: { ok: true, html: '<mjx-inline>x</mjx-inline>' },
      }),
    }).state;
    const decos = decorations(state);
    expect(decos).toHaveLength(1);
    expect(decos[0].widget.display).toBe(false);
    expect(decos[0].widget.result).toEqual({ ok: true, html: '<mjx-inline>x</mjx-inline>' });
  });

  it('emits both inline and block widgets in the same document', () => {
    const doc = 'see $a$ below\n\n$$\nb\n$$\n';
    const state = make_state(doc, 0);
    const decos = decorations(state);
    expect(decos).toHaveLength(2);
    const block = decos.find((d) => d.widget.display);
    const inline = decos.find((d) => !d.widget.display);
    expect(block?.block).toBe(true);
    expect(inline?.block).toBe(false);
    expect(block?.widget.src).toBe('b');
    expect(inline?.widget.src).toBe('a');
  });

  it('does not modify the document text when inline math is present', () => {
    const doc = 'value: $x = y$ end\n';
    const state = make_state(doc);
    expect(state.doc.toString()).toBe(doc);
  });
});

describe('math_cache_field MATH-R-5', () => {
  it('starts empty', () => {
    const state = make_state('');
    expect(state.field(math_cache_field).size).toBe(0);
  });

  it('records typeset HTML under a display-aware key', () => {
    let state = make_state('$$\na\n$$\n');
    state = state.update({
      effects: set_typeset_effect.of({ display: true, src: 'a', result: { ok: true, html: '<mjx>a</mjx>' } }),
    }).state;
    expect(state.field(math_cache_field).get('block:a')).toEqual({ ok: true, html: '<mjx>a</mjx>' });
  });

  it('keeps block and inline entries for the same src separate', () => {
    let state = make_state('inline $x$ here\n\n$$\nx\n$$\n');
    state = state.update({
      effects: set_typeset_effect.of({ display: true, src: 'x', result: { ok: true, html: '<mjx-b>x</mjx-b>' } }),
    }).state;
    state = state.update({
      effects: set_typeset_effect.of({ display: false, src: 'x', result: { ok: true, html: '<mjx-i>x</mjx-i>' } }),
    }).state;
    const cache = state.field(math_cache_field);
    expect(cache.get('block:x')).toEqual({ ok: true, html: '<mjx-b>x</mjx-b>' });
    expect(cache.get('inline:x')).toEqual({ ok: true, html: '<mjx-i>x</mjx-i>' });
  });

  it('preserves prior entries when adding a new one', () => {
    let state = make_state('$$\na\n$$\n');
    state = state.update({
      effects: set_typeset_effect.of({ display: true, src: 'a', result: { ok: true, html: '<mjx>a</mjx>' } }),
    }).state;
    state = state.update({
      effects: set_typeset_effect.of({ display: true, src: 'b', result: { ok: true, html: '<mjx>b</mjx>' } }),
    }).state;
    const cache = state.field(math_cache_field);
    expect(cache.get('block:a')).toEqual({ ok: true, html: '<mjx>a</mjx>' });
    expect(cache.get('block:b')).toEqual({ ok: true, html: '<mjx>b</mjx>' });
  });
});

describe('math_widgets_field — pointer-down reveal freeze MATH-I-9', () => {
  // frozen_reveal_selection_field must be configured BEFORE math_widgets_field
  // so the field's update reads the post-transaction frozen value.
  function make_gated_state(doc: string, cursor: number): EditorState {
    return EditorState.create({
      doc,
      extensions: [
        markdown({ extensions: [GFM, math_grammar_extension] }),
        math_cache_field,
        frozen_reveal_selection_field,
        math_widgets_field,
      ],
      selection: { anchor: cursor },
    });
  }

  const DOC = '$$f(a)=b$$\nx';

  it('keeps the block widget rendered while a drag from below covers the block (frozen off-block)', () => {
    let state = make_gated_state(DOC, DOC.length);
    expect(decorations(state).some((d) => d.block)).toBe(true);

    // Press on the line below: freeze the pre-press (off-block) selection.
    state = state.update({
      effects: set_frozen_reveal_selection.of(state.selection),
    }).state;
    // Drag upward so the live selection now covers the whole block.
    state = state.update({ selection: { anchor: DOC.length, head: 0 } }).state;

    // Live selection overlaps the block, but the freeze gates reveal: widget stays.
    expect(decorations(state).some((d) => d.block)).toBe(true);
  });

  it('reveals the raw source once the freeze clears on release', () => {
    let state = make_gated_state(DOC, DOC.length);
    state = state.update({
      effects: set_frozen_reveal_selection.of(state.selection),
    }).state;
    state = state.update({ selection: { anchor: DOC.length, head: 0 } }).state;
    expect(decorations(state).some((d) => d.block)).toBe(true);

    // Release: the effects-only transaction clearing the freeze must rebuild.
    state = state.update({ effects: set_frozen_reveal_selection.of(null) }).state;
    expect(decorations(state).some((d) => d.block)).toBe(false);
  });

  it('does not freeze keyboard selection (no pointer): reveal lands immediately', () => {
    let state = make_gated_state(DOC, DOC.length);
    state = state.update({ selection: { anchor: DOC.length, head: 0 } }).state;
    expect(decorations(state).some((d) => d.block)).toBe(false);
  });
});
