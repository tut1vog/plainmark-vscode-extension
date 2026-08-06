import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode, Tree } from '@lezer/common';
import type { OffsetRange } from '../ranges.js';

const dollar_sign = '$'.charCodeAt(0);

// Textual mirror of grammar/math.ts `opens_block_math` for top-level lines
// (nested list/quote contexts are out of scope).
const fence_re = /^ {0,3}\$\$/;

// Textual mirror of the grammar's eager single-line `$$…$$` check: such a line
// is a complete block on its own and never opens a region.
function is_self_contained(text: string): boolean {
  const indent = text.length - text.trimStart().length;
  const trimmed_len = text.replace(/\s+$/, '').length;
  return (
    trimmed_len >= indent + 5 &&
    text.charCodeAt(trimmed_len - 1) === dollar_sign &&
    text.charCodeAt(trimmed_len - 2) === dollar_sign
  );
}

// MATH-E-7: dollars inside code constructs are literal text, never fences.
function inside_code(tree: Tree, pos: number): boolean {
  for (
    let node: SyntaxNode | null = tree.resolveInner(pos, 1);
    node;
    node = node.parent
  ) {
    if (node.name === 'FencedCode' || node.name === 'CodeBlock') return true;
  }
  return false;
}

const cache = new WeakMap<Tree, readonly OffsetRange[]>();

// Closed `$$` … `$$` fence pairs found textually, independent of whether the
// grammar formed a BlockMath node. When a blank line dissolves a block into
// paragraphs (MATH-E-12 — e.g. the transient state right after Enter inside a
// block), the content gets inline-parsed as markdown and marker-hiding mangles
// the math source (`\\` displays as `\`). These regions gate inline decoration
// off so the raw source stays byte-accurate. Regions coinciding with a real
// BlockMath are harmless no-ops (its content has no inline nodes), and an
// unpaired opener yields no region, preserving MATH-E-6 behavior below it.
export function closed_math_fence_regions(
  state: EditorState,
): readonly OffsetRange[] {
  const tree = syntaxTree(state);
  const cached = cache.get(tree);
  if (cached) return cached;

  const regions: OffsetRange[] = [];
  let open_from = -1;
  let pos = 0;
  const iter = state.doc.iterLines();
  for (iter.next(); !iter.done; iter.next()) {
    const text = iter.value;
    const from = pos;
    pos += text.length + 1;
    if (!fence_re.test(text)) continue;
    if (inside_code(tree, from)) continue;
    if (open_from < 0) {
      if (is_self_contained(text)) continue;
      open_from = from;
    } else {
      // Inside an open fence, any `$$`-prefixed line closes it (mirrors the
      // leaf parser's nextLine), including a `$$x$$`-shaped line.
      regions.push({ from: open_from, to: from + text.length });
      open_from = -1;
    }
  }
  cache.set(tree, regions);
  return regions;
}
