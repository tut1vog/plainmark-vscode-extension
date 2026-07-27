import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { visible_end_before } from './hidden_marker_runs.js';

// A hidden trailing run (a collapsed link's `](url)`, trailing `**`) is not
// hit-testable, so a click right of the line resolves to the last visible
// position and strands the caret mid-line; remap such plain clicks to the
// line end on release (NAV-N-9).

// Clicks at or left of the last glyph's right edge keep the default mapping —
// only clearly-past-the-text clicks remap.
const PAST_TEXT_EPS = 1;

interface HiddenTailPress {
  readonly view: EditorView;
  readonly pos: number;
  readonly target: number;
}

// Correct only for one press in flight at a time; a second concurrent realm would share this (same caveat as links.ts).
let press: HiddenTailPress | null = null;

export function capture_hidden_tail_press(view: EditorView, event: MouseEvent): void {
  press = null;
  if (event.detail !== 1) return;
  if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos === null) return;
  const line = view.state.doc.lineAt(pos);
  if (pos >= line.to) return;
  if (visible_end_before(view, line.to) !== pos) return;
  const before = view.coordsAtPos(pos, -1);
  if (!before || event.clientX <= before.right + PAST_TEXT_EPS) return;
  press = { view, pos, target: line.to };
}

// Returns the remap target only when the press's plain click actually landed a
// single empty caret at the captured position; a drag, multi-cursor, or
// cross-view release returns null. Consumes the capture either way.
export function take_hidden_tail_remap(
  view: EditorView,
  state: EditorState,
): number | null {
  const p = press;
  press = null;
  if (!p || p.view !== view) return null;
  const { main, ranges } = state.selection;
  if (ranges.length !== 1 || !main.empty || main.head !== p.pos) return null;
  return p.target;
}
