import type { BlockContext, LeafBlock, Line, MarkdownConfig } from '@lezer/markdown';

const dollar_sign = '$'.charCodeAt(0);

// The parser's context-match cursor: index of the first stack context whose
// markup this line does not carry (stack[0] is Document, so a fully matched
// line reports the stack length). Core to lezer's block loop but absent from
// the public typings; @lezer/markdown is pinned.
function matched_context_depth(line: Line): number {
  return (line as unknown as { depth: number }).depth;
}

// Under the hard-newline break model (PARA-E-5) a single `\n` already ends the
// paragraph, so CommonMark §5.1 laziness — defined only over "paragraph
// continuation text" — has nothing to continue across a quote boundary: a line
// missing the `>` of an enclosing quote ends the open leaf, the unmatched
// quote levels close, and the line reparses outside them (BQ-E-1). Firing only
// when an UNMATCHED context is a Blockquote keeps list laziness intact
// (`- a\nb`, `> - a\n> b`). An open `$$` leaf is exempt so quote-nested
// display math keeps its lazy forms (MATH-E-13); indented lines never reach
// endLeaf hooks (lezer consults them only below the code-indent bound), so
// `> a\n    b` still absorbs (BQ-E-12).
const quote_exit_parser = {
  name: 'QuoteExit',
  endLeaf(cx: BlockContext, line: Line, leaf: LeafBlock): boolean {
    if (cx.depth <= 1) return false;
    if (
      leaf.content.charCodeAt(0) === dollar_sign &&
      leaf.content.charCodeAt(1) === dollar_sign
    ) {
      return false;
    }
    for (let depth = matched_context_depth(line); depth < cx.depth; depth++) {
      if (cx.parentType(depth).name === 'Blockquote') return true;
    }
    return false;
  },
};

export const quote_exit_extension: MarkdownConfig = {
  parseBlock: [quote_exit_parser],
};
