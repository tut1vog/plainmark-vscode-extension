// T19.23 regression — cell-activation click reveals on press because the cell
// subview is created in rAF after the activating mousedown has already
// bubbled past, so the cell's pointer_state never sees the press. Without
// seeding the cell's latch from the main view's current pointer_down state,
// the reveal rule reads `pointer_down=false` at cell mount and an
// inside-construct caret reveals immediately — Typora behavior says hold.
//
// Fix: activate_cell seeds the cell's pointer_down when main_view's
// pointer is currently held. The cell's own document-mouseup listener (from
// pointer_state_extension in editor_extensions_core) clears it on release.

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

// Cell at (1, 0) contains `**bold**`. Coords picked to land mid-cell — exact
// caret position doesn't matter for the gate; we only need any pointer_down
// transition observed.
const TABLE_WITH_BOLD =
  '| a | b | c |\n|---|---|---|\n| **bold** | x | y |\n';

describe('T19.23 — cell-activation pointer-down seeding', () => {
  let container: HTMLElement;
  let view: EditorView;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    view?.destroy();
    container.remove();
    // Defensive: clear any latched pointer_down from a previous test by
    // firing a global mouseup. The next test's beforeEach starts clean.
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  it('seeds cell pointer_down=true when activating click happens while main is held', async () => {
    view = mount_editor(container, TABLE_WITH_BOLD);
    await next_frame();
    await next_frame();

    // Simulate main-view mousedown that bubbled past the td: dispatch a
    // mousedown on the main view's contentDOM so main.pointer_down latches.
    view.contentDOM.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
    );
    expect(view.state.field(pointer_down_field)).toBe(true);

    // Now activate the cell via td mousedown — table widget schedules the
    // subview creation in rAF.
    const td = get_cell(container, 1, 0);
    const rect = td.getBoundingClientRect();
    td.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + 10,
        clientY: rect.top + rect.height / 2,
      }),
    );
    await next_frame();
    await next_frame();

    // Cell is now mounted. Its pointer_state should have been seeded true.
    const sub = active_subview_view();
    expect(sub.state.field(pointer_down_field)).toBe(true);
  });

  it('does NOT seed when main pointer is already released before cell mount (fast click)', async () => {
    view = mount_editor(container, TABLE_WITH_BOLD);
    await next_frame();
    await next_frame();

    // Fast click: mousedown latches main.pointer_down, mouseup clears it
    // BEFORE the rAF-deferred cell creation fires. By the time the cell
    // mounts, main.pointer_down is false → no seed.
    const td = get_cell(container, 1, 0);
    const rect = td.getBoundingClientRect();
    td.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + 10,
        clientY: rect.top + rect.height / 2,
      }),
    );
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await next_frame();
    await next_frame();

    const sub = active_subview_view();
    expect(sub.state.field(pointer_down_field)).toBe(false);
  });

  it('document mouseup clears the seeded cell pointer_down (cell mouse-release path)', async () => {
    view = mount_editor(container, TABLE_WITH_BOLD);
    await next_frame();
    await next_frame();

    view.contentDOM.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
    );
    const td = get_cell(container, 1, 0);
    const rect = td.getBoundingClientRect();
    td.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + 10,
        clientY: rect.top + rect.height / 2,
      }),
    );
    await next_frame();
    await next_frame();

    const sub = active_subview_view();
    expect(sub.state.field(pointer_down_field)).toBe(true);

    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await next_frame();
    expect(sub.state.field(pointer_down_field)).toBe(false);
  });
});
