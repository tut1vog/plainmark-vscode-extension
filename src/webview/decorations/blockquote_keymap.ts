import { deleteCharBackward } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';
import { Transaction, type EditorState, type Line } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { ancestor, enclosing } from '../tree_ancestors.js';

const EMPTY_QUOTE_LINE_RE = /^[\s>]*>[\s>]*$/;
const ONE_LEVEL_RE = /^([ \t]*)>[ \t]?/;

// The Blockquote a line belongs to, probed at its first `>` — on a list
// continuation line the Blockquote node starts after the list indent.
function line_blockquote(state: EditorState, line: Line): SyntaxNode | null {
  const gt = line.text.indexOf('>');
  const probe = gt < 0 ? line.from : line.from + gt;
  return enclosing(syntaxTree(state).resolveInner(probe, 1), 'Blockquote');
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
  const quote = line_blockquote(state, line);
  if (!quote) return null;
  const m = ONE_LEVEL_RE.exec(line.text);
  if (!m) return null;
  // Whitespace before the marker is list indent inside a list item — keep it
  // so the caret stays in the item; elsewhere it is quote indent and goes too.
  const from = ancestor(quote, 'ListItem') ? line.from + m[1].length : line.from;
  const to = line.from + m[0].length;
  return { from, to, anchor: line.to - (to - from) };
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
  if (!line_blockquote(state, line)) return false;
  return deleteCharBackward(view);
}
