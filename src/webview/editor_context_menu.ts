import { selectAll } from '@codemirror/commands';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { show_context_menu, type ShellEntry } from './context_menu_shell.js';
import { copy_selection, cut_selection, request_clipboard_paste } from './clipboard.js';
import { insert_code_block, insert_horizontal_rule, insert_math_block } from './insert_block.js';
import { insert_footnote } from './decorations/footnote_insert.js';
import { insert_table_at_caret } from './widgets/insert_table_command.js';

export interface EditorMenuContext {
  has_selection: boolean;
}

export interface EditorMenuActions {
  cut(): void;
  copy(): void;
  paste(): void;
  select_all(): void;
  insert_table(): void;
  insert_code_block(): void;
  insert_math_block(): void;
  insert_horizontal_rule(): void;
  insert_footnote(): void;
}

export function compute_editor_menu_entries(
  ctx: EditorMenuContext,
  act: EditorMenuActions,
): ShellEntry[] {
  return [
    {
      kind: 'item',
      id: 'cut',
      label: 'Cut',
      disabled: !ctx.has_selection,
      shortcut: 'Mod-x',
      run: act.cut,
    },
    {
      kind: 'item',
      id: 'copy',
      label: 'Copy',
      disabled: !ctx.has_selection,
      shortcut: 'Mod-c',
      run: act.copy,
    },
    { kind: 'item', id: 'paste', label: 'Paste', shortcut: 'Mod-v', run: act.paste },
    { kind: 'separator' },
    {
      kind: 'submenu',
      id: 'insert',
      label: 'Insert',
      entries: [
        { kind: 'item', id: 'insert_table', label: 'Table', run: act.insert_table },
        { kind: 'item', id: 'insert_code_block', label: 'Code Block', run: act.insert_code_block },
        { kind: 'item', id: 'insert_math_block', label: 'Math Block', run: act.insert_math_block },
        {
          kind: 'item',
          id: 'insert_horizontal_rule',
          label: 'Horizontal Rule',
          run: act.insert_horizontal_rule,
        },
        {
          kind: 'item',
          id: 'insert_footnote',
          label: 'Footnote',
          shortcut: 'Mod-Shift-6',
          run: act.insert_footnote,
        },
      ],
    },
    { kind: 'separator' },
    { kind: 'item', id: 'select_all', label: 'Select All', shortcut: 'Mod-a', run: act.select_all },
  ];
}

function make_view_actions(view: EditorView): EditorMenuActions {
  return {
    cut: () => void cut_selection(view),
    copy: () => void copy_selection(view),
    paste: () => request_clipboard_paste(),
    select_all: () => {
      selectAll(view);
      view.focus();
    },
    insert_table: () => insert_table_at_caret(view),
    insert_code_block: () => {
      insert_code_block(view);
      view.focus();
    },
    insert_math_block: () => {
      insert_math_block(view);
      view.focus();
    },
    insert_horizontal_rule: () => {
      insert_horizontal_rule(view);
      view.focus();
    },
    insert_footnote: () => {
      insert_footnote(view);
      view.focus();
    },
  };
}

// Main view only: a right-click inside a table cell is claimed (preventDefault)
// by the cell's own contextmenu handler before it bubbles up here.
export const editor_context_menu_extension: Extension = EditorView.domEventHandlers({
  contextmenu(event, view) {
    if (event.defaultPrevented) return false;
    event.preventDefault();
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    // Platform convention: a right-click inside the selection keeps it; one
    // outside moves the caret to the click point before menu state is computed.
    if (
      pos !== null &&
      !view.state.selection.ranges.some((r) => pos >= r.from && pos <= r.to)
    ) {
      view.dispatch({ selection: { anchor: pos } });
    }
    const has_selection = view.state.selection.ranges.some((r) => !r.empty);
    show_context_menu({
      entries: compute_editor_menu_entries({ has_selection }, make_view_actions(view)),
      anchor: { x: event.clientX, y: event.clientY },
    });
    return true;
  },
});
