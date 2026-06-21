import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { undo } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import { mount_editor } from '../util.js';
import { dispatch_host_sync_to_view } from '../../../src/webview/sync.js';
import { table_completions } from '../../../src/webview/widgets/table_autocomplete.js';
import {
  get_active_cell_snapshot,
  lookup_cell_range,
} from '../../../src/webview/widgets/table.js';

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

function active_cell_coords(): { row: number; col: number; table_from: number } | null {
  const sub = active_subview_container();
  if (!sub) return null;
  const td = sub.closest('th, td') as HTMLElement | null;
  const block = sub.closest('.plainmark-table-block') as HTMLElement | null;
  if (!td || !block) return null;
  const row = Number(td.dataset.rowIndex);
  const col = Number(td.dataset.colIndex);
  const tf = Number(block.dataset.tableFrom);
  if (!Number.isFinite(row) || !Number.isFinite(col) || !Number.isFinite(tf)) return null;
  return { row, col, table_from: tf };
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

function fire_accept(view: EditorView): void {
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
  if (!result) throw new Error('table_completions returned null in fire_accept');
  const option = result.options[0];
  const apply = option.apply;
  if (typeof apply !== 'function') throw new Error('completion has no apply()');
  if (typeof result.to !== 'number') throw new Error('completion result missing to');
  apply(view, option, result.from, result.to);
}

const SAMPLE_TABLE = '| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n';

// A prefix line so table_from > 0 and a main caret at 0 sits BEFORE the table
// (the real-product condition; see table_keymap.spec.ts).
const PREFIX = 'intro\n';
const PREFIXED_TABLE = PREFIX + SAMPLE_TABLE;
const PREFIX_TABLE_FROM = PREFIX.length;

describe('T10.6.6e — rebase-on-undo ViewPlugin', () => {
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
    document.querySelectorAll('.cm-tooltip-autocomplete').forEach((el) => el.remove());
  });

  // Scenario (a) — in-cell single-keystroke undo.
  it('TBL-I-18 TBL-I-9: (a) in-cell Mod-z rebases subview content and keeps the cell active', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    await activate_cell(container, 1, 0);
    const sub = active_subview_view();

    // Type 'X' before the original '1'.
    sub.dispatch({
      changes: { from: 0, to: 0, insert: 'X' },
      userEvent: 'input.type',
    });
    await next_frame();
    expect(sub.state.doc.toString()).toBe('X1');

    // Mod-z routes to undo(main_view). Subview should rebase to post-undo content '1'.
    key(subview_content_dom(), { key: 'z', ...mod_init() });
    await settle();

    // Same subview, same cell.
    expect(active_subview_container()).not.toBeNull();
    expect(active_cell_coords()).toEqual({ row: 1, col: 0, table_from: 0 });

    // Subview content reflects post-undo cell text.
    const sub_after = active_subview_view();
    expect(sub_after.state.doc.toString()).toBe('1');

    // Subview's contentDOM still has focus.
    const sub_cm = subview_content_dom();
    expect(sub_cm.contains(document.activeElement) || document.activeElement === sub_cm).toBe(true);
  });

  // Scenario (b) — cross-cell undo: edit (0,0), Tab to (0,1), Mod-z reverts the
  // (0,0) edit. Per locked spec Q3: active cell switches back to (0,0).
  it('TBL-I-18: (b) Mod-z reverting an edit in a different cell switches active cell back', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    await activate_cell(container, 1, 0);
    const sub_00 = active_subview_view();

    sub_00.dispatch({
      changes: { from: 0, to: 0, insert: 'Z' },
      userEvent: 'input.type',
    });
    await next_frame();

    // Tab to (1, 1). The Tab keymap tears down the (1,0) subview and activates (1,1).
    key(subview_content_dom(), { key: 'Tab' });
    await settle();
    expect(active_cell_coords()).toEqual({ row: 1, col: 1, table_from: 0 });

    // Mod-z reverts the (1,0) edit (the most recent main-view history event).
    key(subview_content_dom(), { key: 'z', ...mod_init() });
    await settle();

    // Active cell switches BACK to (1, 0) per locked-spec Q3 cross-cell rule.
    expect(active_subview_container()).not.toBeNull();
    expect(active_cell_coords()).toEqual({ row: 1, col: 0, table_from: 0 });

    // Subview content reflects post-undo cell (1, 0) content ('1' — original).
    const sub_after = active_subview_view();
    expect(sub_after.state.doc.toString()).toBe('1');
  });

  // Scenario (c) — structural undo (insert row, then Mod-z removes the row).
  // The undo's change range spans the structural op; per locked-spec, teardown
  // current subview and reactivate at the post-undo cursor position.
  it('TBL-I-18: (c) Mod-z reverting a structural insert-row teardowns and reactivates at the cursor', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    await activate_cell(container, 1, 0);
    const sub = active_subview_view();
    sub.dispatch({
      changes: { from: 0, to: 0, insert: 'a' },
      userEvent: 'input.type',
    });
    await next_frame();

    // Mod-Enter (Ctrl/Cmd+Enter) — insert row below (1, 0). Structural op.
    key(subview_content_dom(), { key: 'Enter', ...mod_init() });
    await settle();

    // Dimension change rebuilds the widget; TableWidget.destroy fires and
    // tears the subview down. Dispatch Mod-z on the still-alive target —
    // subview if it survived, main view otherwise.
    const undo_target = active_subview_container()
      ? subview_content_dom()
      : view.contentDOM;
    key(undo_target, { key: 'z', ...mod_init() });
    await settle();

    // Subview should be present at a reactivated cell — the cell containing
    // the post-undo cursor. Per locked spec, this is at the post-undo cell
    // adjacent to the structural change.
    expect(active_subview_container()).not.toBeNull();
    // Conservative assertion: active cell exists inside the table.
    expect(active_cell_coords()).not.toBeNull();
  });

  // Scenario (d) — type, click outside table (subview teardown), then Mod-z.
  // The plugin must REACTIVATE the cell where the undo's change range lands.
  it('TBL-I-18: (d) Mod-z after subview teardown reactivates the cell where the undo lands', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    await activate_cell(container, 1, 0);
    const sub = active_subview_view();
    sub.dispatch({
      changes: { from: 0, to: 0, insert: 'q' },
      userEvent: 'input.type',
    });
    await next_frame();

    // Simulate clicking outside the table: move focus to main view + dispatch
    // a selection outside the cell range.
    view.focus();
    view.dispatch({ selection: { anchor: 0 } });
    // Allow blur_handler's setTimeout(teardown) to fire.
    await new Promise<void>((r) => setTimeout(r, 30));
    await next_frame();

    // Subview is torn down.
    expect(active_subview_container()).toBeNull();

    // Mod-z fires on the main view's contentDOM (no subview active). With no
    // subview to intercept Mod-z, CM6's default historyKeymap on main_view
    // catches it.
    key(view.contentDOM, { key: 'z', ...mod_init() });
    await settle();

    // The plugin should detect the undo landed in cell (1, 0) and reactivate.
    expect(active_subview_container()).not.toBeNull();
    expect(active_cell_coords()).toEqual({ row: 1, col: 0, table_from: 0 });
  });

  // Scenario (e) — EB autocomplete inserts a table; Mod-z reverts the insertion.
  // No table → no widget → subview destroyed; no reactivation possible.
  it('TBL-I-18: (e) Mod-z after EB autocomplete reverts the table; subview is destroyed, no reactivation', async () => {
    view = mount_editor(container, '|');
    fire_accept(view);
    // Several frames for request_cell_focus → activate_cell.
    await next_frame();
    await next_frame();
    await next_frame();
    expect(active_subview_container()).not.toBeNull();

    key(subview_content_dom(), { key: 'z', ...mod_init() });
    await settle();

    // Doc reverts to '|' (no table).
    expect(view.state.doc.toString()).toBe('|');
    // Subview destroyed (TableWidget.destroy fired); no cell to reactivate.
    expect(active_subview_container()).toBeNull();
  });
});

