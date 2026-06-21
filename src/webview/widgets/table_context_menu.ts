import type { EditorView } from '@codemirror/view';
import { dispatch_table_edit, dispatch_table_remove } from './table_keymap.js';
import { request_cell_focus } from './table.js';
import {
  delete_column,
  delete_row,
  insert_column_left,
  insert_column_right,
  insert_row_above,
  insert_row_below,
  set_column_alignment,
  structural_op_target,
  swap_column_left,
  swap_column_right,
  swap_row_down,
  swap_row_up,
} from './table_ops.js';
import type { TableModel } from './table_serialize.js';
import { get_table_keybindings } from './table_keybindings_config.js';
import type { TableActionId } from '../../common/table_keybindings.js';

export type MenuItemId = TableActionId;

export interface MenuItem {
  kind: 'item';
  id: MenuItemId;
  label: string;
  disabled: boolean;
  mutate: (m: TableModel) => TableModel;
}

interface MenuSeparator {
  kind: 'separator';
}

export type MenuEntry = MenuItem | MenuSeparator;

export interface MenuContext {
  row: number;
  col: number;
  row_count: number;
  col_count: number;
}

export function compute_menu_items(ctx: MenuContext): MenuEntry[] {
  const { row, col, row_count, col_count } = ctx;
  return [
    {
      kind: 'item',
      id: 'insert_row_above',
      label: 'Insert row above',
      disabled: row === 0,
      mutate: (m) => insert_row_above(m, row),
    },
    {
      kind: 'item',
      id: 'insert_row_below',
      label: 'Insert row below',
      disabled: false,
      mutate: (m) => insert_row_below(m, row),
    },
    {
      kind: 'item',
      id: 'insert_column_left',
      label: 'Insert column left',
      disabled: false,
      mutate: (m) => insert_column_left(m, col),
    },
    {
      kind: 'item',
      id: 'insert_column_right',
      label: 'Insert column right',
      disabled: false,
      mutate: (m) => insert_column_right(m, col),
    },
    { kind: 'separator' },
    {
      kind: 'item',
      id: 'delete_row',
      label: 'Delete row',
      disabled: row === 0,
      mutate: (m) => delete_row(m, row),
    },
    {
      kind: 'item',
      id: 'delete_column',
      label: 'Delete column',
      disabled: col_count <= 1,
      mutate: (m) => delete_column(m, col),
    },
    {
      kind: 'item',
      id: 'delete_table',
      label: 'Delete table',
      disabled: false,
      // delete_table removes the block in run_action; identity keeps the MenuItem shape uniform.
      mutate: (m) => m,
    },
    { kind: 'separator' },
    {
      kind: 'item',
      id: 'swap_row_up',
      label: 'Swap row up',
      disabled: row <= 1,
      mutate: (m) => swap_row_up(m, row),
    },
    {
      kind: 'item',
      id: 'swap_row_down',
      label: 'Swap row down',
      disabled: row === 0 || row >= row_count - 1,
      mutate: (m) => swap_row_down(m, row),
    },
    {
      kind: 'item',
      id: 'swap_column_left',
      label: 'Swap column left',
      disabled: col === 0,
      mutate: (m) => swap_column_left(m, col),
    },
    {
      kind: 'item',
      id: 'swap_column_right',
      label: 'Swap column right',
      disabled: col >= col_count - 1,
      mutate: (m) => swap_column_right(m, col),
    },
    { kind: 'separator' },
    {
      kind: 'item',
      id: 'align_left',
      label: 'Align column left',
      disabled: false,
      mutate: (m) => set_column_alignment(m, col, 'left'),
    },
    {
      kind: 'item',
      id: 'align_center',
      label: 'Align column center',
      disabled: false,
      mutate: (m) => set_column_alignment(m, col, 'center'),
    },
    {
      kind: 'item',
      id: 'align_right',
      label: 'Align column right',
      disabled: false,
      mutate: (m) => set_column_alignment(m, col, 'right'),
    },
    {
      kind: 'item',
      id: 'align_none',
      label: 'Align column none',
      disabled: false,
      mutate: (m) => set_column_alignment(m, col, null),
    },
  ];
}

