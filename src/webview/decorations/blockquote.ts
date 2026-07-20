import { syntaxTree } from '@codemirror/language';
import {
  type ChangeSet,
  type EditorState,
  type Range,
  StateEffect,
  StateField,
} from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import type { SyntaxNodeRef } from '@lezer/common';
import { build_callout_decorations } from './callout.js';
import { detect_callout } from './callout_detect.js';
import { make_inline_decorations_plugin, type NodeHandler } from './inline_decorations.js';
import { line_revealed } from './quote_reveal.js';

const MAX_DEPTH = 6;

// BQ-R-12: the measured advance of a single `>` glyph and a single space (px),
// published by the probe ViewPlugin and read by the line-decoration builder (and
// by callout.ts). A line's hanging indent is its prefix advance,
// `gtCount·gt + wsCount·space`, where the counts come from a lexical scan of that
// line's own leading `>`/whitespace run (quote_prefix_counts). Measuring `>` and a
// space SEPARATELY (not the combined `> ` width) is what makes a tight `>text`
// first line not corrupt the metric for every other line. Written as a PER-LINE
// inline `element.style` (Obsidian's mechanism), it lands wrapped rows under the
// first VISIBLE glyph — matching Obsidian / the native preview (BQ-R-12 example).
export interface MarkerMetrics {
  gt: number;
  space: number;
}
const set_marker_metrics = StateEffect.define<MarkerMetrics>();
export const marker_metrics_field = StateField.define<MarkerMetrics>({
  create: () => ({ gt: 0, space: 0 }),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(set_marker_metrics)) return effect.value;
    }
    return value;
  },
});

// The leading `>`/whitespace run of a line, as a count of `>` glyphs and a count
// of whitespace chars — the literal prefix before the first visible content
// glyph. Lexical (not parse-based) so it captures tight markers (`>x`), spaced
// markers (`> x`), nesting (`> > x`), and intentional leading content spaces
// (`>   x`) uniformly: the prefix renders as exactly these glyphs, so its advance
// is gtCount·(`>` advance) + wsCount·(space advance). (Tabs count as one space
// advance each — rare in this position.)
export function quote_prefix_counts(line_text: string): { gt: number; ws: number } {
  let gt = 0;
  let ws = 0;
  for (const ch of line_text) {
    if (ch === '>') gt++;
    else if (ch === ' ' || ch === '\t') ws++;
    else break;
  }
  return { gt, ws };
}

const depth_line_decorations = new Map<number, Decoration>();
for (let d = 1; d <= MAX_DEPTH; d++) {
  depth_line_decorations.set(
    d,
    Decoration.line({
      class: 'plainmark-blockquote plainmark-collapse-adjacent',
      attributes: { 'data-blockquote-depth': d.toString() },
    }),
  );
}

// Per-line hanging-indent px: the line's literal `>`/whitespace prefix advance,
// so wrapped rows hang under the first visible glyph.
export function hanging_indent_px(gt_count: number, ws_count: number, metrics: MarkerMetrics): number {
  return Math.round((gt_count * metrics.gt + ws_count * metrics.space) * 100) / 100;
}

// The lexical quote prefix alone: every `>` (with interleaved indent) plus the
// one trailing space that belongs to the last marker. Unlike
// quote_prefix_counts' full run this EXCLUDES list-nesting spaces after the
// prefix — on a list line those are hidden (lists.ts), so they must not be
// counted into the line's indent.
const quote_only_prefix_re = /^(?:[ \t]*>)+[ \t]?/;

// Nesting units a quoted LIST line adds to its hanging indent: the
// ListItem-ancestor count of the ListMark that opens the line's content
// (depth + 1 — one unit for the marker slot itself, one per nesting level), or
// 0 when the line's first content glyph is not a ListMark. The list's own
// depth padding cannot convey this (the quote's inline indent overrides it),
// and the nesting spaces are hidden, so the quote indent carries the units:
// wrapped rows then hang at the item's text column, mirroring an unquoted
// list. The matching FIRST-row step is in-flow marker margin (lists_theme).
function quoted_list_indent_units(state: EditorState, line_from: number, line_text: string): number {
  const m = quote_only_prefix_re.exec(line_text);
  if (!m) return 0;
  let i = m[0].length;
  while (i < line_text.length && (line_text[i] === ' ' || line_text[i] === '\t')) i++;
  if (i >= line_text.length) return 0;
  const node = syntaxTree(state).resolveInner(line_from + i, 1);
  if (node.name !== 'ListMark') return 0;
  let units = 0;
  for (let p = node.parent; p; p = p.parent) {
    if (p.name === 'ListItem') units++;
  }
  return units;
}

