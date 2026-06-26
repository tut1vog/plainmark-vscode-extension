import { syntaxTree } from '@codemirror/language';
import {
  type EditorState,
  EditorSelection,
  type SelectionRange,
} from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

// Typora-style auto-include-markers-in-selection for inline constructs.
// On mouseup, if a non-empty selection lies inside a construct's content area,
// snap to the node's outer bounds so the syntax markers join the selection —
// combined with the reveal-on-non-strict-cover rule, the markers reveal at
// the snapped boundary. Bare URLs have no markers, so they never snap.
const SNAP_NODE_NAMES: ReadonlyMap<string, string> = new Map([
  ['StrongEmphasis', 'EmphasisMark'],
  ['Emphasis', 'EmphasisMark'],
  ['Strikethrough', 'StrikethroughMark'],
  ['InlineCode', 'CodeMark'],
  ['Autolink', 'LinkMark'],
]);

interface SnapTarget {
  readonly from: number;
  readonly to: number;
}

function snap_rules(
  content_start: number,
  content_end: number,
  node_from: number,
  node_to: number,
  range: SelectionRange,
): SnapTarget | null {
  const left_at_content_start = range.from === content_start;
  const right_at_content_end = range.to === content_end;
  const left_before_content = range.from < content_start;
  const right_after_content = range.to > content_end;

  // Rule C — exact content-area cover (e.g., a drag selecting exactly `bold` inside
  // `**bold**`). Snap to the whole construct so a copy yields the
  // markdown source. Strict-inside selections (`ld` inside `bold`)
  // deliberately do NOT snap — the user's range is narrower than the
  // construct on purpose; markers still reveal via the
  // non-strict-cover rule, selection stays where the user put it.
  if (left_at_content_start && right_at_content_end) {
    if (range.from === node_from && range.to === node_to) return null;
    return { from: node_from, to: node_to };
  }
  // Rule A — left edge at content start AND right extends past the closing
  // marker. The hidden opening marker is collapsed to the same visual
  // position as content_start (display:none), so a user dragging past the
  // construct on the right can't visually reach behind the opening marker
  // with the mouse — extend the left edge to include it.
  if (left_at_content_start && right_after_content) {
    return { from: node_from, to: range.to };
  }
  // Rule B — symmetric for the closing marker.
  if (right_at_content_end && left_before_content) {
    return { from: range.from, to: node_to };
  }
  return null;
}

function match_symmetric_rule(node: SyntaxNode, range: SelectionRange): SnapTarget | null {
  const mark_name = SNAP_NODE_NAMES.get(node.name);
  if (!mark_name) return null;
  const first = node.firstChild;
  const last = node.lastChild;
  // Mirror text_styles.ts well-formedness check: firstChild and lastChild
  // must be the syntax marks with content between them.
  if (
    !first ||
    !last ||
    first === last ||
    first.name !== mark_name ||
    last.name !== mark_name ||
    first.to >= last.from
  ) {
    return null;
  }
  return snap_rules(first.to, last.from, node.from, node.to, range);
}

// `[label](url)` — content area is the LABEL (between the first `[` and `]`),
// but the snap target is the whole node including `(url)`. The construct is
// asymmetric (last mark is `)`, not the closing content marker), so it can't go
// through match_symmetric_rule. Mirrors links.ts well-formedness.
function match_link_rule(node: SyntaxNode, range: SelectionRange): SnapTarget | null {
  if (node.name !== 'Link') return null;
  const marks: SyntaxNode[] = [];
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === 'LinkMark') marks.push(c);
  }
  if (marks.length < 4) return null;
  const open = marks[0];
  const close_bracket = marks[1];
  const close_paren = marks[marks.length - 1];
  if (open.from !== node.from || close_paren.to !== node.to) return null;
  const content_start = open.to;
  const content_end = close_bracket.from;
  if (content_start >= content_end) return null;
  return snap_rules(content_start, content_end, node.from, node.to, range);
}

function match_rule(node: SyntaxNode, range: SelectionRange): SnapTarget | null {
  return match_symmetric_rule(node, range) ?? match_link_rule(node, range);
}

function walk_for_rule(start: SyntaxNode | null, range: SelectionRange): SnapTarget | null {
  let node: SyntaxNode | null = start;
  while (node) {
    const target = match_rule(node, range);
    if (target) return target;
    node = node.parent;
  }
  return null;
}

function find_snap_target(state: EditorState, range: SelectionRange): SnapTarget | null {
  if (range.empty) return null;
  const tree = syntaxTree(state);
  // Walk from both endpoints — Rule A needs an inside-construct anchor at
  // range.from; Rule B needs one at range.to (Rule B's range.from is BEFORE
  // the construct, so resolveInner(range.from) lands outside and never reaches
  // the emphasis on the way up). Rule C's endpoints both sit inside, so
  // either walk finds it; the from-walk runs first by convention.
  return (
    walk_for_rule(tree.resolveInner(range.from, 1), range) ??
    walk_for_rule(tree.resolveInner(range.to, -1), range)
  );
}

// Returns a new EditorSelection with snapped ranges, or null if no range
// qualified (caller skips the selection field of the dispatch).
export function compute_marker_snap(state: EditorState): EditorSelection | null {
  const ranges = state.selection.ranges;
  const snapped: SelectionRange[] = [];
  let any_changed = false;
  for (const range of ranges) {
    const target = find_snap_target(state, range);
    if (!target) {
      snapped.push(range);
      continue;
    }
    any_changed = true;
    // Preserve the user's drag direction: a left-to-right drag (anchor < head)
    // snaps to anchor=from, head=to so subsequent shift+ArrowRight extends from
    // the right end. Right-to-left mirrors.
    snapped.push(
      range.anchor <= range.head
        ? EditorSelection.range(target.from, target.to)
        : EditorSelection.range(target.to, target.from),
    );
  }
  if (!any_changed) return null;
  return EditorSelection.create(snapped, state.selection.mainIndex);
}
