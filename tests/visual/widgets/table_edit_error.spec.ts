import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorView } from '@codemirror/view';
import { mount_editor } from '../util.js';
import { dispatch_table_edit } from '../../../src/webview/widgets/table_keymap.js';

// serialize_table is only invoked on edit, never on render, so the table still
// renders normally under this mock; only the edit-path catch is exercised.
vi.mock('../../../src/webview/widgets/table_serialize.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/webview/widgets/table_serialize.js')>();
  return {
    ...actual,
    serialize_table: () => {
      throw new Error('forced serialize failure');
    },
  };
});

const SAMPLE_TABLE = '| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n';

async function next_frame(): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

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

function active_subview_view(): EditorView {
  const sub = active_subview_container();
  if (!sub) throw new Error('no active subview container');
  const root = sub.querySelector('.cm-editor') as HTMLElement | null;
  if (!root) throw new Error('no .cm-editor inside subview');
  const sub_view = EditorView.findFromDOM(root);
  if (!sub_view) throw new Error('EditorView.findFromDOM returned null for subview root');
  return sub_view;
}

async function activate_cell(
  container: HTMLElement,
  row_index: number,
  col_index: number,
): Promise<HTMLElement> {
  const td = get_cell(container, row_index, col_index);
  td.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await next_frame();
  await next_frame();
  const sub = active_subview_container();
  if (!sub) throw new Error('subview did not mount');
  return sub;
}

function once_error_event(): Promise<CustomEvent> {
  return new Promise<CustomEvent>((resolve) => {
    document.addEventListener(
      'plainmark-table-edit-error',
      (ev) => resolve(ev as CustomEvent),
      { once: true },
    );
  });
}

describe('table edit-path failure surfacing (TBL-E-12)', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;
  // Replaces (and thus suppresses) the console-sentinel's console.error wrapper
  // for these tests, which deliberately log an error; also serves as the assertion.
  let error_spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    error_spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    error_spy.mockRestore();
    view?.destroy();
    view = undefined;
    container.remove();
  });

  function error_logged_with(needle: string): boolean {
    return error_spy.mock.calls.some((call: unknown[]) =>
      call.some((arg: unknown) => typeof arg === 'string' && arg.includes(needle)),
    );
  }

  it('TBL-E-12: structural op failure writes no bytes and fires the error event', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    const table_from = Number(get_table_block(container).dataset.tableFrom);
    expect(Number.isFinite(table_from)).toBe(true);
    const before_doc = view.state.doc.toString();

    const error_event = once_error_event();
    const outcome = dispatch_table_edit(view, table_from, () => {
      throw new Error('forced failure');
    });

    expect(outcome).toEqual({ changed: false, info: null, new_model: null });
    expect(view.state.doc.toString()).toBe(before_doc);

    const ev = await error_event;
    expect(String(ev.detail.reason)).toContain('forced failure');
    expect(error_logged_with('table structural op failed')).toBe(true);
  });

  it('TBL-E-12: cell edit failure writes no bytes and fires the error event', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    const before_doc = view.state.doc.toString();
    await activate_cell(container, 1, 0);

    const error_event = once_error_event();
    // A real subview transaction drives handle_cell_edit, whose serialize_table
    // call throws under the module mock.
    const sub_view = active_subview_view();
    sub_view.dispatch({ changes: { from: 0, to: 0, insert: 'X' }, userEvent: 'input.type' });
    await next_frame();

    expect(view.state.doc.toString()).toBe(before_doc);

    const ev = await error_event;
    expect(String(ev.detail.reason)).toContain('forced serialize failure');
    expect(error_logged_with('table cell dispatch failed')).toBe(true);
  });
});