// Hanging indent as inline style on the line: `padding-left` pushes content to the
// indent column; the equal negative `text-indent` cancels it for the first row
// (BQ-R-12 net-to-zero origin) so the in-flow transparent `> ` markers + any
// leading content spaces sit before content and the first row's visible glyph
// lands at the SAME column as wrapped continuation rows (which hang at
// padding-left). The net-to-zero pair also pins the per-marker bars: a line
// whose padding and indent did not cancel would paint its bar off-column. On
// a list line the indent adds `units` list-indent steps on top of the prefix
// px (see quoted_list_indent_units). Cached per (depth, px, units).
const indent_line_cache = new Map<string, Decoration>();
function indent_line_decoration(depth: number, px: number, units: number): Decoration {
  const key = `${depth}:${px}:${units}`;
  let deco = indent_line_cache.get(key);
  if (!deco) {
    const expr =
      units > 0
        ? `calc(${px}px + ${units} * var(--plainmark-list-indent, 1em))`
        : `${px}px`;
    const style =
      units > 0
        ? `padding-left:${expr};text-indent:calc(-1 * ${expr})`
        : `padding-left:${px}px;text-indent:-${px}px`;
    deco = Decoration.line({
      class: 'plainmark-blockquote plainmark-collapse-adjacent',
      attributes: {
        'data-blockquote-depth': depth.toString(),
        style,
      },
    });
    indent_line_cache.set(key, deco);
  }
  return deco;
}

// A mark, not a replace — a line-leading replace widget flickers drawSelection (see headings.ts). Paint-only hide via `.plainmark-quote-marker` keeps the slot's width.
export const hide_marker = Decoration.mark({ class: 'plainmark-quote-marker' });

// Revealed (caret-on-line) blockquote marker: shown as ordinary editable text at
// its NATURAL `> ` width (no fixed-width slot, no CSS rule). The pinned hidden
// slot is one indent wide but the `>` glyph is narrower; pinning the revealed
// marker to that same width too leaves dead space between the glyph and the
// content, and the caret at the marker→content boundary then paints at the glyph
// edge or the content edge depending on arrival direction — one offset, two x.
// Natural width removes the dead space, so the caret is unambiguous. The cost is
// the Obsidian-model reflow: content slides left by depth·(indent − natural) when
// the caret enters a quote line and back when it leaves (BQ-R-11).
const reveal_marker = Decoration.mark({ class: 'plainmark-quote-marker-revealed' });

function depth_at_line(state: EditorState, line_from: number, line_to: number): number {
  let depth = 0;
  syntaxTree(state).iterate({
    from: line_from,
    to: line_to,
    enter(node) {
      if (node.name === 'QuoteMark') {
        depth++;
        return false;
      }
      return undefined;
    },
  });
  if (depth === 0) {
    const cursor = syntaxTree(state).cursorAt(line_from);
    do {
      if (cursor.name === 'Blockquote') depth++;
    } while (cursor.parent());
  }
  return depth;
}

