// Footnote parsing extension for `@lezer/markdown`. Adapted from
// `lezer-markdown-obsidian@0.0.3` (MIT, Eryk Walder,
// https://github.com/erykwalder/lezer-markdown-obsidian) with node naming
// changed to the CommonMark / mdast convention (FootnoteReference inline,
// FootnoteDefinition block). Re-targeted from `@lezer/markdown@^0.15` to
// `@lezer/markdown@1.6.3`.
import type {
  BlockContext, BlockParser, InlineContext, InlineParser,
  LeafBlock, LeafBlockParser, Line, MarkdownConfig,
} from '@lezer/markdown';

// `[^label]:` definition head; label is 1+ chars, no whitespace, no brackets.
export const DEFINITION_HEAD_RE = /^\[\^([^\s[\]]+)\]:/;
// `[^label]` reference prefix (no colon); captures the label.
const REFERENCE_RE = /^\[\^([^\s[\]]+)\]/;
// `[^label]` reference, whole-string anchored (the slice is exactly the token).
export const REFERENCE_EXACT_RE = /^\[\^([^\s[\]]+)\]$/;
// Strips the `[^label]: ` definition prefix, including the optional space.
export const DEFINITION_HEAD_STRIP_RE = /^\[\^[^\s[\]]+\]:\s?/;

// Upper bound for the head slice when extracting a label from a `[^label]`
// prefix — far longer than any realistic label, so the regex always resolves.
export const FOOTNOTE_HEAD_SLICE = 256;

export function parse_footnote_label(text: string): string | null {
  const m = REFERENCE_RE.exec(text);
  return m ? m[1] : null;
}

class FootnoteDefinitionParser implements LeafBlockParser {
  constructor(
    private readonly label_end: number,
    private readonly body_start: number,
  ) {}

  nextLine(_cx: BlockContext, _line: Line, _leaf: LeafBlock): boolean {
    // Always accumulate; termination is driven by `endLeaf` (a new def head)
    // or by a blank line / EOF. Returning `true` here would abandon the
    // leaf without calling `finish` (lezer-markdown source dist/index.js:799).
    return false;
  }

  finish(cx: BlockContext, leaf: LeafBlock): boolean {
    const body_text = leaf.content.slice(this.body_start - leaf.start);
    cx.addLeafElement(
      leaf,
      cx.elt('FootnoteDefinition', leaf.start, leaf.start + leaf.content.length, [
        cx.elt('FootnoteLabel', leaf.start, this.label_end),
        ...cx.parser.parseInline(body_text, this.body_start),
      ]),
    );
    return true;
  }
}

const footnote_definition_block_parser: BlockParser = {
  name: 'FootnoteDefinition',
  leaf(_cx, leaf): LeafBlockParser | null {
    const match = DEFINITION_HEAD_RE.exec(leaf.content);
    if (!match) return null;
    const label_end = leaf.start + match[0].length;
    // Skip the single space after `:` if present (markdown-it convention).
    const body_start = leaf.content.charCodeAt(match[0].length) === 0x20
      ? label_end + 1
      : label_end;
    return new FootnoteDefinitionParser(label_end, body_start);
  },
  // Must beat the default LinkReference parser, which would otherwise consume
  // `[^x]: text` as LinkReference(LinkLabel="[^x]", URL="text").
  before: 'LinkReference',
  // Terminate the current leaf when a new definition head begins on the next
  // line — this routes through `finishLeaf` so `finish()` actually fires.
  // Without this, stacked `[^a]: ...\n[^b]: ...` lines would all be absorbed
  // into a single paragraph leaf and only the last would be emitted (via
  // blank-line / EOF termination).
  endLeaf(_cx, line) {
    return DEFINITION_HEAD_RE.test(line.text.slice(line.pos));
  },
};

const footnote_reference_inline_parser: InlineParser = {
  name: 'FootnoteReference',
  parse(cx: InlineContext, next: number, pos: number): number {
    if (next !== 0x5B /* '[' */) return -1;
    if (cx.char(pos + 1) !== 0x5E /* '^' */) return -1;
    const match = REFERENCE_RE.exec(cx.slice(pos, cx.end));
    if (!match) return -1;
    const end = pos + match[0].length;
    return cx.addElement(
      cx.elt('FootnoteReference', pos, end, [
        cx.elt('FootnoteMark', pos, pos + 2),
        cx.elt('FootnoteLabel', pos + 2, end - 1),
        cx.elt('FootnoteMark', end - 1, end),
      ]),
    );
  },
  // Must beat the default Link parser so `[^…]` never opens a Link delimiter.
  before: 'Link',
};

export const Footnote: MarkdownConfig = {
  defineNodes: [
    { name: 'FootnoteDefinition', block: true },
    { name: 'FootnoteReference' },
    { name: 'FootnoteLabel' },
    { name: 'FootnoteMark' },
  ],
  parseBlock: [footnote_definition_block_parser],
  parseInline: [footnote_reference_inline_parser],
};
