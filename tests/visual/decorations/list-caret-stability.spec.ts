import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor, move_cursor, next_frame } from '../util.js';

// LIST-I-3: no list construct reveals, so a nested ordered line renders at the
// same x with the caret on or off it. The retired source-true reveal (raw
// spaces in flow at depth 0) shifted the line by depth·indent − space advance
// on every caret enter/leave. Each guard measures the marker's and content's
// left edge off-line, moves the caret onto the line, and measures again.
describe('LIST-I-3: caret entering a nested ordered line does not shift it', () => {
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

  async function left_edges(
    doc: string,
    positions: number[],
    caret_off: number,
    caret_on: number,
  ): Promise<Array<[number, number]>> {
    view = mount_editor(container, doc);
    move_cursor(view, caret_off);
    await next_frame();
    await next_frame();
    const v = view;
    const before = positions.map((p) => v.coordsAtPos(p)!.left);
    move_cursor(v, caret_on);
    await next_frame();
    await next_frame();
    const after = positions.map((p) => v.coordsAtPos(p)!.left);
    return positions.map((_, i) => [before[i], after[i]]);
  }

  it('ordered item nested under a bullet: marker and content x stay put', async () => {
    // '- a\n  1. b\n  2. c\nz' — inner ListMark[6,8), content 'b' at 9.
    const edges = await left_edges('- a\n  1. b\n  2. c\nz', [6, 9], 19, 9);
    for (const [before, after] of edges) {
      expect(Math.abs(after - before)).toBeLessThanOrEqual(1);
    }
  });

  it('ordered item nested under an ordered parent (3-space indent): x stays put', async () => {
    // '1. a\n   1. b\nz' — inner ListMark[8,10), content 'b' at 11.
    const edges = await left_edges('1. a\n   1. b\nz', [8, 11], 14, 11);
    for (const [before, after] of edges) {
      expect(Math.abs(after - before)).toBeLessThanOrEqual(1);
    }
  });

  it('caret leave restores the identical geometry (round trip)', async () => {
    const doc = '- a\n  1. b\n  2. c\nz';
    view = mount_editor(container, doc);
    move_cursor(view, 19);
    await next_frame();
    await next_frame();
    const start = view.coordsAtPos(6)!.left;
    move_cursor(view, 9);
    await next_frame();
    await next_frame();
    move_cursor(view, 19);
    await next_frame();
    await next_frame();
    const back = view.coordsAtPos(6)!.left;
    expect(Math.abs(back - start)).toBeLessThanOrEqual(1);
  });
});
