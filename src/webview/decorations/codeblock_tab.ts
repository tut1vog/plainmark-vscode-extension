import { deleteCharBackwardStrict } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';
import { Transaction, type ChangeSpec, type EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';
import type { Command } from '@codemirror/view';

// Fenced code uses a 4-space Tab/Shift-Tab indent, independent of the editor's 2-space prose indent unit. CBLK-I-13.
const CODE_INDENT = '    ';

function in_fenced_code(state: EditorState, pos: number): boolean {
  for (
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
    node;
    node = node.parent
  ) {
    if (node.name === 'FencedCode') return true;
  }
  return false;
}

// Line span a selection covers; a selection ending exactly at a line start excludes that line (mirrors CM6).
function selected_lines(state: EditorState): { first: number; last: number } {
  const { main } = state.selection;
  const first = state.doc.lineAt(main.from).number;
  let last = state.doc.lineAt(main.to).number;
  if (!main.empty && main.to === state.doc.line(last).from && last > first) last--;
  return { first, last };
}

export const codeblock_tab_indent: Command = (view) => {
  const { state } = view;
  if (state.selection.ranges.length !== 1) return false;
  const { main } = state.selection;
  if (!in_fenced_code(state, main.head)) return false;

  if (main.empty) {
    view.dispatch({
      changes: { from: main.head, insert: CODE_INDENT },
      selection: { anchor: main.head + CODE_INDENT.length },
      scrollIntoView: true,
      annotations: [Transaction.userEvent.of('input')],
    });
    return true;
  }

  const { first, last } = selected_lines(state);
  const changes: ChangeSpec[] = [];
  for (let n = first; n <= last; n++) {
    changes.push({ from: state.doc.line(n).from, insert: CODE_INDENT });
  }
  view.dispatch({
    changes,
    scrollIntoView: true,
    annotations: [Transaction.userEvent.of('input.indent')],
  });
  return true;
};

export const codeblock_tab_dedent: Command = (view) => {
  const { state } = view;
  if (state.selection.ranges.length !== 1) return false;
  const { main } = state.selection;
  if (!in_fenced_code(state, main.head)) return false;

  const { first, last } = selected_lines(state);
  const changes: ChangeSpec[] = [];
  for (let n = first; n <= last; n++) {
    const line = state.doc.line(n);
    const lead = /^ {1,4}/.exec(line.text);
    if (lead) changes.push({ from: line.from, to: line.from + lead[0].length, insert: '' });
  }
  if (changes.length > 0) {
    view.dispatch({
      changes,
      scrollIntoView: true,
      annotations: [Transaction.userEvent.of('delete.dedent')],
    });
  }
  return true;
};

// In fenced code, force a strict single-char Backspace — CM6's default strips a whole indent unit in leading whitespace. CBLK-I-14.
export const codeblock_backspace: Command = (view) => {
  const { main } = view.state.selection;
  if (!main.empty) return false;
  if (!in_fenced_code(view.state, main.head)) return false;
  return deleteCharBackwardStrict(view);
};