describe('caret survives undo of a multi-line (<br>) cell edit', () => {
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

  // Reproduces "Ctrl+Enter makes a <br>, Ctrl+Z loses the caret". The undo
  // shrinks the active subview from two lines to one; in a real host that
  // shrink can drop the subview's `.cm-focused` class (hiding drawSelection's
  // caret) and leave the subview unfocused, so the focusout teardown reaps it.
  // Headless Chromium never drops focus on its own, so we force the host focus
  // loss with an explicit blur() to exercise the path. The rebase fix must
  // refocus the subview synchronously, before the focusout teardown timer runs.
  it('TBL-I-18: undo of a soft-break cell refocuses the subview (no teardown)', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    await activate_cell(container, 1, 0);
    const sub = active_subview_view();

    // Soft line break at end of cell "1" → subview "1\n" (serializes to "1<br>").
    sub.dispatch({
      changes: { from: sub.state.doc.length, insert: '\n' },
      selection: { anchor: sub.state.doc.length + 1 },
      userEvent: 'input',
    });
    await settle();
    expect(active_subview_view().state.doc.toString()).toBe('1\n');

    // Simulate the real-host focus loss during the undo widget rebuild, then
    // undo synchronously (rebase must refocus before the teardown setTimeout(0)).
    active_subview_view().contentDOM.blur();
    undo(view);

    // Let the focusout teardown timer fire.
    await new Promise<void>((r) => setTimeout(r, 30));
    await next_frame();

    // Subview survives because the rebase refocused it (teardown skipped).
    expect(active_subview_container()).not.toBeNull();
    const after = active_subview_view();
    expect(after.state.doc.toString()).toBe('1');
    const cm = subview_content_dom();
    expect(cm.contains(document.activeElement) || document.activeElement === cm).toBe(true);
  });

  it('TBL-I-18: undo of a soft-break cell pins the caret inside the post-undo content', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    await activate_cell(container, 1, 0);
    const sub = active_subview_view();

    sub.dispatch({
      changes: { from: sub.state.doc.length, insert: '\n' },
      selection: { anchor: sub.state.doc.length + 1 },
      userEvent: 'input',
    });
    await settle();

    undo(view);
    await settle();

    const after = active_subview_view();
    expect(after.state.doc.toString()).toBe('1');
    // Rebase pins an explicit selection clamped to the shorter post-undo content.
    expect(after.state.selection.main.head).toBeLessThanOrEqual(after.state.doc.length);
    expect(after.state.selection.main.head).toBe(1);
  });
});

