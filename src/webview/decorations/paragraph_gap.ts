import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';

// Constructs that own their spacing (or where a newline is content, not a
// paragraph break) — no line of these ever carries the gap. Setext headings
// are deliberately absent: Plainmark renders them as plain prose, and typing
// `-` under a paragraph transiently parses as a setext underline — excluding
// it here would flash the layout mid-bullet-typing. Blockquote is also absent
// (ADR-0007): quote and callout interiors share the prose paragraph rhythm —
// only the first line of the outermost quote is excluded (see gap_eligible) —
// and inner non-prose constructs still bail here because the ancestor walk
// runs inner→outer, hitting e.g. a quoted FencedCode before the Blockquote.
const NON_PROSE_CONTEXTS = new Set([
  'FencedCode',
  'CodeBlock',
  'FrontMatter',
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
  tree: ReturnType<typeof syntaxTree>,
  line: { from: number; to: number; text: string },
): boolean {
  // Skip the lexical quote prefix (`>` runs and whitespace, BQ-R-12's scan),
  // not just whitespace: probing at a bare `>` resolves to the QuoteMark,
  // whose ancestors skip the ListItem a quoted list line belongs to.
  const prefix = /^[ \t>]*/.exec(line.text)![0].length;
  const probe = Math.min(line.from + prefix, line.to);
  let outermost_list: { from: number } | null = null;
  let innermost_item: { from: number } | null = null;
  let outermost_quote: { from: number } | null = null;
  for (let n = tree.resolveInner(probe, 1); n; n = n.parent!) {
    if (NON_PROSE_CONTEXTS.has(n.name)) return false;
    if (n.name === 'ListItem' && innermost_item === null) innermost_item = n;
    if (LIST_CONTEXTS.has(n.name)) outermost_list = n;
    if (n.name === 'Blockquote') outermost_quote = n;
    if (!n.parent) break;
  }
  // First line of the outermost quote (plain or callout): the block's outer
  // breathing room stays --plainmark-blockquote-padding-y / the callout header
  // padding — gap padding here would render as a fat tinted band above the
  // quote's first paragraph, since .cm-line padding sits inside the background
  // and margins are banned (height-map rule). Interior lines (any depth,
  // callout bodies, quoted blanks) fall through to the prose/list rules, so
  // deepening an interior line with another `>` never moves the layout.
  if (outermost_quote !== null && outermost_quote.from >= line.from) return false;
  if (outermost_list === null || outermost_list.from >= line.from) return true;
  return innermost_item !== null && innermost_item.from < line.from;
}

// A hard `\n` renders as a paragraph break: every eligible line after the
// first document line gets gap padding above it. Soft-wrapped rows share one
// .cm-line, so wrap boundaries are untouched (PARA-E-5 amendment, 2026-07-19).
function build_gap_decorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const tree = syntaxTree(view.state);
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = view.state.doc.lineAt(pos);
      // Blank lines included — the gap must exist the instant Enter creates
      // the line, or the first typed character reflows the layout.
      if (line.number > 1 && gap_eligible(tree, line)) {
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
  '.cm-line.plainmark-paragraph-gap.plainmark-paragraph-gap.plainmark-paragraph-gap': {
    paddingTop: 'var(--plainmark-paragraph-gap, 0.75em)',
  },
});

export const paragraph_gap_extension = [paragraph_gap_plugin, paragraph_gap_theme];
