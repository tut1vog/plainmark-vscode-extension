import { type EditorState, type Range } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import type { SyntaxNodeRef } from '@lezer/common';
import { make_inline_decorations_plugin, type NodeHandler } from './inline_decorations.js';
import { should_reveal_for_selection } from './selection_reveal.js';

function text_style_handler(
  node_name: string,
  mark_name: string,
  class_name: string,
): NodeHandler {
  const content_mark = Decoration.mark({ class: class_name });
  // Inline-block + width:0 + overflow:hidden.
  // - Marker text stays in layout as a zero-width inline-block (drawSelection
  //   has a valid 0-width rect → no Track A drag-render artifacts; coordsAt
  //   returns valid coords → no scanY skip; rect has valid height →
  //   no font-size:0 caret regression).
  // - Width:0 + overflow:hidden collapses the marker glyphs to zero visual
  //   width without over-collapsing (unlike letter-spacing on proportional
  //   fonts where multi-char markers like `](url)` over-collapse to negative
  //   width and pull subsequent text leftward).
  // - On reveal (no class), the span becomes plain inline with natural width
  //   → adjacent characters shift right → layout shift returns. Known
  //   tradeoff for now.
  const hide_marker = Decoration.mark({ class: 'plainmark-inline-marker-hidden' });
  return {
    nodeNames: [node_name],
    handle(node: SyntaxNodeRef, state: EditorState): Range<Decoration>[] {
      // firstChild / lastChild of an emphasis-family node are its syntax markers;
      // editable content sits between them.
      const tree_node = node.node;
      const first = tree_node.firstChild;
      const last = tree_node.lastChild;
      if (
        !first ||
        !last ||
        first === last ||
        first.name !== mark_name ||
        last.name !== mark_name ||
        first.to >= last.from
      ) {
        return [];
      }
      const decorations: Range<Decoration>[] = [content_mark.range(first.to, last.from)];
      const revealed = should_reveal_for_selection(state, node.from, node.to);
      if (!revealed) {
        decorations.push(hide_marker.range(first.from, first.to));
        decorations.push(hide_marker.range(last.from, last.to));
      }
      return decorations;
    },
  };
}

export const text_style_handlers: readonly NodeHandler[] = [
  text_style_handler('StrongEmphasis', 'EmphasisMark', 'plainmark-strong'),
  text_style_handler('Emphasis', 'EmphasisMark', 'plainmark-em'),
  text_style_handler('Strikethrough', 'StrikethroughMark', 'plainmark-strikethrough'),
  text_style_handler('InlineCode', 'CodeMark', 'plainmark-inline-code'),
];

const text_styles_theme = EditorView.theme({
  // Single definition of the inline-marker-hidden rule for the whole editor —
  // links/escapes/text-style markers all use this class; text_styles_extension
  // always co-loads, so it need not be redefined per consumer.
  '.plainmark-inline-marker-hidden': {
    display: 'inline-block',
    width: '0',
    overflow: 'hidden',
    // CSS 2.1 §10.8.1: overflow != visible makes inline-block's baseline its
    // bottom margin edge (not its last in-flow line's baseline). With
    // vertical-align:baseline, that pushes the inline-block ~0.45em above the
    // strut top, inflating the line-box during hide and producing a visible
    // upward shift when the marker reveals. vertical-align:top bypasses the
    // baseline computation: the inline-block's top aligns to the line-box top.
    // Since the inline-block height equals the strut height (both 1.5em from
    // inherited line-height), no extra line-box height is introduced and the
    // line stays the same height across hide/reveal.
    verticalAlign: 'top',
    // EditorView.lineWrapping cascades overflow-wrap:anywhere into descendants.
    // With width:0, multi-char markers (`**`, `](url)`) would break on every
    // char, making the inline-block N lines tall and inflating the parent line.
    // nowrap keeps content on one line; overflow:hidden still clips horizontally.
    whiteSpace: 'nowrap',
  },
  '.plainmark-strong': {
    color: 'var(--plainmark-strong-color, inherit)',
    fontWeight: 'var(--plainmark-strong-weight, 600)' as 'bold',
  },
  '.plainmark-em': {
    color: 'var(--plainmark-em-color, inherit)',
    fontStyle: 'var(--plainmark-em-style, italic)' as 'italic',
  },
  '.plainmark-strikethrough': {
    color: 'var(--plainmark-strikethrough-color, inherit)',
    textDecoration: 'var(--plainmark-strikethrough-decoration, line-through)',
  },
  '.plainmark-inline-code': {
    color:
      'var(--plainmark-inline-code-color, var(--vscode-textPreformat-foreground, inherit))',
    backgroundColor:
      'var(--plainmark-inline-code-background, var(--vscode-textPreformat-background, var(--vscode-textCodeBlock-background, transparent)))',
    border:
      '1px solid var(--plainmark-inline-code-border-color, var(--vscode-textPreformat-border, transparent))',
    padding: 'var(--plainmark-inline-code-padding, 0.2em 0.4em)',
    borderRadius: 'var(--plainmark-inline-code-border-radius, 6px)',
    fontFamily:
      'var(--plainmark-inline-code-font-family, var(--plainmark-font-code, monospace))',
    fontSize: 'var(--plainmark-inline-code-font-size, 85%)',
  },
});

export const text_styles_extension = [
  make_inline_decorations_plugin(text_style_handlers),
  text_styles_theme,
];
