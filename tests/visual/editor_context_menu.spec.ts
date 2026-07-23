import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor } from './util.js';
import { create_clipboard_paste_controller } from '../../src/webview/clipboard.js';
import type { WebviewToHostMessage } from '../../src/sync/protocol.js';

const DOC = 'hello world\n\nsecond paragraph\n';
const SAMPLE_TABLE = '| a | b |\n|---|---|\n| 1 | 2 |\n';

function get_menus(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.plainmark-context-menu'));
}

function get_menu_item(id: string): HTMLElement | null {
  return document.querySelector(`.plainmark-context-menu-item[data-menu-item-id="${id}"]`);
}

function right_click_at(view: EditorView, pos: number): { x: number; y: number } {
  const coords = view.coordsAtPos(pos);
  if (!coords) throw new Error(`no coords at pos ${pos}`);
  const point = { x: coords.left + 1, y: (coords.top + coords.bottom) / 2 };
  view.contentDOM.dispatchEvent(
    new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
    }),
  );
  return point;
}

async function next_frame(): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

describe('editor context menu — DOM behavior', () => {
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
    document.querySelectorAll('.plainmark-context-menu').forEach((el) => el.remove());
  });

  it('CTX-R-1 CTX-R-2: right-click in prose opens the editor menu with the clipboard trio, Insert, and Select All', () => {
    view = mount_editor(container, DOC);
    right_click_at(view, 2);

    const menus = get_menus();
    expect(menus.length).toBe(1);
    for (const id of ['cut', 'copy', 'paste', 'insert', 'select_all']) {
      expect(get_menu_item(id), `missing item ${id}`).not.toBeNull();
    }
    // The editor-wide menu is not the table menu.
    expect(menus[0].classList.contains('plainmark-table-context-menu')).toBe(false);
  });

  it('CTX-R-5 CTX-I-2: no selection: cut and copy render disabled; paste and select all stay enabled', () => {
    view = mount_editor(container, DOC);
    view.dispatch({ selection: { anchor: 2 } });
    right_click_at(view, 2);

    for (const id of ['cut', 'copy']) {
      const item = get_menu_item(id);
      expect(item!.classList.contains('plainmark-context-menu-item-disabled')).toBe(true);
      expect(item!.getAttribute('aria-disabled')).toBe('true');
    }
    for (const id of ['paste', 'select_all']) {
      expect(
        get_menu_item(id)!.classList.contains('plainmark-context-menu-item-disabled'),
      ).toBe(false);
    }
  });

  it('CTX-I-1: right-click inside the selection keeps it and enables cut/copy', () => {
    view = mount_editor(container, DOC);
    view.dispatch({ selection: { anchor: 0, head: 5 } });
    right_click_at(view, 2);

    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(5);
    expect(
      get_menu_item('cut')!.classList.contains('plainmark-context-menu-item-disabled'),
    ).toBe(false);
    expect(
      get_menu_item('copy')!.classList.contains('plainmark-context-menu-item-disabled'),
    ).toBe(false);
  });

  it('CTX-I-1: right-click outside the selection moves the caret to the click point first', () => {
    view = mount_editor(container, DOC);
    view.dispatch({ selection: { anchor: 0, head: 5 } });
    const target_pos = DOC.indexOf('paragraph');
    const coords = view.coordsAtPos(target_pos)!;
    const expected = view.posAtCoords({
      x: coords.left + 1,
      y: (coords.top + coords.bottom) / 2,
    });
    right_click_at(view, target_pos);

    expect(view.state.selection.main.empty).toBe(true);
    expect(view.state.selection.main.head).toBe(expected);
  });

  it('CTX-R-3: hovering Insert opens the submenu with the five insert items', () => {
    view = mount_editor(container, DOC);
    right_click_at(view, 2);

    const insert = get_menu_item('insert')!;
    expect(insert.getAttribute('aria-haspopup')).toBe('menu');
    insert.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));

    expect(insert.getAttribute('aria-expanded')).toBe('true');
    expect(get_menus().length).toBe(2);
    for (const id of [
      'insert_table',
      'insert_code_block',
      'insert_math_block',
      'insert_horizontal_rule',
      'insert_footnote',
    ]) {
      expect(get_menu_item(id), `missing submenu item ${id}`).not.toBeNull();
    }
  });

  it('CTX-R-3: hovering a plain sibling item closes an open submenu', () => {
    view = mount_editor(container, DOC);
    right_click_at(view, 2);

    get_menu_item('insert')!.dispatchEvent(new MouseEvent('mouseenter'));
    expect(get_menus().length).toBe(2);
    get_menu_item('paste')!.dispatchEvent(new MouseEvent('mouseenter'));
    expect(get_menus().length).toBe(1);
    expect(get_menu_item('insert')!.getAttribute('aria-expanded')).toBe('false');
  });

  it('CTX-I-10 CTX-R-4 CTX-SP-1: Insert > Horizontal Rule inserts the rule in one transaction and dismisses the whole menu tree', async () => {
    view = mount_editor(container, DOC);
    view.dispatch({ selection: { anchor: DOC.length } });
    right_click_at(view, DOC.length - 1);
    const dispatch_spy = vi.spyOn(view, 'dispatch');

    get_menu_item('insert')!.dispatchEvent(new MouseEvent('mouseenter'));
    get_menu_item('insert_horizontal_rule')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    await next_frame();

    const change_calls = dispatch_spy.mock.calls.filter(
      (c) => (c[0] as { changes?: unknown }).changes !== undefined,
    );
    expect(change_calls.length).toBe(1);
    expect(view.state.doc.toString()).toContain('---\n');
    expect(get_menus().length).toBe(0);
  });

  it('CTX-I-10: Insert > Code Block places the caret on the empty line between the fences', async () => {
    view = mount_editor(container, 'hello\n');
    view.dispatch({ selection: { anchor: 6 } });
    right_click_at(view, 6);

    get_menu_item('insert')!.dispatchEvent(new MouseEvent('mouseenter'));
    get_menu_item('insert_code_block')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    await next_frame();

    expect(view.state.doc.toString()).toBe('hello\n```\n\n```');
    expect(view.state.selection.main.head).toBe(10);
  });

  it('CTX-I-2: Cut copies the selection to the clipboard and deletes it in one transaction', async () => {
    const written: string[] = [];
    // Own-property stub shadows the Navigator.prototype getter; deleted in finally.
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (t: string): Promise<void> => {
          written.push(t);
          return Promise.resolve();
        },
      },
    });
    try {
      view = mount_editor(container, DOC);
      view.dispatch({ selection: { anchor: 0, head: 5 } });
      right_click_at(view, 2);

      get_menu_item('cut')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      );
      await vi.waitFor(() => {
        expect(view!.state.doc.toString()).toBe(DOC.slice(5));
      });
      expect(written).toEqual(['hello']);
      expect(get_menus().length).toBe(0);
    } finally {
      delete (navigator as { clipboard?: unknown }).clipboard;
    }
  });

  it('CTX-R-5 CTX-I-5: Format submenu opens with four items; all disabled without a selection', () => {
    view = mount_editor(container, DOC);
    view.dispatch({ selection: { anchor: 2 } });
    right_click_at(view, 2);

    get_menu_item('format')!.dispatchEvent(new MouseEvent('mouseenter'));
    for (const id of [
      'format_bold',
      'format_italic',
      'format_strikethrough',
      'format_inline_code',
    ]) {
      const item = get_menu_item(id);
      expect(item, `missing item ${id}`).not.toBeNull();
      expect(item!.classList.contains('plainmark-context-menu-item-disabled')).toBe(true);
    }
  });

  it('CTX-I-5 CTX-SP-2: Format > Bold wraps the selection in one transaction, keeps it on the content, and dismisses', async () => {
    view = mount_editor(container, DOC);
    view.dispatch({ selection: { anchor: 6, head: 11 } });
    right_click_at(view, 8);
    const dispatch_spy = vi.spyOn(view, 'dispatch');

    get_menu_item('format')!.dispatchEvent(new MouseEvent('mouseenter'));
    get_menu_item('format_bold')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    await next_frame();

    const change_calls = dispatch_spy.mock.calls.filter(
      (c) => (c[0] as { changes?: unknown }).changes !== undefined,
    );
    expect(change_calls.length).toBe(1);
    expect(view.state.doc.toString()).toBe('hello **world**\n\nsecond paragraph\n');
    expect(view.state.selection.main.from).toBe(8);
    expect(view.state.selection.main.to).toBe(13);
    expect(get_menus().length).toBe(0);
  });

  it('CTX-I-6: Format > Bold with a whitespace-padded selection places markers inside the whitespace', async () => {
    view = mount_editor(container, DOC);
    view.dispatch({ selection: { anchor: 5, head: 11 } });
    right_click_at(view, 8);

    get_menu_item('format')!.dispatchEvent(new MouseEvent('mouseenter'));
    get_menu_item('format_bold')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    await next_frame();

    expect(view.state.doc.toString()).toBe('hello **world**\n\nsecond paragraph\n');
    expect(view.state.selection.main.from).toBe(8);
    expect(view.state.selection.main.to).toBe(13);
  });

  it('CTX-I-5: Format > Bold on a bold construct unwraps it back to the original bytes', async () => {
    view = mount_editor(container, 'hello **world**\n');
    view.dispatch({ selection: { anchor: 8, head: 13 } });
    right_click_at(view, 9);

    get_menu_item('format')!.dispatchEvent(new MouseEvent('mouseenter'));
    get_menu_item('format_bold')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    await next_frame();

    expect(view.state.doc.toString()).toBe('hello world\n');
    expect(view.state.selection.main.from).toBe(6);
    expect(view.state.selection.main.to).toBe(11);
  });

  it('CTX-R-2: Paragraph submenu opens with ten items, enabled even without a selection', () => {
    view = mount_editor(container, DOC);
    view.dispatch({ selection: { anchor: 2 } });
    right_click_at(view, 2);

    get_menu_item('paragraph')!.dispatchEvent(new MouseEvent('mouseenter'));
    const submenu_items = [
      'heading_1',
      'heading_2',
      'heading_3',
      'heading_4',
      'heading_5',
      'heading_6',
      'bulleted_list',
      'numbered_list',
      'task_list',
      'blockquote',
    ];
    for (const id of submenu_items) {
      const item = get_menu_item(id);
      expect(item, `missing item ${id}`).not.toBeNull();
      expect(item!.classList.contains('plainmark-context-menu-item-disabled')).toBe(false);
    }
  });

  it('CTX-I-7: Paragraph > Heading 1 prefixes the caret line in one transaction; re-applying reverts it', async () => {
    view = mount_editor(container, DOC);
    view.dispatch({ selection: { anchor: 2 } });
    right_click_at(view, 2);
    const dispatch_spy = vi.spyOn(view, 'dispatch');

    get_menu_item('paragraph')!.dispatchEvent(new MouseEvent('mouseenter'));
    get_menu_item('heading_1')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    await next_frame();

    const change_calls = dispatch_spy.mock.calls.filter(
      (c) => (c[0] as { changes?: unknown }).changes !== undefined,
    );
    expect(change_calls.length).toBe(1);
    expect(view.state.doc.toString()).toBe('# hello world\n\nsecond paragraph\n');
    expect(get_menus().length).toBe(0);

    right_click_at(view, 4);
    get_menu_item('paragraph')!.dispatchEvent(new MouseEvent('mouseenter'));
    get_menu_item('heading_1')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    await next_frame();
    expect(view.state.doc.toString()).toBe(DOC);
  });

  it('CTX-I-8: Paragraph > Bulleted List on an empty paragraph inserts the prefix and parks the caret after it', async () => {
    view = mount_editor(container, DOC);
    view.dispatch({ selection: { anchor: 12 } });
    right_click_at(view, 12);

    get_menu_item('paragraph')!.dispatchEvent(new MouseEvent('mouseenter'));
    get_menu_item('bulleted_list')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    await next_frame();

    expect(view.state.doc.toString()).toBe('hello world\n- \nsecond paragraph\n');
    expect(view.state.selection.main.head).toBe(14);
  });

  it('CTX-I-7 CTX-E-2: Paragraph > Blockquote quotes every non-blank line of a multi-line selection', async () => {
    view = mount_editor(container, DOC);
    view.dispatch({ selection: { anchor: 0, head: DOC.length } });
    right_click_at(view, 2);

    get_menu_item('paragraph')!.dispatchEvent(new MouseEvent('mouseenter'));
    get_menu_item('blockquote')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    await next_frame();

    expect(view.state.doc.toString()).toBe('> hello world\n\n> second paragraph\n');
  });

  it('CTX-I-4: Select All selects the whole document and dismisses the menu', async () => {
    view = mount_editor(container, DOC);
    view.dispatch({ selection: { anchor: 2 } });
    right_click_at(view, 2);

    get_menu_item('select_all')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    await next_frame();

    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(DOC.length);
    expect(get_menus().length).toBe(0);
  });

  it('CTX-R-4: Escape dismisses the menu', () => {
    view = mount_editor(container, DOC);
    right_click_at(view, 2);
    expect(get_menus().length).toBe(1);

    document.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }),
    );
    expect(get_menus().length).toBe(0);
  });

  it('CTX-E-1: right-click inside a table cell opens the table menu, not the editor menu', () => {
    view = mount_editor(container, SAMPLE_TABLE);
    const td = container.querySelector('[data-row-index="1"][data-col-index="0"]')!;
    td.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }),
    );

    const menus = get_menus();
    expect(menus.length).toBe(1);
    expect(menus[0].classList.contains('plainmark-table-context-menu')).toBe(true);
    expect(get_menu_item('insert_row_below')).not.toBeNull();
    expect(get_menu_item('cut')).toBeNull();
  });
});

describe('CTX-I-3 clipboard paste controller — host round-trip', () => {
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

  it('request posts read_clipboard; deliver replaces the selection with LF-normalized text', () => {
    view = mount_editor(container, 'abc def\n');
    view.dispatch({ selection: { anchor: 4, head: 7 } });
    const posted: WebviewToHostMessage[] = [];
    const controller = create_clipboard_paste_controller(view, (m) => posted.push(m));

    controller.request();
    expect(posted).toEqual([{ type: 'read_clipboard' }]);

    controller.deliver('one\r\ntwo');
    expect(view.state.doc.toString()).toBe('abc one\ntwo\n');
    expect(view.state.selection.main.head).toBe(11);
  });

  it('an unsolicited or empty reply changes nothing', () => {
    view = mount_editor(container, 'abc\n');
    const controller = create_clipboard_paste_controller(view, () => undefined);

    controller.deliver('stray');
    expect(view.state.doc.toString()).toBe('abc\n');

    controller.request();
    controller.deliver('');
    expect(view.state.doc.toString()).toBe('abc\n');
  });
});
