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
  // Fenced-only dialect: without IndentedCode a ≥4-indent line behind a blank
  // parses as whatever its content starts (list, quote, heading, fence, HR, or
  // paragraph) — other renderers still read it as code, so transforms must not
  // change blanks adjacent to indent-led lines (PARA-I-5's indent trap).
  { remove: ['IndentedCode'] },
];
