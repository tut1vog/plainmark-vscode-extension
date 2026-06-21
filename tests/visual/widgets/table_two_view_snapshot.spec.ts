import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor } from '../util.js';
import { get_active_cell_snapshot } from '../../../src/webview/widgets/table.js';

async function next_frame(): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
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

async function activate_cell(
  container: HTMLElement,
  row_index: number,
  col_index: number,
): Promise<void> {
  const td = get_cell(container, row_index, col_index);
  td.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  // activate_cell defers subview creation by one requestAnimationFrame.
  await next_frame();
  await next_frame();
}

const SAMPLE = '| col one | b |\n|---|---|\n| r1c0 | r1c1 |\n';

describe('table active-cell snapshot is scoped per main view', () => {
  let container_a: HTMLElement;
  let container_b: HTMLElement;
  let view_a: EditorView | undefined;
  let view_b: EditorView | undefined;

  beforeEach(() => {
    container_a = document.createElement('div');
    container_b = document.createElement('div');
    document.body.appendChild(container_a);
    document.body.appendChild(container_b);
  });

  afterEach(() => {
    view_a?.destroy();
    view_b?.destroy();
    view_a = undefined;
    view_b = undefined;
    container_a.remove();
    container_b.remove();
  });

  it('activating a cell in one view leaves the other view\'s snapshot null', async () => {
    view_a = mount_editor(container_a, SAMPLE);
    view_b = mount_editor(container_b, SAMPLE);
    await next_frame();
    await next_frame();

    await activate_cell(container_a, 1, 0);

    const snap_a = get_active_cell_snapshot(view_a);
    expect(snap_a).not.toBeNull();
    expect(snap_a?.row).toBe(1);
    expect(snap_a?.col).toBe(0);
    expect(get_active_cell_snapshot(view_b)).toBeNull();
  });

  it('the second view gets its own snapshot, independent of the first', async () => {
    view_a = mount_editor(container_a, SAMPLE);
    view_b = mount_editor(container_b, SAMPLE);
    await next_frame();
    await next_frame();

    await activate_cell(container_a, 1, 0);
    const snap_a = get_active_cell_snapshot(view_a);
    expect(snap_a?.row).toBe(1);
    expect(snap_a?.col).toBe(0);
    const sub_view_a = snap_a?.sub_view;

    // Activating in view B steals focus → view A's subview blurs and tears down
    // (legitimate focus semantics). The cross-talk guarantee under test is that
    // view B's snapshot is keyed to view B alone: it reflects B's own cell and
    // its own subview, never inheriting A's coordinates or EditorView.
    await activate_cell(container_b, 1, 1);
    const snap_b = get_active_cell_snapshot(view_b);
    expect(snap_b?.row).toBe(1);
    expect(snap_b?.col).toBe(1);
    expect(snap_b?.sub_view).not.toBe(sub_view_a);
  });
});
