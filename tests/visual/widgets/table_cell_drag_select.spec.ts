// Regression — click-drag-to-select inside a table cell. The activating
// mousedown is preventDefaulted and the cell subview is created a frame later
// (AC3 rAF), so the browser never arms its native drag-select for the gesture.
// activate_cell drives the selection manually from document mousemove/mouseup
// while the activating press is still held. Without it, a single press+drag
// yields an empty selection (caret only) — the user had to click once to seed
// the subview, then press+drag a second time.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { mount_editor } from '../util.js';
import { pointer_down_field } from '../../../src/webview/decorations/pointer_state.js';

function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}

function get_cell(
  container: HTMLElement,
  row_index: number,
  col_index: number,
): HTMLTableCellElement {
  const block = container.querySelector('.plainmark-table-block') as HTMLElement | null;
  if (!block) throw new Error('no .plainmark-table-block');
  const td = block.querySelector(
    `[data-row-index="${row_index}"][data-col-index="${col_index}"]`,
  ) as HTMLTableCellElement | null;
  if (!td) throw new Error(`no cell at (${row_index}, ${col_index})`);
  return td;
}

function active_subview_view(): EditorView {
  const sub = document.querySelector('.plainmark-table-cell-edit') as HTMLElement | null;
  if (!sub) throw new Error('no active subview');
  const root = sub.querySelector('.cm-editor') as HTMLElement | null;
  if (!root) throw new Error('no .cm-editor in subview');
  const view = EditorView.findFromDOM(root);
  if (!view) throw new Error('EditorView.findFromDOM returned null');
  return view;
}

// Cell (1, 0) holds `hello world` — wide enough that a left→right drag spans a
// clearly non-empty range.
const TABLE =
  '| a | b | c |\n|---|---|---|\n| hello world | x | y |\n';

async function press_and_drag(
  view: EditorView,
  td: HTMLTableCellElement,
): Promise<EditorView> {
  // Main-view mousedown so main.pointer_down latches (mirrors the real press
  // bubbling past the td before preventDefault).
  view.contentDOM.dispatchEvent(
    new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
  );
  const rect = td.getBoundingClientRect();
  // Press near the start of the cell text.
  td.dispatchEvent(
    new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + 3,
      clientY: rect.top + rect.height / 2,
    }),
  );
  await next_frame();
  await next_frame();

  const sub = active_subview_view();
  const sub_rect = sub.contentDOM.getBoundingClientRect();
  // Drag to the far right of the cell text, button still held.
  document.dispatchEvent(
    new MouseEvent('mousemove', {
      bubbles: true,
      buttons: 1,
      clientX: sub_rect.right - 3,
      clientY: sub_rect.top + sub_rect.height / 2,
    }),
  );
  return sub;
}

describe('table cell drag-select (Option A)', () => {
  let container: HTMLElement;
  let view: EditorView;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    view?.destroy();
    container.remove();
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  it('TBL-I-26: a single press+drag selects a non-empty range inside the cell', async () => {
    view = mount_editor(container, TABLE);
    await next_frame();
    await next_frame();

    const sub = await press_and_drag(view, get_cell(container, 1, 0));
    expect(sub.state.selection.main.empty).toBe(false);
    // Anchor near the start, head extended toward the end.
    expect(sub.state.selection.main.head).toBeGreaterThan(
      sub.state.selection.main.anchor,
    );
  });

  it('TBL-I-26: mouseup ends the drag — a later move does not extend the selection', async () => {
    view = mount_editor(container, TABLE);
    await next_frame();
    await next_frame();

    const sub = await press_and_drag(view, get_cell(container, 1, 0));
    const after_drag = sub.state.selection.main.head;

    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await next_frame();
    expect(sub.state.field(pointer_down_field)).toBe(false);

    // A post-release move must be ignored (listener removed).
    const sub_rect = sub.contentDOM.getBoundingClientRect();
    document.dispatchEvent(
      new MouseEvent('mousemove', {
        bubbles: true,
        buttons: 1,
        clientX: sub_rect.left + 3,
        clientY: sub_rect.top + sub_rect.height / 2,
      }),
    );
    await next_frame();
    expect(sub.state.selection.main.head).toBe(after_drag);
  });

  it('TBL-I-26: a button-less move ends the drag (Electron #17635 off-iframe release)', async () => {
    view = mount_editor(container, TABLE);
    await next_frame();
    await next_frame();

    const sub = await press_and_drag(view, get_cell(container, 1, 0));
    const after_drag = sub.state.selection.main.head;

    // Release happened outside the webview iframe: no mouseup here, but the
    // cursor returns button-less.
    const sub_rect = sub.contentDOM.getBoundingClientRect();
    document.dispatchEvent(
      new MouseEvent('mousemove', {
        bubbles: true,
        buttons: 0,
        clientX: sub_rect.left + 3,
        clientY: sub_rect.top + sub_rect.height / 2,
      }),
    );
    await next_frame();
    // The recovery move must not have extended the selection back to the start.
    expect(sub.state.selection.main.head).toBe(after_drag);

    // And a further held move is ignored — the drag is fully torn down.
    document.dispatchEvent(
      new MouseEvent('mousemove', {
        bubbles: true,
        buttons: 1,
        clientX: sub_rect.left + 3,
        clientY: sub_rect.top + sub_rect.height / 2,
      }),
    );
    await next_frame();
    expect(sub.state.selection.main.head).toBe(after_drag);
  });
});
