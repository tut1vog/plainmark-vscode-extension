// Position-agnostic structural tree comparator for metamorphic tests.
//
// `compareTree` requires identical byte positions; the metamorphic
// properties (CRLF↔LF, trailing whitespace, extra blank lines) shift byte
// positions but should leave the node-type structure intact. This walker
// matches node-type sequences in pre-order, ignoring positions entirely.

import type { Tree } from '@lezer/common';

export interface StructuralDiff {
  ok: boolean;
  mismatch?: string;
}

export function structurally_equal(a: Tree, b: Tree): StructuralDiff {
  const curA = a.cursor();
  const curB = b.cursor();
  for (;;) {
    if (curA.type != curB.type) {
      return {
        ok: false,
        mismatch: `node type mismatch: ${curA.name} vs ${curB.name}`,
      };
    }
    const nextA = curA.next();
    const nextB = curB.next();
    if (nextA !== nextB) {
      return {
        ok: false,
        mismatch: `tree size mismatch (at ${curA.name}): ${nextA ? 'a' : 'b'} ran out first`,
      };
    }
    if (!nextA) return { ok: true };
  }
}
