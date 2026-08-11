import { type EditorState, type Range } from '@codemirror/state';
import { Decoration } from '@codemirror/view';
import type { SyntaxNodeRef } from '@lezer/common';
import type { NodeHandler } from './inline_decorations.js';
import { should_reveal_for_selection } from './selection_reveal.js';

const hide_marker = Decoration.mark({ class: 'plainmark-inline-marker-hidden' });

// lezer's Escape node spans backslash + escaped char and only exists for the
// CommonMark escapable punctuation set — keying on the node covers every
// escapable character without enumerating them.
const escape_handler: NodeHandler = {
  nodeNames: ['Escape'],
  handle(node: SyntaxNodeRef, state: EditorState): Range<Decoration>[] {
    if (should_reveal_for_selection(state, node.from, node.to)) return [];
    return [hide_marker.range(node.from, node.from + 1)];
  },
};

// Consumed by inline_bundle.ts (one shared walk). No theme — the
// .plainmark-inline-marker-hidden rule lives once in text_styles_theme.
export const escape_handlers: readonly NodeHandler[] = [escape_handler];
