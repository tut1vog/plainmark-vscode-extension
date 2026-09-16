import { syntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState, type Line } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';
import { ancestor, enclosing } from '../tree_ancestors.js';

const LEADING_WS_RE = /^[ \t]*/;

function find_first_child(node: SyntaxNode, name: string): SyntaxNode | null {
  for (let c = node.firstChild; c; c = c.nextSibling) if (c.name === name) return c;
  return null;
}

// Column at which an item's content starts on its marker line: marker end plus
// the 1–4 spaces after it (5+ spaces count as one — the rest is content).
export function item_content_column(state: EditorState, item: SyntaxNode): number | null {
  const mark = find_first_child(item, 'ListMark');
  if (!mark) return null;
  const marker_line = state.doc.lineAt(item.from);
  const after = marker_line.text.slice(mark.to - marker_line.from);
  const spaces = LEADING_WS_RE.exec(after)![0].length;
  return mark.to - marker_line.from + (spaces > 4 ? 1 : spaces);
}

// The hidden span of a list continuation line's leading whitespace, or null
// when `line` is not such a line. Only the item's continuation indent is
// hidden; whitespace beyond the content column stays visible.
export function continuation_hidden_indent(
  state: EditorState,
  line: Line,
): { from: number; to: number } | null {
  const ws = LEADING_WS_RE.exec(line.text)![0].length;
  if (ws === 0 || ws === line.length) return null;
  const paragraph = enclosing(syntaxTree(state).resolveInner(line.from + ws, 1), 'Paragraph');
  const item = paragraph?.parent;
  if (!item || item.name !== 'ListItem') return null;
  if (state.doc.lineAt(item.from).from === line.from) return null;
  // A quoted item's continuation whitespace stays in flow (LIST-R-12).
  if (ancestor(item, 'Blockquote') !== null) return null;
  const content_column = item_content_column(state, item) ?? ws;
  return { from: line.from, to: line.from + Math.min(ws, content_column) };
}

// Every position in the hidden run renders at the run's end, so an empty
// caret placed inside it — by a click in the line's padding, a vertical move,
// or a dispatch — rests at the end. CM6's atomic-range snap covers only pointer
// and DOM selections and leaves the run's own start reachable.
export const list_continuation_caret_filter = EditorState.transactionFilter.of((tr) => {
  const sel = tr.selection;
  if (!sel) return tr;
  const state = tr.state;
  let moved = false;
  const ranges = sel.ranges.map((range) => {
    if (!range.empty) return range;
    const line = state.doc.lineAt(range.head);
    const hidden = continuation_hidden_indent(state, line);
    if (!hidden || range.head >= hidden.to) return range;
    moved = true;
    return EditorSelection.cursor(hidden.to);
  });
  if (!moved) return tr;
  return [tr, { selection: EditorSelection.create(ranges, sel.mainIndex) }];
});
