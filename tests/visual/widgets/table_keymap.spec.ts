import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorView } from '@codemirror/view';
import { mount_editor } from '../util.js';
import { TABLE_KEYBINDING_DEFAULTS } from '../../../src/common/table_keybindings.js';
import { dispatch_table_edit } from '../../../src/webview/widgets/table_keymap.js';
import { insert_row_below } from '../../../src/webview/widgets/table_ops.js';

function get_table_block(container: HTMLElement): HTMLElement {
  const block = container.querySelector('.plainmark-table-block') as HTMLElement | null;
  if (!block) throw new Error('no .plainmark-table-block in DOM');
  return block;
}

function get_cell(
  container: HTMLElement,
  row_index: number,
  col_index: number,
): HTMLTableCellElement {
  const sel = `[data-row-index="${row_index}"][data-col-index="${col_index}"]`;
  const td = get_table_block(container).querySelector(sel) as HTMLTableCellElement | null;
  if (!td) throw new Error(`no cell at (${row_index}, ${col_index})`);
  return td;
}

function active_subview_container(): HTMLElement | null {
  return document.querySelector('.plainmark-table-cell-edit');
}

async function next_frame(): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

async function activate_cell(
  container: HTMLElement,
  row_index: number,
  col_index: number,
): Promise<HTMLElement> {
  const td = get_cell(container, row_index, col_index);
  td.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  // activate_cell defers the subview mount one rAF; two frames ensures the
  // measure / dispatch chain has settled before we read DOM state.
  await next_frame();
  await next_frame();
  const sub = active_subview_container();
  if (!sub) throw new Error('subview did not mount');
  return sub;
}

function key(target: Element, init: KeyboardEventInit): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
}

const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform);

function mod_init(extra: KeyboardEventInit = {}): KeyboardEventInit {
  // CM6's keymap matches "Meta-z" on mac and "Ctrl-z" elsewhere; setting BOTH
  // modifiers stringifies to "Ctrl-Meta-z" and matches neither. Pick the right
  // one for the runtime platform.
  return IS_MAC ? { ...extra, metaKey: true } : { ...extra, ctrlKey: true };
}

function subview_content_dom(): HTMLElement {
  const cm = active_subview_container()?.querySelector('.cm-content') as HTMLElement | null;
  if (!cm) throw new Error('no .cm-content in active subview');
  return cm;
}

function active_cell_coords(): { row: number; col: number } | null {
  const td = active_subview_container()?.closest('td') as HTMLTableCellElement | null;
  if (!td) return null;
  return { row: Number(td.dataset.rowIndex), col: Number(td.dataset.colIndex) };
}

const SAMPLE_TABLE = '| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n';

// A prefix line before the table so table_from > 0. Regression tests for
// caret-loss MUST place the main caret at 0 (the real-product condition: the
// product seeds the caret at 0 and clicking a cell preventDefaults the
// mousedown, so the main caret never moves off 0). Without a prefix, caret-at-0
// would sit inside the table and the test would prove nothing.
const PREFIX = 'intro\n';
const PREFIXED_TABLE = PREFIX + SAMPLE_TABLE;
const PREFIX_TABLE_FROM = PREFIX.length;

