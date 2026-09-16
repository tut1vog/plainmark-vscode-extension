import { indentUnit, syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import { type ChangeSpec, Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { selected_lines } from '../selected_lines.js';
import { enclosing } from '../tree_ancestors.js';
import { continuation_hidden_indent } from './list_continuation.js';

// Checkbox form kept in lockstep with marker_aware_backspace's
// MARKER_PREFIX_RE — an empty `- [ ] ` must take the same two-stage exit as
// an empty `- `.
const EMPTY_BULLET_LINE_RE = /^[ \t]*[-*+](?: {1,4}\[[ xX]\])?[ \t]*$/;
const INDENT_ONLY_LINE_RE = /^[ \t]+$/;

// A quoted list line, split at the two positions Tab/Shift-Tab care about:
// group 1 — the quote prefix (every `>` plus the one optional space that
// belongs to the last marker); group 2 — the nesting spaces between prefix and
// list marker. The trailing `[ \t]` demands a real (space-gated) list item.
const QUOTED_LIST_LINE_RE = /^((?:[ \t]*>)+[ \t]?)([ \t]*)(?:[-*+]|\d+[.)])[ \t]/;

function in_list_item(state: EditorState, pos: number): boolean {
  return enclosing(syntaxTree(state).resolveInner(pos, 1), 'ListItem') !== null;
}

// The quoted list lines in the main selection, with the offset where nesting
// spaces begin (after the quote prefix) and the current nesting-space run.
// The syntax-tree check rejects lookalikes (e.g. a `> - x` line inside a
// fenced code block within the quote).
function quoted_list_lines(
  state: EditorState,
): Array<{ indent_at: number; spaces: number }> {
  const { first, last } = selected_lines(state);
  const out: Array<{ indent_at: number; spaces: number }> = [];
  for (let n = first; n <= last; n++) {
    const line = state.doc.line(n);
    const m = QUOTED_LIST_LINE_RE.exec(line.text);
    if (!m) continue;
    if (!in_list_item(state, line.from + m[1].length + m[2].length)) continue;
    out.push({ indent_at: line.from + m[1].length, spaces: m[2].length });
  }
  return out;
}

// Tab on a list item inside a blockquote. CM6's indentMore (via indentWithTab)
// inserts the indent unit at LINE START, which on a quoted line lands before
// the `>` — mutating the quote prefix instead of nesting the item. Insert the
// unit right after the quote prefix instead, where markdown reads list
// nesting from. Registered ahead of indentWithTab (Prec.highest, mirroring
// codeblock_tab); yields when no selected line is a quoted list line.
export function quoted_list_tab_indent(view: EditorView): boolean {
  const { state } = view;
  if (state.selection.ranges.length !== 1) return false;
  const lines = quoted_list_lines(state);
  if (lines.length === 0) return false;
  const unit = state.facet(indentUnit);
  const changes: ChangeSpec[] = lines.map((l) => ({ from: l.indent_at, insert: unit }));
  view.dispatch({
    changes,
    scrollIntoView: true,
    annotations: [Transaction.userEvent.of('input.indent')],
  });
  return true;
}

// Shift-Tab counterpart: remove up to one indent unit of nesting spaces from
// just after the quote prefix. Claims the key (returns true) even when there
// is nothing to remove, so indentLess cannot fall through and strip
// line-start whitespace before the `>`.
export function quoted_list_tab_dedent(view: EditorView): boolean {
  const { state } = view;
  if (state.selection.ranges.length !== 1) return false;
  const lines = quoted_list_lines(state);
  if (lines.length === 0) return false;
  const unit = state.facet(indentUnit).length;
  const changes: ChangeSpec[] = [];
  for (const l of lines) {
    const strip = Math.min(unit, l.spaces);
    if (strip > 0) changes.push({ from: l.indent_at, to: l.indent_at + strip, insert: '' });
  }
  if (changes.length > 0) {
    view.dispatch({
      changes,
      scrollIntoView: true,
      annotations: [Transaction.userEvent.of('delete.dedent')],
    });
  }
  return true;
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

// A list continuation line's indent is display-hidden (LIST-R-12), so the
// caret reads as sitting at the line's start anywhere in that run. Backspace
// there joins the line to the one above in one press — deleting only the
// hidden spaces would show nothing. In the visible whitespace past the run
// it deletes one character: lang-markdown's default strips all of it as
// "extra space after the marker", but on this line it is content.
export function list_continuation_indent_backspace(view: EditorView): boolean {
  const { state } = view;
  const { main } = state.selection;
  if (!main.empty) return false;
  const line = state.doc.lineAt(main.head);
  if (line.number === 1) return false;
  const hidden = continuation_hidden_indent(state, line);
  if (!hidden) return false;
  if (main.head > hidden.to) {
    if (/\S/.test(state.doc.sliceString(hidden.to, main.head))) return false;
    view.dispatch({
      changes: { from: main.head - 1, to: main.head },
      selection: { anchor: main.head - 1 },
      annotations: [Transaction.userEvent.of('delete')],
    });
    return true;
  }
  const prev_line = state.doc.line(line.number - 1);
  view.dispatch({
    changes: { from: prev_line.to, to: hidden.to, insert: '' },
    selection: { anchor: prev_line.to },
    annotations: [Transaction.userEvent.of('delete')],
  });
  return true;
}

// Delete at a line's end swallows the next line's hidden indent with the
// newline, so the join never surfaces the spaces mid-line.
export function list_continuation_indent_delete(view: EditorView): boolean {
  const { state } = view;
  const { main } = state.selection;
  if (!main.empty) return false;
  const line = state.doc.lineAt(main.head);
  if (main.head !== line.to || line.number === state.doc.lines) return false;
  const hidden = continuation_hidden_indent(state, state.doc.line(line.number + 1));
  if (!hidden) return false;
  view.dispatch({
    changes: { from: main.head, to: hidden.to, insert: '' },
    annotations: [Transaction.userEvent.of('delete')],
  });
  return true;
}

// Column 0 of a continuation line renders at the same spot as the hidden
// indent's end, so ArrowLeft/ArrowRight cross the newline and the indent as
// one step instead of stopping on that invisible position.
export function list_continuation_arrow_left(view: EditorView): boolean {
  const { state } = view;
  const { main } = state.selection;
  if (!main.empty) return false;
  const line = state.doc.lineAt(main.head);
  if (line.number === 1) return false;
  const hidden = continuation_hidden_indent(state, line);
  if (!hidden || main.head > hidden.to) return false;
  view.dispatch({
    selection: { anchor: state.doc.line(line.number - 1).to },
    scrollIntoView: true,
    annotations: [Transaction.userEvent.of('select')],
  });
  return true;
}

export function list_continuation_arrow_right(view: EditorView): boolean {
  const { state } = view;
  const { main } = state.selection;
  if (!main.empty) return false;
  const line = state.doc.lineAt(main.head);
  if (main.head !== line.to || line.number === state.doc.lines) return false;
  const hidden = continuation_hidden_indent(state, state.doc.line(line.number + 1));
  if (!hidden) return false;
  view.dispatch({
    selection: { anchor: hidden.to },
    scrollIntoView: true,
    annotations: [Transaction.userEvent.of('select')],
  });
  return true;
}
