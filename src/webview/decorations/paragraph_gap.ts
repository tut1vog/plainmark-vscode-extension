import { syntaxTree } from '@codemirror/language';
import { type EditorState, RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { detect_callout } from './callout_detect.js';

// Constructs whose INTERIOR lines own their spacing (or where a newline is
// content, not a paragraph break) — only the line a construct STARTS on joins
// the paragraph rhythm (ADR-0010); every later line of it stays gap-free.
// Setext headings are deliberately absent: Plainmark renders them as plain
// prose, and typing `-` under a paragraph transiently parses as a setext
// underline — excluding it here would flash the layout mid-bullet-typing.
// Blockquote is also absent (ADR-0007): quote and callout interiors share the
// prose paragraph rhythm, and quoted non-prose constructs stay gap-free via
// the construct-start check in gap_eligible (BQ-R-13). FrontMatter is not
// here — it is excluded unconditionally (it can only sit at the doc top, and
// its opening `---` must never take a gap when an edit transiently reparses).
const NON_PROSE_CONTEXTS = new Set([
  'FencedCode',
  'CodeBlock',
  'BlockMath',
  'HTMLBlock',
  'CommentBlock',
  'ProcessingInstructionBlock',
  'Table',
  'ATXHeading1',
  'ATXHeading2',
  'ATXHeading3',
  'ATXHeading4',
  'ATXHeading5',
  'ATXHeading6',
  'HorizontalRule',
]);

const LIST_CONTEXTS = new Set(['BulletList', 'OrderedList']);

const gap_line = Decoration.line({ class: 'plainmark-paragraph-gap' });

// Gap-invariance across marker typing: `para\n-` parses as a setext underline,
// `para\n* ` as paragraph text, `para\n* x` as a list — all transitional states
// on the way to a bullet. Prose lines, blank lines, setext lines, AND the first
// line of a top-level list all keep the gap, so none of those reclassifications
// moves the layout vertically; only interior list MARKER lines (a ListItem
// starts on the line) drop to the tighter item spacing (which lists.ts applies
// via an adjacent-sibling rule).
//
// Item continuation lines — lazy (`- a\nb`) or indented (`- a\n  b`), i.e.
// lines inside an item begun on an earlier line — keep the gap: under the
// hard-newline break model (PARA-R-7, amended per ADR-0006) they read as
// paragraphs, not soft wraps. Marker typing on one stays a single jump: `-`
// prepended to existing text is still continuation prose (`-next`), and the
// space keystroke completes a real item (`- next`) in the same instant the
// gap hands off to item spacing. Blank lines between loose items have no
// ListItem ancestor and stay tight, so loose-list geometry is unchanged.
function gap_eligible(
  state: EditorState,
  line: { from: number; to: number; text: string },
): boolean {
  const tree = syntaxTree(state);
  // Skip the lexical quote prefix (`>` runs and whitespace, BQ-R-12's scan),
  // not just whitespace: probing at a bare `>` resolves to the QuoteMark,
  // whose ancestors skip the ListItem a quoted list line belongs to.
  const prefix = /^[ \t>]*/.exec(line.text)![0].length;
  const probe = Math.min(line.from + prefix, line.to);
  // Prefix-only and blank lines probe at line END, where a construct that
  // ends exactly there is invisible to side 1 — resolveInner climbs to
  // Document. An empty callout body line at doc end (`> [!note] t\n> `) lost
  // its Blockquote ancestor that way: it took the bogus prose gap, and the
  // first typed character restored the context and snapped the line up to the
  // title seam. Lean left (-1) at end-of-line probes so the line resolves
  // into the construct it terminates; content probes keep side 1.
  const side = probe === line.to ? -1 : 1;
  let outermost_list: { from: number } | null = null;
  let innermost_item: { from: number } | null = null;
  let outermost_quote: SyntaxNode | null = null;
  let construct_start = false;
  for (let n = tree.resolveInner(probe, side); n; n = n.parent!) {
    if (n.name === 'FrontMatter') return false;
    if (NON_PROSE_CONTEXTS.has(n.name)) {
      // Interior lines of a non-prose construct own their spacing; the line
      // the construct STARTS on joins the paragraph rhythm (ADR-0010), so the
      // block as a whole separates from what precedes it. Each construct's
      // theme renders that gap as clear space (background skips the padded
      // band; see the per-construct `.plainmark-paragraph-gap` rules).
      if (n.from < line.from) return false;
      construct_start = true;
    }
    if (n.name === 'ListItem' && innermost_item === null) innermost_item = n;
    if (LIST_CONTEXTS.has(n.name)) outermost_list = n;
    if (n.name === 'Blockquote') outermost_quote = n;
    if (!n.parent) break;
  }
  if (outermost_quote !== null && outermost_quote.from < line.from) {
    // Interior quote line. A quoted non-prose construct stays gap-free at any
    // depth (BQ-R-13): the in-quote rhythm belongs to quoted prose, and the
    // construct's own start-line gap applies only at the document level.
    if (construct_start) return false;
    // First BODY line of a callout (the line right under the header): the
    // title→content seam stays the header's title-padding-bottom alone —
    // owner smoke rejected gap-sized spacing under the icon line (CALL-R-11).
    // Later body lines keep the gap like any quote interior.
    const header_line = state.doc.lineAt(outermost_quote.from);
    if (line.from === header_line.to + 1 && detect_callout(state, outermost_quote) !== null)
      return false;
  }
  // The FIRST line of the outermost quote (plain or callout header) is
  // eligible like any construct start (ADR-0010, reversing ADR-0007's
  // first-line exclusion): the gap renders as clear space above the block —
  // the tint is bottom-anchored past the gap and the bars start below it
  // (blockquote.ts / callout.ts), so no tinted band appears. It still
  // composes with the list rules below (a quote opening inside a list item
  // reads as that item's continuation).
  if (outermost_list === null || outermost_list.from >= line.from) return true;
  return innermost_item !== null && innermost_item.from < line.from;
}

// A hard `\n` renders as a paragraph break: every eligible line after the
// first document line gets gap padding above it. Soft-wrapped rows share one
// .cm-line, so wrap boundaries are untouched (PARA-E-5 amendment, 2026-07-19).
function build_gap_decorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = view.state.doc.lineAt(pos);
      // Blank lines included — the gap must exist the instant Enter creates
      // the line, or the first typed character reflows the layout.
      if (line.number > 1 && gap_eligible(view.state, line)) {
        builder.add(line.from, line.from, gap_line);
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

const paragraph_gap_plugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build_gap_decorations(view);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.state) !== syntaxTree(update.startState)
      ) {
        this.decorations = build_gap_decorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

const paragraph_gap_theme = EditorView.theme({
  // Padding, not margin — CM6's height map excludes margins on .cm-line
  // (same rule as headings/lists, T14.1). Class TRIPLED for a deterministic
  // (0,4,0) win over every padding-top peer at (0,3,0) or below: the doubled
  // form already beat `.plainmark-list-item + .plainmark-list-item` item
  // spacing, but tied with the blockquote per-depth rule
  // (`.plainmark-blockquote[data-blockquote-depth]:not(.plainmark-callout)`),
  // leaving quote-interior gaps (ADR-0007) to source order; the third class
  // also outranks `.plainmark-callout-body`'s padding-top reset. The quote
  // tint and nesting bars span the padded box (bars are top:0/bottom:0 on the
  // line; the callout accent is a background gradient), so the gap renders as
  // in-quote space with unbroken chrome.
  //
  // Construct START lines (ADR-0010) take this same padding as their default;
  // constructs that stack the gap on their own breathing room (quote first
  // line, callout header, indented-code first, headings, HR) override it with
  // (0,5,0) rules in their own themes — deliberately ABOVE this (0,4,0) so the
  // stack never depends on theme source order.
  '.cm-line.plainmark-paragraph-gap.plainmark-paragraph-gap.plainmark-paragraph-gap': {
    paddingTop: 'var(--plainmark-paragraph-gap, 0.75em)',
  },
});

export const paragraph_gap_extension = [paragraph_gap_plugin, paragraph_gap_theme];
