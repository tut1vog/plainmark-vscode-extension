import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { syncAnnotation } from '../../../src/webview/sync.js';
import { mount_editor } from '../util.js';

function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}

function get_cell(container: HTMLElement, row: number, col: number): HTMLTableCellElement {
  const td = container.querySelector(
    `.plainmark-table-block [data-row-index="${row}"][data-col-index="${col}"]`,
  ) as HTMLTableCellElement | null;
  if (!td) throw new Error(`no cell at (${row}, ${col})`);
  return td;
}

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
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}

const INTRO = 'intro\n\n';
const TABLE = '| a | b |\n|---|---|\n| 1 | 2 |\n';

describe('table widget under edits that only shift it', () => {
  let container: HTMLElement;
  let view: EditorView;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    view?.destroy();
    container.remove();
  });

  it('TBL-I-40: a host sync that rewrites the active cell does not steal focus', async () => {
    view = mount_editor(container, INTRO + TABLE);
    await next_frame();
    press(get_cell(container, 1, 0));
    await next_frame();
    await next_frame();
    const sub = container.querySelector('.plainmark-table-cell-edit .cm-content') as HTMLElement;
    expect(sub).not.toBeNull();
    expect(document.activeElement).toBe(sub);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);

    // One outside edit spanning the intro and the active cell (`1` → `9`),
    // as a find-and-replace in a split text editor would arrive.
    const cell_pos = (INTRO + TABLE).indexOf('| 1 |') + 2;
    view.dispatch({
      changes: [
        { from: 0, to: 5, insert: 'intros' },
        { from: cell_pos, to: cell_pos + 1, insert: '9' },
      ],
      annotations: [syncAnnotation.of(true)],
    });

    expect(document.activeElement).toBe(input);
    input.remove();
  });
});
