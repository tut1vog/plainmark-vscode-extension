import { Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

export interface BlockInsertContext {
  caret: number;
  at_line_start: boolean;
  // Character at the caret; '' at end of document.
  next_char: string;
  // Whether the content ending up on the line directly above the block is blank or absent.
  above_blank: boolean;
}

export interface BlockInsertPlan {
  from: number;
  insert: string;
  cursor: number;
}

// Place `block` on its own line(s) at the caret: a mid-line caret pushes the
// block onto a fresh line, and a mid-line split gets a newline after the block.
export function plan_block_insert(
  ctx: BlockInsertContext,
  block: string,
  cursor_offset: number,
  require_blank_above = false,
): BlockInsertPlan {
  const base_prefix = ctx.at_line_start ? '' : '\n';
  const prefix =
    require_blank_above && !ctx.above_blank ? base_prefix + '\n' : base_prefix;
  const suffix = ctx.next_char === '' || ctx.next_char === '\n' ? '' : '\n';
  return {
    from: ctx.caret,
    insert: prefix + block + suffix,
    cursor: ctx.caret + prefix.length + cursor_offset,
  };
}

function above_blank(view: EditorView, caret: number): boolean {
  const line = view.state.doc.lineAt(caret);
  if (caret > line.from) {
    return /^[ \t]*$/.test(view.state.doc.sliceString(line.from, caret));
  }
  if (line.number === 1) return true;
  return /^[ \t]*$/.test(view.state.doc.line(line.number - 1).text);
}

function dispatch_block_insert(
  view: EditorView,
  block: string,
  cursor_offset: number,
  require_blank_above = false,
): void {
  const caret = view.state.selection.main.head;
  const plan = plan_block_insert(
    {
      caret,
      at_line_start: caret === view.state.doc.lineAt(caret).from,
      next_char: caret < view.state.doc.length ? view.state.doc.sliceString(caret, caret + 1) : '',
      above_blank: above_blank(view, caret),
    },
    block,
    cursor_offset,
    require_blank_above,
  );
  view.dispatch({
    changes: { from: plan.from, insert: plan.insert },
    selection: { anchor: plan.cursor },
    annotations: [Transaction.userEvent.of('input')],
    scrollIntoView: true,
  });
}

// Caret lands on the empty body line between the fences.
export function insert_code_block(view: EditorView): void {
  dispatch_block_insert(view, '```\n\n```', 4);
}

// Caret lands on the empty body line between the delimiters.
export function insert_math_block(view: EditorView): void {
  dispatch_block_insert(view, '$$\n\n$$', 3);
}

// Caret lands on the line below the rule, ready to type. A `---` directly
// under a non-blank line parses as its setext H2 underline, not a rule —
// so this insert alone demands a blank line above.
export function insert_horizontal_rule(view: EditorView): void {
  dispatch_block_insert(view, '---\n', 4, true);
}
