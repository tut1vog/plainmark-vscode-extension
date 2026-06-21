import type { EditorState } from '@codemirror/state';
import { frozen_reveal_selection_field } from './pointer_state.js';

// Per-line reveal (Obsidian Live Preview model): the `>` marker on the
// caret's line is shown as editable text; markers on every other line stay
// hidden. The marker reserves its width either way (paint-only hide), so reveal
// never reflows and there is no flicker to suppress. While a pointer button is
// held the reveal FREEZES to the pre-press selection (Obsidian behavior): a
// press neither hides an already-shown `>` nor reveals a hidden one, and the
// live selection takes over only on release. Lives in its own module (not
// blockquote.ts) so the blockquote↔callout import cycle doesn't pull
// `pointer_state` into a cycle node — both constructs import it from here.
export function line_revealed(
  state: EditorState,
  line_from: number,
  line_to: number,
): boolean {
  const frozen = state.field(frozen_reveal_selection_field, false);
  const selection = frozen ?? state.selection;
  return selection.ranges.some((r) => r.from <= line_to && r.to >= line_from);
}
