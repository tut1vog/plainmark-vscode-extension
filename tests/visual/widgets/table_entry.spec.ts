import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { mount_editor } from '../util.js';

const STARTER = '| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n';

async function next_frame(): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

async function settle(): Promise<void> {
  // request_cell_focus chains requestMeasure → activate_cell → setTimeout(0); drain a macrotask + a few frames.
  await new Promise((r) => setTimeout(r, 20));
  await next_frame();
  await next_frame();
  await next_frame();
}

function active_subview_container(): HTMLElement | null {
  return document.querySelector('.plainmark-table-cell-edit');
}

function active_cell_indices(): { row: number; col: number } | null {
  const sub = active_subview_container();
  if (!sub) return null;
  const td = sub.closest('[data-row-index][data-col-index]') as HTMLElement | null;
  if (!td) return null;
  const row = Number(td.dataset.rowIndex);
  const col = Number(td.dataset.colIndex);
  if (!Number.isFinite(row) || !Number.isFinite(col)) return null;
  return { row, col };
}

function arrow_down(view: EditorView): boolean {
  return !view.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      code: 'ArrowDown',
      keyCode: 40,
      which: 40,
      bubbles: true,
      cancelable: true,
      composed: true,
    }),
  );
}

function arrow_up(view: EditorView): boolean {
  return !view.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'ArrowUp',
      code: 'ArrowUp',
      keyCode: 38,
      which: 38,
      bubbles: true,
      cancelable: true,
      composed: true,
    }),
  );
}

