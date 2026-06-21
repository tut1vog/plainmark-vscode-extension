import { deleteCharBackward } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';
import { Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

const EMPTY_QUOTE_LINE_RE = /^[\s>]*>[\s>]*$/;
const ONE_LEVEL_RE = /^[ \t]*>[ \t]?/;

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
  const cursor = syntaxTree(state).cursorAt(line.from, 1);
  let in_blockquote = false;
  do {
    if (cursor.name === 'Blockquote') {
      in_blockquote = true;
      break;
    }
  } while (cursor.parent());
  if (!in_blockquote) return null;
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
  const cursor = syntaxTree(state).cursorAt(line.from, 1);
  let in_blockquote = false;
  do {
    if (cursor.name === 'Blockquote') {
      in_blockquote = true;
      break;
    }
  } while (cursor.parent());
  if (!in_blockquote) return false;
  return deleteCharBackward(view);
}
