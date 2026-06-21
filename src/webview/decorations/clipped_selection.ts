import { type Text } from '@codemirror/state';
import { Direction, EditorView, RectangleMarker, layer } from '@codemirror/view';

// Class on the wrapper element of our custom selection layer.
const LAYER_CLASS = 'cm-clippedSelectionLayer';
// Class on each rectangle; the translucent background + z-index treatment in
// editor_extensions.ts binds to it (and the stock `.cm-selectionBackground` is
// suppressed there so the two layers don't double-draw).
const CLIPPED_SELECTION_CLASS = 'cm-clippedSelectionBackground';

// A blank selected line (empty OR whitespace-only) draws a uniform thin stub
// instead of its measured width — without this, lines differing only in trailing
// whitespace get visibly different selection widths (Obsidian draws one constant
// thin stub on every blank line). Width is a fraction of a character so the stub
// reads as thinner than any text-bearing line.
const STUB_WIDTH_RATIO = 0.5;

// Split a selection range into per-logical-line sub-ranges so each can be fed to
// `RectangleMarker.forRange`, which clips a SINGLE-line range to actual text
// coords (stock `drawSelection` only extends to full content width for the
// multi-line "between" rows). An empty sub-range on an interior blank line is
// kept (the caller renders a uniform stub for it); an empty sub-range at the
// start of the final line (selection ending on a line break) is dropped, since
// browsers paint nothing there.
export function split_selection_range_by_line(
  doc: Text,
  from: number,
  to: number,
): Array<{ from: number; to: number }> {
  const segments: Array<{ from: number; to: number }> = [];
  if (from >= to) return segments;
  let pos = from;
  while (pos <= to) {
    const line = doc.lineAt(pos);
    const seg_from = Math.max(from, line.from);
    const seg_to = Math.min(to, line.to);
    const is_last = line.to >= to;
    if (is_last && seg_from === seg_to && to === line.from) break;
    segments.push({ from: seg_from, to: seg_to });
    if (line.to >= to) break;
    pos = line.to + 1;
  }
  return segments;
}

// Client-space origin of the layer (mirrors `@codemirror/view`'s private
// `getBase`). Returned in the SAME getBoundingClientRect coordinate space as
// `view.coordsAtPos`, so every rectangle we derive from coords stays consistent
// with the glyphs at any device-pixel ratio. The earlier `RectangleMarker.forRange`
// path mixed scaled `getBoundingClientRect` values with unscaled `getComputedStyle`
// padding inside CM6's `rectanglesForRange`, which misplaced the row edges at
// fractional DPR.
function layer_base(view: EditorView): { left: number; top: number } {
  const rect = view.scrollDOM.getBoundingClientRect();
  const left =
    view.textDirection === Direction.LTR
      ? rect.left
      : rect.right - view.scrollDOM.clientWidth * view.scaleX;
  return {
    left: left - view.scrollDOM.scrollLeft * view.scaleX,
    top: rect.top - view.scrollDOM.scrollTop * view.scaleY,
  };
}

// Minimum caret-rect height that can seed a visual row. font-size:0 spans (the
// hidden task-list "- " marker) report zero-height rects collapsed onto the
// baseline; anchoring row geometry to one fabricates a bogus row.
const MIN_ROW_SEED_HEIGHT = 1;

interface VerticalBand {
  top: number;
  bottom: number;
}

// Same visual row ⇔ the caret rects' vertical bands overlap (strict, so
// touching wrapped rows stay separate). Top-equality-within-epsilon is NOT
// equivalent: one row legitimately mixes box heights/tops — task-checkbox
// replace widget, font-size:0 marker span, text — and splitting on top
// differences paints spurious full-width "wrapped row" rectangles.
function same_visual_row(a: VerticalBand, b: VerticalBand): boolean {
  return a.top < b.bottom && a.bottom > b.top;
}

// A box in the selection layer's client-coordinate space (same space as the
// RectangleMarker geometry, i.e. getBoundingClientRect minus `layer_base`).
interface LayerRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// Per-visual-row client rects of inline replace-widgets whose rendered box wraps
// across rows. Only MathJax inline math does this today: it inserts `mjx-break`
// boxes at relations/operators that break the formula even under the container's
// `white-space: nowrap`. The atomic `[from, to]` range such a widget replaces
// offers no document position at the wrapped row's left edge, so the
// position-based row walk seeds that row AFTER the widget and leaves the
// continuation uncovered. Returned in layer space for `engulf_widget_row` to
// union into the row rectangles. Block widgets are excluded (a selected block
// renders as an in-flow preview, never a replaced widget) via the inline display
// check; single-row widgets (images, checkboxes) need no help and are skipped.
function wrapped_inline_widget_rects(
  view: EditorView,
  base: { left: number; top: number },
): LayerRect[] {
  const out: LayerRect[] = [];
  for (const el of Array.from(view.contentDOM.querySelectorAll('[contenteditable="false"]'))) {
    const rects = el.getClientRects();
    if (rects.length < 2) continue;
    if (!getComputedStyle(el).display.startsWith('inline')) continue;
    for (const r of Array.from(rects)) {
      out.push({
        left: r.left - base.left,
        right: r.right - base.left,
        top: r.top - base.top,
        bottom: r.bottom - base.top,
      });
    }
  }
  return out;
}

// Horizontal slack for treating a widget box as abutting a row rectangle.
const WIDGET_TOUCH_EPS = 1;

