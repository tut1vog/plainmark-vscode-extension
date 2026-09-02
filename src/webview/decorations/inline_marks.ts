import type { SyntaxNode } from '@lezer/common';

// Well-formedness of the inline constructs whose markers hide and snap. A leaf
// module: the handlers (text_styles, links) and the mouseup snap both need it,
// and the handlers already sit downstream of the snap via pointer_state.

// An emphasis-family node's syntax marks: firstChild and lastChild must both be
// the mark with content between them.
export function symmetric_marks(
  node: SyntaxNode,
  mark_name: string,
): { first: SyntaxNode; last: SyntaxNode } | null {
  const first = node.firstChild;
  const last = node.lastChild;
  if (
    !first ||
    !last ||
    first === last ||
    first.name !== mark_name ||
    last.name !== mark_name ||
    first.to >= last.from
  ) {
    return null;
  }
  return { first, last };
}

export function link_marks(node: SyntaxNode): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === 'LinkMark') out.push(c);
  }
  return out;
}

// `[text](url)` — LinkMark `[`, `]`, `(`, …, `)`: the `[` opens the node, the `)`
// closes it, and the bracketed text is non-empty.
export function inline_link_marks(node: SyntaxNode): {
  open: SyntaxNode;
  close_bracket: SyntaxNode;
  open_paren: SyntaxNode;
  close_paren: SyntaxNode;
} | null {
  const marks = link_marks(node);
  if (marks.length < 4) return null;
  const open = marks[0];
  const close_bracket = marks[1];
  const open_paren = marks[2];
  const close_paren = marks[marks.length - 1];
  if (open.from !== node.from || close_paren.to !== node.to) return null;
  if (open.to >= close_bracket.from) return null;
  return { open, close_bracket, open_paren, close_paren };
}
