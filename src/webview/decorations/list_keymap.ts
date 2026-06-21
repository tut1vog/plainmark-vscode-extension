import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import { Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

const EMPTY_BULLET_LINE_RE = /^[ \t]*[-*+][ \t]*$/;
const INDENT_ONLY_LINE_RE = /^[ \t]+$/;

function in_list_item(state: EditorState, pos: number): boolean {
  const cursor = syntaxTree(state).cursorAt(pos, 1);
  do {
    if (cursor.name === 'ListItem') return true;
  } while (cursor.parent());
  return false;
}

// Backspace on an empty bullet item drops the marker but keeps the leading
// indentation, so the caret lands aligned with the parent item's text column
// (Typora two-stage exit; stage two is list_dangling_indent_backspace).
// Higher-precedence than markdownKeymap, whose deleteMarkupBackward outdents
// a nested item instead of removing it.
export function list_empty_bullet_backspace(view: EditorView): boolean {
  const { state } = view;
  const { main } = state.selection;
  if (!main.empty) return false;
  const line = state.doc.lineAt(main.head);
  if (!EMPTY_BULLET_LINE_RE.test(line.text)) return false;
  const marker_from = line.from + line.text.search(/[-*+]/);
  // The syntax-tree check rejects a lone `-` that is a setext-heading underline.
  if (!in_list_item(state, marker_from)) return false;
  view.dispatch({
    changes: { from: marker_from, to: line.to, insert: '' },
    selection: { anchor: marker_from },
    annotations: [Transaction.userEvent.of('delete')],
  });
  return true;
}

// Stage two of the Typora exit: Backspace on the indentation-only line left by
// stage one removes the whole line, landing the caret at the end of the list
// item above. Scoped to lines directly below a list item so a plain document's
// indented blank line keeps the default backspace behavior.
export function list_dangling_indent_backspace(view: EditorView): boolean {
  const { state } = view;
  const { main } = state.selection;
  if (!main.empty) return false;
  const line = state.doc.lineAt(main.head);
  if (!INDENT_ONLY_LINE_RE.test(line.text)) return false;
  if (line.number === 1) return false;
  const prev_line = state.doc.line(line.number - 1);
  if (!in_list_item(state, prev_line.from)) return false;
  view.dispatch({
    changes: { from: prev_line.to, to: line.to, insert: '' },
    selection: { anchor: prev_line.to },
    annotations: [Transaction.userEvent.of('delete')],
  });
  return true;
}
