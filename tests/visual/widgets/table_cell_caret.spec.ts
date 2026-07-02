import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor } from '../util.js';

async function next_frame(): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

function get_table_block(container: HTMLElement): HTMLElement | null {
  return container.querySelector('.plainmark-table-block') as HTMLElement | null;
}

function get_cell(
  container: HTMLElement,
  row_index: number,
  col_index: number,
): HTMLTableCellElement {
  const sel = `[data-row-index="${row_index}"][data-col-index="${col_index}"]`;
  const block = get_table_block(container);
  if (!block) throw new Error('no .plainmark-table-block');
  const td = block.querySelector(sel) as HTMLTableCellElement | null;
  if (!td) throw new Error(`no cell at (${row_index}, ${col_index})`);
  return td;
}

const SAMPLE = '| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |\n';

describe('widget.coordsAt: caret rendering inside cells', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    view?.destroy();
    view = undefined;
    container.remove();
  });

  it('TBL-R-14: view.coordsAtPos for a position inside cell (0,0) returns a Rect inside the (0,0) <th> bounding rect', async () => {
    view = mount_editor(container, SAMPLE);
    await next_frame();
    await next_frame();

    // Cell (0,0) source range is [1, 4] in '| a | b | c |...' — pick offset 2.
    const probe_pos = 2;
    const rect = view.coordsAtPos(probe_pos, 1);
    expect(rect).not.toBeNull();

    const td = get_cell(container, 0, 0);
    const td_rect = td.getBoundingClientRect();

    // Without widget.coordsAt, CM6's coordsInWidget flattens to widget right-bottom;
    // rect.left would be at the right edge of the entire <table>, far past td_rect.right.
    // With widget.coordsAt returning td.getBoundingClientRect(), rect must be inside td.
    expect({
      rect_left: rect!.left,
      rect_right: rect!.right,
      rect_top: rect!.top,
      rect_bottom: rect!.bottom,
      td_left: td_rect.left,
      td_right: td_rect.right,
      td_top: td_rect.top,
      td_bottom: td_rect.bottom,
    }).toSatisfy((coords: {
      rect_left: number; rect_right: number; rect_top: number; rect_bottom: number;
      td_left: number; td_right: number; td_top: number; td_bottom: number;
    }) =>
      coords.rect_left >= coords.td_left &&
      coords.rect_right <= coords.td_right &&
      coords.rect_top >= coords.td_top &&
      coords.rect_bottom <= coords.td_bottom,
    );
  });

  it('TBL-R-14: view.coordsAtPos for a position inside cell (0,1) returns a Rect inside the (0,1) <th> bounding rect', async () => {
    view = mount_editor(container, SAMPLE);
    await next_frame();
    await next_frame();

    // Cell (0,1) source range is [5, 8].
    const probe_pos = 6;
    const rect = view.coordsAtPos(probe_pos, 1);
    expect(rect).not.toBeNull();

    const td = get_cell(container, 0, 1);
    const td_rect = td.getBoundingClientRect();

    expect(rect!.left).toBeGreaterThanOrEqual(td_rect.left);
    expect(rect!.right).toBeLessThanOrEqual(td_rect.right);
    expect(rect!.top).toBeGreaterThanOrEqual(td_rect.top);
    expect(rect!.bottom).toBeLessThanOrEqual(td_rect.bottom);
  });

  it('TBL-R-14: view.coordsAtPos for a position inside cell (1,2) returns a Rect inside the (1,2) <td> bounding rect', async () => {
    view = mount_editor(container, SAMPLE);
    await next_frame();
    await next_frame();

    // Cell (1,2) is the third cell in the body row '| 1 | 2 | 3 |' which starts at offset 28.
    // Cell source range is [28+9, 28+12] = [37, 40].
    const probe_pos = 38;
    const rect = view.coordsAtPos(probe_pos, 1);
    expect(rect).not.toBeNull();

    const td = get_cell(container, 1, 2);
    const td_rect = td.getBoundingClientRect();

    expect(rect!.left).toBeGreaterThanOrEqual(td_rect.left);
    expect(rect!.right).toBeLessThanOrEqual(td_rect.right);
    expect(rect!.top).toBeGreaterThanOrEqual(td_rect.top);
    expect(rect!.bottom).toBeLessThanOrEqual(td_rect.bottom);
  });
});

describe('double-caret CSS mitigation', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    view?.destroy();
    view = undefined;
    container.remove();
  });

  it('TBL-I-1: main-view editor has data-plainmark-cell-active attribute when a cell is active', async () => {
    view = mount_editor(container, SAMPLE);
    await next_frame();
    await next_frame();

    // Before activation: no attribute.
    expect(view.dom.hasAttribute('data-plainmark-cell-active')).toBe(false);

    // Click into (0, 0).
    const td = get_cell(container, 0, 0);
    td.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await next_frame();
    await next_frame();

    // After activation: attribute present.
    expect(view.dom.hasAttribute('data-plainmark-cell-active')).toBe(true);
  });

  // CM6's drawSelection hides cursors on blurred editors naturally — so a
  // "main-view cursor is display:none when a cell is active" test would pass
  // spuriously (the focus has moved to the subview, hiding main cursor
  // regardless of any CSS we install). The data-attribute toggle is the
  // proof of the mechanism: if the attribute is correctly toggled, the CSS
  // rule provides defense-in-depth for any future code path that puts the
  // main-view selection inside a block-replace while a cell is also active.

  it('TBL-I-1 TBL-I-4: main-view cursor is visible again after cell teardown (attribute removed)', async () => {
    view = mount_editor(container, SAMPLE);
    await next_frame();
    await next_frame();

    const td = get_cell(container, 0, 0);
    td.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await next_frame();
    await next_frame();
    expect(view.dom.hasAttribute('data-plainmark-cell-active')).toBe(true);

    // Move focus to main view via dispatched selection + focus() — triggers the
    // subview's focusout → setTimeout(teardown, 0) chain.
    view.focus();
    view.dispatch({ selection: { anchor: 0 } });
    // Multiple frames + a setTimeout boundary for the teardown.
    await new Promise<void>((r) => setTimeout(r, 10));
    await next_frame();
    await next_frame();

    expect(view.dom.hasAttribute('data-plainmark-cell-active')).toBe(false);
  });
});
