// Regression: vertical cursor motion and click-targeting across a
// nested bullet list must stay in sync with CM6's height map. The bug pattern
// (D13.9 first form): a `margin-top` rule on `.plainmark-list-item +
// .plainmark-list-item` introduces inter-`.cm-line` gaps that
// `getBoundingClientRect` does not see, so the height map and real DOM drift
// apart by `N * spacing` over an N-item list. At 7+ items the cumulative
// error pushes `moveVertically` past a full line height, causing ArrowUp to
// skip lines and `posAtCoords` to return a position one line below the click
// coordinate. The fix uses `padding-top` on the second item of each pair so
// the spacing is part of the line-box `getBoundingClientRect` measures.
//
// Both assertions below require real layout — Tier A jsdom returns zeros for
// `getBoundingClientRect`, so this regression is only catchable in Tier B.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cursorLineUp } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';
import { mount_editor } from '../util.js';

// Seven-item flat+nested bullet list followed by a plain trailing line.
// Visual order matches the line numbers below. The trailing line is plain
// prose (not `.plainmark-list-item`), so the boundary between the last list
// item and the trailing line is the longest contiguous run of list-item
// siblings and the most error-prone region for the height map. No final `\n`
// so `doc.length` lands at end-of-L8 (not on a phantom L9 empty line).
//
// L1: - a
// L2:   - b
// L3:   - c
// L4: - d
// L5:   - e
// L6:   - f
// L7: - g
// L8: trailing
const LIST_DOC = '- a\n  - b\n  - c\n- d\n  - e\n  - f\n- g\ntrailing';

async function settle(view: EditorView): Promise<void> {
  for (let i = 0; i < 4; i++) {
    view.requestMeasure();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }
}

function walk_up(view: EditorView, presses: number): number[] {
  const lines: number[] = [];
  for (let i = 0; i < presses; i++) {
    cursorLineUp(view);
    lines.push(view.state.doc.lineAt(view.state.selection.main.head).number);
  }
  return lines;
}

describe('nested-list cursor navigation', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.height = '600px';
    container.style.width = '800px';
    document.body.appendChild(container);
  });
  afterEach(() => {
    view?.destroy();
    view = undefined;
    container.remove();
  });

  it('ArrowUp from the trailing line steps one visual line at a time across the 7-item nested list', async () => {
    view = mount_editor(container, LIST_DOC);
    await settle(view);
    // Caret starts at end of doc (mount_editor sets anchor: doc.length).
    expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(8);
    // Walk up 7 times; each press should step to exactly the previous line.
    // Pre-fix bug: at margin-top: 0.25em on 7 items, the first ArrowUp
    // overshoots past L7 / L6 / L5 and lands on L4 (~16-24px cumulative drift
    // > half a line height).
    expect(walk_up(view, 7)).toEqual([7, 6, 5, 4, 3, 2, 1]);
  });

  it('posAtCoords on every list-item line returns a position on that line (no off-by-one)', async () => {
    view = mount_editor(container, LIST_DOC);
    await settle(view);
    const lines = container.querySelectorAll<HTMLElement>('.plainmark-list-item');
    // Each `.plainmark-list-item` is a single `.cm-line`; expect one per L1..L7.
    expect(lines.length).toBe(7);
    for (let i = 0; i < lines.length; i++) {
      const rect = lines[i].getBoundingClientRect();
      // Sample a point inside the line's content area (offset 10px from left
      // to clear marker padding; vertical center).
      const x = rect.left + 10;
      const y = rect.top + rect.height / 2;
      const pos = view!.posAtCoords({ x, y });
      expect(pos, `posAtCoords returned null at L${i + 1}`).not.toBeNull();
      const landed_line = view!.state.doc.lineAt(pos!).number;
      // Pre-fix bug: at margin-top: 0.25em, posAtCoords returns a position on
      // L(i+2) instead of L(i+1) for i >= ~3 — the cumulative gap pushes the
      // click coordinate into the next height-map bucket.
      expect(
        landed_line,
        `click at L${i + 1} bbox center landed on L${landed_line}`,
      ).toBe(i + 1);
    }
  });
});
