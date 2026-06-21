import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor } from '../util.js';

async function next_frame(): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

function get_cell(
  container: HTMLElement,
  row_index: number,
  col_index: number,
): HTMLTableCellElement {
  const sel = `[data-row-index="${row_index}"][data-col-index="${col_index}"]`;
  const block = container.querySelector('.plainmark-table-block');
  if (!block) throw new Error('no .plainmark-table-block');
  const td = block.querySelector(sel) as HTMLTableCellElement | null;
  if (!td) throw new Error(`no cell at (${row_index}, ${col_index})`);
  return td;
}

const TRANSPARENT = 'rgba(0, 0, 0, 0)';
const SAMPLE = '| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |\n';

// CM6 drawSelection re-enables the opaque system `Highlight` color for native
// ::selection inside any focused descendant of .cm-content — a cell subview is
// exactly that. editor_extensions_core re-hides it so the only selection paint
// is the translucent clipped layer, matching outside-table selection.
describe('SHELL-X-11 — cell-subview selection color matches outside-table', () => {
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

  it('subview .cm-line ::selection background is transparent (no opaque Highlight)', async () => {
    view = mount_editor(container, SAMPLE);
    await next_frame();
    await next_frame();

    // Body cell (1,0) — first body row.
    const td = get_cell(container, 1, 0);
    td.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await next_frame();
    await next_frame();

    const sub_content = td.querySelector('.cm-content') as HTMLElement | null;
    expect(sub_content).not.toBeNull();
    expect(sub_content!.contains(document.activeElement)).toBe(true);

    const sub_line = td.querySelector('.cm-line') as HTMLElement | null;
    expect(sub_line).not.toBeNull();

    const bg = getComputedStyle(sub_line!, '::selection').backgroundColor;
    expect(bg).toBe(TRANSPARENT);
  });

  it('main-view .cm-line ::selection is also transparent (parity)', async () => {
    view = mount_editor(container, SAMPLE);
    await next_frame();
    await next_frame();

    const main_line = container.querySelector('.cm-content > .cm-line') as HTMLElement | null;
    expect(main_line).not.toBeNull();
    const bg = getComputedStyle(main_line!, '::selection').backgroundColor;
    expect(bg).toBe(TRANSPARENT);
  });
});