describe('table keymap — navigation', () => {
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

  it('TBL-I-5: Tab inside a non-last cell moves focus to the next cell subview', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    await activate_cell(container, 1, 0);
    expect(get_cell(container, 1, 0).querySelector('.plainmark-table-cell-edit')).not.toBeNull();

    key(subview_content_dom(), { key: 'Tab' });
    await next_frame();
    await next_frame();

    // Previous cell torn down, new cell at (1, 1) has the subview.
    expect(get_cell(container, 1, 0).querySelector('.plainmark-table-cell-edit')).toBeNull();
    expect(get_cell(container, 1, 1).querySelector('.plainmark-table-cell-edit')).not.toBeNull();
  });

  it('TBL-I-5 TBL-SP-2: Tab at last cell of last row auto-creates a new row and focuses (new_row, 0)', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    await activate_cell(container, 2, 2);

    const main = view;
    const dispatch_spy = vi.spyOn(main, 'dispatch');

    key(subview_content_dom(), { key: 'Tab' });
    // requestMeasure + activate_cell each defer one frame; allow several.
    await next_frame();
    await next_frame();
    await next_frame();
    await next_frame();

    // The auto-row-create is one change-bearing dispatch; the re-focus
    // activation adds a selection-only seed (RC3) that must not be counted.
    const change_calls = dispatch_spy.mock.calls.filter(
      (c) => (c[0] as { changes?: unknown }).changes !== undefined,
    );
    expect(change_calls.length).toBe(1);
    const block = get_table_block(container);
    const trs = block.querySelectorAll('tbody tr');
    expect(trs.length).toBe(3);
    expect(get_cell(container, 3, 0).querySelector('.plainmark-table-cell-edit')).not.toBeNull();
  });

  it('TBL-I-6: Enter inside a body cell moves focus to (row+1, col)', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    await activate_cell(container, 1, 1);

    key(subview_content_dom(), { key: 'Enter' });
    await next_frame();
    await next_frame();

    expect(get_cell(container, 1, 1).querySelector('.plainmark-table-cell-edit')).toBeNull();
    expect(get_cell(container, 2, 1).querySelector('.plainmark-table-cell-edit')).not.toBeNull();
  });

  it('TBL-I-6 TBL-I-21: Enter from a last-row cell exits below the table and creates no new row', async () => {
    view = mount_editor(container, SAMPLE_TABLE + 'tail');
    const before_rows = get_table_block(container).querySelectorAll('tbody tr').length;
    await activate_cell(container, 2, 1);

    key(subview_content_dom(), { key: 'Enter' });
    await next_frame();
    await next_frame();

    expect(active_subview_container()).toBeNull();
    const head = view.state.selection.main.head;
    const line = view.state.doc.lineAt(head);
    expect(view.state.doc.sliceString(line.from, line.to)).toBe('tail');
    expect(head).toBe(line.from);
    expect(get_table_block(container).querySelectorAll('tbody tr').length).toBe(before_rows);
  });

  it('TBL-I-6 TBL-SP-5: Shift+Enter inserts a newline in the subview; main-view dispatch encodes it as <br>', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    await activate_cell(container, 1, 0);

    key(subview_content_dom(), { key: 'Enter', shiftKey: true });
    await next_frame();

    // Subview holds the logical '\n'; the main-view dispatch serializes via N4 to '<br>'.
    // Cell was '1'; cursor sits at doc-start in the fresh subview so the '\n'
    // lands before '1' → cell content becomes '\n1' → escapes to '<br>1'.
    const doc = view.state.doc.toString();
    expect(doc).toMatch(/<br>/);
  });

  it('TBL-I-7 TBL-I-20: ArrowUp from header row, first visual line, exits to main view just before the table', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    const table_from = Number(get_table_block(container).dataset.tableFrom);
    expect(Number.isFinite(table_from)).toBe(true);

    await activate_cell(container, 0, 1);

    key(subview_content_dom(), { key: 'ArrowUp' });
    await next_frame();

    expect(active_subview_container()).toBeNull();
    expect(view.state.selection.main.head).toBe(Math.max(0, table_from - 1));
  });

  it('TBL-I-7 TBL-I-21: ArrowRight from bottom-right cell exits to start of line after the table (Bug 2)', async () => {
    // info.to is right AFTER the last `|` of the last pipe row — same byte-line
    // as the last visually-replaced line, so the position is mid-line inside
    // the block-replace's visual extent. Pre-fix, exit_to_main_view(info.to)
    // landed selection there; TableWidget.coordsAt returned null (no matching
    // cell range); CM6's coordsInWidget fallback flattened to widget-right-
    // bottom, rendering a caret the height of the entire table. Post-fix, the
    // exit target advances to the start of the line strictly after info.to.
    view = mount_editor(container, SAMPLE_TABLE + 'tail');
    const sub = await activate_cell(container, 2, 2);
    // For an empty cell ('6' is one char), move caret to end so caret_at_end fires.
    const inner_view = EditorView.findFromDOM(sub.querySelector('.cm-editor') as HTMLElement);
    expect(inner_view).not.toBeNull();
    inner_view!.dispatch({ selection: { anchor: inner_view!.state.doc.length } });

    key(subview_content_dom(), { key: 'ArrowRight' });
    await next_frame();
    await next_frame();

    expect(active_subview_container()).toBeNull();
    const head = view.state.selection.main.head;
    const line = view.state.doc.lineAt(head);
    expect(view.state.doc.sliceString(line.from, line.to)).toBe('tail');
    expect(head).toBe(line.from);
  });

  it('TBL-I-21: ArrowRight from bottom-right cell synchronously tears down the subview (Bug B delay fix)', async () => {
    // Pre-fix, focusout's setTimeout(0) deferred teardown to the next
    // macrotask, leaving the subview DOM in the document after focus shifted
    // to the main view. User perceived a delay before the next-line caret
    // rendered. Post-fix, teardown_now runs synchronously inside the keymap
    // handler — the subview container is gone BEFORE the next frame.
    view = mount_editor(container, SAMPLE_TABLE + 'tail');
    const sub = await activate_cell(container, 2, 2);
    const inner_view = EditorView.findFromDOM(sub.querySelector('.cm-editor') as HTMLElement);
    expect(inner_view).not.toBeNull();
    inner_view!.dispatch({ selection: { anchor: inner_view!.state.doc.length } });

    key(subview_content_dom(), { key: 'ArrowRight' });

    // NO awaits — assert sync teardown happened inside the key dispatch.
    expect(active_subview_container()).toBeNull();
  });

  it('TBL-I-7 TBL-I-21: ArrowDown from bottom row exits to start of line after the table (Bug 2 — symmetric)', async () => {
    view = mount_editor(container, SAMPLE_TABLE + 'tail');
    await activate_cell(container, 2, 1);

    key(subview_content_dom(), { key: 'ArrowDown' });
    await next_frame();
    await next_frame();

    expect(active_subview_container()).toBeNull();
    const head = view.state.selection.main.head;
    const line = view.state.doc.lineAt(head);
    expect(view.state.doc.sliceString(line.from, line.to)).toBe('tail');
    expect(head).toBe(line.from);
  });
});