describe('SYNC-H-8 — a host sync rebases the active cell subview (FIX-3)', () => {
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

  it('a sync rewriting the active cell rebases the subview to the fresh text', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    await activate_cell(container, 1, 0);
    const sub = active_subview_view();
    expect(sub.state.doc.toString()).toBe('1');
    // Place the caret at offset 1 (end of '1') — must survive the rebase unclamped.
    sub.dispatch({ selection: { anchor: 1 } });

    dispatch_host_sync_to_view(view, SAMPLE_TABLE.replace('| 1 |', '| one |'));
    await settle();

    expect(active_subview_container()).not.toBeNull();
    expect(active_cell_coords()).toEqual({ row: 1, col: 0, table_from: 0 });
    const sub_after = active_subview_view();
    expect(sub_after.state.doc.toString()).toBe('one');
    expect(sub_after.state.selection.main.head).toBe(1);
  });

  it('an in-cell keystroke after the sync does not revert the external edit', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    await activate_cell(container, 1, 0);

    dispatch_host_sync_to_view(view, SAMPLE_TABLE.replace('| 1 |', '| one |'));
    await settle();

    const sub = active_subview_view();
    expect(sub.state.doc.toString()).toBe('one');
    sub.dispatch({
      changes: { from: sub.state.doc.length, insert: 'X' },
      userEvent: 'input.type',
    });
    await settle();

    expect(view.state.doc.toString()).toContain('| oneX |');
    expect(view.state.doc.toString()).not.toContain('| 1');
  });

  it('a sync deleting the table tears down the subview', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    await activate_cell(container, 1, 0);

    dispatch_host_sync_to_view(view, 'plain paragraph\n');
    await settle();

    expect(active_subview_container()).toBeNull();
    expect(get_active_cell_snapshot(view)).toBeNull();
  });

  it("a sync deleting the active cell's row tears down the subview", async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    await activate_cell(container, 2, 0);

    dispatch_host_sync_to_view(view, SAMPLE_TABLE.replace('| 4 | 5 | 6 |\n', ''));
    await settle();

    expect(active_subview_container()).toBeNull();
    expect(get_active_cell_snapshot(view)).toBeNull();
  });

  it('a sync shifting the table without touching the cell keeps the subview intact', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    await activate_cell(container, 1, 0);

    dispatch_host_sync_to_view(view, 'intro\n' + SAMPLE_TABLE);
    await settle();

    expect(active_subview_container()).not.toBeNull();
    expect(active_subview_view().state.doc.toString()).toBe('1');
    // Snapshot tracks the shifted table so a later sync/undo still resolves it.
    expect(get_active_cell_snapshot(view)?.table_from).toBe('intro\n'.length);
  });
});

