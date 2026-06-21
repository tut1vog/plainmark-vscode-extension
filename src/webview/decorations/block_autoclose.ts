import { syntaxTree } from '@codemirror/language';
import { Transaction, type EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';
import type { EditorView } from '@codemirror/view';

// 0–3 leading spaces (4+ is an indented code block, not a fence) + a uniform
// run of 3+ backticks/tildes + an info string carrying no fence character.
const OPEN_FENCE_RE = /^( {0,3})(`{3,}|~{3,})[^`~\n]*$/;
const MATH_OPEN_RE = /^( {0,3})\$\$[ \t]*$/;

function enclosing(node: SyntaxNode, name: string): SyntaxNode | null {
  for (let n: SyntaxNode | null = node; n; n = n.parent) {
    if (n.name === name) return n;
  }
  return null;
}

function fence_is_unclosed(state: EditorState, pos: number): boolean {
  // A closed block carries both an opening and a closing CodeMark; with no
  // FencedCode node the line is a fresh opener (or an unparsed tail) — unclosed.
  const fenced = enclosing(syntaxTree(state).resolveInner(pos, -1), 'FencedCode');
  return fenced ? fenced.getChildren('CodeMark').length < 2 : true;
}

function math_is_unclosed(state: EditorState, pos: number): boolean {
  // The math grammar emits a BlockMath node only for a complete `$$…$$` pair;
  // a node here means the caret sits on a delimiter of an already-closed block.
  return enclosing(syntaxTree(state).resolveInner(pos, -1), 'BlockMath') === null;
}

function close_block(
  view: EditorView,
  insert_at: number,
  indent: string,
  closer: string,
): boolean {
  view.dispatch({
    changes: { from: insert_at, insert: `\n\n${indent}${closer}` },
    selection: { anchor: insert_at + 1 },
    annotations: [Transaction.userEvent.of('input')],
  });
  return true;
}

// On Enter at the end of a freshly-opened, still-unclosed fenced code block or
// `$$` math block, append the matching closing delimiter so the block does not
// run to the end of the document. Higher-precedence than markdownKeymap.
export function block_delimiter_autoclose(view: EditorView): boolean {
  const { state } = view;
  const { main } = state.selection;
  if (!main.empty) return false;
  const line = state.doc.lineAt(main.head);
  // Fire only with the caret at the line end — the user just typed the opener.
  if (main.head !== line.to) return false;

  const fence = OPEN_FENCE_RE.exec(line.text);
  if (fence && fence_is_unclosed(state, main.head)) {
    return close_block(view, line.to, fence[1], fence[2]);
  }

  const math = MATH_OPEN_RE.exec(line.text);
  if (math && math_is_unclosed(state, main.head)) {
    return close_block(view, line.to, math[1], '$$');
  }

  return false;
}

function delete_block(view: EditorView, from: number, to: number): boolean {
  view.dispatch({
    changes: { from, to, insert: '' },
    selection: { anchor: from },
    annotations: [Transaction.userEvent.of('delete')],
  });
  return true;
}

// Backspace on the sole empty content line of an empty, fully-closed fenced
// code or `$$` math block removes the whole block — opening and closing
// delimiter together — instead of leaving a dangling closer. Counterpart to
// block_delimiter_autoclose.
export function block_empty_backspace(view: EditorView): boolean {
  const { state } = view;
  const { main } = state.selection;
  if (!main.empty) return false;
  const line = state.doc.lineAt(main.head);
  if (line.length !== 0) return false;

  const inner = syntaxTree(state).resolveInner(main.head, -1);
  const node = enclosing(inner, 'FencedCode') ?? enclosing(inner, 'BlockMath');
  if (node) {
    // An unclosed FencedCode has no closer to remove — yield to default Backspace.
    if (node.name === 'FencedCode' && node.getChildren('CodeMark').length < 2) {
      return false;
    }
    const opener = state.doc.lineAt(node.from);
    const closer = state.doc.lineAt(node.to);
    // Exactly three lines — opener, the empty content line, closer — caret on the middle.
    if (closer.number !== opener.number + 2 || line.number !== opener.number + 1) {
      return false;
    }
    return delete_block(view, node.from, node.to);
  }

  // An empty `$$\n\n$$` block has a blank content line that ends the math leaf
  // before its close, so it parses as two paragraphs rather than a BlockMath node;
  // recognize the opener/blank/closer shape textually instead.
  if (line.number > 1 && line.number < state.doc.lines) {
    const above = state.doc.line(line.number - 1);
    const below = state.doc.line(line.number + 1);
    if (
      MATH_OPEN_RE.test(above.text) &&
      MATH_OPEN_RE.test(below.text) &&
      // a `$$` ending a complete BlockMath above is a closer, not this block's opener
      math_is_unclosed(state, above.to)
    ) {
      return delete_block(view, above.from, below.to);
    }
  }
  return false;
}

// Typing the third backtick/tilde of an otherwise-empty line immediately appends
// a matching closing fence on the next line, leaving the caret at the end of the
// opening line so the user types the language inline (`` ```|\n``` ``). Suppressed
// when the immediate next line is already a matching closer, so adding a fence
// above existing code doesn't orphan a duplicate. Registered as an inputHandler.
export function fence_autopair_input(
  view: EditorView,
  from: number,
  to: number,
  insert: string,
): boolean {
  if (insert !== '`' && insert !== '~') return false;
  const { state } = view;
  const { main } = state.selection;
  // Plain caret insertion only — not a type-over-selection, not multi-cursor.
  if (!main.empty || from !== to || from !== main.head) return false;
  const line = state.doc.lineAt(from);
  // The fence char must close the run at end of line — nothing typed-over after it.
  if (to !== line.to) return false;
  const completed = state.doc.sliceString(line.from, from) + insert;
  // Exactly 3 bare fence chars: autopair triggers only on the just-completed
  // run, before any info string — hence no `{3,}` and no tail, unlike OPEN_FENCE_RE.
  const m = /^( {0,3})(`{3}|~{3})$/.exec(completed);
  if (!m || m[2][0] !== insert) return false;
  // the typed run closes an unclosed fence above — pairing would orphan a fresh opener
  if (
    enclosing(syntaxTree(state).resolveInner(from, -1), 'FencedCode') &&
    fence_is_unclosed(state, from)
  ) {
    return false;
  }
  const indent = m[1];
  const closer = m[2];
  if (line.number < state.doc.lines) {
    const next = state.doc.line(line.number + 1);
    // A closer carries no info string: 3+ fence chars with only a whitespace
    // tail — `[ \t]*$` not `[^`~\n]*$`, so an info-bearing opener won't match.
    const nm = /^( {0,3})(`{3,}|~{3,})[ \t]*$/.exec(next.text);
    if (nm && nm[2][0] === insert && nm[2].length >= closer.length) return false;
  }
  view.dispatch({
    changes: { from, to, insert: `${insert}\n${indent}${closer}` },
    selection: { anchor: from + insert.length },
    annotations: [Transaction.userEvent.of('input')],
  });
  return true;
}