const blockquote_handler: NodeHandler = {
  nodeNames: ['Blockquote'],
  handle(node: SyntaxNodeRef, state: EditorState): Range<Decoration>[] {
    // outer iterate covers all descendant QuoteMarks; skip inner Blockquote to avoid duplicates
    if (node.node.parent?.name === 'Blockquote') return [];

    const callout_info = detect_callout(state, node.node);
    if (callout_info) return build_callout_decorations(state, node, callout_info);

    const decorations: Range<Decoration>[] = [];

    const metrics = state.field(marker_metrics_field, false) ?? { gt: 0, space: 0 };
    const start_line = state.doc.lineAt(node.from).number;
    const end_line = state.doc.lineAt(node.to).number;
    for (let i = start_line; i <= end_line; i++) {
      const line = state.doc.line(i);
      // Depth (for the bars / data attribute) is parse-based; the indent magnitude
      // is the line's own literal prefix advance (quote_prefix_counts).
      const raw_depth = depth_at_line(state, line.from, line.to);
      const clamped = Math.min(Math.max(raw_depth, 1), MAX_DEPTH);
      const units = quoted_list_indent_units(state, line.from, line.text);
      // List line: count only the quote prefix (nesting spaces are hidden);
      // otherwise the full literal run, including intentional content spaces.
      const counts = quote_prefix_counts(
        units > 0 ? (quote_only_prefix_re.exec(line.text)?.[0] ?? line.text) : line.text,
      );
      // Inline measured indent once the probe has run; the class-only decoration
      // (theme em fallback) covers the first frame before measurement.
      const deco =
        metrics.gt > 0
          ? indent_line_decoration(clamped, hanging_indent_px(counts.gt, counts.ws, metrics), units)
          : depth_line_decorations.get(clamped);
      if (deco) decorations.push(deco.range(line.from));
    }

    syntaxTree(state).iterate({
      from: node.from,
      to: node.to,
      enter(child) {
        if (child.name === 'QuoteMark') {
          const line = state.doc.lineAt(child.from);
          const after = child.to;
          const has_trailing_space =
            after < state.doc.length && state.doc.sliceString(after, after + 1) === ' ';
          const hide_to = has_trailing_space ? after + 1 : after;
          // Per-line reveal: the active line shows the `>` as editable text, but
          // still in the indent-pinned slot so the content keeps its column.
          const revealed = line_revealed(state, line.from, line.to);
          decorations.push((revealed ? reveal_marker : hide_marker).range(child.from, hide_to));
        }
      },
    });

    return decorations;
  },
};

export const blockquote_handlers: readonly NodeHandler[] = [blockquote_handler];

function build_blockquote_theme(): Record<string, Record<string, string>> {
  // These em values are the PRE-MEASURE fallback only: the authoritative hanging
  // indent is the per-line inline `padding-left`/`text-indent` (measured marker
  // width, see indent_line_decoration), which outranks this theme rule. This rule
  // just gives the first frame (before the probe runs) a reasonable indent.
  const indent = 'var(--plainmark-blockquote-indent-per-depth, 1em)';
  const bar_color =
    'var(--plainmark-blockquote-border-color, color-mix(in srgb, var(--vscode-foreground) 30%, transparent))';
  const bar_width = 'var(--plainmark-blockquote-border-width, 4px)';
  const padding_y = 'var(--plainmark-blockquote-padding-y, 0.25em)';
  const text_gap = 'var(--plainmark-blockquote-text-gap, 0.5em)';

  const rules: Record<string, Record<string, string>> = {
    '.plainmark-blockquote': {
      color:
        'var(--plainmark-blockquote-color, color-mix(in srgb, var(--vscode-foreground, currentColor) 70%, transparent))',
      'background-color':
        'var(--plainmark-blockquote-background, color-mix(in srgb, var(--vscode-foreground) 5%, transparent))',
      'font-style': 'var(--plainmark-blockquote-style, normal)' as 'normal',
      // Containing block for the per-marker bars: anchoring them to the LINE (not
      // the inline marker, whose box is one visual row) lets each bar span the
      // line's full wrapped height, so the bar stays continuous when a paragraph
      // wraps (BQ-R-5). Per-marker x is preserved via the bar's static position.
      position: 'relative',
    },
    // Marker hide for the off-caret-line `>` (Obsidian's mechanism): paint the
    // glyph transparent rather than collapsing or `visibility:hidden`-ing it. The
    // glyph keeps its full natural inline box in BOTH states (hidden=transparent,
    // revealed=normal), so revealing on caret-enter reflows NOTHING and the glyph
    // fills its own box with no dead space — the caret is associativity-stable at
    // the marker→content boundary. `color:transparent` (not `visibility:hidden`)
    // keeps the text rects measurable so `coordsAtPos` stays correct.
    '.plainmark-quote-marker': {
      color: 'transparent',
    },
    // DIRECT-child text-indent reset: Chromium leaks the line's negative indent into inline-flex children, collapsing their gap (Firefox#1682380); a descendant `*` reset would also kill the block's first-line hang.
    '.plainmark-blockquote > *': {
      'text-indent': '0',
    },
    // Each `>` marker draws its own nesting bar (Obsidian's mechanism), instead
    // of the line painting bars at a fixed k·indent grid. The bar's containing
    // block is the LINE (`.plainmark-blockquote` is `position: relative`); the
    // marker itself stays unpositioned so its `::before` is laid out against the
    // line and can span the line's full wrapped height. Horizontal placement
    // comes from the bar's STATIC position (no `left`/`right`): the `::before`
    // would flow at its marker's left edge, so each depth's bar lands at that
    // marker's natural x — bars track the content step at every depth with a
    // constant gap, no fixed-em assumption, no runtime measurement. Scoped to
    // `.plainmark-blockquote` so callout accents (their own chrome) are untouched.
    '.plainmark-blockquote .plainmark-quote-marker::before, .plainmark-blockquote .plainmark-quote-marker-revealed::before':
      {
        content: '""',
        position: 'absolute',
        // Span the line's full box (padding included) and no further — Obsidian's
        // `app.css` does the same (`.cm-blockquote-border::before { top:0; bottom:0 }`).
        // Adjacent blockquote line boxes are flush (the collapse-adjacent rule zeroes
        // the inter-line padding), so the bars meet without overlapping; overshooting
        // past the box would poke past the background and double up the translucent
        // border colour into darker bands at every line boundary.
        top: '0',
        bottom: '0',
        'border-left': `${bar_width} solid ${bar_color}`,
        'pointer-events': 'none',
      },
  };

  for (let n = 1; n <= MAX_DEPTH; n++) {
    // Hanging indent nets content to body-x: text-indent cancels the full
    // padding-left so the first line of every depth starts at the editor's
    // content-left (where CM6 drawSelection derives its single leftSide from the
    // first visible .cm-line), keeping the selection highlight aligned with the
    // text. Wrapped continuation lines hang to the padded column. Depth is
    // conveyed by the per-marker bars (above), not by stepping the content right
    // (SHELL-X-9). Horizontal-only.
    const indent_expr = `${n - 1} * ${indent} + ${text_gap}`;
    rules[`.plainmark-blockquote[data-blockquote-depth="${n}"]:not(.plainmark-callout)`] = {
      'padding-left': `calc(${indent_expr})`,
      'text-indent': `calc(-1 * (${indent_expr}))`,
      'padding-top': padding_y,
      'padding-bottom': padding_y,
    };
  }

  return rules;
}

