import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor } from '../util.js';
import { insert_table_at_caret } from '../../../src/webview/widgets/insert_table_command.js';

const STARTER = [
  '|     |     |     |',
  '| --- | --- | --- |',
  '|     |     |     |',
  '|     |     |     |',
].join('\n');

const SAMPLE_TABLE = '| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n';

function get_table_block(container: HTMLElement): HTMLElement | null {
  return container.querySelector('.plainmark-table-block') as HTMLElement | null;
}

function get_cell(
  container: HTMLElement,
  row_index: number,
  col_index: number,
): HTMLTableCellElement {
  const sel = `[data-row-index="${row_index}"][data-col-index="${col_index}"]`;
  const block = get_table_block(container);
  if (!block) throw new Error('no .plainmark-table-block');
  const td = block.querySelector(sel) as HTMLTableCellElement | null;
  if (!td) throw new Error(`no cell at (${row_index}, ${col_index})`);
  return td;
}

async function next_frame(): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

describe('insert_table_at_caret — ED command webview path', () => {
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

  it('TBL-I-17: prepends a leading \\n when caret is at offset 0 (Fix 5) + Fix B1 trailing newline at an empty doc', async () => {
    view = mount_editor(container, '');
    insert_table_at_caret(view);
    await next_frame();
    // Fix 5: caret === 0 always prepends a leading '\n' so the table
    // doesn't sit at offset 0 with no caret-targetable line above. Fix B1: end-
    // of-doc still appends '\n' so ArrowDown has a target line below.
    expect(view.state.doc.toString()).toBe('\n' + STARTER + '\n');
  });

  it('TBL-I-17: inserts at end of "hello": prefix newline + starter + Fix B1 trailing newline', async () => {
    view = mount_editor(container, 'hello');
    view.dispatch({ selection: { anchor: 'hello'.length } });
    insert_table_at_caret(view);
    await next_frame();
    expect(view.state.doc.toString()).toBe('hello\n' + STARTER + '\n');
  });

  it('TBL-I-17: splits a mid-line caret: prefix newline + starter + suffix newline + remainder', async () => {
    view = mount_editor(container, 'hello world');
    view.dispatch({ selection: { anchor: 'hello'.length } });
    insert_table_at_caret(view);
    await next_frame();
    expect(view.state.doc.toString()).toBe('hello\n' + STARTER + '\n' + ' world');
  });

  it('TBL-I-17: omits the leading newline when caret is at line-start of a non-first line', async () => {
    // Fix 5 means caret === 0 always gets a leading '\n'. To exercise
    // the at-line-start-but-not-offset-0 branch (no leading newline), put the
    // caret at the start of line 2.
    view = mount_editor(container, 'first line\nsecond line');
    view.dispatch({ selection: { anchor: 'first line\n'.length } });
    insert_table_at_caret(view);
    await next_frame();
    expect(view.state.doc.toString()).toBe(
      'first line\n' + STARTER + '\n' + 'second line',
    );
  });

  it('TBL-I-17: omits the trailing newline when caret sits immediately before an existing \\n', async () => {
    view = mount_editor(container, 'hello\nworld');
    view.dispatch({ selection: { anchor: 'hello'.length } });
    insert_table_at_caret(view);
    await next_frame();
    // next_char === '\n' → suffix is ''. No double newline introduced.
    expect(view.state.doc.toString()).toBe('hello\n' + STARTER + '\nworld');
  });

  it('TBL-I-17: focuses the first header cell after insertion', async () => {
    view = mount_editor(container, '');
    insert_table_at_caret(view);
    // request_cell_focus → requestMeasure → activate_cell → defer.
    await next_frame();
    await next_frame();
    await next_frame();
    await next_frame();

    const cell00 = get_cell(container, 0, 0);
    const active = document.activeElement;
    expect(active).not.toBeNull();
    expect(cell00.contains(active)).toBe(true);
  });

  it('TBL-I-17: is a no-op + warn when invoked with focus inside an existing table cell', async () => {
    view = mount_editor(container, SAMPLE_TABLE);
    const td = get_cell(container, 1, 0);
    td.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await next_frame();
    await next_frame();
    const subview = document.querySelector('.plainmark-table-cell-edit');
    expect(subview).not.toBeNull();
    // Move focus into the subview's editable so document.activeElement is
    // inside the table.
    const cm = subview!.querySelector('.cm-content') as HTMLElement | null;
    expect(cm).not.toBeNull();
    (cm as HTMLElement).focus();
    expect(cm!.closest('.plainmark-table-block')).not.toBeNull();
    expect(document.activeElement === cm).toBe(true);

    const warn_spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const dispatch_spy = vi.spyOn(view, 'dispatch');
    const before_doc = view.state.doc.toString();

    insert_table_at_caret(view);
    await next_frame();

    expect(view.state.doc.toString()).toBe(before_doc);
    expect(dispatch_spy).not.toHaveBeenCalled();
    const had_warn = warn_spy.mock.calls.some((args) => {
      return (
        args[0] === '[widget]' &&
        typeof args[1] === 'string' &&
        args[1].includes('insertTable ignored')
      );
    });
    expect(had_warn).toBe(true);

    warn_spy.mockRestore();
  });

  it('TBL-I-17: fires exactly one main-view dispatch tagged userEvent input on the non-no-op path', async () => {
    view = mount_editor(container, '');
    const dispatch_spy = vi.spyOn(view, 'dispatch');
    insert_table_at_caret(view);
    await next_frame();

    // One change-bearing dispatch (the table insert); the re-focus activation
    // adds a selection-only seed (RC3) that must not be counted.
    const change_calls = dispatch_spy.mock.calls.filter(
      (c) => (c[0] as { changes?: unknown }).changes !== undefined,
    );
    expect(change_calls.length).toBe(1);
    const arg = change_calls[0][0] as {
      annotations?: { value?: string }[] | { value?: string };
    };
    const ann = Array.isArray(arg.annotations) ? arg.annotations : [arg.annotations];
    const has_input_user_event = ann.some(
      (a) => typeof a === 'object' && a !== null && 'value' in a && (a as { value?: string }).value === 'input',
    );
    expect(has_input_user_event).toBe(true);
  });
});

describe('insert_table message — webview bus wiring', () => {
  // index.ts wires window 'message' events to insert_table_at_caret. We can't
  // import index.ts (it would call acquireVsCodeApi at module load), but we can
  // reproduce the wiring inline and assert it dispatches end-to-end.
  let container: HTMLElement;
  let view: EditorView | undefined;
  let listener: ((event: MessageEvent) => void) | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (listener) window.removeEventListener('message', listener);
    listener = undefined;
    view?.destroy();
    view = undefined;
    container.remove();
  });

  it('TBL-I-17: synthetic {type: insert_table} message routes to insert_table_at_caret and inserts the starter', async () => {
    view = mount_editor(container, '');
    const v = view;
    listener = (event: MessageEvent) => {
      const msg = event.data as { type?: string } | null | undefined;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'insert_table') insert_table_at_caret(v);
    };
    window.addEventListener('message', listener);

    window.dispatchEvent(
      new MessageEvent('message', { data: { type: 'insert_table' } }),
    );
    await next_frame();
    // Fix 5: caret === 0 prepends '\n'. Fix B1: empty-doc appends '\n'.
    expect(view.state.doc.toString()).toBe('\n' + STARTER + '\n');
  });
});
