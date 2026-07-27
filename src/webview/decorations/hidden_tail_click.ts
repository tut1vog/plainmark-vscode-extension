import type { EditorSelection, EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { visible_end_before } from './hidden_marker_runs.js';

// A hidden trailing run (a collapsed link's `](url)`, trailing `**`) is not
// hit-testable, so a click right of the line resolves to the last visible
// position and strands the caret mid-line; remap such plain clicks to the
// line end on release (NAV-N-9). Presses landing right of the content column
// (on the scroller, outside contentDOM) never reach CM6 — there the browser's
// native placement moves the caret, or nothing does — so the release check
// accepts the natively-placed caret and the untouched pre-press selection
// alike.
// Clicks at or left of the last glyph's right edge keep the default mapping —
// only clearly-past-the-text clicks remap.
const PAST_TEXT_EPS = 1;

interface HiddenTailPress {
  readonly view: EditorView;
  readonly visible_end: number;
  readonly target: number;
  readonly press_selection: EditorSelection;
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
  const visible_end = visible_end_before(view, line.to);
  if (visible_end >= line.to) return;
  // Content-area hit-testing resolves to the visible end; a press outside the
  // content column resolves to the line end instead. Anything else is a click
  // on the text itself — keep the default mapping.
  if (pos !== visible_end && pos !== line.to) return;
  const before = view.coordsAtPos(visible_end, -1);
  if (!before || event.clientX <= before.right + PAST_TEXT_EPS) return;
  press = {
    view,
    visible_end,
    target: line.to,
    press_selection: view.state.selection,
  };
}

// Returns the remap target only when the press's plain click left a single
// empty caret at the visible end (CM6 or native placement) or left the
// pre-press selection untouched (press outside the content column that the
// browser ignored); a drag, multi-cursor, or cross-view release returns null.
// Consumes the capture either way.
export function take_hidden_tail_remap(
  view: EditorView,
  state: EditorState,
): number | null {
  const p = press;
  press = null;
  if (!p || p.view !== view) return null;
  const { main, ranges } = state.selection;
  if (ranges.length === 1 && main.empty && main.head === p.visible_end) return p.target;
  if (state.selection.eq(p.press_selection)) return p.target;
  return null;
}