const blockquote_theme = EditorView.theme(build_blockquote_theme());

// True when this transaction inserted text containing a `>` byte — the keystroke
// (or paste) that can turn a line into a blockquote and add its padding-left.
export function changes_insert_quote_mark(changes: ChangeSet): boolean {
  let found = false;
  changes.iterChanges(
    (_from_a: number, _to_a: number, _from_b: number, _to_b: number, inserted) => {
      if (!found && inserted.length > 0 && inserted.toString().includes('>')) found = true;
    },
  );
  return found;
}

// True when the caret's line now begins with a `>` marker (leading whitespace
// allowed) — i.e. the caret sits on a freshly-formed quote line.
export function caret_on_quote_line(state: EditorState): boolean {
  const line = state.doc.lineAt(state.selection.main.head);
  return /^[ \t]*>/.test(line.text);
}

// When typing `>` turns the caret's line into a blockquote, the SAME
// transaction adds the line's `padding-left` chrome AND moves the caret onto it.
// CM6's drawSelection measures the caret in that update's rAF, but Chromium's
// webview sometimes commits the new padding a frame later, so the caret paints
// at the pre-padding x (left of the `>`) ~1-in-2 times. A no-op selection
// re-dispatch on the NEXT frame forces drawSelection to re-measure after the
// layout settles. Render-only (no doc change, no undo step). Gated to the
// plain→quote transition so ordinary typing inside a quote doesn't re-dispatch.
// Community-confirmed fallback for the Chromium-webview layout-commit race.
const blockquote_caret_remeasure = ViewPlugin.fromClass(
  class {
    update(update: ViewUpdate): void {
      if (!update.docChanged || !update.selectionSet) return;
      if (!changes_insert_quote_mark(update.changes)) return;
      if (!caret_on_quote_line(update.state)) return;
      const { view } = update;
      requestAnimationFrame(() => {
        if (!view.dom.isConnected) return;
        view.dispatch({ selection: view.state.selection });
      });
    }
  },
);

