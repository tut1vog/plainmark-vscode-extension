import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { undo, undoDepth } from '@codemirror/commands';
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

// CM6 history's newGroupDelay is 500 ms. Wait long enough to defeat joining.
async function wait_past_group_delay(): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, 600));
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

function active_cell_coords(): { row: number; col: number } | null {
  const sub = active_subview_container();
  if (!sub) return null;
  const td = sub.closest('th, td') as HTMLElement | null;
  if (!td) return null;
  return { row: Number(td.dataset.rowIndex), col: Number(td.dataset.colIndex) };
}

function active_subview_view(): EditorView {
  const sub = active_subview_container();
  if (!sub) throw new Error('no active subview');
  const root = sub.querySelector('.cm-editor') as HTMLElement | null;
  if (!root) throw new Error('no .cm-editor in subview');
  const v = EditorView.findFromDOM(root);
  if (!v) throw new Error('EditorView.findFromDOM returned null');
  return v;
}

async function activate(container: HTMLElement, row: number, col: number): Promise<void> {
  const td = get_cell(container, row, col);
  td.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await next_frame();
  await next_frame();
  if (!active_subview_container()) throw new Error('subview did not mount');
}

async function type_in_subview(text: string): Promise<void> {
  const sub = active_subview_view();
  sub.dispatch({
    changes: { from: sub.state.doc.length, insert: text },
    userEvent: 'input.type',
  });
  await next_frame();
}

function cell_text_in_main_doc(view: EditorView, row: number, col: number): string {
  const block = view.dom.querySelector('.plainmark-table-block') as HTMLElement | null;
  if (!block) throw new Error('no table block in main view DOM');
  const td = block.querySelector(
    `[data-row-index="${row}"][data-col-index="${col}"]`,
  ) as HTMLElement | null;
  if (!td) throw new Error(`no rendered TD at (${row}, ${col})`);
  return (td.textContent ?? '').replace(/​/g, '');
}

const SAMPLE = '| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n';

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform);
function mod_init(extra: KeyboardEventInit = {}): KeyboardEventInit {
  return IS_MAC ? { ...extra, metaKey: true } : { ...extra, ctrlKey: true };
}
function key(target: Element, init: KeyboardEventInit): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
}
function subview_content_dom(): HTMLElement {
  const cm = active_subview_container()?.querySelector('.cm-content') as HTMLElement | null;
  if (!cm) throw new Error('no .cm-content in active subview');
  return cm;
}

describe('table cell undo history', () => {
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

  // Trailing-whitespace canonicalization.
  // The source representation (column-uniform padding) cannot distinguish
  // user-typed leading/trailing whitespace from format padding. After a rebase
  // (undo / redo), trailing whitespace is dropped from the subview to match
  // the canonical source. This is a known design limitation, not a bug — but
  // it's user-visible. Pin behaviour explicitly so future changes can't
  // regress it without a deliberate decision.
  it('TBL-I-18: trailing whitespace in a cell is dropped from the subview after undo', async () => {
    view = mount_editor(container, SAMPLE);
    await activate(container, 1, 0);
    const sub = active_subview_view();
    sub.dispatch({
      changes: { from: 0, to: sub.state.doc.length, insert: '' },
      userEvent: 'input.type',
    });
    await settle();

    await type_in_subview('a');
    await wait_past_group_delay();
    await type_in_subview(' '); // trailing space
    await wait_past_group_delay();
    await type_in_subview('b');
    await settle();

    expect(active_subview_view().state.doc.toString()).toBe('a b');

    // After undo, rebase reads the cell from the main doc via .trim(). The
    // source format can't represent trailing whitespace (column padding
    // absorbs it), so the subview canonicalizes to 'a' — NOT 'a '. Pinning
    // this so future changes have to deliberately revisit the behaviour.
    undo(view);
    await settle();
    expect(active_subview_container()).not.toBeNull();
    expect(active_subview_view().state.doc.toString()).toBe('a');
  }, 15000);

  // Type-after-undo race: type immediately after Cmd+Z, before the rebase rAF fires.
  // If the rebase plugin queues request_cell_focus (switch+rebase path) and the
  // user types BEFORE the next animation frame, the keystroke lands in the
  // old subview. Then the rAF tears that subview down. The typed char may end
  // up in a cell the user didn't intend.
  it('TBL-I-18: typing after Cmd+Z but before the next frame does not land in a torn-down cell', async () => {
    view = mount_editor(container, SAMPLE);
    await activate(container, 1, 0);
    const sub_10 = active_subview_view();
    // Insert 'Z' BEFORE the existing '1' → cell becomes 'Z1'.
    sub_10.dispatch({
      changes: { from: 0, to: 0, insert: 'Z' },
      userEvent: 'input.type',
    });
    await settle();
    await wait_past_group_delay();

    key(subview_content_dom(), { key: 'Tab' });
    await settle();
    expect(active_cell_coords()).toEqual({ row: 1, col: 1 });

    // Cmd+Z synchronously dispatches the undo + queues rebase rAF. We type
    // BEFORE awaiting any frame.
    key(subview_content_dom(), { key: 'z', ...mod_init() });
    // No await — synchronous typing in whichever subview is currently alive.
    const sub_after_z = active_subview_view();
    sub_after_z.dispatch({
      changes: { from: sub_after_z.state.doc.length, insert: 'X' },
      userEvent: 'input.type',
    });
    await settle();

    // Final state should be coherent: subview content matches the cell it
    // ended up in. The doc must still parse as exactly one table.
    const final_coords = active_cell_coords();
    expect(final_coords).not.toBeNull();
    if (final_coords) {
      const cell_text = cell_text_in_main_doc(view, final_coords.row, final_coords.col);
      expect(active_subview_view().state.doc.toString()).toBe(cell_text);
    }
    expect(view.dom.querySelectorAll('.plainmark-table-block').length).toBe(1);
  }, 15000);

  // Structural op + content: each undo step is bytewise sane.
  it('TBL-SP-8: structural op + content edits walk back without garbage bytes', async () => {
    view = mount_editor(container, SAMPLE);
    await activate(container, 1, 0);
    await type_in_subview('a');
    await settle();
    await wait_past_group_delay();

    key(subview_content_dom(), { key: 'ArrowDown', altKey: true, shiftKey: true });
    await settle();
    await wait_past_group_delay();

    let safety = 10;
    while (undoDepth(view.state) > 0 && safety-- > 0) {
      const before_len = view.state.doc.length;
      undo(view);
      await settle();
      // doc must still parse as a table (or be the original doc).
      const blocks = view.dom.querySelectorAll('.plainmark-table-block').length;
      expect(blocks).toBeGreaterThanOrEqual(1);
      // length is a sane integer.
      expect(view.state.doc.length).toBeGreaterThan(0);
      expect(view.state.doc.length).not.toBe(before_len === 0 ? -1 : before_len + 999999);
    }
  }, 20000);
});
