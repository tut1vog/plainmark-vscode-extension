import { syntaxTree } from '@codemirror/language';
import { Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

// Plainmark override for `@codemirror/lang-markdown`'s `deleteMarkupBackward`
// in the "marker has content after it" case. lang-markdown's default fires on
// Backspace whenever the caret column equals the marker's trailing-space end —
// a useful "I just typed `> `, undo my marker" affordance on EMPTY marker
// lines, but destructive on lines with content. Concretely, typing a space at
// column 1 of `> [!CAUTION]` produces `>  [!CAUTION]` with caret at 2; the
// subsequent Backspace at column 2 (the spaceEnd for the `> ` marker) deletes
// the marker AND the just-typed space together, silently demoting the callout
// to ` [!CAUTION]`. We pre-empt at Prec.highest with a normal single-char
// Backspace whenever there's EXTRA whitespace immediately after the canonical
// marker — preserves the empty-line affordance, suppresses the content-loss
// surprise.

// One canonical marker (blockquote `>` / unordered `-`*`+ / ordered `1.`/`1)`)
// followed by exactly ONE space. The `+` allows nested markers (`> > content`).
// Matching one space (not `\s+`) is load-bearing: greedy `\s+` would absorb
// the extra whitespace we're meant to detect.
const MARKER_PREFIX_RE = /^(?:\s*(?:>|[-*+]|\d+[.)])\s)+/;

// True when `pos` sits inside a ListItem node. Blockquote contexts never reach
// these handlers: blockquote_plain_backspace runs earlier in the same keymap
// (editor_extensions.ts ordered dispatch) and consumes every in-blockquote
// Backspace with the identical single-char delete.
function in_list_item(view: EditorView, pos: number): boolean {
  const cursor = syntaxTree(view.state).cursorAt(pos, 1);
  do {
    if (cursor.name === 'ListItem') return true;
  } while (cursor.parent());
  return false;
}

export function marker_aware_backspace(view: EditorView): boolean {
  const { state } = view;
  const { main } = state.selection;
  if (!main.empty) return false;
  if (main.head === 0) return false;

  const line = state.doc.lineAt(main.head);
  const col = main.head - line.from;

  const m = MARKER_PREFIX_RE.exec(line.text);
  if (!m) return false;
  const marker_end = m[0].length;
  if (col !== marker_end) return false;

  const after = line.text.slice(marker_end);
  if (!/^\s/.test(after)) return false;
  if (!/\S/.test(after)) return false;

  // Guard against false positives in code blocks / HTML / raw contexts where
  // the line text matches the regex but isn't a markdown marker — mirrors
  // lang-markdown's `markdownLanguage.isActiveAt` + Blockquote/ListItem check.
  if (!in_list_item(view, line.from)) return false;

  view.dispatch({
    changes: { from: main.head - 1, to: main.head },
    selection: { anchor: main.head - 1 },
    annotations: [Transaction.userEvent.of('delete')],
  });
  return true;
}

// Pre-empt `deleteMarkupBackward` on a LAZY-CONTINUATION line — a line inside a
// Blockquote/ListItem node that carries no literal marker of its own (e.g. text
// typed on the line below `> [!NOTE]` lazily joins the quote). There the context
// reports the parent construct's marker columns, so deleteMarkupBackward deletes
// `[line.from + inner.from, caret)` — which on such a line is the user's own
// content, not a marker (typing then one Backspace eats an extra char). When the
// caret has real content before it on a no-marker line, force a plain single-char
// Backspace.
export function lazy_continuation_backspace(view: EditorView): boolean {
  const { state } = view;
  const { main } = state.selection;
  if (!main.empty) return false;
  if (main.head === 0) return false;

  const line = state.doc.lineAt(main.head);
  const col = main.head - line.from;
  if (col === 0) return false;

  // A line that physically starts with a canonical marker is handled by the
  // normal blockquote/list path (and lang-markdown's legitimate marker-undo).
  if (MARKER_PREFIX_RE.test(line.text)) return false;
  // Only intervene when content (not just indentation) precedes the caret — an
  // indentation-only prefix is lang-markdown's legitimate dedent affordance.
  if (!/\S/.test(line.text.slice(0, col))) return false;
  if (!in_list_item(view, line.from)) return false;

  view.dispatch({
    changes: { from: main.head - 1, to: main.head },
    selection: { anchor: main.head - 1 },
    annotations: [Transaction.userEvent.of('delete')],
  });
  return true;
}
