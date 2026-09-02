// YAML frontmatter parser for @lezer/markdown. Synthesizes SilverBullet's BlockParser
// (MIT) with retronav/ixora's parseMixed overlay (Apache-2.0) plus Zettlr's `...` closer
// (GPL-3 design reference only — fresh code).
import { type Input, parseMixed } from '@lezer/common';
import { yamlLanguage } from '@codemirror/lang-yaml';
import type {
  BlockContext,
  BlockParser,
  Line,
  MarkdownConfig,
} from '@lezer/markdown';

const OPEN_RE = /^---\s*$/;
const CLOSE_RE = /^(?:---|\.\.\.)\s*$/;

// BlockContext.input is @internal, but a block parser has no public multi-line
// lookahead, and consuming lines before returning false strands the context at
// EOF with every consumed line unparsed.
function closer_below(cx: BlockContext, from: number): boolean {
  const input = (cx as unknown as { input?: Input }).input;
  if (!input) return true;
  let pos = from;
  let carry = '';
  while (pos < input.length) {
    const chunk = input.chunk(pos);
    if (chunk.length === 0) break;
    const text = carry + chunk;
    let start = 0;
    let nl: number;
    while ((nl = text.indexOf('\n', start)) >= 0) {
      if (CLOSE_RE.test(text.slice(start, nl))) return true;
      start = nl + 1;
    }
    carry = text.slice(start);
    pos += chunk.length;
  }
  return CLOSE_RE.test(carry);
}

const frontmatter_block_parser: BlockParser = {
  name: 'FrontMatter',
  before: 'HorizontalRule',
  parse(cx: BlockContext, line: Line): boolean {
    if (cx.parsedPos !== 0) return false;
    if (!OPEN_RE.test(line.text)) return false;

    const open_from = cx.lineStart;
    const open_to = cx.lineStart + line.text.length;
    if (!closer_below(cx, open_to + 1)) return false;

    if (!cx.nextLine()) return false;
    const content_from = cx.lineStart;
    let content_to = cx.lineStart;
    let last_pos = cx.parsedPos;

    while (!CLOSE_RE.test(line.text)) {
      content_to = cx.lineStart + line.text.length;
      // Unreachable after closer_below unless the context fails to advance
      // (ixora's latent crash); kept as the last-resort abort.
      if (!cx.nextLine() || cx.parsedPos === last_pos) return false;
      last_pos = cx.parsedPos;
    }

    const close_from = cx.lineStart;
    const close_to = cx.lineStart + line.text.length;
    cx.nextLine();

    cx.addElement(
      cx.elt('FrontMatter', open_from, close_to, [
        cx.elt('FrontMatterMark', open_from, open_to),
        cx.elt('FrontMatterContent', content_from, content_to),
        cx.elt('FrontMatterMark', close_from, close_to),
      ]),
    );
    return true;
  },
};

const frontmatter_yaml_wrap = parseMixed((node) => {
  if (node.type.name === 'FrontMatter') {
    return {
      parser: yamlLanguage.parser,
      overlay: (child) => child.type.name === 'FrontMatterContent',
    };
  }
  return null;
});

export const frontmatter_extension: MarkdownConfig = {
  defineNodes: [
    { name: 'FrontMatter', block: true },
    'FrontMatterMark',
    'FrontMatterContent',
  ],
  parseBlock: [frontmatter_block_parser],
  wrap: frontmatter_yaml_wrap,
};
