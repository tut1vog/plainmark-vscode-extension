import { type EditorState, type Range } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import type { SyntaxNodeRef } from '@lezer/common';
import { make_inline_decorations_plugin, type NodeHandler } from './inline_decorations.js';

const hr_line = Decoration.line({ class: 'plainmark-hr plainmark-collapse-adjacent' });

const horizontal_rule_handler: NodeHandler = {
  nodeNames: ['HorizontalRule'],
  handle(node: SyntaxNodeRef, state: EditorState): Range<Decoration>[] {
    const line_from = state.doc.lineAt(node.from).from;
    return [hr_line.range(line_from)];
  },
};

export const horizontal_rule_handlers: readonly NodeHandler[] = [horizontal_rule_handler];

const horizontal_rule_theme = EditorView.theme({
  '.plainmark-hr': {
    // Hide the raw `---` / `***` / `___` source bytes; the visible bar is drawn by ::before.
    color: 'transparent',
    position: 'relative',
    // Padding (not margin) so CM6's .cm-line height map measures the spacing.
    padding: 'var(--plainmark-hr-padding-y, 0.4em) 0',
  },
  '.plainmark-hr::before': {
    content: '""',
    position: 'absolute',
    left: '0',
    right: '0',
    top: '50%',
    borderTop:
      'var(--plainmark-hr-width, 1px) solid var(--plainmark-hr-color, var(--vscode-textSeparator-foreground, var(--vscode-contrastBorder, currentColor)))',
  },
  // ADR-0010: a gapped HR stacks the paragraph gap on its own padding
  // ((0,5,0) beats the tripled paragraph-gap rule at (0,4,0) independent of
  // source order) …
  '.cm-line.cm-line.cm-line.plainmark-hr.plainmark-paragraph-gap': {
    padding:
      'calc(var(--plainmark-paragraph-gap, 0.75em) + var(--plainmark-hr-padding-y, 0.4em)) 0 var(--plainmark-hr-padding-y, 0.4em)',
  },
  // … and the drawn bar re-centres on the source glyph line: 50% of the now
  // top-heavy padded box sits gap/2 above the content centre.
  '.plainmark-hr.plainmark-paragraph-gap::before': {
    top: 'calc(50% + var(--plainmark-paragraph-gap, 0.75em) / 2)',
  },
});

export const horizontal_rule_extension = [
  make_inline_decorations_plugin(horizontal_rule_handlers),
  horizontal_rule_theme,
];
