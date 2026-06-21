// YAML frontmatter parser for @lezer/markdown. Synthesizes SilverBullet's BlockParser
// (MIT) with retronav/ixora's parseMixed overlay (Apache-2.0) plus Zettlr's `...` closer
// (GPL-3 design reference only — fresh code).
import { parseMixed } from '@lezer/common';
import { yamlLanguage } from '@codemirror/lang-yaml';
import type {
  BlockContext,
  BlockParser,
  Line,
  MarkdownConfig,
} from '@lezer/markdown';

const OPEN_RE = /^---\s*$/;
const CLOSE_RE = /^(?:---|\.\.\.)\s*$/;

const frontmatter_block_parser: BlockParser = {
  name: 'FrontMatter',
  before: 'HorizontalRule',
  parse(cx: BlockContext, line: Line): boolean {
    if (cx.parsedPos !== 0) return false;
    if (!OPEN_RE.test(line.text)) return false;

    const open_from = cx.lineStart;
    const open_to = cx.lineStart + line.text.length;

    if (!cx.nextLine()) return false;
    const content_from = cx.lineStart;
    let content_to = cx.lineStart;
    let last_pos = cx.parsedPos;

    while (!CLOSE_RE.test(line.text)) {
      content_to = cx.lineStart + line.text.length;
      // Unclosed-frontmatter abort: cx.nextLine() returns false at EOF; the
      // identity check catches the degenerate case where it returns true but
      // does not advance (defends against ixora's latent crash).
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