// --- Keyboard-shortcut hints (TBL-I-27) ---

const ARROW_GLYPH: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

function split_combo(combo: string): { mods: string[]; key: string } {
  const parts = combo.split('-');
  return { mods: parts.slice(0, -1), key: parts[parts.length - 1] };
}

function display_modifier(mod: string, mac: boolean): string {
  switch (mod) {
    case 'Mod':
      return mac ? 'Cmd' : 'Ctrl';
    case 'Alt':
      return mac ? 'Option' : 'Alt';
    case 'Meta':
      return mac ? 'Cmd' : 'Meta';
    default:
      return mod; // Ctrl, Cmd, Shift
  }
}

function display_key(key: string): string {
  if (key in ARROW_GLYPH) return ARROW_GLYPH[key];
  if (/^[a-z]$/.test(key)) return key.toUpperCase();
  return key;
}

// Platform-aware display text for a CM6 key combo. Modifier symbols (⌘/⌥/⇧) were
// rejected — they render as tofu in some fonts; arrows keep their glyphs.
export function format_shortcut(combo: string, opts: { mac: boolean }): string {
  const { mods, key } = split_combo(combo);
  return [...mods.map((m) => display_modifier(m, opts.mac)), display_key(key)].join('+');
}

function aria_modifier(mod: string): string {
  switch (mod) {
    case 'Mod':
    case 'Ctrl':
      return 'Control';
    case 'Cmd':
    case 'Meta':
      return 'Meta';
    default:
      return mod; // Alt, Shift
  }
}

// Canonical, non-localized names for aria-keyshortcuts (W3C ARIA, platform-invariant).
export function aria_keyshortcut(combo: string): string {
  const { mods, key } = split_combo(combo);
  return [...mods.map(aria_modifier), key].join('+');
}

function is_mac(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua_data = (navigator as unknown as { userAgentData?: { platform?: string } })
    .userAgentData;
  const platform = ua_data?.platform || navigator.platform || navigator.userAgent || '';
  return /mac/i.test(platform);
}

// --- DOM rendering (Tier B-covered) ---

export interface ShowMenuArgs {
  main_view: EditorView;
  table_from: number;
  row: number;
  col: number;
  row_count: number;
  col_count: number;
  anchor: { x: number; y: number };
}

const MENU_STYLE_TEXT = `
.plainmark-table-context-menu {
  position: fixed;
  z-index: 99999;
  background: var(--vscode-menu-background, #fff);
  color: var(--vscode-menu-foreground, #000);
  border: 1px solid var(--vscode-menu-border, var(--vscode-widget-border, #888));
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  padding: 4px 0;
  min-width: 180px;
  font-size: var(--vscode-font-size, 13px);
  font-family: var(--vscode-font-family, sans-serif);
  user-select: none;
}
.plainmark-table-context-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 4px 12px;
  cursor: pointer;
  white-space: nowrap;
}
.plainmark-table-context-menu-item:hover {
  background: var(--vscode-menu-selectionBackground, #e0e0e0);
  color: var(--vscode-menu-selectionForeground, inherit);
}
.plainmark-table-context-menu-item-disabled {
  color: var(--vscode-disabledForeground, #888);
  pointer-events: none;
  cursor: default;
}
.plainmark-table-context-menu-item-shortcut {
  color: var(--vscode-descriptionForeground, var(--vscode-disabledForeground, #888));
  font-size: 0.9em;
}
.plainmark-table-context-menu-separator {
  border-top: 1px solid var(--vscode-menu-separatorBackground, var(--vscode-widget-border, #ccc));
  margin: 4px 0;
  height: 0;
}
`;

// Correct only for the single production webview / single EditorView realm; a
// second mounted view would share this injection flag and open-menu handle.
let stylesheet_injected = false;
let current_dismiss: (() => void) | null = null;

