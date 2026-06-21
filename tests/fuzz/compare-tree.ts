// Cursor-parallel tree comparator — clones lezer-markdown's
// test/compare-tree.ts verbatim (MIT). Throws on the first node type or
// position mismatch, or on tree-shape mismatch. Used by the spec-corpus
// crash test (T28.2) to verify incremental and full parses produce
// identical trees.

import type { Tree } from '@lezer/common';

export function compareTree(a: Tree, b: Tree): void {
  const curA = a.cursor();
  const curB = b.cursor();
  for (;;) {
    let mismatch: string | null = null;
    let next = false;
    if (curA.type != curB.type)
      mismatch = `Node type mismatch (${curA.name} vs ${curB.name})`;
    else if (curA.from != curB.from)
      mismatch = `Start pos mismatch for ${curA.name}: ${curA.from} vs ${curB.from}`;
    else if (curA.to != curB.to)
      mismatch = `End pos mismatch for ${curA.name}: ${curA.to} vs ${curB.to}`;
    else if ((next = curA.next()) != curB.next()) mismatch = `Tree size mismatch`;
    if (mismatch) throw new Error(`${mismatch}\n  ${a}\n  ${b}`);
    if (!next) break;
  }
}
