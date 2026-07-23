import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import {
  EditorSelection,
  Transaction,
  type EditorState,
  type SelectionRange,
  type TransactionSpec,
} from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

export type InlineStyle = 'bold' | 'italic' | 'strikethrough' | 'inline_code';

interface StyleDef {
  node_name: string;
  mark_name: string;
  marker: string;
}

const STYLE_DEFS: Record<InlineStyle, StyleDef> = {
  bold: { node_name: 'StrongEmphasis', mark_name: 'EmphasisMark', marker: '**' },
  italic: { node_name: 'Emphasis', mark_name: 'EmphasisMark', marker: '*' },
  strikethrough: { node_name: 'Strikethrough', mark_name: 'StrikethroughMark', marker: '~~' },
  inline_code: { node_name: 'InlineCode', mark_name: 'CodeMark', marker: '`' },
};

// Tree-based, not textual: `**bold**` is a StrongEmphasis, never an Emphasis,
// so an italic toggle inside bold wraps instead of eating one `*` per side.
function covering_node(
  state: EditorState,
  from: number,
  to: number,
  node_name: string,
): SyntaxNode | null {
  const tree = ensureSyntaxTree(state, to, 100) ?? syntaxTree(state);
  for (
    let node: SyntaxNode | null = tree.resolveInner(from, 1);
    node;
    node = node.parent
  ) {
    if (node.name === node_name && node.from <= from && node.to >= to) return node;
  }
  return null;
}

function unwrapped_range(
  range: SelectionRange,
  marks: Array<{ from: number; to: number }>,
): SelectionRange {
  const removed_before = (pos: number): number =>
    marks.reduce((n, m) => n + Math.max(0, Math.min(pos, m.to) - m.from), 0);
  return EditorSelection.range(
    range.anchor - removed_before(range.anchor),
    range.head - removed_before(range.head),
  );
}

// A selection anywhere inside a construct of the style (markers included)
// unwraps the whole construct — deleting its actual marker bytes, so `__x__`
// and `_x_` forms unwrap as written; wrapping always uses the canonical marker.
export function toggle_inline_style_spec(
  state: EditorState,
  style: InlineStyle,
): TransactionSpec | null {
  const def = STYLE_DEFS[style];
  if (state.selection.ranges.every((r) => r.empty)) return null;
  const spec = state.changeByRange((range) => {
    if (range.empty) return { range };
    const node = covering_node(state, range.from, range.to, def.node_name);
    const marks = node
      ? node.getChildren(def.mark_name).map((m) => ({ from: m.from, to: m.to }))
      : [];
    if (marks.length > 0) {
      return {
        changes: marks.map((m) => ({ from: m.from, to: m.to })),
        range: unwrapped_range(range, marks),
      };
    }
    return {
      changes: [
        { from: range.from, insert: def.marker },
        { from: range.to, insert: def.marker },
      ],
      range: EditorSelection.range(
        range.anchor + def.marker.length,
        range.head + def.marker.length,
      ),
    };
  });
  return {
    ...spec,
    annotations: Transaction.userEvent.of('input'),
    scrollIntoView: true,
  };
}

export function toggle_inline_style(view: EditorView, style: InlineStyle): boolean {
  const spec = toggle_inline_style_spec(view.state, style);
  if (!spec) return false;
  view.dispatch(spec);
  return true;
}