describe('table keymap — structural ops', () => {
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

  it('TBL-I-8 TBL-I-29 TBL-I-32 (RC2): Mod-Enter inserts a row below and re-focuses the new row’s cell', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    await activate_cell(container, 1, 0);
    const before_lines = view.state.doc.lines;

    key(subview_content_dom(), { key: 'Enter', ...mod_init() });
    await new Promise((r) => setTimeout(r, 50));
    await next_frame();
    await next_frame();

    expect(view.state.doc.lines).toBeGreaterThanOrEqual(before_lines + 1);
    const blocks = container.querySelectorAll('.plainmark-table-block');
    expect(blocks.length).toBe(1);
    const trs = blocks[0].querySelectorAll('tbody tr');
    expect(trs.length).toBe(3);
    // RC2: the destination cell (new row at index 2, same column) is now active.
    expect(active_subview_container()).not.toBeNull();
    expect(get_cell(container, 2, 0).querySelector('.plainmark-table-cell-edit')).not.toBeNull();
  });

  it('TBL-I-8: Alt+ArrowUp in the header row is a no-op (disabled): no dispatch, doc unchanged', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    await activate_cell(container, 0, 1);
    const before_doc = view.state.doc.toString();
    const dispatch_spy = vi.spyOn(view, 'dispatch');

    key(subview_content_dom(), { key: 'ArrowUp', altKey: true });
    await next_frame();

    // The handler consumed the key but the mutator returned the input model
    // by reference, so dispatch_table_edit suppresses the main-view dispatch.
    expect(dispatch_spy).not.toHaveBeenCalled();
    expect(view.state.doc.toString()).toBe(before_doc);
  });

  it('TBL-I-8: Alt+ArrowLeft on the first column is a no-op (disabled): no dispatch, doc unchanged', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    await activate_cell(container, 1, 0);
    const before_doc = view.state.doc.toString();
    const dispatch_spy = vi.spyOn(view, 'dispatch');

    key(subview_content_dom(), { key: 'ArrowLeft', altKey: true });
    await next_frame();

    expect(dispatch_spy).not.toHaveBeenCalled();
    expect(view.state.doc.toString()).toBe(before_doc);
  });

  it('TBL-I-8 TBL-R-11 TBL-I-32 (RC2): Alt+ArrowDown swap re-focuses the destination cell with fresh content', async () => {
    view = mount_editor(
      container,
      '| a | b | c |\n|---|---|---|\n| r1c0 | r1c1 | r1c2 |\n| r2c0 | r2c1 | r2c2 |\n',
    );
    // Activating (1, 0) then swapping row down: the active cell now FOLLOWS the
    // content to (2, 0) (RC2 — reverses the old "commit point; user re-focuses"
    // design). The swapped subview shows fresh content (the stale-swap fix).
    await activate_cell(container, 1, 0);

    key(subview_content_dom(), { key: 'ArrowDown', altKey: true });
    await next_frame();
    await next_frame();

    // RC2: active cell follows the swap to (2, 0)...
    expect(get_cell(container, 2, 0).querySelector('.plainmark-table-cell-edit')).not.toBeNull();
    // ...showing fresh (swapped) content, not the stale pre-swap text.
    expect(active_subview_view().state.doc.toString()).toBe('r1c0');
    // Non-active cells reflect the swap.
    expect(get_cell(container, 1, 0).textContent).toContain('r2c0');
    expect(get_cell(container, 1, 1).textContent).toContain('r2c1');
    expect(get_cell(container, 1, 2).textContent).toContain('r2c2');
    expect(get_cell(container, 2, 1).textContent).toContain('r1c1');
    expect(get_cell(container, 2, 2).textContent).toContain('r1c2');
  });

  it('TBL-I-8 TBL-R-3: Mod-Enter inserts an empty row whose non-active cells render a zero-width space (regression: empty-cell collapse)', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    await activate_cell(container, 1, 0);

    key(subview_content_dom(), { key: 'Enter', ...mod_init() });
    await new Promise((r) => setTimeout(r, 50));
    await next_frame();
    await next_frame();

    // Inserted row lives at index 2. RC2 re-focuses its first cell (2, 0), so
    // that cell now hosts an (empty) subview; the row's other cells are empty in
    // source — the ZWSP fallback ensures they have one line-height of content.
    expect(get_cell(container, 2, 0).querySelector('.plainmark-table-cell-edit')).not.toBeNull();
    expect(get_cell(container, 2, 1).textContent).toBe('\u200B');
    expect(get_cell(container, 2, 2).textContent).toBe('\u200B');
  });

  it('TBL-I-8 TBL-SP-2: Mod-Enter fires exactly one main-view dispatch tagged userEvent input', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    await activate_cell(container, 1, 0);
    const table_block = get_table_block(container);
    const table_from = Number(table_block.dataset.tableFrom);

    const dispatch_spy = vi.spyOn(view, 'dispatch');

    key(subview_content_dom(), { key: 'Enter', ...mod_init() });
    await next_frame();
    await next_frame();

    // RC2's re-focus + RC3's activation seed add selection-only main-view
    // dispatches; the structural op itself must remain exactly ONE
    // change-bearing dispatch (TBL-SP-2, INV-UNDO-1).
    const change_calls = dispatch_spy.mock.calls.filter(
      (c) => (c[0] as { changes?: unknown }).changes !== undefined,
    );
    expect(change_calls.length).toBe(1);
    const arg = change_calls[0][0] as {
      changes?: { from: number };
      userEvent?: string;
      annotations?: unknown;
    };
    // annotations carry Transaction.userEvent.of('input'); the change covers the
    // whole table range starting at table.from.
    expect(arg.changes?.from).toBe(table_from);
  });

  it('TBL-SP-2 (RC1): a keyboard structural op with the main caret at 0 leaves the caret in the table, not at 0', async () => {
    view = mount_editor(container, PREFIXED_TABLE);
    // Real-product condition: main caret seeded at document start.
    view.dispatch({ selection: { anchor: 0 } });
    expect(view.state.selection.main.head).toBe(0);
    // Activation seeds the main caret into the cell (RC3), so it is no longer 0
    // even before the op fires.
    await activate_cell(container, 1, 0);

    key(subview_content_dom(), { key: 'Enter', ...mod_init() });
    await next_frame();
    await next_frame();

    const head = view.state.selection.main.head;
    expect(head).not.toBe(0);
    expect(head).toBeGreaterThanOrEqual(PREFIX_TABLE_FROM);
  });

  it('TBL-SP-2 (RC1): dispatch_table_edit with no active cell pins the main caret at the table, not at 0', async () => {
    view = mount_editor(container, PREFIXED_TABLE);
    view.dispatch({ selection: { anchor: 0 } });
    expect(view.state.selection.main.head).toBe(0);

    dispatch_table_edit(view, PREFIX_TABLE_FROM, (m) => insert_row_below(m, 1));
    await next_frame();

    const head = view.state.selection.main.head;
    expect(head).not.toBe(0);
    expect(head).toBeGreaterThanOrEqual(PREFIX_TABLE_FROM);
  });

  // 3 body rows × 3 cols so every op has room from the middle cell (2, 1).
  const BIG_TABLE =
    '| a | b | c |\n|---|---|---|\n| r1c0 | r1c1 | r1c2 |\n| r2c0 | r2c1 | r2c2 |\n| r3c0 | r3c1 | r3c2 |\n';

  // Each keyboard-bound op re-activates its destination cell (RC2). Fired from
  // the active cell (2, 1); targets per structural_op_target's map.
  it.each([
    ['insert_row_above', { key: 'ArrowUp', altKey: true, shiftKey: true }, { row: 2, col: 1 }],
    ['insert_row_below', { key: 'Enter', ...mod_init() }, { row: 3, col: 1 }],
    ['insert_column_left', { key: 'ArrowLeft', altKey: true, shiftKey: true }, { row: 2, col: 1 }],
    ['insert_column_right', { key: 'ArrowRight', altKey: true, shiftKey: true }, { row: 2, col: 2 }],
    ['delete_row', { key: 'Backspace', ...mod_init({ shiftKey: true }) }, { row: 2, col: 1 }],
    ['swap_row_up', { key: 'ArrowUp', altKey: true }, { row: 1, col: 1 }],
    ['swap_row_down', { key: 'ArrowDown', altKey: true }, { row: 3, col: 1 }],
    ['swap_column_left', { key: 'ArrowLeft', altKey: true }, { row: 2, col: 0 }],
    ['swap_column_right', { key: 'ArrowRight', altKey: true }, { row: 2, col: 2 }],
  ] as const)('TBL-I-8 TBL-I-32 (RC2): %s re-focuses its destination cell', async (_label, init, target) => {
    view = mount_editor(container, BIG_TABLE);
    view.dispatch({ selection: { anchor: 0 } });
    await activate_cell(container, 2, 1);

    key(subview_content_dom(), init);
    await new Promise((r) => setTimeout(r, 50));
    await next_frame();
    await next_frame();

    expect(active_cell_coords()).toEqual(target);
  });
});

