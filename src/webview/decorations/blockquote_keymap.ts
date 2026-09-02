import { deleteCharBackward } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';
import { Transaction, type EditorState, type Line } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { enclosing } from '../tree_ancestors.js';

const EMPTY_QUOTE_LINE_RE = /^[\s>]*>[\s>]*$/;
const ONE_LEVEL_RE = /^[ \t]*>[ \t]?/;

function line_in_blockquote(state: EditorState, line: Line): boolean {
  return enclosing(syntaxTree(state).resolveInner(line.from, 1), 'Blockquote') !== null;
}

interface OutdentOp {
  from: number;
  to: number;
  anchor: number;
}

// Obsidian Live Preview: Enter / Backspace on an empty `> ` line outdents ONE
// quote level in place — it removes the leading-most `> ` (or lone `>`) with no
// inserted newline, leaving the caret on the now-shallower line. Returns null
// when the caret is not a lone cursor on an empty marker-only line inside a
// Blockquote node.
function empty_quote_line_outdent(view: EditorView): OutdentOp | null {
  const { state } = view;
  const { main } = state.selection;
  if (!main.empty) return null;
  const line = state.doc.lineAt(main.head);
  if (!EMPTY_QUOTE_LINE_RE.test(line.text)) return null;
  if (!line_in_blockquote(state, line)) return null;
  const strip = ONE_LEVEL_RE.exec(line.text)?.[0].length ?? 0;
  return {
    from: line.from,
    to: line.from + strip,
    anchor: line.from + (line.text.length - strip),
  };
}

export function blockquote_empty_line_outdent(view: EditorView): boolean {
  const op = empty_quote_line_outdent(view);
  if (!op) return false;
  view.dispatch({
    changes: { from: op.from, to: op.to, insert: '' },
    selection: { anchor: op.anchor },
    annotations: [Transaction.userEvent.of('input')],
  });
  return true;
}

// Per-line reveal makes the `>` ordinary editable text, so Backspace inside a
// blockquote (or callout — a `Blockquote` node at the Lezer level) is plain
// single-character deletion: it removes the trailing space, then the `>`, one
// character per press — never the whole `> ` prefix (lang-markdown's
// `deleteMarkupBackward` markup-demote) and never the whole marker-only line (the
// old empty-`> `-line outdent). Matches Obsidian. Lists are NOT affected (their
// markdown-aware backspace is handled by the list / marker_aware handlers). Runs
// at `Prec.highest` ahead of `deleteMarkupBackward`; at column 0 it yields so the
// default line-join applies.
export function blockquote_plain_backspace(view: EditorView): boolean {
  const { state } = view;
  const { main } = state.selection;
  if (!main.empty) return false;
  if (main.head === 0) return false;
  const line = state.doc.lineAt(main.head);
  if (main.head === line.from) return false;
  if (!line_in_blockquote(state, line)) return false;
  return deleteCharBackward(view);
}