// Extend a selection row rectangle to engulf any wrapped-widget box on its
// visual row. A rendered inline widget overlapped by a selection is always
// STRICTLY covered by it (any partial overlap reveals the raw source instead, so
// the widget isn't rendered) — hence a widget box that abuts the row rect is
// fully selected, and a union closes the gap without a second, overlapping
// rectangle that the translucent layer would double-paint into a darker patch.
function engulf_widget_row(
  row: LayerRect,
  widgets: LayerRect[],
): { left: number; width: number } {
  let { left, right } = row;
  for (const w of widgets) {
    const band_overlap = w.top < row.bottom && w.bottom > row.top;
    const horiz_touch = w.left <= right + WIDGET_TOUCH_EPS && w.right >= left - WIDGET_TOUCH_EPS;
    if (band_overlap && horiz_touch) {
      left = Math.min(left, w.left);
      right = Math.max(right, w.right);
    }
  }
  return { left, width: Math.max(0, right - left) };
}

// Largest position in [from, to] whose end-side coords share `seed`'s visual
// row. Within one logical line, row membership is monotone with position
// (LTR): positions on the seed's row overlap its band, later wrapped rows sit
// fully below it — so a binary search finds the soft-wrap boundary in
// O(log n) coordsAtPos calls instead of scanning every character.
function visual_row_end(
  view: EditorView,
  from: number,
  to: number,
  seed: VerticalBand,
): number {
  const end = view.coordsAtPos(to, -1);
  if (end && same_visual_row(end, seed)) return to;
  let lo = from;
  let hi = to;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const c = view.coordsAtPos(mid, -1);
    if (c && same_visual_row(c, seed)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export const clipped_selection_layer = layer({
  above: false,
  class: LAYER_CLASS,
  update(update) {
    return update.docChanged || update.selectionSet || update.viewportChanged || update.geometryChanged;
  },
  markers(view: EditorView) {
    const markers: RectangleMarker[] = [];
    const stub_width = Math.max(2, view.defaultCharacterWidth * STUB_WIDTH_RATIO);
    const base = layer_base(view);
    // Content-column right edge in the same client space — the full-width bound
    // for interior wrapped rows. Read from getBoundingClientRect (not parseInt of
    // a computed padding) so it scales with the glyph coords at any DPR.
    const content_right = view.contentDOM.getBoundingClientRect().right;
    // Boxes of inline widgets that wrap across visual rows (inline math); each
    // emitted row rectangle is extended to engulf the one sharing its row, so the
    // widget's wrapped continuation — which has no addressable left-edge position
    // — is covered instead of left as a white gap.
    const widget_rects = wrapped_inline_widget_rects(view, base);
    // Snap the viewport bounds out to whole lines so a line scrolled partly off
    // the top still starts its rectangle at its own content-left, not mid-line.
    const vp_from = view.state.doc.lineAt(view.viewport.from).from;
    const vp_to = view.state.doc.lineAt(view.viewport.to).to;
    for (const r of view.state.selection.ranges) {
      if (r.empty) continue;
      const from = Math.max(r.from, vp_from);
      const to = Math.min(r.to, vp_to);
      if (from >= to) continue;
      for (const seg of split_selection_range_by_line(view.state.doc, from, to)) {
        const line = view.state.doc.lineAt(seg.from);
        if (line.text.trim() === '') {
          // Blank line — uniform thin stub at the line's content-left, fixed
          // width so trailing-whitespace differences don't change it.
          const at = view.coordsAtPos(line.from, 1);
          if (!at) continue;
          markers.push(
            new RectangleMarker(
              CLIPPED_SELECTION_CLASS,
              at.left - base.left,
              at.top - base.top,
              stub_width,
              at.bottom - at.top,
            ),
          );
          continue;
        }
        // Subdivide the logical-line segment into its visual (wrapped) rows.
        // Interior rows extend to the content-column right edge; the segment's
        // final row clips to its text/selection end. Each row's left edge is the
        // measured glyph coord at the row start, so it tracks the line's own
        // content-left (hanging indents for lists/blockquotes included).
        let pos = seg.from;
        while (pos <= seg.to) {
          let start = view.coordsAtPos(pos, 1);
          // A degenerate rect cannot seed a row — skip to the first real box.
          while (start && start.bottom - start.top < MIN_ROW_SEED_HEIGHT && pos < seg.to) {
            pos += 1;
            start = view.coordsAtPos(pos, 1);
          }
          if (!start || start.bottom - start.top < MIN_ROW_SEED_HEIGHT) break;
          const row_end = visual_row_end(view, pos, seg.to, start);
          const end = view.coordsAtPos(row_end, -1) ?? start;
          // Union of the row's start/end boxes so a mixed-height row (checkbox
          // seed + taller text) is covered at full height. Guarded to the seed's
          // row: at a single-position row, the end-side rect can land on the
          // previous wrapped row and must not stretch the union across rows.
          const on_seed_row = same_visual_row(end, start);
          const top = on_seed_row ? Math.min(start.top, end.top) : start.top;
          const bottom = on_seed_row ? Math.max(start.bottom, end.bottom) : start.bottom;
          const is_final = row_end >= seg.to;
          const right = is_final ? (on_seed_row ? end.right : start.right) : content_right;
          const row_layer: LayerRect = {
            left: start.left - base.left,
            right: right - base.left,
            top: top - base.top,
            bottom: bottom - base.top,
          };
          const { left: adj_left, width } = engulf_widget_row(row_layer, widget_rects);
          if (width > 0) {
            markers.push(
              new RectangleMarker(
                CLIPPED_SELECTION_CLASS,
                adj_left,
                row_layer.top,
                width,
                bottom - top,
              ),
            );
          }
          if (is_final) break;
          pos = row_end > pos ? row_end : pos + 1;
        }
      }
    }
    return markers;
  },
});
