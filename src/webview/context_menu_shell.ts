// Shared DOM shell for Plainmark's right-click menus (editor-wide + table cell).
// Custom in-webview DOM rather than VS Code's `webview/context` contribution —
// the webview's own `preventDefault()` on contextmenu suppresses the native menu.

export interface ShellActionItem {
  kind: 'item';
  id: string;
  label: string;
  disabled?: boolean;
  // CM6 combo (e.g. 'Mod-Shift-6'): rendered per-platform, mirrored in aria-keyshortcuts.
  shortcut?: string;
  run: () => void;
}

export interface ShellSubmenu {
  kind: 'submenu';
  id: string;
  label: string;
  entries: ShellEntry[];
}

interface ShellSeparator {
  kind: 'separator';
}

export type ShellEntry = ShellActionItem | ShellSubmenu | ShellSeparator;

export interface ShowContextMenuArgs {
  entries: ShellEntry[];
  anchor: { x: number; y: number };
  // Legacy per-menu class applied alongside the shared classes (same suffixes) so
  // existing selectors/tests keyed on the table menu's original classes keep working.
  alias_prefix?: string;
}

// --- Keyboard-shortcut hints ---

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

// --- DOM rendering ---

const BASE_CLASS = 'plainmark-context-menu';

const MENU_STYLE_TEXT = `
.plainmark-context-menu {
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
.plainmark-context-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 4px 12px;
  cursor: pointer;
  white-space: nowrap;
}
.plainmark-context-menu-item:hover {
  background: var(--vscode-menu-selectionBackground, #e0e0e0);
  color: var(--vscode-menu-selectionForeground, inherit);
}
.plainmark-context-menu-item-disabled {
  color: var(--vscode-disabledForeground, #888);
  pointer-events: none;
  cursor: default;
}
.plainmark-context-menu-item-shortcut {
  color: var(--vscode-descriptionForeground, var(--vscode-disabledForeground, #888));
  font-size: 0.9em;
}
.plainmark-context-menu-submenu-arrow {
  color: var(--vscode-descriptionForeground, var(--vscode-disabledForeground, #888));
  font-size: 0.9em;
}
.plainmark-context-menu-separator {
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

function class_names(suffix: string, alias_prefix: string | undefined): string {
  const base = `${BASE_CLASS}${suffix}`;
  return alias_prefix ? `${base} ${alias_prefix}${suffix}` : base;
}

interface MenuHandle {
  el: HTMLElement;
  close: () => void;
}

function clamp_into_viewport(el: HTMLElement, x: number, y: number, flip_anchor?: DOMRect): void {
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.visibility = 'hidden';
  document.body.appendChild(el);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rect = el.getBoundingClientRect();
  let left = x;
  let top = y;
  if (left + rect.width > vw) {
    left = Math.max(0, flip_anchor ? flip_anchor.left - rect.width : x - rect.width);
  }
  if (top + rect.height > vh) top = Math.max(0, flip_anchor ? vh - rect.height : y - rect.height);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  el.style.visibility = '';
}

function create_menu(
  entries: ShellEntry[],
  alias_prefix: string | undefined,
  mounted: Set<HTMLElement>,
  on_action: () => void,
): MenuHandle {
  const menu = document.createElement('div');
  menu.className = class_names('', alias_prefix);
  menu.setAttribute('role', 'menu');
  // Keep focus (and the editor's DOM selection) untouched while clicking menu items.
  menu.addEventListener('mousedown', (ev) => ev.preventDefault());
  mounted.add(menu);

  let child: { handle: MenuHandle; item: HTMLElement } | null = null;
  const close_child = (): void => {
    if (!child) return;
    child.item.setAttribute('aria-expanded', 'false');
    child.handle.close();
    child = null;
  };
  const close = (): void => {
    close_child();
    mounted.delete(menu);
    menu.remove();
  };

  const mac = is_mac();

  for (const entry of entries) {
    if (entry.kind === 'separator') {
      const sep = document.createElement('div');
      sep.className = class_names('-separator', alias_prefix);
      sep.setAttribute('role', 'separator');
      menu.appendChild(sep);
      continue;
    }

    const item = document.createElement('div');
    item.className = class_names('-item', alias_prefix);
    item.setAttribute('role', 'menuitem');
    item.dataset.menuItemId = entry.id;

    const label_span = document.createElement('span');
    label_span.className = class_names('-item-label', alias_prefix);
    label_span.textContent = entry.label;
    item.appendChild(label_span);

    if (entry.kind === 'submenu') {
      item.setAttribute('aria-haspopup', 'menu');
      item.setAttribute('aria-expanded', 'false');
      const arrow = document.createElement('span');
      arrow.className = class_names('-submenu-arrow', alias_prefix);
      arrow.textContent = '▸';
      arrow.setAttribute('aria-hidden', 'true');
      item.appendChild(arrow);

      const open_submenu = (): void => {
        if (child?.item === item) return;
        close_child();
        const handle = create_menu(entry.entries, alias_prefix, mounted, on_action);
        const item_rect = item.getBoundingClientRect();
        // -4px aligns the submenu's first item with its parent (menu padding).
        clamp_into_viewport(handle.el, item_rect.right, item_rect.top - 4, item_rect);
        item.setAttribute('aria-expanded', 'true');
        child = { handle, item };
      };
      item.addEventListener('mouseenter', open_submenu);
      item.addEventListener('click', open_submenu);
    } else {
      if (entry.disabled) {
        item.classList.add(...class_names('-item-disabled', alias_prefix).split(' '));
        item.setAttribute('aria-disabled', 'true');
      }
      if (entry.shortcut) {
        const shortcut_span = document.createElement('span');
        shortcut_span.className = class_names('-item-shortcut', alias_prefix);
        shortcut_span.textContent = format_shortcut(entry.shortcut, { mac });
        shortcut_span.setAttribute('aria-hidden', 'true');
        item.appendChild(shortcut_span);
        item.setAttribute('aria-keyshortcuts', aria_keyshortcut(entry.shortcut));
      }
      item.addEventListener('mouseenter', close_child);
      item.addEventListener('click', () => {
        if (entry.disabled) return;
        entry.run();
        on_action();
      });
    }
    menu.appendChild(item);
  }

  return { el: menu, close };
}

export function show_context_menu(args: ShowContextMenuArgs): () => void {
  if (current_dismiss) current_dismiss();
  ensure_stylesheet();

  const mounted = new Set<HTMLElement>();
  let dismissed = false;
  const cleanups: Array<() => void> = [];

  const dismiss = (): void => {
    if (dismissed) return;
    dismissed = true;
    for (const c of cleanups) c();
    root.close();
    if (current_dismiss === dismiss) current_dismiss = null;
  };

  const root = create_menu(args.entries, args.alias_prefix, mounted, dismiss);
  clamp_into_viewport(root.el, args.anchor.x, args.anchor.y);

  const on_outside_mousedown = (ev: MouseEvent): void => {
    for (const m of mounted) {
      if (m.contains(ev.target as Node)) return;
    }
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