// BQ-R-12: the per-line indent is `gtCount·gt + wsCount·space`, so the probe needs
// just two font metrics — one `>` glyph's advance and one space's advance —
// measured from caret geometry (coordsAtPos). They are measured INDEPENDENTLY: the
// `>` from any QuoteMark, the space from the first ` ` at/after that marker on its
// line (its trailing space, or the first inter-word space). Measuring them apart is
// what stops a tight `>text` first line — whose marker has no trailing space — from
// poisoning the metric (which previously zeroed the space advance for every line).

// The first `>` marker in the viewport: `from`/`gt_to` bound the `>` glyph.
function first_quote_mark(view: EditorView): { from: number; gt_to: number } | null {
  const tree = syntaxTree(view.state);
  for (const { from: vf, to: vt } of view.visibleRanges) {
    let mark_from = -1;
    let mark_to = -1;
    tree.iterate({
      from: vf,
      to: vt,
      enter(node) {
        if (mark_from >= 0) return false;
        if (node.name === 'QuoteMark') {
          mark_from = node.from;
          mark_to = node.to;
          return false;
        }
        return undefined;
      },
    });
    if (mark_from >= 0) return { from: mark_from, gt_to: mark_to };
  }
  return null;
}

// Frames the probe keeps retrying a zero measurement before giving up — covers a
// slow first paint without busy-looping when the doc simply has no blockquote.
const MAX_MARKER_MEASURE_RETRIES = 10;

const blockquote_marker_width_probe = ViewPlugin.fromClass(
  class {
    private metrics: MarkerMetrics = { gt: 0, space: 0 };
    constructor(view: EditorView) {
      this.measure(view);
    }
    update(update: ViewUpdate): void {
      // Re-measure on font/zoom change (geometryChanged) and once a marker first
      // appears or scrolls in while still unmeasured.
      if (
        update.geometryChanged ||
        (this.metrics.gt === 0 && (update.docChanged || update.viewportChanged))
      ) {
        this.measure(update.view);
      }
    }
    private measure(view: EditorView, attempts = MAX_MARKER_MEASURE_RETRIES): void {
      view.requestMeasure({
        read: (): MarkerMetrics => {
          const qm = first_quote_mark(view);
          if (!qm) return { gt: 0, space: 0 };
          const x0 = view.coordsAtPos(qm.from);
          const x1 = view.coordsAtPos(qm.gt_to);
          if (!x0 || !x1) return { gt: 0, space: 0 };
          const line = view.state.doc.lineAt(qm.from);
          const space_idx = line.text.indexOf(' ', qm.gt_to - line.from);
          let space = 0;
          if (space_idx >= 0) {
            const sp = line.from + space_idx;
            const a = view.coordsAtPos(sp);
            const b = view.coordsAtPos(sp + 1);
            if (a && b) space = b.left - a.left;
          }
          return { gt: x1.left - x0.left, space };
        },
        write: (m: MarkerMetrics) => {
          if (m.gt <= 0) {
            // The marker has no rendered box yet (first-paint race) — retry next
            // frame so the indent lands on its own. Without this the line sticks
            // on the em fallback (a visibly mis-hung continuation row) until some
            // later geometry/doc change happens to re-trigger a measure.
            if (attempts > 0) {
              requestAnimationFrame(() => {
                if (view.dom.isConnected) this.measure(view, attempts - 1);
              });
            }
            return;
          }
          if (
            Math.abs(m.gt - this.metrics.gt) > 0.5 ||
            Math.abs(m.space - this.metrics.space) > 0.5
          ) {
            this.metrics = m;
            // Dispatch off the measure phase (no update-in-progress reentrancy).
            requestAnimationFrame(() => {
              if (view.dom.isConnected) {
                view.dispatch({ effects: set_marker_metrics.of(m) });
              }
            });
          }
        },
      });
    }
  },
);

const marker_metrics_changed = (update: ViewUpdate): boolean =>
  update.startState.field(marker_metrics_field) !== update.state.field(marker_metrics_field);

export const blockquote_extension = [
  marker_metrics_field,
  make_inline_decorations_plugin(blockquote_handlers, marker_metrics_changed),
  blockquote_caret_remeasure,
  blockquote_marker_width_probe,
  blockquote_theme,
];
