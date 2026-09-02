import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { get_cell, mount_editor, next_frame } from '../util.js';
import { get_active_cell_snapshot } from '../../../src/webview/widgets/table.js';

function press(td: HTMLTableCellElement): void {
  const rect = td.getBoundingClientRect();
  td.dispatchEvent(
    new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + 10,
      clientY: rect.top + rect.height / 2,
    }),
  );
}

const TABLE = '| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |\n';

describe('TBL-I-1 — cell activation race (rAF supersession)', () => {
  let container: HTMLElement;
  let view: EditorView;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    view?.destroy();
    container.remove();
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  it('two cell activations in one frame leave exactly one live subview', async () => {
    view = mount_editor(container, TABLE);
    await next_frame();
    await next_frame();

    const first = get_cell(container, 1, 0);
    const second = get_cell(container, 1, 1);

    // Both presses land before any rAF runs (same frame). The earlier
    // activation must abort so it never builds a leaked subview.
    press(first);
    press(second);
    await next_frame();
    await next_frame();

    expect(document.querySelectorAll('.plainmark-table-cell-edit')).toHaveLength(1);
    expect(first.querySelector('.plainmark-table-cell-edit')).toBeNull();

    const first_root = first.querySelector('.cm-editor') as HTMLElement | null;
    expect(first_root ? EditorView.findFromDOM(first_root) : null).toBeNull();

    const second_sub = second.querySelector('.plainmark-table-cell-edit');
    expect(second_sub).not.toBeNull();
  });

  it('an edit above the table in the press frame still activates the pressed cell', async () => {
    view = mount_editor(container, 'hello\n' + TABLE);
    await next_frame();
    await next_frame();

    const td = get_cell(container, 1, 0);
    press(td);
    // Same frame: the insert shifts table.from by one and swaps the container's
    // widget; the pending build must resolve the live offset, not the stale one.
    view.dispatch({ changes: { from: 0, insert: 'x' } });
    await next_frame();
    await next_frame();

    expect(td.isConnected).toBe(true);
    expect(td.querySelector('.plainmark-table-cell-edit')).not.toBeNull();
    expect(document.querySelectorAll('.plainmark-table-cell-edit')).toHaveLength(1);
    expect(get_active_cell_snapshot(view)?.table_from).toBe('xhello\n'.length);
  });

  it('two activations straddling a widget swap in one frame leave one live subview', async () => {
    view = mount_editor(container, TABLE);
    await next_frame();
    await next_frame();

    const first = get_cell(container, 1, 0);
    const second = get_cell(container, 1, 1);
    press(first);
    // An in-table edit swaps the container's widget (same dimensions, so the
    // tds survive) before the second press lands on the new widget.
    view.dispatch({ changes: { from: TABLE.indexOf('3'), insert: 'x' } });
    press(second);
    await next_frame();
    await next_frame();

    expect(document.querySelectorAll('.plainmark-table-cell-edit')).toHaveLength(1);
    expect(first.querySelector('.plainmark-table-cell-edit')).toBeNull();
    expect(second.querySelector('.plainmark-table-cell-edit')).not.toBeNull();
  });

  it('activation pending when the widget is destroyed never mounts a subview', async () => {
    view = mount_editor(container, TABLE);
    await next_frame();
    await next_frame();

    const td = get_cell(container, 1, 0);
    press(td);
    // Same frame as the press: a dimension change makes updateDOM decline,
    // so CM destroys the old widget DOM and rebuilds via toDOM — while the
    // activation rAF is still pending against the old td.
    view.dispatch({
      changes: { from: view.state.doc.length, insert: '| 4 | 5 | 6 |\n' },
    });
    await next_frame();
    await next_frame();

    expect(td.isConnected).toBe(false);
    expect(td.querySelector('.plainmark-table-cell-edit')).toBeNull();
    expect(document.querySelectorAll('.plainmark-table-cell-edit')).toHaveLength(0);
    expect(view.dom.hasAttribute('data-plainmark-cell-active')).toBe(false);
  });
});
