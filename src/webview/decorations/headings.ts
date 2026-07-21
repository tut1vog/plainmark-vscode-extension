import { type EditorState, type Range } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import type { SyntaxNodeRef } from '@lezer/common';
import { make_inline_decorations_plugin, type NodeHandler } from './inline_decorations.js';
import { should_reveal_for_selection } from './selection_reveal.js';

function heading_handler(node_name: string, level: number): NodeHandler {
  const line_class = `plainmark-h${level} plainmark-collapse-adjacent`;
  const line_deco = Decoration.line({ class: line_class });
  const hide_marker = Decoration.mark({ class: 'plainmark-heading-marker' });
  return {
    nodeNames: [node_name],
    handle(node: SyntaxNodeRef, state: EditorState): Range<Decoration>[] {
      const line_from = state.doc.lineAt(node.from).from;

      const first = node.node.firstChild;
      if (!first || first.name !== 'HeaderMark') return [line_deco.range(line_from)];

      const after = first.to;
      const has_trailing_space =
        after < state.doc.length && state.doc.sliceString(after, after + 1) === ' ';
      // A bare `#`-run with no space after it renders as plain text (Typora
      // parity, HEAD-E-1) even though CommonMark parses it as an empty heading.
      if (!has_trailing_space && after >= node.to) return [];

      const decorations: Range<Decoration>[] = [line_deco.range(line_from)];
      const hide_to = has_trailing_space ? after + 1 : after;

      // Reveal scoped to the marker range so the `#`-run shows only at the start of the heading text (HEAD-R-4); a caret deeper in the text re-hides it (accepted shift, HEAD-E-7).
      const has_text = state.doc.sliceString(hide_to, node.to).trim().length > 0;
      const revealed = should_reveal_for_selection(state, first.from, hide_to);
      if (has_text && !revealed) decorations.push(hide_marker.range(first.from, hide_to));
      return decorations;
    },
  };
}

export const heading_handlers: readonly NodeHandler[] = [
  heading_handler('ATXHeading1', 1),
  heading_handler('ATXHeading2', 2),
  heading_handler('ATXHeading3', 3),
  heading_handler('ATXHeading4', 4),
  heading_handler('ATXHeading5', 5),
  heading_handler('ATXHeading6', 6),
];

const headings_theme = EditorView.theme({
  // Hide the ATX marker by collapsing its glyphs to zero width. A mark (vs a
  // replace decoration) keeps `# ` as ordinary text — a replace renders a
  // contenteditable=false span flanked by cm-widgetBuffer <img>s, and that
  // line-leading widget boundary makes posAtCoords ambiguous, which breaks
  // drawSelection's wrappedLine and paints a flickering whole-line selection.
  '.plainmark-heading-marker': {
    fontSize: '0',
  },
  '.plainmark-h1, .plainmark-h2, .plainmark-h3, .plainmark-h4, .plainmark-h5, .plainmark-h6': {
    color: 'var(--plainmark-heading-color, inherit)',
    fontFamily: 'var(--plainmark-heading-font-family, inherit)',
    // Tall line-height carries the bulk of the visible gap (sits inside the
    // line's hit-test box so it doesn't read as "clickable whitespace").
    lineHeight: 'var(--plainmark-heading-line-height, 1.5)',
    // Padding, not margin: CM6's `.cm-line` height map measures the line's
    // own box, which excludes margins — a margin here desyncs `coordsAtPos`
    // and `moveVertically` for every line below the heading. Same lesson as
    // the table block widget. Values kept small so the unavoidable fat-
    // click region stays ≤~10px.
    paddingTop: 'var(--plainmark-heading-padding-top, 0.4em)',
    paddingBottom: 'var(--plainmark-heading-padding-bottom, 0.3em)',
  },
  // ADR-0011 (amending ADR-0010): a gapped heading stacks the paragraph gap
  // on its own padding, but the GAP component holds at the base font size —
  // each level divides the gap by its default size scale to cancel the
  // heading's em context (owner rejected the proportional stack: 2.3em of
  // base on h1 read as an extremely wide top band). Only the heading's own
  // breathing (--plainmark-heading-padding-top) still scales. The divisors
  // hard-code the default --plainmark-h<n>-size scales; a themed size
  // diverges from the gap — accepted, same class as ADR-0010's table/math
  // shorthand hard-coding. (0,5,0) beats the tripled paragraph-gap rule at
  // (0,4,0) independent of theme source order.
  '.cm-line.cm-line.cm-line.plainmark-h1.plainmark-paragraph-gap': {
    paddingTop:
      'calc(var(--plainmark-paragraph-gap, 0.75em) / 2 + var(--plainmark-heading-padding-top, 0.4em))',
  },
  '.cm-line.cm-line.cm-line.plainmark-h2.plainmark-paragraph-gap': {
    paddingTop:
      'calc(var(--plainmark-paragraph-gap, 0.75em) / 1.5 + var(--plainmark-heading-padding-top, 0.4em))',
  },
  '.cm-line.cm-line.cm-line.plainmark-h3.plainmark-paragraph-gap': {
    paddingTop:
      'calc(var(--plainmark-paragraph-gap, 0.75em) / 1.25 + var(--plainmark-heading-padding-top, 0.4em))',
  },
  '.cm-line.cm-line.cm-line.plainmark-h4.plainmark-paragraph-gap': {
    paddingTop:
      'calc(var(--plainmark-paragraph-gap, 0.75em) + var(--plainmark-heading-padding-top, 0.4em))',
  },
  '.cm-line.cm-line.cm-line.plainmark-h5.plainmark-paragraph-gap': {
    paddingTop:
      'calc(var(--plainmark-paragraph-gap, 0.75em) / 0.875 + var(--plainmark-heading-padding-top, 0.4em))',
  },
  '.cm-line.cm-line.cm-line.plainmark-h6.plainmark-paragraph-gap': {
    paddingTop:
      'calc(var(--plainmark-paragraph-gap, 0.75em) / 0.85 + var(--plainmark-heading-padding-top, 0.4em))',
  },
  // GitHub-style separator on h1 / h2 only.
  '.plainmark-h1, .plainmark-h2': {
    borderBottom:
      'var(--plainmark-heading-border-width, 1px) solid var(--plainmark-heading-border-color, var(--vscode-textSeparator-foreground, color-mix(in srgb, var(--vscode-foreground) 35%, transparent)))',
  },
  '.plainmark-h1': {
    fontSize: 'var(--plainmark-h1-size, 2em)',
    fontWeight: 'var(--plainmark-h1-weight, 600)' as 'bold',
  },
  '.plainmark-h2': {
    fontSize: 'var(--plainmark-h2-size, 1.5em)',
    fontWeight: 'var(--plainmark-h2-weight, 600)' as 'bold',
  },
  '.plainmark-h3': {
    fontSize: 'var(--plainmark-h3-size, 1.25em)',
    fontWeight: 'var(--plainmark-h3-weight, 600)' as 'bold',
  },
  '.plainmark-h4': {
    fontSize: 'var(--plainmark-h4-size, 1em)',
    fontWeight: 'var(--plainmark-h4-weight, 600)' as 'bold',
  },
  '.plainmark-h5': {
    fontSize: 'var(--plainmark-h5-size, 0.875em)',
    fontWeight: 'var(--plainmark-h5-weight, 600)' as 'bold',
  },
  '.plainmark-h6': {
    fontSize: 'var(--plainmark-h6-size, 0.85em)',
    fontWeight: 'var(--plainmark-h6-weight, 600)' as 'bold',
  },
});

export const headings_extension = [
  make_inline_decorations_plugin(heading_handlers),
  headings_theme,
];
