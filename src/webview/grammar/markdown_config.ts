import type { MarkdownExtension } from '@lezer/markdown';
import { GFM } from '@lezer/markdown';
import { Footnote } from '../decorations/footnote_parser.js';
import { frontmatter_extension } from './frontmatter.js';
import { math_extension } from './math.js';
import { quote_exit_extension } from './quote_exit.js';

// The one grammar list for editor and tests — a reduced grammar reclassifies
// constructs (a `$$` block parses as a paragraph), so every full-parse consumer
// must use this list, not assemble its own.
export const markdown_grammar_extensions: MarkdownExtension = [
  GFM,
  math_extension,
  Footnote,
  frontmatter_extension,
  quote_exit_extension,
  // IndentedCode stays in the grammar as an inert SHIELD (CBLK-E-1): first in
  // parser order it claims every ≥4-indent block start, so `    - x` never
  // activates a construct — but its CodeBlock node gets no chrome and renders
  // as plain text. Other renderers still read the region as code, so
  // transforms must not change blanks adjacent to it (PARA-I-5's indent trap).
];
