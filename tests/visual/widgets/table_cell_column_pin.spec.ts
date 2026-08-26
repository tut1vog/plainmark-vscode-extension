import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor } from '../util.js';
import {
  get_active_cell_snapshot,
  request_cell_focus,
} from '../../../src/webview/widgets/table.js';

async function next_frame(): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

async function settle(): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, 0));
  await next_frame();
  await next_frame();
}

function get_cell(
  container: HTMLElement,
  row_index: number,
  col_index: number,
): HTMLTableCellElement {
  const td = container.querySelector(
    `[data-row-index="${row_index}"][data-col-index="${col_index}"]`,
  ) as HTMLTableCellElement | null;
  if (!td) throw new Error(`no cell at (${row_index}, ${col_index})`);
  return td;
}

function column_widths(container: HTMLElement): number[] {
  const header = container.querySelector(
    '.plainmark-table-block thead tr',
  ) as HTMLTableRowElement | null;
  if (!header) throw new Error('no header row');
  return Array.from(header.cells, (th) => th.getBoundingClientRect().width);
}

function expect_same_widths(actual: number[], expected: number[]): void {
  expect(actual.length).toBe(expected.length);
  actual.forEach((w, i) => expect(Math.abs(w - expected[i])).toBeLessThan(0.5));
}

function pins(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll('.plainmark-table-block table > colgroup'));
}

async function press(
  container: HTMLElement,
  view: EditorView,
  row_index: number,
  col_index: number,
): Promise<EditorView> {
  get_cell(container, row_index, col_index).dispatchEvent(
    new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
  );
  await next_frame();
  await next_frame();
  const snap = get_active_cell_snapshot(view);
  if (!snap) throw new Error('cell did not activate');
  return snap.sub_view;
}

async function release(): Promise<void> {
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  await next_frame();
  await next_frame();
}

// Over-constrained in a 900px pane: every column is already narrower than its
// content, so any intrinsic-width change would re-distribute all three.
const TABLE = [
  '| Error | Cause | Fix |',
  '| :--- | :--- | :--- |',
  '| `SSL_do_handshake() failed` | Client failed verification against `ssl_client_certificate` in mTLS. | 1. Ensure client certificate was signed by the exact CA.<br/>2. Check expiry. |',
  '| plain text cell | Nginx is serving `cert.pem` (leaf only). | Update `ssl_certificate` to point to `fullchain.pem`. |',
  '',
].join('\n');

describe('TBL-I-38: column widths hold while a cell is active', () => {
  let container: HTMLElement;
  let view: EditorView;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '900px';
    document.body.appendChild(container);
  });

  afterEach(() => {
    view?.destroy();
    container.remove();
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  it('activation click and the marker reveal on release leave every column in place', async () => {
    view = mount_editor(container, TABLE);
    await next_frame();
    await next_frame();
    const rest = column_widths(container);

    // the cell is one code span; the caret lands at its end, touching the closing backtick
    await press(container, view, 1, 0);
    expect(pins(container)).toHaveLength(1);
    expect(pins(container)[0].children).toHaveLength(3);
    expect_same_widths(column_widths(container), rest);

    await release();
    expect_same_widths(column_widths(container), rest);
  });

  it('caret motion onto a code span and in-cell typing wrap within the cell', async () => {
    view = mount_editor(container, TABLE);
    await next_frame();
    await next_frame();
    const rest = column_widths(container);

    const sub = await press(container, view, 2, 1);
    await release();
    const doc = sub.state.doc.toString();
    sub.dispatch({ selection: { anchor: doc.indexOf('cert.pem') + 2 } });
    await next_frame();
    expect_same_widths(column_widths(container), rest);

    sub.dispatch({
      changes: {
        from: sub.state.doc.length,
        insert: ' and a long clause about certificate chains that must wrap inside this cell',
      },
    });
    await settle();
    expect(get_active_cell_snapshot(view)?.sub_view).toBe(sub);
    expect_same_widths(column_widths(container), rest);
  });

  it('teardown removes the pin and restores the at-rest layout', async () => {
    view = mount_editor(container, TABLE);
    await next_frame();
    await next_frame();
    const rest = column_widths(container);

    const sub = await press(container, view, 1, 0);
    await release();
    sub.contentDOM.blur();
    await settle();

    expect(get_active_cell_snapshot(view)).toBeNull();
    expect(pins(container)).toHaveLength(0);
    expect_same_widths(column_widths(container), rest);
  });

  it('cell-to-cell navigation re-pins once from the at-rest layout', async () => {
    view = mount_editor(container, TABLE);
    await next_frame();
    await next_frame();
    const rest = column_widths(container);

    await press(container, view, 1, 0);
    await release();
    const table_from = get_active_cell_snapshot(view)?.table_from;
    if (table_from === undefined) throw new Error('no active cell');
    request_cell_focus(view, table_from, 1, 1, { nav: true });
    await settle();

    const snap = get_active_cell_snapshot(view);
    expect(snap?.row).toBe(1);
    expect(snap?.col).toBe(1);
    expect(pins(container)).toHaveLength(1);
    expect_same_widths(column_widths(container), rest);
  });
});
