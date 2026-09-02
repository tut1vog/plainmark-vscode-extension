// Vendored from https://github.com/davidmyersdev/ink-mde/blob/main/plugins/katex/grammar.ts (MIT).
// Block + inline halves. Inline rule is permissive (Typora-style): any pair of `$` on the same
// line is math; users escape literal dollar signs with `\$`. `\$` outside math is consumed by
// lezer-markdown's built-in `Escape` parser before our rule sees the `$`, so prose dollars like
// `\$5.00` never trigger math.
import type { SyntaxNode } from '@lezer/common';
import type {
  BlockContext,
  InlineContext,
  LeafBlock,
  LeafBlockParser,
  Line,
  MarkdownConfig,
} from '@lezer/markdown';

const dollar_sign = '$'.charCodeAt(0);

function opens_block_math(line: Line): boolean {
  return (
    line.next === dollar_sign &&
    line.text.charCodeAt(line.pos + 1) === dollar_sign
  );
}

function leaf_is_block_math(leaf: LeafBlock): boolean {
  return (
    leaf.content.charCodeAt(0) === dollar_sign &&
    leaf.content.charCodeAt(1) === dollar_sign
  );
}

// Multi-line `$$` blocks defer to a leaf parser so an unclosed opener falls back to a
// Paragraph (finish → false) instead of swallowing the rest of the document; a block
// forms only once a closing `$$` line is seen. A blank line ends the leaf before its
// close, so blank-line-spanning math is not supported.
class BlockMathLeafParser implements LeafBlockParser {
  nextLine(cx: BlockContext, line: Line, leaf: LeafBlock): boolean {
    if (!opens_block_math(line)) return false;
    const close_mark_start = cx.lineStart + line.pos;
    cx.nextLine();
    const close_mark_end = cx.prevLineEnd();
    cx.addLeafElement(
      leaf,
      cx.elt('BlockMath', leaf.start, close_mark_end, [
        cx.elt('BlockMathMark', leaf.start, leaf.start + 2),
        cx.elt('BlockMathMark', close_mark_start, close_mark_end),
      ]),
    );
    return true;
  }
  finish(): boolean {
    return false;
  }
}

const math_block_parser = {
  name: 'BlockMath',
  // A `$$` opener must interrupt an open paragraph/leaf block (MATH-E-11); without
  // this hook the lezer Paragraph parser absorbs the `$$` line as lazy continuation.
  // But when the open block is itself a `$$` block, this `$$` line is its close — let
  // the leaf parser's nextLine claim it rather than ending the leaf here.
  endLeaf(_cx: BlockContext, line: Line, leaf: LeafBlock): boolean {
    return opens_block_math(line) && !leaf_is_block_math(leaf);
  },
  // Eager path handles only the self-contained same-line `$$<content>$$`; multi-line
  // openers return false and are picked up by the leaf parser below.
  parse(cx: BlockContext, line: Line): boolean {
    if (!opens_block_math(line)) return false;

    const trimmed_len = line.text.replace(/\s+$/, '').length;
    if (
      trimmed_len >= line.pos + 5 &&
      line.text.charCodeAt(trimmed_len - 1) === dollar_sign &&
      line.text.charCodeAt(trimmed_len - 2) === dollar_sign
    ) {
      const open_mark_start = cx.lineStart + line.pos;
      const open_mark_end = open_mark_start + 2;
      const close_mark_end = cx.lineStart + trimmed_len;
      const close_mark_start = close_mark_end - 2;
      cx.addElement(
        cx.elt('BlockMath', open_mark_start, close_mark_end, [
          cx.elt('BlockMathMark', open_mark_start, open_mark_end),
          cx.elt('BlockMathMark', close_mark_start, close_mark_end),
        ]),
      );
      cx.nextLine();
      return true;
    }
    return false;
  },
  leaf(_cx: BlockContext, leaf: LeafBlock): LeafBlockParser | null {
    return leaf_is_block_math(leaf) ? new BlockMathLeafParser() : null;
  },
};

const backtick = '`'.charCodeAt(0);
const backslash = '\\'.charCodeAt(0);
const newline = '\n'.charCodeAt(0);

function run_length(text: string, i: number, code: number): number {
  let n = 0;
  while (text.charCodeAt(i + n) === code) n++;
  return n;
}

// Start of the next backtick run of exactly `n` backticks at or after `from`, or -1.
function find_backtick_run(text: string, from: number, n: number): number {
  for (let j = from; j < text.length; j++) {
    if (text.charCodeAt(j) !== backtick) continue;
    const m = run_length(text, j, backtick);
    if (m === n) return j;
    j += m - 1;
  }
  return -1;
}

// End (exclusive) of the inline math opened by the `$` at `pos`, or -1. A `\`
// escapes the next char so `\$` is content (MATH-E-3); a backtick run skips to
// its matching run so a `$` inside a code span never closes (MATH-E-7); the
// math never crosses a line break and needs at least one content char.
function inline_math_end(text: string, pos: number): number {
  let i = pos + 1;
  while (i < text.length) {
    const c = text.charCodeAt(i);
    if (c === newline) return -1;
    if (c === backslash) {
      if (text.charCodeAt(i + 1) === newline) return -1;
      i += 2;
      continue;
    }
    if (c === backtick) {
      const n = run_length(text, i, backtick);
      const close = find_backtick_run(text, i + n, n);
      if (close < 0) {
        i += n;
        continue;
      }
      const nl = text.indexOf('\n', i);
      if (nl >= 0 && nl < close) return -1;
      i = close + n;
      continue;
    }
    if (c === dollar_sign) return i > pos + 1 ? i + 1 : -1;
    i++;
  }
  return -1;
}

const math_inline_parser = {
  name: 'InlineMath',
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== dollar_sign) return -1;
    // `$$` only delimits math at line start (MATH-E-4); a mid-line run stays
    // literal and parsing resumes after it, so it can neither open inline math
    // as `$` + `$x` nor leave a stray `$` to pair with later prose (MATH-E-15).
    if (cx.char(pos + 1) === dollar_sign) return pos + run_length(cx.slice(pos, cx.end), 0, dollar_sign);
    const end = inline_math_end(cx.slice(pos, cx.end), 0);
    if (end < 0) return -1;
    return cx.addElement(
      cx.elt('InlineMath', pos, pos + end, [
        cx.elt('InlineMathMark', pos, pos + 1),
        cx.elt('InlineMathMark', pos + end - 1, pos + end),
      ]),
    );
  },
};

export const math_extension: MarkdownConfig = {
  defineNodes: [
    { name: 'BlockMath', block: true },
    { name: 'BlockMathMark' },
    { name: 'InlineMath' },
    { name: 'InlineMathMark' },
  ],
  parseBlock: [math_block_parser],
  parseInline: [math_inline_parser],
};

// Nearest InlineMath or BlockMath on the path from `node` to the root.
export function enclosing_math(node: SyntaxNode | null): SyntaxNode | null {
  for (let n = node; n; n = n.parent) {
    if (n.name === 'InlineMath' || n.name === 'BlockMath') return n;
  }
  return null;
}