describe('table entry keymap — ArrowDown/ArrowUp from main view (Fix 2)', () => {
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

  it('TBL-I-22: ArrowDown from line above table activates first cell (0, 0)', async () => {
    const prefix = 'hello\n';
    view = mount_editor(container, prefix + STARTER);
    view.dispatch({ selection: { anchor: 5 } });
    view.focus();
    await next_frame();

    arrow_down(view);
    await settle();

    expect(active_subview_container()).not.toBeNull();
    const idx = active_cell_indices();
    expect(idx).not.toBeNull();
    expect(idx!.row).toBe(0);
    expect(idx!.col).toBe(0);
  });

  // BLOCKER: lezer-markdown absorbs an adjacent paragraph into the Table node
  // unless separated by '\n\n'. With '\n\n' (the realistic case), the Table
  // terminates at the last '|' and no real source line below it has
  // `line.from - 1 < table.to` — the entry keymap simply cannot fire. With a
  // single '\n' separator, 'bye' is parsed inside the Table; the keymap fires
  // and `locate_table_extraction` reports row_count = 4 (header + 2 body +
  // Implementation update: ArrowUp branch now uses the LAST element of
  // `info.cells` (row-then-col ordered) rather than `(row_count-1, col_count-1)`,
  // so it's robust to lezer's row_count over-counting when the next paragraph
  // is absorbed into the Table node. `find_table_just_above` also tolerates
  // both Table.to-includes-\n and Table.to-stops-at-last-| cases.
  it('TBL-I-23: ArrowUp from line below table activates the LAST cell (last_row, last_col)', async () => {
    view = mount_editor(container, STARTER + 'bye');
    const bye_line_pos = STARTER.length;
    view.dispatch({ selection: { anchor: bye_line_pos } });
    view.contentDOM.focus();
    view.focus();
    await next_frame();

    arrow_up(view);
    await settle();

    expect(active_subview_container()).not.toBeNull();
    const idx = active_cell_indices();
    expect(idx).not.toBeNull();
    // Discover actual last-cell indices from the rendered DOM so the
    // assertion stays correct regardless of extraction's row_count.
    const block_el = container.querySelector('.plainmark-table-block') as HTMLElement;
    const all_cells = block_el.querySelectorAll<HTMLElement>('[data-row-index][data-col-index]');
    let max_row = -1;
    let max_col = -1;
    all_cells.forEach((td) => {
      const r = Number(td.dataset.rowIndex);
      const c = Number(td.dataset.colIndex);
      if (Number.isFinite(r) && r > max_row) max_row = r;
      if (Number.isFinite(c) && c > max_col) max_col = c;
    });
    expect(idx!.row).toBe(max_row);
    expect(idx!.col).toBe(max_col);
  });

  it('DEF-3: ArrowUp from below a table with an underfilled MIDDLE row targets the true last cell, not the placeholder', async () => {
    // Row 1 is underfilled: its (1,1)/(1,2) placeholders are appended after
    // all real cells in info.cells, so a plain "last array element" pick
    // lands on the middle row's placeholder instead of (2,2).
    const doc = '| a | b | c |\n|---|---|---|\n| 1 |\n| 4 | 5 | 6 |\nbye';
    view = mount_editor(container, doc);
    view.dispatch({ selection: { anchor: doc.lastIndexOf('bye') } });
    view.contentDOM.focus();
    view.focus();
    await next_frame();

    arrow_up(view);
    await settle();

    expect(active_subview_container()).not.toBeNull();
    const idx = active_cell_indices();
    expect(idx).not.toBeNull();
    expect(idx!.row).toBe(2);
    expect(idx!.col).toBe(2);
  });

  it('TBL-I-22: ArrowDown when NOT immediately above a table is a no-op (default CM6 moves to next line)', async () => {
    const prefix = 'hello\nworld\n';
    view = mount_editor(container, prefix + STARTER);
    view.dispatch({ selection: { anchor: 5 } });
    view.focus();
    await next_frame();

    arrow_down(view);
    await settle();

    expect(active_subview_container()).toBeNull();
    const head = view.state.selection.main.head;
    expect(view.state.doc.lineAt(head).number).toBe(2);
  });

  it('TBL-I-23: ArrowUp when NOT immediately below a table is a no-op (default CM6 moves to previous line)', async () => {
    view = mount_editor(container, STARTER + '\nfoo\nbar');
    const doc_len = view.state.doc.length;
    view.dispatch({ selection: { anchor: doc_len } });
    view.focus();
    await next_frame();

    arrow_up(view);
    await settle();

    expect(active_subview_container()).toBeNull();
    const head = view.state.selection.main.head;
    const line = view.state.doc.lineAt(head);
    expect(view.state.doc.sliceString(line.from, line.to)).toBe('foo');
  });

  it('TBL-I-25: ArrowDown into an IL1-skipped table (nested in list) is a no-op', async () => {
    // List items each containing a single pipe-delimited line. Even if lezer
    // parses Table syntax inside the list, `build_table_decorations`'
    // is_in_list_or_blockquote guard suppresses the widget, so the entry
    // keymap's `table_widget_rendered` DOM check returns false.
    const prefix = 'hello\n';
    const nested = '- | A | B |\n- |---|---|\n- | 1 | 2 |\n';
    view = mount_editor(container, prefix + nested);
    view.dispatch({ selection: { anchor: 5 } });
    view.focus();
    await next_frame();

    expect(container.querySelector('.plainmark-table-block')).toBeNull();

    arrow_down(view);
    await settle();

    expect(active_subview_container()).toBeNull();
    const head = view.state.selection.main.head;
    expect(view.state.doc.lineAt(head).number).toBeGreaterThan(1);
  });

  it('TBL-I-23: ArrowLeft from start of line below table activates the LAST cell (Bug A)', async () => {
    // CM6's default ArrowLeft from line-start moves caret one byte back —
    // landing mid-line on the last pipe row, inside the block-replace's
    // visual extent. The result is the same widget-right-bottom giant caret
    // as Bug 2. Symmetric with ArrowUp from the same position: activate the
    // last cell.
    view = mount_editor(container, STARTER + 'tail');
    const tail_line_start = STARTER.length;
    view.dispatch({ selection: { anchor: tail_line_start } });
    view.focus();
    await next_frame();

    const event = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      code: 'ArrowLeft',
      keyCode: 37,
      which: 37,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    view.contentDOM.dispatchEvent(event);
    await settle();

    expect(active_subview_container()).not.toBeNull();
    const idx = active_cell_indices();
    expect(idx).not.toBeNull();
    // Last rendered cell — match the same DOM-driven discovery as the
    // ArrowUp test so the assertion stays robust to lezer row_count drift.
    const block_el = container.querySelector('.plainmark-table-block') as HTMLElement;
    const all_cells = block_el.querySelectorAll<HTMLElement>('[data-row-index][data-col-index]');
    let max_row = -1;
    let max_col = -1;
    all_cells.forEach((td) => {
      const r = Number(td.dataset.rowIndex);
      const c = Number(td.dataset.colIndex);
      if (Number.isFinite(r) && r > max_row) max_row = r;
      if (Number.isFinite(c) && c > max_col) max_col = c;
    });
    expect(idx!.row).toBe(max_row);
    expect(idx!.col).toBe(max_col);
  });

  it('TBL-I-24: Backspace at start of line below table activates the LAST cell — no byte deletion (Bug C)', async () => {
    // CM6's default Backspace from line-start deletes the preceding \n,
    // joining the current line to the previous one. The previous "line" is
    // the table's last pipe row — joining the math/text line onto a pipe
    // row corrupts the table grammar (post-delete it no longer parses as
    // a Table), AND the resulting selection lands mid-line in the
    // block-replace, hitting the giant-caret fallback. Treat as nav.
    view = mount_editor(container, STARTER + 'tail');
    const tail_line_start = STARTER.length;
    const doc_before = view.state.doc.toString();
    view.dispatch({ selection: { anchor: tail_line_start } });
    view.focus();
    await next_frame();

    const event = new KeyboardEvent('keydown', {
      key: 'Backspace',
      code: 'Backspace',
      keyCode: 8,
      which: 8,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    view.contentDOM.dispatchEvent(event);
    await settle();

    expect(view.state.doc.toString()).toBe(doc_before);
    expect(active_subview_container()).not.toBeNull();
    const block_el = container.querySelector('.plainmark-table-block') as HTMLElement;
    const all_cells = block_el.querySelectorAll<HTMLElement>('[data-row-index][data-col-index]');
    let max_row = -1;
    let max_col = -1;
    all_cells.forEach((td) => {
      const r = Number(td.dataset.rowIndex);
      const c = Number(td.dataset.colIndex);
      if (Number.isFinite(r) && r > max_row) max_row = r;
      if (Number.isFinite(c) && c > max_col) max_col = c;
    });
    const idx = active_cell_indices()!;
    expect(idx.row).toBe(max_row);
    expect(idx.col).toBe(max_col);
  });

  it('TBL-I-24: Backspace mid-line still deletes one char (guard)', async () => {
    view = mount_editor(container, STARTER + 'tail');
    view.dispatch({ selection: { anchor: STARTER.length + 2 } });
    view.focus();
    await next_frame();

    const before_len = view.state.doc.length;
    const event = new KeyboardEvent('keydown', {
      key: 'Backspace',
      code: 'Backspace',
      keyCode: 8,
      which: 8,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    view.contentDOM.dispatchEvent(event);
    await settle();

    expect(view.state.doc.length).toBe(before_len - 1);
    expect(active_subview_container()).toBeNull();
  });

  it('TBL-I-22: ArrowRight at end of line above table activates the first cell (Bug D)', async () => {
    // Leading empty line is the degenerate case: line.from === line.to === 0,
    // so caret at position 0 satisfies `sel.head === line.to`. Without this
    // binding, CM6's default moves caret one byte forward to position 1
    // (block-replace left edge), and the user sees no cell activation.
    view = mount_editor(container, '\n' + STARTER);
    view.dispatch({ selection: { anchor: 0 } });
    view.focus();
    await next_frame();

    const event = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      code: 'ArrowRight',
      keyCode: 39,
      which: 39,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    view.contentDOM.dispatchEvent(event);
    await settle();

    expect(active_subview_container()).not.toBeNull();
    const idx = active_cell_indices()!;
    expect(idx.row).toBe(0);
    expect(idx.col).toBe(0);
  });

  it('TBL-I-22: ArrowRight at end of non-empty line above table activates the first cell', async () => {
    view = mount_editor(container, 'hello\n' + STARTER);
    view.dispatch({ selection: { anchor: 5 } });
    view.focus();
    await next_frame();

    const event = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      code: 'ArrowRight',
      keyCode: 39,
      which: 39,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    view.contentDOM.dispatchEvent(event);
    await settle();

    expect(active_subview_container()).not.toBeNull();
    const idx = active_cell_indices()!;
    expect(idx.row).toBe(0);
    expect(idx.col).toBe(0);
  });

  it('TBL-I-22: ArrowRight when caret is NOT at line end is a no-op (guard)', async () => {
    view = mount_editor(container, 'hello\n' + STARTER);
    view.dispatch({ selection: { anchor: 2 } });
    view.focus();
    await next_frame();

    const event = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      code: 'ArrowRight',
      keyCode: 39,
      which: 39,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    view.contentDOM.dispatchEvent(event);
    await settle();

    expect(active_subview_container()).toBeNull();
    expect(view.state.selection.main.head).toBe(3);
  });

  it('TBL-I-23: ArrowLeft when caret is NOT at line start is a no-op (guard)', async () => {
    view = mount_editor(container, STARTER + 'tail');
    // Caret mid-'tail' — default CM6 ArrowLeft must still fire.
    view.dispatch({ selection: { anchor: STARTER.length + 2 } });
    view.focus();
    await next_frame();

    const event = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      code: 'ArrowLeft',
      keyCode: 37,
      which: 37,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    view.contentDOM.dispatchEvent(event);
    await settle();

    expect(active_subview_container()).toBeNull();
    expect(view.state.selection.main.head).toBe(STARTER.length + 1);
  });

  it('TBL-I-23: ArrowUp from line below an absorbed-paragraph line is a no-op (Bug 1)', async () => {
    // STARTER + '$a=b$\n' — only ONE \n between the table and the math line,
    // so lezer's GFM grammar absorbs `$a=b$` as a TableRow with zero
    // TableDelimiter children. Pre-fix, find_table_just_above used the RAW
    // Lezer Table.to (extended past the math line), matched line 6 as
    // "immediately after the table", and ArrowUp from the empty trailing line
    // jumped INTO the bottom-right cell — skipping the math line entirely.
    view = mount_editor(container, STARTER + '$a=b$\n');
    const doc_len = view.state.doc.length;
    view.dispatch({ selection: { anchor: doc_len } });
    view.focus();
    await next_frame();

    arrow_up(view);
    await settle();

    expect(active_subview_container()).toBeNull();
    const head = view.state.selection.main.head;
    const line = view.state.doc.lineAt(head);
    expect(view.state.doc.sliceString(line.from, line.to)).toBe('$a=b$');
  });

  it('TBL-I-25: Default ArrowDown/ArrowUp still works in non-table contexts', async () => {
    view = mount_editor(container, 'line1\nline2\nline3');
    view.dispatch({ selection: { anchor: 5 } });
    view.focus();
    await next_frame();

    arrow_down(view);
    await settle();
    let head = view.state.selection.main.head;
    expect(view.state.doc.lineAt(head).number).toBe(2);

    arrow_up(view);
    await settle();
    head = view.state.selection.main.head;
    expect(view.state.doc.lineAt(head).number).toBe(1);
  });
});
