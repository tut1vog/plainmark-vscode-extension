// A selection strictly covering a collapsed construct keeps it collapsed
// (MRS-R-4), but the hidden `](url)` glyphs stay laid out past the visible
// text (width:0 clips paint, not layout) — the row rectangle must clip to the
// visible content end, not the invisible glyph geometry.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import {
  set_frozen_reveal_selection,
  set_pointer_down,
} from '../../src/webview/decorations/pointer_state.js';
import { mount_editor, next_frame } from './util.js';

describe('SHELL-X-10: covered-line selection clips to visible content end', () => {
  let container: HTMLElement;
  let view: EditorView;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    view.destroy();
    container.remove();
  });

  async function covered_row_right(
    doc: string,
    visible_to: number,
  ): Promise<{ rect_right: number; visible_right: number; laid_out_right: number }> {
    view = mount_editor(container, doc);
    await next_frame();
    await next_frame();
    const line2 = view.state.doc.line(2);
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
    await next_frame();
    await next_frame();
    const visible_end = view.coordsAtPos(line2.from + visible_to, -1)!;
    const laid_out_end = view.coordsAtPos(line2.to, -1)!;
    const y = (visible_end.top + visible_end.bottom) / 2;
    const row = Array.from(container.querySelectorAll('.cm-clippedSelectionBackground'))
      .map((el) => el.getBoundingClientRect())
      .find((r) => r.top <= y && r.bottom >= y);
    expect(row).toBeTruthy();
    return {
      rect_right: row!.right,
      visible_right: visible_end.right,
      laid_out_right: laid_out_end.right,
    };
  }

  it('collapsed link line: rectangle ends at the link text, not the hidden url', async () => {
    const link = '[anthropics:defending-code-reference-harness](https://github.com/anthropics/defending-code-reference-harness)';
    const m = await covered_row_right(`x\n${link}\ny\n`, link.indexOf(']('));
    expect(m.laid_out_right).toBeGreaterThan(m.visible_right + 50);
    expect(Math.abs(m.rect_right - m.visible_right)).toBeLessThanOrEqual(1);
  });

  it('trailing strong emphasis: rectangle ends at the bold text, not the hidden **', async () => {
    const m = await covered_row_right('x\na **bold**\ny\n', 'a **bold'.length);
    expect(Math.abs(m.rect_right - m.visible_right)).toBeLessThanOrEqual(1);
  });

  // Mid-drag the reveal predicate runs against the frozen pre-press selection
  // (MRS-P-1/P-2), so the markers stay hidden while the head crosses the url —
  // seed that freeze the same way the table subview does.
  it('mid-drag head inside the hidden url still clips to the link text', async () => {
    const link = '[text](https://example.com/a-fairly-long-destination-path)';
    view = mount_editor(container, `x\n${link}\ny\n`);
    await next_frame();
    await next_frame();
    const line2 = view.state.doc.line(2);
    const visible_to = line2.from + link.indexOf('](');
    view.dispatch({
      effects: [
        set_pointer_down.of(true),
        set_frozen_reveal_selection.of(view.state.selection),
      ],
    });
    view.dispatch({ selection: { anchor: 0, head: line2.to - 5 } });
    await next_frame();
    await next_frame();
    const visible_end = view.coordsAtPos(visible_to, -1)!;
    const y = (visible_end.top + visible_end.bottom) / 2;
    const row = Array.from(container.querySelectorAll('.cm-clippedSelectionBackground'))
      .map((el) => el.getBoundingClientRect())
      .find((r) => r.top <= y && r.bottom >= y);
    expect(row).toBeTruthy();
    expect(Math.abs(row!.right - visible_end.right)).toBeLessThanOrEqual(1);
  });
});
