import { deleteCharBackwardStrict } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';
import { Transaction, type ChangeSpec, type EditorState, type Line } from '@codemirror/state';
import type { Command } from '@codemirror/view';
import { selected_lines } from '../selected_lines.js';
import { enclosing } from '../tree_ancestors.js';

// Fenced code uses a 4-space Tab/Shift-Tab indent, independent of the editor's 2-space prose indent unit. CBLK-I-13.
const CODE_INDENT = '    ';

function in_fenced_code(state: EditorState, pos: number): boolean {
  return enclosing(syntaxTree(state).resolveInner(pos, -1), 'FencedCode') !== null;
}

// The selected lines that lie inside a fenced block, minus its delimiter lines
// (a delimiter shifted to 4+ indent stops being a fence). Lines outside any
// fence are never touched, whichever way the selection was dragged.
function fenced_body_lines(state: EditorState): { lines: Line[]; any_fenced: boolean } {
  const { first, last } = selected_lines(state);
  const lines: Line[] = [];
  let any_fenced = false;
  for (let n = first; n <= last; n++) {
    const line = state.doc.line(n);
    if (!in_fenced_code(state, line.to)) continue;
    any_fenced = true;
    if (!is_fence_delimiter_line(state, line)) lines.push(line);
  }
  return { lines, any_fenced };
}

function is_fence_delimiter_line(state: EditorState, line: { from: number; to: number }): boolean {
  let found = false;
  syntaxTree(state).iterate({
    from: line.from,
    to: line.to,
    enter(node) {
      if (found) return false;
      if (node.name === 'CodeMark' && node.node.parent?.name === 'FencedCode') {
        found = true;
        return false;
      }
      return;
    },
  });
  return found;
}

export const codeblock_tab_indent: Command = (view) => {
  const { state } = view;
  if (state.selection.ranges.length !== 1) return false;
  const { main } = state.selection;

  if (main.empty) {
    if (!in_fenced_code(state, main.head)) return false;
    view.dispatch({
      changes: { from: main.head, insert: CODE_INDENT },
      selection: { anchor: main.head + CODE_INDENT.length },
      scrollIntoView: true,
      annotations: [Transaction.userEvent.of('input')],
    });
    return true;
  }

  const { lines, any_fenced } = fenced_body_lines(state);
  if (!any_fenced) return false;
  const changes: ChangeSpec[] = lines.map((line) => ({ from: line.from, insert: CODE_INDENT }));
  // Consume the key even with nothing to indent — falling through would hand the fence lines to indentMore.
  if (changes.length > 0) {
    view.dispatch({
      changes,
      scrollIntoView: true,
      annotations: [Transaction.userEvent.of('input.indent')],
    });
  }
  return true;
};

export const codeblock_tab_dedent: Command = (view) => {
  const { state } = view;
  if (state.selection.ranges.length !== 1) return false;
  const { lines, any_fenced } = fenced_body_lines(state);
  if (!any_fenced) return false;
  const changes: ChangeSpec[] = [];
  for (const line of lines) {
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