function ensure_stylesheet(): void {
  if (stylesheet_injected) return;
  if (typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = MENU_STYLE_TEXT;
  document.head.appendChild(style);
  stylesheet_injected = true;
}

export function show_table_context_menu(args: ShowMenuArgs): () => void {
  if (current_dismiss) current_dismiss();
  ensure_stylesheet();

  const entries = compute_menu_items({
    row: args.row,
    col: args.col,
    row_count: args.row_count,
    col_count: args.col_count,
  });

  const menu = document.createElement('div');
  menu.className = 'plainmark-table-context-menu';
  menu.setAttribute('role', 'menu');

  let dismissed = false;
  const cleanups: Array<() => void> = [];

  const dismiss = (): void => {
    if (dismissed) return;
    dismissed = true;
    for (const c of cleanups) c();
    if (menu.parentNode) menu.parentNode.removeChild(menu);
    if (current_dismiss === dismiss) current_dismiss = null;
  };

  const run_action = (entry: MenuItem): void => {
    if (entry.id === 'delete_table') {
      dispatch_table_remove(args.main_view, args.table_from);
      dismiss();
      return;
    }
    const out = dispatch_table_edit(args.main_view, args.table_from, entry.mutate);
    // RC2: re-activate the destination cell after a content-changing op (also
    // fixes "right-click op → caret to 0"); align ops + no-ops skip re-focus.
    if (out.changed && out.new_model) {
      const target = structural_op_target(
        entry.id,
        args.row,
        args.col,
        out.new_model.rows.length,
        out.new_model.rows[0]?.length ?? 0,
      );
      if (target) request_cell_focus(args.main_view, args.table_from, target.row, target.col);
    }
    dismiss();
  };

  const mac = is_mac();
  const keybindings = get_table_keybindings();

  for (const entry of entries) {
    if (entry.kind === 'separator') {
      const sep = document.createElement('div');
      sep.className = 'plainmark-table-context-menu-separator';
      sep.setAttribute('role', 'separator');
      menu.appendChild(sep);
      continue;
    }
    const item = document.createElement('div');
    item.className = 'plainmark-table-context-menu-item';
    if (entry.disabled) {
      item.classList.add('plainmark-table-context-menu-item-disabled');
      item.setAttribute('aria-disabled', 'true');
    }
    item.setAttribute('role', 'menuitem');
    item.dataset.menuItemId = entry.id;

    const label_span = document.createElement('span');
    label_span.className = 'plainmark-table-context-menu-item-label';
    label_span.textContent = entry.label;
    item.appendChild(label_span);

    const bound_key = keybindings[entry.id];
    if (bound_key) {
      const shortcut_span = document.createElement('span');
      shortcut_span.className = 'plainmark-table-context-menu-item-shortcut';
      shortcut_span.textContent = format_shortcut(bound_key, { mac });
      shortcut_span.setAttribute('aria-hidden', 'true');
      item.appendChild(shortcut_span);
      item.setAttribute('aria-keyshortcuts', aria_keyshortcut(bound_key));
    }

    item.addEventListener('click', () => {
      if (entry.disabled) return;
      run_action(entry);
    });
    menu.appendChild(item);
  }

  // Mount hidden at the anchor; measure; flip across the click point when overflowing the viewport.
  menu.style.left = `${args.anchor.x}px`;
  menu.style.top = `${args.anchor.y}px`;
  menu.style.visibility = 'hidden';
  document.body.appendChild(menu);

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rect = menu.getBoundingClientRect();
  let left = args.anchor.x;
  let top = args.anchor.y;
  if (left + rect.width > vw) left = Math.max(0, args.anchor.x - rect.width);
  if (top + rect.height > vh) top = Math.max(0, args.anchor.y - rect.height);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.visibility = '';

  const on_outside_mousedown = (ev: MouseEvent): void => {
    if (menu.contains(ev.target as Node)) return;
    dismiss();
  };
  const on_keydown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      dismiss();
    }
  };
  const on_scroll = (): void => {
    dismiss();
  };

  document.addEventListener('mousedown', on_outside_mousedown, true);
  document.addEventListener('keydown', on_keydown, true);
  window.addEventListener('scroll', on_scroll, true);
  cleanups.push(() => document.removeEventListener('mousedown', on_outside_mousedown, true));
  cleanups.push(() => document.removeEventListener('keydown', on_keydown, true));
  cleanups.push(() => window.removeEventListener('scroll', on_scroll, true));

  current_dismiss = dismiss;
  return dismiss;
}