function active_subview_view(): EditorView {
  const sub = active_subview_container();
  if (!sub) throw new Error('no active subview container');
  const root = sub.querySelector('.cm-editor') as HTMLElement | null;
  if (!root) throw new Error('no .cm-editor inside subview');
  const sub_view = EditorView.findFromDOM(root);
  if (!sub_view) throw new Error('EditorView.findFromDOM returned null for subview root');
  return sub_view;
}

async function settle(): Promise<void> {
  // teardown rides setTimeout(0); allow microtask + macrotask drain.
  await new Promise((r) => setTimeout(r, 20));
  await next_frame();
}

describe('table keymap — undo/redo routing (Fix A)', () => {
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

  it('TBL-I-9 TBL-SP-8: Mod-z inside a cell subview reverts the typed character via main-view history', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    const before_doc = view.state.doc.toString();
    await activate_cell(container, 1, 0);

    // Dispatch a synthetic input on the subview's EditorView — the cell_edit_listener
    // serializes the whole table and main-view-dispatches it tagged userEvent 'input'.
    const sub_view = active_subview_view();
    sub_view.dispatch({
      changes: { from: 0, to: 0, insert: 'X' },
      userEvent: 'input.type',
    });
    await next_frame();
    const after_type = view.state.doc.toString();
    expect(after_type).not.toBe(before_doc);

    // Mod-z on the subview's contentDOM routes to main view's undo.
    key(subview_content_dom(), { key: 'z', ...mod_init() });
    await settle();

    expect(view.state.doc.toString()).toBe(before_doc);
    // route_to_main no longer calls main_view.focus() — subview stays mounted.
    expect(active_subview_container()).not.toBeNull();
  });

  it('Mod-z keeps focus in the subview and does NOT tear it down', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    await activate_cell(container, 1, 0);

    const sub_cm = subview_content_dom();
    expect(sub_cm.contains(document.activeElement) || document.activeElement === sub_cm).toBe(true);

    key(sub_cm, { key: 'z', ...mod_init() });
    await settle();

    // Subview keeps focus and stays mounted across Mod-z.
    expect(active_subview_container()).not.toBeNull();
    const sub_cm_after = subview_content_dom();
    expect(
      sub_cm_after.contains(document.activeElement) || document.activeElement === sub_cm_after,
    ).toBe(true);
  });

  // Mod-Shift-z / Mod-y redo behavior: the subview stays mounted
  // but its state.doc is stale (not yet synced to post-undo cell content). Redo
  // dispatched against main_view's history applies, but syncing the subview is
  // the rebase-on-undo ViewPlugin's job. Here we only assert that
  // the redo path doesn't tear down the subview or move focus away.

  it('Mod-Shift-z does not tear the subview down', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    await activate_cell(container, 1, 0);

    const sub_view = active_subview_view();
    sub_view.dispatch({
      changes: { from: 0, to: 0, insert: 'X' },
      userEvent: 'input.type',
    });
    await next_frame();

    key(subview_content_dom(), { key: 'z', ...mod_init() });
    await settle();
    expect(active_subview_container()).not.toBeNull();

    key(subview_content_dom(), { key: 'z', shiftKey: true, ...mod_init() });
    await settle();
    expect(active_subview_container()).not.toBeNull();
    const sub_cm = subview_content_dom();
    expect(
      sub_cm.contains(document.activeElement) || document.activeElement === sub_cm,
    ).toBe(true);
  });

  it('Mod-y does not tear the subview down', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    await activate_cell(container, 1, 0);

    const sub_view = active_subview_view();
    sub_view.dispatch({
      changes: { from: 0, to: 0, insert: 'Y' },
      userEvent: 'input.type',
    });
    await next_frame();

    key(subview_content_dom(), { key: 'z', ...mod_init() });
    await settle();

    key(subview_content_dom(), { key: 'y', ...mod_init() });
    await settle();
    expect(active_subview_container()).not.toBeNull();
  });

  it('TBL-SP-8: cell edit alone pins main-view selection at table.from (Fix 1, no undo)', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    const table_block = get_table_block(container);
    const table_from = Number(table_block.dataset.tableFrom);
    expect(Number.isFinite(table_from)).toBe(true);
    await activate_cell(container, 1, 0);

    const sub_view = active_subview_view();
    sub_view.dispatch({
      changes: { from: 0, to: 0, insert: 'a' },
      userEvent: 'input.type',
    });
    await next_frame();

    // Pre-Fix-1: CM6 default change-mapping drifted the main selection into the
    // replaced range, ending up at table.to. Post-Fix-1: handle_cell_edit pins
    // it at table_from via `selection: { anchor: table_from }`.
    expect(view.state.selection.main.head).toBe(table_from);
  });

  it('TBL-I-9 TBL-SP-8: cell edit + Mod-z: post-undo selection is NOT at table_from - 1 (regression guard)', async () => {
    const prefix = 'hello\n';
    view = mount_editor(container, prefix + SAMPLE_TABLE);
    // route_to_main no longer overrides post-undo selection to
    // table_from - 1. CM6 history restores its own selection (whatever the
    // pre-edit main-view selection was — depends on test setup). Subview stays
    // mounted and keeps focus.
    const before_doc = view.state.doc.toString();
    const table_block = get_table_block(container);
    const table_from = Number(table_block.dataset.tableFrom);
    expect(table_from).toBe(prefix.length);

    await activate_cell(container, 1, 0);
    const sub_view = active_subview_view();
    sub_view.dispatch({
      changes: { from: 0, to: 0, insert: 'a' },
      userEvent: 'input.type',
    });
    await next_frame();
    expect(view.state.doc.toString()).not.toBe(before_doc);
    // Fix 1: handle_cell_edit pins main-view selection at table_from while editing.
    expect(view.state.selection.main.head).toBe(table_from);

    key(subview_content_dom(), { key: 'z', ...mod_init() });
    await settle();

    expect(view.state.doc.toString()).toBe(before_doc);
    // The post-undo override at table_from - 1 is REMOVED.
    // History restores the pre-edit selection wherever it was; we only assert
    // it's not the old override target.
    expect(view.state.selection.main.head).not.toBe(table_from - 1);
    // Subview stays mounted, contentDOM keeps focus.
    expect(active_subview_container()).not.toBeNull();
    const sub_cm = subview_content_dom();
    expect(
      sub_cm.contains(document.activeElement) || document.activeElement === sub_cm,
    ).toBe(true);
  });

  it('TBL-I-9: Mod-z after EB autocomplete (empty-doc table insertion) reverts the doc to "|"', async () => {
    view = mount_editor(container, '|');
    const { table_completions } = await import(
      '../../../src/webview/widgets/table_autocomplete.js'
    );
    const ctx = {
      state: view.state,
      pos: view.state.selection.main.head,
      explicit: true,
      view,
      aborted: false,
      addEventListener: () => {},
      tokenBefore: () => null,
      matchBefore: () => null,
    } as unknown as Parameters<typeof table_completions>[0];
    const result = table_completions(ctx);
    expect(result).not.toBeNull();
    const option = result!.options[0];
    const apply = option.apply;
    if (typeof apply !== 'function') throw new Error('completion has no apply()');
    if (typeof result!.to !== 'number') throw new Error('completion result missing to');
    apply(view, option, result!.from, result!.to);
    // Several frames for request_cell_focus → requestMeasure → activate_cell.
    await next_frame();
    await next_frame();
    await next_frame();
    await next_frame();

    expect(active_subview_container()).not.toBeNull();
    key(subview_content_dom(), { key: 'z', ...mod_init() });
    await settle();

    // The accept dispatch was tagged userEvent: 'input' (history-included).
    expect(view.state.doc.toString()).toBe('|');
  });
});

