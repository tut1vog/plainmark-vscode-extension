import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { mount_editor } from '../util.js';

async function next_frame(): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

async function settle(): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, 20));
  await next_frame();
  await next_frame();
}

function get_table_block(container: HTMLElement): HTMLElement {
  const block = container.querySelector('.plainmark-table-block') as HTMLElement | null;
  if (!block) throw new Error('no .plainmark-table-block');
  return block;
}

function get_cell(
  container: HTMLElement,
  row_index: number,
  col_index: number,
): HTMLTableCellElement {
  const sel = `[data-row-index="${row_index}"][data-col-index="${col_index}"]`;
  const block = get_table_block(container);
  const td = block.querySelector(sel) as HTMLTableCellElement | null;
  if (!td) throw new Error(`no cell at (${row_index}, ${col_index})`);
  return td;
}

function active_subview_container(): HTMLElement | null {
  return document.querySelector('.plainmark-table-cell-edit');
}

function active_subview_view(): EditorView {
  const sub = active_subview_container();
  if (!sub) throw new Error('no active subview container');
  const root = sub.querySelector('.cm-editor') as HTMLElement | null;
  if (!root) throw new Error('no .cm-editor inside subview');
  const sub_view = EditorView.findFromDOM(root);
  if (!sub_view) throw new Error('EditorView.findFromDOM returned null');
  return sub_view;
}

async function activate_cell(
  container: HTMLElement,
  row_index: number,
  col_index: number,
): Promise<void> {
  const td = get_cell(container, row_index, col_index);
  td.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await next_frame();
  await next_frame();
  if (!active_subview_container()) throw new Error('subview did not mount');
}

const SAMPLE_TABLE = '| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n';

describe('cell typing with space — Bug A1 (post-T10.6.6e smoke)', () => {
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

  // Cell starts with '1'. Clear it first, then exercise space-then-char.
  async function clear_subview(sub: EditorView): Promise<void> {
    sub.dispatch({
      changes: { from: 0, to: sub.state.doc.length, insert: '' },
      userEvent: 'input.type',
    });
    await settle();
  }

  it('typing space then a character keeps the subview alive and focused', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    await activate_cell(container, 1, 0);
    const sub_before = active_subview_view();
    const sub_cm_dom_before = sub_before.contentDOM;
    await clear_subview(sub_before);
    // After clear_subview the cell is empty in main; subview must still be alive.
    expect(active_subview_container(), 'subview after clear').not.toBeNull();
    expect(active_subview_view()).toBe(sub_before);

    // Type space — subview doc becomes ' '. handle_cell_edit dispatches a
    // whole-table replace on main; serialized cell padding produces the same
    // bytes as the empty case, so trimmed content_signature is unchanged.
    sub_before.dispatch({
      changes: { from: 0, to: 0, insert: ' ' },
      userEvent: 'input.type',
    });
    await settle();

    // Subview should still be active and the SAME EditorView.
    expect(
      active_subview_container(),
      'subview after typing single space',
    ).not.toBeNull();
    const sub_mid = active_subview_view();
    expect(sub_mid).toBe(sub_before);
    expect(sub_mid.state.doc.toString()).toBe(' ');

    // Type 'a' — subview doc becomes ' a'. Trimmed content goes from '' to 'a'
    // so content_signature changes; updateDOM fires; active cell must be
    // preserved by the skip-active-td path.
    sub_mid.dispatch({
      changes: { from: 1, to: 1, insert: 'a' },
      userEvent: 'input.type',
    });
    await settle();

    // Subview MUST still be alive, same EditorView, contentDOM intact.
    expect(active_subview_container()).not.toBeNull();
    const sub_after = active_subview_view();
    expect(sub_after).toBe(sub_before);
    expect(sub_after.state.doc.toString()).toBe(' a');
    expect(sub_after.contentDOM).toBe(sub_cm_dom_before);
    expect(
      sub_after.contentDOM.contains(document.activeElement) ||
        document.activeElement === sub_after.contentDOM,
    ).toBe(true);
  });

  it('typing a, space, b keeps the subview alive (in-cell space mid-token)', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    await activate_cell(container, 1, 0);
    const sub = active_subview_view();
    const cm_dom_before = sub.contentDOM;
    await clear_subview(sub);

    for (const ch of 'a b') {
      sub.dispatch({
        changes: { from: sub.state.doc.length, insert: ch },
        userEvent: 'input.type',
      });
      await settle();
      expect(active_subview_container()).not.toBeNull();
    }
    const sub_after = active_subview_view();
    expect(sub_after).toBe(sub);
    expect(sub_after.contentDOM).toBe(cm_dom_before);
    expect(sub_after.state.doc.toString()).toBe('a b');
    expect(
      sub_after.contentDOM.contains(document.activeElement) ||
        document.activeElement === sub_after.contentDOM,
    ).toBe(true);
  });
});
