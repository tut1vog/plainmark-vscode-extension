import { EditorSelection } from '@codemirror/state';
import type { EditorView, KeyBinding } from '@codemirror/view';

// NAV-N-8: stock cursorLineUp/Down collapse a non-empty selection without
// moving, costing a second press; collapse and take the vertical step together.
function collapse_and_move(view: EditorView, forward: boolean): boolean {
  const { state } = view;
  if (state.selection.ranges.every((range) => range.empty)) return false;
  const selection = EditorSelection.create(
    state.selection.ranges.map((range) => {
      const cursor = range.empty
        ? range
        : EditorSelection.cursor(forward ? range.to : range.from);
      const moved = view.moveVertically(cursor, forward);
      // Mirror cursorLineDown's first/last-line fallback to the line boundary.
      return moved.head === cursor.head ? view.moveToLineBoundary(cursor, forward) : moved;
    }),
    state.selection.mainIndex,
  );
  view.dispatch({ selection, scrollIntoView: true, userEvent: 'select' });
  return true;
}

export const vertical_arrow_collapse_keymap: KeyBinding[] = [
  { key: 'ArrowUp', run: (view) => collapse_and_move(view, false) },
  { key: 'ArrowDown', run: (view) => collapse_and_move(view, true) },
];
