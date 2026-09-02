import type { SyntaxNode } from '@lezer/common';

// Nearest node named `name` on the path from `node` (inclusive) to the root.
export function enclosing(node: SyntaxNode | null, name: string): SyntaxNode | null {
  for (let n = node; n; n = n.parent) if (n.name === name) return n;
  return null;
}

// Nearest strict ancestor of `node` named `name`.
export function ancestor(node: SyntaxNode, name: string): SyntaxNode | null {
  return enclosing(node.parent, name);
}

// Strict ancestors of `node` named `name`; the walk stops short of the first
// ancestor named `stop`, so nesting counts do not cross that container.
export function count_ancestors(node: SyntaxNode, name: string, stop?: string): number {
  let count = 0;
  for (let p = node.parent; p; p = p.parent) {
    if (p.name === stop) break;
    if (p.name === name) count++;
  }
  return count;
}