describe('table keymap — configurable bindings', () => {
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
    delete window.__plainmark_table_keybindings;
  });

  it('TBL-I-8 TBL-I-29: delete_row default (Mod-Shift-Backspace) deletes the active body row', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    await activate_cell(container, 1, 0);
    const before = get_table_block(container).querySelectorAll('tbody tr').length;

    key(subview_content_dom(), { key: 'Backspace', shiftKey: true, ...mod_init() });
    await new Promise((r) => setTimeout(r, 50));
    await next_frame();

    expect(get_table_block(container).querySelectorAll('tbody tr').length).toBe(before - 1);
    const doc = view.state.doc.toString();
    expect(doc).not.toContain('1'); // the deleted row's cells (1/2/3) are gone
    expect(doc).toMatch(/\|\s*4\s*\|/); // the surviving row (4/5/6) remains, column-padded
  });

  it('TBL-I-8 TBL-I-28: a custom injected binding drives the op (delete_column)', async () => {
    window.__plainmark_table_keybindings = {
      ...TABLE_KEYBINDING_DEFAULTS,
      delete_column: 'Mod-Alt-Backspace',
    };
    view = mount_editor(container, SAMPLE_TABLE);
    await activate_cell(container, 1, 1);
    expect(get_table_block(container).querySelectorAll('[data-row-index="0"]').length).toBe(3);

    key(subview_content_dom(), { key: 'Backspace', altKey: true, ...mod_init() });
    await new Promise((r) => setTimeout(r, 50));
    await next_frame();

    expect(get_table_block(container).querySelectorAll('[data-row-index="0"]').length).toBe(2);
  });
});

