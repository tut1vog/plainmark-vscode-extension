// A table link follows only on Cmd/Ctrl+click: the at-rest cell carries no live
// href for the webview's built-in link handler to open, and the active cell's link
// span routes through the shared editor link click handler.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { get_cell, get_table_block, mount_editor, next_frame } from '../util.js';

const URL = 'https://example.com/table';
const DOC = `| name | link |\n|---|---|\n| first | plain |\n| other | [table link](${URL}) |\n\ntail\n`;

async function activate(container: HTMLElement, row: number, col: number): Promise<void> {
  get_cell(container, row, col).dispatchEvent(
    new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
  );
  await next_frame();
  await next_frame();
}

function subview_link(container: HTMLElement): Element {
  const span = get_cell(container, 2, 1).querySelector(
    `.plainmark-table-cell-edit [data-plainmark-href="${URL}"]`,
  );
  if (!span) throw new Error('no link span in the active cell subview');
  return span;
}

function click(target: Element, init: MouseEventInit): void {
  const rect = target.getBoundingClientRect();
  const coords = {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
    ...init,
  };
  target.dispatchEvent(new MouseEvent('mousedown', coords));
  target.dispatchEvent(new MouseEvent('mouseup', coords));
  target.dispatchEvent(new MouseEvent('click', coords));
}

describe('table cell links', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;
  let dispatched: string[];
  let listener: (e: Event) => void;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatched = [];
    listener = (e: Event) => {
      dispatched.push((e as CustomEvent<{ href: string }>).detail.href);
    };
    document.addEventListener('plainmark-link-click', listener);
  });

  afterEach(() => {
    document.removeEventListener('plainmark-link-click', listener);
    view?.destroy();
    view = undefined;
    container.remove();
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  it('TBL-R-3 LINK-I-7: an at-rest table link exposes no live href, even while another cell is active', async () => {
    view = mount_editor(container, DOC);
    await next_frame();
    const link = get_cell(container, 2, 1).querySelector('a.plainmark-link');
    expect(link?.getAttribute('data-plainmark-href')).toBe(URL);
    expect(get_table_block(container).querySelectorAll('a[href]').length).toBe(0);

    await activate(container, 1, 1);
    expect(container.querySelector('.plainmark-table-cell-edit')).not.toBeNull();
    expect(get_table_block(container).querySelectorAll('a[href]').length).toBe(0);
  });

  it('LINK-I-6 LINK-I-7: in an active cell, Cmd/Ctrl+click on the link navigates and a plain click does not', async () => {
    view = mount_editor(container, DOC);
    await activate(container, 2, 1);

    click(subview_link(container), {});
    await next_frame();
    expect(dispatched).toEqual([]);

    click(subview_link(container), { metaKey: true });
    await next_frame();
    expect(dispatched).toEqual([URL]);

    click(subview_link(container), { ctrlKey: true });
    await next_frame();
    expect(dispatched).toEqual([URL, URL]);
  });
});