describe('FIX-11 — destroy after an eq()-true widget swap tears down the stranded active state', () => {
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

  // Typing a trailing space in the active cell re-serializes the whole table
  // with identical trimmed cell texts → the rebuilt widget is eq()-true, so
  // CM6 swaps the tile's widget without calling updateDOM (or toDOM),
  // stranding `active` on the previous instance.
  async function activate_then_eq_true_swap(): Promise<void> {
    view = mount_editor(container, SAMPLE_TABLE);
    await activate_cell(container, 2, 0);
    expect(view.dom.hasAttribute('data-plainmark-cell-active')).toBe(true);

    const sub = active_subview_view();
    sub.dispatch({
      changes: { from: sub.state.doc.length, insert: ' ' },
      userEvent: 'input.type',
    });
    await settle();
    expect(active_subview_container()).not.toBeNull();
  }

  it("a dimension-changing sync (updateDOM dims bail) after the swap still clears subview, snapshot, and attribute", async () => {
    await activate_then_eq_true_swap();

    // the row now reads `| 4  | 5 | 6 |` after the re-serialized space
    dispatch_host_sync_to_view(
      view!,
      view!.state.doc.toString().replace(/\| 4 .*\n/, ''),
    );

    // Synchronous after the dispatch — destroy must do the teardown itself,
    // not lean on the focusout rescue's setTimeout(0).
    expect(get_active_cell_snapshot(view!)).toBeNull();
    expect(view!.dom.hasAttribute('data-plainmark-cell-active')).toBe(false);

    await settle();
    expect(active_subview_container()).toBeNull();
    expect(document.querySelector('.plainmark-table-cell-edit')).toBeNull();
  });

  it('a sync deleting the table after the swap still clears subview, snapshot, and attribute', async () => {
    await activate_then_eq_true_swap();

    dispatch_host_sync_to_view(view!, 'plain paragraph\n');

    expect(get_active_cell_snapshot(view!)).toBeNull();
    expect(view!.dom.hasAttribute('data-plainmark-cell-active')).toBe(false);

    await settle();
    expect(active_subview_container()).toBeNull();
    expect(document.querySelector('.plainmark-table-cell-edit')).toBeNull();
  });
});

