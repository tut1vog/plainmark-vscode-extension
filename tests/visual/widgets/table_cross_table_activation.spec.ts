import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { mount_editor, next_frame } from '../util.js';
import { dispatch_host_sync_to_view } from '../../../src/webview/sync.js';
import { get_active_cell_snapshot } from '../../../src/webview/widgets/table.js';

const DOC =
  'First table:\n\n' +
  '| Fruit  | Colour |\n| ------ | ------ |\n| apple  | red    |\n| banana | yellow |\n\n' +
  'Second table:\n\n' +
  '| Item  | Note    |\n| ----- | ------- |\n| alpha | cherry7 |\n| beta  | plain   |\n';

async function settle(): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, 20));
  await next_frame();
  await next_frame();
}

function cell_of(block: HTMLElement, row: number, col: number): HTMLTableCellElement {
  const td = block.querySelector(
    `[data-row-index="${row}"][data-col-index="${col}"]`,
  ) as HTMLTableCellElement | null;
  if (!td) throw new Error(`no cell at (${row}, ${col})`);
  return td;
}

function subview_in(td: HTMLElement): EditorView | null {
  const root = td.querySelector('.plainmark-table-cell-edit .cm-editor') as HTMLElement | null;
  return root ? EditorView.findFromDOM(root) : null;
}

async function press(td: HTMLTableCellElement): Promise<void> {
  const rect = td.getBoundingClientRect();
  td.dispatchEvent(
    new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + 4,
      clientY: rect.top + rect.height / 2,
    }),
  );
  await next_frame();
  await next_frame();
}

describe('TBL-I-18: pressing a cell in another table while a cell is active', () => {
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
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  async function activate_a_then_b(): Promise<{ b_td: HTMLTableCellElement; b_from: number }> {
    view = mount_editor(container, DOC);
    await next_frame();
    await next_frame();
    const blocks = container.querySelectorAll<HTMLElement>('.plainmark-table-block');
    expect(blocks).toHaveLength(2);
    const a_td = cell_of(blocks[0], 1, 0);
    const b_td = cell_of(blocks[1], 1, 1);

    await press(a_td);
    expect(subview_in(a_td)).not.toBeNull();

    await press(b_td);
    // let A's deferred focusout teardown run
    await settle();
    expect(subview_in(a_td)).toBeNull();
    return { b_td, b_from: Number(blocks[1].dataset.tableFrom) };
  }

  it("the pressed cell keeps its subview, snapshot, and active attribute after the old cell's teardown", async () => {
    const { b_td, b_from } = await activate_a_then_b();

    const sub = subview_in(b_td);
    expect(sub).not.toBeNull();
    expect(sub!.state.doc.toString()).toBe('cherry7');
    const snapshot = get_active_cell_snapshot(view!);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.sub_view).toBe(sub);
    expect(snapshot!).toMatchObject({ table_from: b_from, row: 1, col: 1 });
    expect(view!.dom.hasAttribute('data-plainmark-cell-active')).toBe(true);
  });

  it('a host-sync edit to the pressed cell survives the next keystroke', async () => {
    const { b_td } = await activate_a_then_b();

    dispatch_host_sync_to_view(view!, DOC.replace('cherry7', 'cherry7-EXT'));
    await settle();

    const sub = subview_in(b_td);
    expect(sub).not.toBeNull();
    expect(sub!.state.doc.toString()).toBe('cherry7-EXT');
    sub!.dispatch({
      changes: { from: sub!.state.doc.length, insert: 'z' },
      userEvent: 'input.type',
    });
    await settle();

    expect(view!.state.doc.toString()).toContain('cherry7-EXTz');
    expect(view!.state.doc.toString()).not.toContain('cherry7z');
  });
});
