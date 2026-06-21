import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor } from '../util.js';

function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}

// BQ-R-11: the pinned blockquote marker slot is display:inline-block with
// overflow:hidden, which takes its bottom edge as the box baseline (CSS 2.1
// §10.8.1). Without vertical-align:top, typing the first character on an empty
// `> ` line shifts the sibling text + caret DOWN. A marker-only line shows no
// shift (no sibling text), so the bug only surfaces on the first keystroke.
// Each guard measures the caret top BEFORE and AFTER typing at the SAME line, so
// constant offsets (line padding, font metrics) cancel and only the
// baseline-shift-on-content-gain remains.
describe('BQ-R-11: typing on an empty `> ` line does not shift the caret down', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '600px';
    document.body.appendChild(container);
  });
  afterEach(() => {
    view?.destroy();
    container.remove();
  });

  async function caret_top_before_vs_after(doc: string): Promise<[number, number]> {
    view = mount_editor(container, doc);
    const empty_line_end = view.state.doc.line(2).to; // line 2 is the empty `> ` line
    view.dispatch({ selection: { anchor: empty_line_end } });
    await next_frame();
    await next_frame();
    const before = view.coordsAtPos(empty_line_end)!.top;

    view.dispatch({
      changes: { from: empty_line_end, insert: 'x' },
      selection: { anchor: empty_line_end + 1 },
    });
    await next_frame();
    await next_frame();
    const after = view.coordsAtPos(empty_line_end + 1)!.top;
    return [before, after];
  }

  it('depth-1 empty `> ` line: caret top stays put on first keystroke', async () => {
    const [before, after] = await caret_top_before_vs_after('> a\n> \n> b');
    expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
  });

  it('depth-2 empty `> > ` line: caret top stays put on first keystroke', async () => {
    const [before, after] = await caret_top_before_vs_after('> > a\n> > \n> > b');
    expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
  });
});

// BQ-R-11: the revealed `>` marker renders at its natural width, so there is no
// dead space between the glyph and the content. Without that (a fixed-width slot
// wider than the glyph) the marker→content boundary offset paints at the glyph's
// right edge for assoc=-1 (ArrowRight from before the `>`) but at the content
// edge for assoc=+1 (ArrowLeft from after the content) — one offset, two
// x-positions by arrival direction. Natural width collapses both to one x.
describe('BQ-R-11: revealed `>` marker caret is associativity-stable at the content boundary', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '600px';
    document.body.appendChild(container);
  });
  afterEach(() => {
    view?.destroy();
    container.remove();
  });

  async function boundary_dx(doc: string, boundary: number): Promise<number> {
    view = mount_editor(container, doc);
    // Caret on the line reveals the `>` (per-line reveal).
    view.dispatch({ selection: { anchor: boundary } });
    await next_frame();
    await next_frame();
    const left = view.coordsAtPos(boundary, -1)!.left;
    const right = view.coordsAtPos(boundary, 1)!.left;
    return Math.abs(right - left);
  }

  it('no-space `>a`: the offset-1 caret paints at one x from both sides', async () => {
    // QuoteMark [0,1], content `a` at [1,2]; boundary offset 1.
    expect(await boundary_dx('>a', 1)).toBeLessThanOrEqual(1);
  });

  it('spaced `> a`: the marker→content boundary caret paints at one x', async () => {
    // QuoteMark [0,1] + trailing space hidden through [0,2]; content `a` at 2.
    expect(await boundary_dx('> a', 2)).toBeLessThanOrEqual(1);
  });
});