describe('FIX-7 — cell keymap resolves table.from live after a position shift', () => {
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

  async function type_line_above_activate_then_undo(row: number, col: number): Promise<void> {
    view = mount_editor(container, SAMPLE_TABLE);
    // Type a line above the table → table_from shifts 0 → PREFIX.length.
    view.dispatch({
      changes: { from: 0, insert: PREFIX },
      selection: { anchor: PREFIX.length },
      userEvent: 'input.type',
    });
    await settle();
    await activate_cell(container, row, col);
    expect(active_cell_coords()).toEqual({ row, col, table_from: PREFIX_TABLE_FROM });

    // Undo the typed line — table shifts back to 0; no cell text differs, so
    // the rebase plugin keeps the same subview (and its keymap closures) alive.
    key(subview_content_dom(), { key: 'z', ...mod_init() });
    await settle();
    expect(active_subview_container()).not.toBeNull();
    expect(active_cell_coords()).toEqual({ row, col, table_from: 0 });
  }

  it('Tab after an undo-driven shift moves to the next cell instead of going dead', async () => {
    await type_line_above_activate_then_undo(1, 0);

    key(subview_content_dom(), { key: 'Tab' });
    await settle();

    expect(active_cell_coords()).toEqual({ row: 1, col: 1, table_from: 0 });
  });

  it('ArrowUp at row 0 after an undo-driven shift exits before the live table position', async () => {
    await type_line_above_activate_then_undo(0, 0);

    key(subview_content_dom(), { key: 'ArrowUp' });
    await settle();

    // Live table_from is 0 → exit injects a leading newline and parks the caret
    // at 0. The stale path would land at stale_from - 1, inside the table.
    expect(active_subview_container()).toBeNull();
    expect(view!.state.doc.toString().startsWith('\n|')).toBe(true);
    expect(view!.state.selection.main.head).toBe(0);
  });
});

describe('activation seeds the main caret into the cell (RC3)', () => {
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

  it('TBL-I-1 (RC3): activating a cell pins the main selection inside that cell', async () => {
    view = mount_editor(container, PREFIXED_TABLE);
    // Real-product condition: main caret at document start, before the table.
    view.dispatch({ selection: { anchor: 0 } });
    await activate_cell(container, 1, 0);

    const range = lookup_cell_range(view.state, PREFIX_TABLE_FROM, 1, 0);
    expect(range).not.toBeNull();
    const head = view.state.selection.main.head;
    expect(head).not.toBe(0);
    expect(head).toBeGreaterThanOrEqual(range!.cell_from);
    expect(head).toBeLessThanOrEqual(range!.cell_to);
  });

  it('TBL-I-18 (RC3): undo of a cell edit restores the caret into the table and re-activates a cell', async () => {
    view = mount_editor(container, PREFIXED_TABLE);
    view.dispatch({ selection: { anchor: 0 } });
    await activate_cell(container, 1, 0);

    const sub = active_subview_view();
    sub.dispatch({ changes: { from: 0, to: 0, insert: 'X' }, userEvent: 'input.type' });
    await next_frame();

    // Exit to the main view (teardown), leaving the main caret at document start.
    view.focus();
    view.dispatch({ selection: { anchor: 0 } });
    await new Promise<void>((r) => setTimeout(r, 30));
    await next_frame();
    expect(active_subview_container()).toBeNull();

    undo(view);
    await settle();

    // Undo restored the caret into the table (not document start) and the rebase
    // plugin re-activated the edited cell.
    const head = view.state.selection.main.head;
    expect(head).not.toBe(0);
    expect(head).toBeGreaterThanOrEqual(PREFIX_TABLE_FROM);
    expect(active_subview_container()).not.toBeNull();
    const coords = active_cell_coords();
    expect(coords).not.toBeNull();
    const range = lookup_cell_range(view.state, coords!.table_from, coords!.row, coords!.col);
    expect(range).not.toBeNull();
    expect(head).toBeGreaterThanOrEqual(range!.cell_from);
    expect(head).toBeLessThanOrEqual(range!.cell_to);
  });
});
