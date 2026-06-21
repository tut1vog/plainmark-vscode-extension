import type { EditorState } from '@codemirror/state';
import { frozen_reveal_selection_field, pointer_down_field } from './pointer_state.js';

// Typora-style reveal predicate. Markers reveal for any selection
// touching the construct EXCEPT a non-empty selection that strictly extends
// past on both sides (a triple-click-like "covering" selection leaves the
// rendered form intact). Empty caret reveals when inside/touching the node.
//
// Pointer-down freeze (MRS-P-1/P-2): while a mouse button is held, the predicate
// runs against the pre-press selection (`frozen_reveal_selection_field`, captured
// at mousedown) rather than the live one — so a press neither hides an
// already-shown marker nor reveals a hidden one, and the live selection takes
// over only on release. A clear-on-press (returning false while down) instead
// hid revealed markers the instant the user clicked, before mouseup. Mirrors
// quote_reveal.ts / math.ts. Keyboard selections (no press → frozen is null)
// reveal immediately per the normal predicate.
//
// The table cell subview is created mid-press (rAF-deferred from the activating
// mousedown), so it seeds `pointer_down` without a frozen pre-press selection.
// A cell whose whole content IS the construct has no off-construct caret to
// freeze to, so pressed-with-no-frozen falls back to hard suppression — reveal
// lands on release, when the latch clears.
export function should_reveal_for_selection(
  state: EditorState,
  node_from: number,
  node_to: number,
): boolean {
  const frozen = state.field(frozen_reveal_selection_field, false);
  if (!frozen && (state.field(pointer_down_field, false) ?? false)) return false;
  const selection = frozen ?? state.selection;
  return selection.ranges.some((r) => {
    if (r.empty) {
      return node_from <= r.from && r.from <= node_to;
    }
    const overlaps = r.from <= node_to && r.to >= node_from;
    if (!overlaps) return false;
    const strict_covers = r.from < node_from && r.to > node_to;
    return !strict_covers;
  });
}
