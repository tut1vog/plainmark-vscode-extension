import { syntaxTree } from '@codemirror/language';
import { type EditorState, EditorSelection } from '@codemirror/state';
import { EditorView, type MouseSelectionStyle } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { type OffsetRange, ranges_overlap } from '../ranges.js';
import { frozen_reveal_selection_field } from '../decorations/pointer_state.js';
import { should_reveal_for_selection } from '../decorations/selection_reveal.js';
import {
  block_math_content_range,
  block_math_widget_range,
  inline_math_content_range,
} from './math.js';

function climb_to_math(node: SyntaxNode | null): SyntaxNode | null {
  for (let n = node; n; n = n.parent) {
    if (n.name === 'InlineMath' || n.name === 'BlockMath') return n;
  }
  return null;
}

// A click on a replace-widget can land at either node boundary depending on which
// half was pressed, so resolve from both sides and take whichever finds the math.
// A quote-nested block widget replaces the whole line (MATH-R-2), so its
// boundary can sit on the line's `> ` prefix, outside the node — probe the
// line's first content char and accept a BlockMath whose widget range covers
// the click.
function math_node_at(state: EditorState, pos: number): SyntaxNode | null {
  const tree = syntaxTree(state);
  const direct =
    climb_to_math(tree.resolveInner(pos, -1)) ?? climb_to_math(tree.resolveInner(pos, 1));
  if (direct) return direct;
  const line = state.doc.lineAt(pos);
  const prefix_len = /^[ \t>]*/.exec(line.text)?.[0].length ?? 0;
  const content_pos = line.from + prefix_len;
  if (content_pos === pos) return null;
  const probed = climb_to_math(tree.resolveInner(content_pos, 1));
  if (probed?.name !== 'BlockMath') return null;
  const wr = block_math_widget_range(state, probed.from, probed.to);
  return pos >= wr.from && pos <= wr.to ? probed : null;
}

// The inner-LaTeX range to select when a *rendered* math widget is clicked
// (delimiters excluded — Obsidian / Typora behavior). Returns null when `pos` is
// not on a math node, or when the node's source is ALREADY revealed — so a click
// in revealed source places an ordinary caret for editing rather than re-selecting.
export function math_content_select_range(
  state: EditorState,
  pos: number,
): OffsetRange | null {
  const node = math_node_at(state, pos);
  if (!node) return null;
  if (node.name === 'InlineMath') {
    if (should_reveal_for_selection(state, node.from, node.to)) return null;
    return inline_math_content_range(node.from, node.to);
  }
  // Block reveal is the plain main-range overlap test (MATH-I-2) against the
  // widget's whole-line span, read through the same frozen-selection lens the
  // widget field uses while a press is held.
  const sel = (state.field(frozen_reveal_selection_field, false) ?? state.selection).main;
  if (ranges_overlap(sel, block_math_widget_range(state, node.from, node.to))) return null;
  return block_math_content_range(state, node.from, node.to);
}

// MATH-I-15: a plain primary single-click on a rendered math widget selects its
// inner LaTeX so it is ready to copy. Uses the public mouseSelectionStyle facet
// (same hook as triple-click line selection); returning null hands the gesture
// back to CM6's defaults — modified clicks, multi-click, clicks in revealed
// source, and non-math clicks all fall through to ordinary caret placement.
export const math_click_select = EditorView.mouseSelectionStyle.of(
  (view, event): MouseSelectionStyle | null => {
    if (event.button !== 0 || event.detail !== 1) return null;
    if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return null;
    // MATH-I-10: a press on a wide block's horizontal scrollbar (offsetY past the
    // content box) must scroll, not select.
    if (
      event.target instanceof HTMLElement &&
      event.target.classList.contains('plainmark-math-block') &&
      event.offsetY > event.target.clientHeight
    ) {
      return null;
    }
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) return null;
    const range = math_content_select_range(view.state, pos);
    if (!range) return null;
    let selection = EditorSelection.range(range.from, range.to);
    return {
      get: () => EditorSelection.create([selection]),
      update(update) {
        selection = selection.map(update.changes);
      },
    };
  },
);