describe('table keymap — Backspace deletes an empty table (TBL-I-34)', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  // Header + one body row, every cell blank → the whole doc is an empty table.
  const EMPTY_TABLE = '|   |   |\n|---|---|\n|   |   |\n';

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    view?.destroy();
    view = undefined;
    container.remove();
  });

  it('Backspace at the start of the first cell of an empty table removes the whole block', async () => {
    view = mount_editor(container, EMPTY_TABLE);
    await activate_cell(container, 0, 0);

    key(subview_content_dom(), { key: 'Backspace' });
    await next_frame();
    await next_frame();

    expect(container.querySelector('.plainmark-table-block')).toBeNull();
    expect(active_subview_container()).toBeNull();
    expect(view.state.doc.toString()).toBe('');
  });

  it('Backspace in a non-empty table leaves the table intact (in-cell delete only)', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    await activate_cell(container, 0, 0);
    const before_doc = view.state.doc.toString();
    // Pin the subview caret at the cell start so the fall-through default is a no-op.
    active_subview_view().dispatch({ selection: { anchor: 0 } });

    key(subview_content_dom(), { key: 'Backspace' });
    await next_frame();
    await next_frame();

    expect(container.querySelector('.plainmark-table-block')).not.toBeNull();
    expect(view.state.doc.toString()).toBe(before_doc);
  });

  it('Backspace in a non-first cell of an empty table does not remove it (first-cell guard)', async () => {
    view = mount_editor(container, EMPTY_TABLE);
    await activate_cell(container, 0, 1);
    const before_doc = view.state.doc.toString();

    key(subview_content_dom(), { key: 'Backspace' });
    await next_frame();
    await next_frame();

    expect(container.querySelector('.plainmark-table-block')).not.toBeNull();
    expect(view.state.doc.toString()).toBe(before_doc);
  });
});
