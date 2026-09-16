import type { Line, MarkdownConfig } from '@lezer/markdown';

// Up to nine digits, `.` or `)`, whitespace, then content. An empty item
// still cannot interrupt.
const ORDERED_ITEM_RE = /^\d{1,9}[.)][ \t]+\S/;

// House divergence from CommonMark §5.3: an ordered item starts a list even
// when it directly follows a paragraph line and its number is not 1 — an
// author who writes `5.` under a line of prose means a list, not prose that
// happens to begin with a number. Ending the leaf here hands the line to
// lezer's own OrderedList parser, which is not number-gated outside of
// interruption. Indented lines never reach endLeaf hooks, so the indent shield
// still holds.
const ordered_list_interrupt_parser = {
  name: 'OrderedListInterrupt',
  endLeaf(_cx: unknown, line: Line): boolean {
    return ORDERED_ITEM_RE.test(line.text.slice(line.pos));
  },
};

export const ordered_list_interrupt_extension: MarkdownConfig = {
  parseBlock: [ordered_list_interrupt_parser],
};
