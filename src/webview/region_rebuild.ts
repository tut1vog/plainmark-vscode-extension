import { syntaxTree } from '@codemirror/language';
import type { ChangeDesc, EditorSelection, EditorState } from '@codemirror/state';
import { frozen_reveal_selection_field } from './decorations/pointer_state.js';
import type { OffsetRange } from './ranges.js';

// Shared region math for incremental block-widget StateFields: instead of a
// doc-wide rebuild per transaction, a field maps its RangeSet through the
// changes and rebuilds only the regions these helpers return. A region is
// always expanded to whole top-level constructs and whole lines, which makes
// drop-and-re-add symmetric: every decoration RangeSet.update filters out of a
// window belongs to a construct a bounded tree iterate over that window
// re-visits (both are touching-inclusive).

function top_level_span(state: EditorState, pos: number): OffsetRange | null {
  const tree = syntaxTree(state);
  const clamped = Math.max(0, Math.min(pos, tree.length));
  let from = -1;
  let to = -1;
  for (const side of [-1, 1] as const) {
    let node = tree.resolve(clamped, side);
    while (node.parent && node.parent.parent) node = node.parent;
    if (!node.parent) continue;
    from = from < 0 ? node.from : Math.min(from, node.from);
    to = to < 0 ? node.to : Math.max(to, node.to);
  }
  return from < 0 ? null : { from, to };
}

function line_snap(state: EditorState, from: number, to: number): OffsetRange {
  const len = state.doc.length;
  return {
    from: state.doc.lineAt(Math.max(0, Math.min(from, len))).from,
    to: state.doc.lineAt(Math.max(0, Math.min(to, len))).to,
  };
}

// [from, to] widened to cover every top-level construct its endpoints touch
// (both resolve sides, so a construct ending exactly at `from` or starting
// exactly at `to` counts), snapped to whole lines — block-widget decoration
// spans extend past their node to line margins.
export function expand_region(state: EditorState, from: number, to: number): OffsetRange {
  const a = top_level_span(state, from);
  const b = top_level_span(state, to);
  return line_snap(
    state,
    Math.min(from, a?.from ?? from),
    Math.max(to, b?.to ?? to),
  );
}

export interface RegionPair {
  old_region: OffsetRange;
  new_region: OffsetRange;
}

// Per changed range: the enclosing top-level constructs in the old AND new
// trees, cross-mapped into both coordinate spaces. The old tree catches a
// construct the edit destroyed (its stale decorations span it); the new tree
// catches one the edit created or re-interpreted (an unclosed fence swallowing
// the rest of the document resolves to one huge node here, which is the true
// affected span).
export function doc_change_regions(
  start_state: EditorState,
  state: EditorState,
  changes: ChangeDesc,
): RegionPair[] {
  const pairs: RegionPair[] = [];
  const inverted = changes.invertedDesc;
  changes.iterChangedRanges((from_a, to_a, from_b, to_b) => {
    let old_r = expand_region(start_state, from_a, to_a);
    let new_r = expand_region(state, from_b, to_b);
    new_r = expand_region(
      state,
      Math.min(new_r.from, changes.mapPos(old_r.from, -1)),
      Math.max(new_r.to, changes.mapPos(old_r.to, 1)),
    );
    old_r = expand_region(
      start_state,
      Math.min(old_r.from, inverted.mapPos(new_r.from, -1)),
      Math.max(old_r.to, inverted.mapPos(new_r.to, 1)),
    );
    pairs.push({ old_region: old_r, new_region: new_r });
  });
  return pairs;
}

// Regions (new coords) where reveal gating can have flipped: for each range of
// the effective (frozen ?? live) selection, old vs new. All ranges, not just
// main: should_reveal_for_selection consults every range.
//
// Anchor-stable case (a drag or shift-select extending range i in place): only
// constructs swept by the head can change reveal state — the anchor edge keeps
// touching the same construct, and a construct strictly inside both selections
// stays covered — so the region is the head sweep, not the selection span.
// Anything else (caret moves, added/removed ranges) falls back to both ranges'
// full spans.
export function reveal_regions(
  start_state: EditorState,
  state: EditorState,
  changes: ChangeDesc | null,
): OffsetRange[] {
  const effective = (s: EditorState): EditorSelection =>
    s.field(frozen_reveal_selection_field, false) ?? s.selection;
  const old_ranges = effective(start_state).ranges;
  const new_ranges = effective(state).ranges;
  const out: OffsetRange[] = [];
  const map = (pos: number): number => (changes ? changes.mapPos(pos, 1) : pos);
  if (old_ranges.length === new_ranges.length) {
    for (let i = 0; i < new_ranges.length; i++) {
      const o = old_ranges[i];
      const n = new_ranges[i];
      const o_anchor = map(o.anchor);
      const o_head = map(o.head);
      if (o_anchor === n.anchor) {
        if (o_head !== n.head) {
          out.push(
            expand_region(state, Math.min(o_head, n.head), Math.max(o_head, n.head)),
          );
        }
        continue;
      }
      out.push(expand_region(state, map(o.from), map(o.to)));
      out.push(expand_region(state, n.from, n.to));
    }
    return out;
  }
  for (const r of old_ranges) out.push(expand_region(state, map(r.from), map(r.to)));
  for (const r of new_ranges) out.push(expand_region(state, r.from, r.to));
  return out;
}

// Newly parse-covered span (new coords) when the background parse extended
// the tree; null when it did not grow.
export function frontier_growth(
  start_state: EditorState,
  state: EditorState,
  changes: ChangeDesc | null,
): OffsetRange | null {
  const old_tree = syntaxTree(start_state);
  const new_tree = syntaxTree(state);
  if (old_tree === new_tree) return null;
  const old_len = changes ? changes.mapPos(old_tree.length, 1) : old_tree.length;
  if (new_tree.length <= old_len) return null;
  return expand_region(state, old_len, new_tree.length);
}

// A tree change region math cannot bound: a reparse that neither came with a
// doc change nor extended the frontier (e.g. a skipped-gap fill). Callers
// fall back to a full rebuild — the pre-incremental behavior.
export function tree_rebuilt_unbounded(
  start_state: EditorState,
  state: EditorState,
  doc_changed: boolean,
): boolean {
  if (doc_changed) return false;
  const old_tree = syntaxTree(start_state);
  const new_tree = syntaxTree(state);
  return old_tree !== new_tree && new_tree.length <= old_tree.length;
}

// Sort + coalesce overlapping/touching regions. Regions are endpoint-expanded
// to construct bounds, so two regions overlapping the same construct always
// overlap each other — after merging, no construct spans two regions and a
// per-region drop-and-re-add cannot duplicate decorations.
export function merge_regions(regions: OffsetRange[]): OffsetRange[] {
  if (regions.length <= 1) return regions;
  const sorted = [...regions].sort((a, b) => a.from - b.from);
  const merged: OffsetRange[] = [{ from: sorted[0].from, to: sorted[0].to }];
  for (const r of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (r.from <= last.to) {
      if (r.to > last.to) last.to = r.to;
    } else {
      merged.push({ from: r.from, to: r.to });
    }
  }
  return merged;
}
