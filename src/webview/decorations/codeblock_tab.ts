import { indentUnit, syntaxTree } from '@codemirror/language';
import { Transaction } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';
import type { Command } from '@codemirror/view';

// Fenced code gets IDE-style caret indent; elsewhere Tab falls through to the whole-line indent (indentWithTab).
export const codeblock_tab_insert: Command = (view) => {
  const { state } = view;
  const { ranges, main } = state.selection;
  if (ranges.length !== 1 || !main.empty) return false;

  let in_fenced_code = false;
  for (
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(main.head, -1);
    node;
    node = node.parent
  ) {
    if (node.name === 'FencedCode') {
      in_fenced_code = true;
      break;
    }
  }
  if (!in_fenced_code) return false;

  const indent = state.facet(indentUnit);
  view.dispatch({
    changes: { from: main.head, insert: indent },
    selection: { anchor: main.head + indent.length },
    scrollIntoView: true,
    annotations: [Transaction.userEvent.of('input')],
  });
  return true;
};
