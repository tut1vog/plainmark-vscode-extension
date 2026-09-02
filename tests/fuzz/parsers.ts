// The parser under fuzz: Plainmark's full grammar (GFM + math + footnote +
// frontmatter + quote-exit), the same list the editor loads. Fuzzing base GFM
// would miss the extensions' own block/inline parsers — and a reduced grammar
// reclassifies constructs, so the CommonMark corpus must go through this one.

import { parser as base_parser } from '@lezer/markdown';
import { markdown_grammar_extensions } from '../../src/webview/grammar/markdown_config.js';

export const plainmark_parser = base_parser.configure(markdown_grammar_extensions);
