import { describe, expect, it, vi } from 'vitest';
import {
  compute_editor_menu_entries,
  type EditorMenuActions,
} from './editor_context_menu.js';
import type { ShellActionItem, ShellEntry, ShellSubmenu } from './context_menu_shell.js';

function stub_actions(): EditorMenuActions {
  return {
    cut: vi.fn(),
    copy: vi.fn(),
    paste: vi.fn(),
    select_all: vi.fn(),
    format_bold: vi.fn(),
    format_italic: vi.fn(),
    format_strikethrough: vi.fn(),
    format_inline_code: vi.fn(),
    paragraph: vi.fn(),
    insert_table: vi.fn(),
    insert_code_block: vi.fn(),
    insert_math_block: vi.fn(),
    insert_horizontal_rule: vi.fn(),
    insert_footnote: vi.fn(),
  };
}

function find_item(entries: ShellEntry[], id: string): ShellActionItem {
  const entry = entries.find((e) => e.kind === 'item' && e.id === id);
  if (!entry || entry.kind !== 'item') throw new Error(`menu item ${id} not found`);
  return entry;
}

function find_submenu(entries: ShellEntry[], id: string): ShellSubmenu {
  const entry = entries.find((e) => e.kind === 'submenu' && e.id === id);
  if (!entry || entry.kind !== 'submenu') throw new Error(`submenu ${id} not found`);
  return entry;
}

describe('compute_editor_menu_entries — structure', () => {
  it('emits clipboard trio, Insert submenu, and Select All in canonical order with separators', () => {
    const entries = compute_editor_menu_entries({ has_selection: true }, stub_actions());
    const shape = entries.map((e) => (e.kind === 'separator' ? '|' : `${e.kind}:${e.id}`));
    expect(shape).toEqual([
      'item:cut',
      'item:copy',
      'item:paste',
      '|',
      'submenu:format',
      'submenu:paragraph',
      'submenu:insert',
      '|',
      'item:select_all',
    ]);
  });

  it('Paragraph submenu holds six headings, a separator, and the four block types', () => {
    const entries = compute_editor_menu_entries({ has_selection: false }, stub_actions());
    const submenu = find_submenu(entries, 'paragraph');
    const shape = submenu.entries.map((e) => (e.kind === 'separator' ? '|' : e.id));
    expect(shape).toEqual([
      'heading_1',
      'heading_2',
      'heading_3',
      'heading_4',
      'heading_5',
      'heading_6',
      '|',
      'bulleted_list',
      'numbered_list',
      'task_list',
      'blockquote',
    ]);
    for (const e of submenu.entries) {
      if (e.kind === 'item') expect(e.disabled, e.id).toBeFalsy();
    }
  });

  it('Format submenu holds bold, italic, strikethrough, inline code', () => {
    const entries = compute_editor_menu_entries({ has_selection: false }, stub_actions());
    const submenu = find_submenu(entries, 'format');
    const ids = submenu.entries.filter((e) => e.kind === 'item').map((e) => e.id);
    expect(ids).toEqual([
      'format_bold',
      'format_italic',
      'format_strikethrough',
      'format_inline_code',
    ]);
  });

  it('Insert submenu holds table, code block, math block, horizontal rule, footnote', () => {
    const entries = compute_editor_menu_entries({ has_selection: false }, stub_actions());
    const submenu = find_submenu(entries, 'insert');
    const ids = submenu.entries.filter((e) => e.kind === 'item').map((e) => e.id);
    expect(ids).toEqual([
      'insert_table',
      'insert_code_block',
      'insert_math_block',
      'insert_horizontal_rule',
      'insert_footnote',
    ]);
  });

  it('every item has a non-empty label and a unique id', () => {
    const entries = compute_editor_menu_entries({ has_selection: true }, stub_actions());
    const ids = new Set<string>();
    const walk = (list: ShellEntry[]): void => {
      for (const e of list) {
        if (e.kind === 'separator') continue;
        expect(e.label.length).toBeGreaterThan(0);
        expect(ids.has(e.id)).toBe(false);
        ids.add(e.id);
        if (e.kind === 'submenu') walk(e.entries);
      }
    };
    walk(entries);
    expect(ids.size).toBe(26);
  });
});

describe('compute_editor_menu_entries — disabled rules', () => {
  it('no selection: cut, copy, and all format items disabled; paste, select all, and inserts stay enabled', () => {
    const entries = compute_editor_menu_entries({ has_selection: false }, stub_actions());
    expect(find_item(entries, 'cut').disabled).toBe(true);
    expect(find_item(entries, 'copy').disabled).toBe(true);
    for (const e of find_submenu(entries, 'format').entries) {
      if (e.kind === 'item') expect(e.disabled, e.id).toBe(true);
    }
    expect(find_item(entries, 'paste').disabled).toBeFalsy();
    expect(find_item(entries, 'select_all').disabled).toBeFalsy();
    for (const e of find_submenu(entries, 'insert').entries) {
      if (e.kind === 'item') expect(e.disabled, e.id).toBeFalsy();
    }
  });

  it('with selection: cut, copy, and format items enabled', () => {
    const entries = compute_editor_menu_entries({ has_selection: true }, stub_actions());
    expect(find_item(entries, 'cut').disabled).toBe(false);
    expect(find_item(entries, 'copy').disabled).toBe(false);
    for (const e of find_submenu(entries, 'format').entries) {
      if (e.kind === 'item') expect(e.disabled, e.id).toBe(false);
    }
  });
});

describe('compute_editor_menu_entries — wiring and shortcuts', () => {
  it('each item runs its own action exactly once', () => {
    const act = stub_actions();
    const entries = compute_editor_menu_entries({ has_selection: true }, act);
    find_item(entries, 'cut').run();
    find_item(entries, 'paste').run();
    find_item(find_submenu(entries, 'insert').entries, 'insert_math_block').run();
    expect(act.cut).toHaveBeenCalledTimes(1);
    expect(act.paste).toHaveBeenCalledTimes(1);
    expect(act.insert_math_block).toHaveBeenCalledTimes(1);
    expect(act.copy).not.toHaveBeenCalled();
  });

  it('paragraph items pass their style to the shared paragraph action', () => {
    const act = stub_actions();
    const entries = compute_editor_menu_entries({ has_selection: false }, act);
    const submenu = find_submenu(entries, 'paragraph');
    find_item(submenu.entries, 'heading_3').run();
    find_item(submenu.entries, 'blockquote').run();
    expect(act.paragraph).toHaveBeenNthCalledWith(1, 'heading_3');
    expect(act.paragraph).toHaveBeenNthCalledWith(2, 'blockquote');
  });

  it('clipboard items and footnote carry their CM6 shortcut combos', () => {
    const entries = compute_editor_menu_entries({ has_selection: true }, stub_actions());
    expect(find_item(entries, 'cut').shortcut).toBe('Mod-x');
    expect(find_item(entries, 'copy').shortcut).toBe('Mod-c');
    expect(find_item(entries, 'paste').shortcut).toBe('Mod-v');
    expect(find_item(entries, 'select_all').shortcut).toBe('Mod-a');
    expect(
      find_item(find_submenu(entries, 'insert').entries, 'insert_footnote').shortcut,
    ).toBe('Mod-Shift-6');
  });
});
