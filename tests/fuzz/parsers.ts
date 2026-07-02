// Lezer-markdown parser configurations for the fuzz suite.
//
// `gfm_parser` is the CommonMark + GFM parser — enough for the spec corpus
// drivers in `spec-corpus.test.ts` (the CommonMark and cmark-gfm corpora are
// pure CommonMark + GFM). Plainmark's full parser (math + footnote +
// frontmatter on top) is reserved for later fuzz tasks that exercise
// constructs unique to Plainmark.

import { GFM, parser as base_parser } from '@lezer/markdown';

export const gfm_parser = base_parser.configure(GFM);
