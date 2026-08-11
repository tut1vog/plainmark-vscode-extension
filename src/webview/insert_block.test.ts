import { describe, expect, it } from 'vitest';
import { plan_block_insert } from './insert_block.js';

const CODE_BLOCK = '```\n\n```';

describe('CTX-I-10 plan_block_insert', () => {
  it('at the start of an empty line: no prefix, no suffix, cursor inside the block', () => {
    const plan = plan_block_insert(
      { caret: 6, at_line_start: true, next_char: '', above_blank: true },
      CODE_BLOCK,
      4,
    );
    expect(plan).toEqual({ from: 6, insert: '```\n\n```', cursor: 10 });
  });

  it('mid-line at end of line: newline prefix pushes the block to a fresh line', () => {
    const plan = plan_block_insert(
      { caret: 5, at_line_start: false, next_char: '\n', above_blank: false },
      CODE_BLOCK,
      4,
    );
    expect(plan).toEqual({ from: 5, insert: '\n```\n\n```', cursor: 10 });
  });

  it('mid-line with text after the caret: newline on both sides splits the line', () => {
    const plan = plan_block_insert(
      { caret: 5, at_line_start: false, next_char: 'w', above_blank: false },
      CODE_BLOCK,
      4,
    );
    expect(plan).toEqual({ from: 5, insert: '\n```\n\n```\n', cursor: 10 });
  });

  it('line start with text at the caret: block lands above, suffix newline keeps the text on its own line', () => {
    const plan = plan_block_insert(
      { caret: 0, at_line_start: true, next_char: 'h', above_blank: true },
      '---\n',
      4,
      true,
    );
    expect(plan).toEqual({ from: 0, insert: '---\n\n', cursor: 4 });
  });

  it('horizontal rule at end of doc: trailing newline gives the cursor a line below the rule', () => {
    const plan = plan_block_insert(
      { caret: 12, at_line_start: false, next_char: '', above_blank: true },
      '---\n',
      4,
      true,
    );
    expect(plan).toEqual({ from: 12, insert: '\n---\n', cursor: 17 });
  });

  it('math block cursor offset lands between the delimiters', () => {
    const plan = plan_block_insert(
      { caret: 0, at_line_start: true, next_char: '', above_blank: true },
      '$$\n\n$$',
      3,
    );
    expect(plan.cursor).toBe(3);
    expect(plan.insert).toBe('$$\n\n$$');
  });
});

describe('CTX-I-10 horizontal rule demands a blank line above (setext guard)', () => {
  it('mid-line after non-blank text: doubles the prefix newline', () => {
    // 'abc|' → 'abc\n\n---\n' — a single \n would make --- a setext H2 of abc.
    const plan = plan_block_insert(
      { caret: 3, at_line_start: false, next_char: '', above_blank: false },
      '---\n',
      4,
      true,
    );
    expect(plan).toEqual({ from: 3, insert: '\n\n---\n', cursor: 9 });
  });

  it('line start directly under non-blank text: inserts the missing blank line', () => {
    // 'abc\n|def' → 'abc\n\n---\ndef'.
    const plan = plan_block_insert(
      { caret: 4, at_line_start: true, next_char: 'd', above_blank: false },
      '---\n',
      4,
      true,
    );
    expect(plan).toEqual({ from: 4, insert: '\n---\n\n', cursor: 9 });
  });

  it('leaves the prefix alone when a blank line is already above', () => {
    const plan = plan_block_insert(
      { caret: 5, at_line_start: true, next_char: '', above_blank: true },
      '---\n',
      4,
      true,
    );
    expect(plan).toEqual({ from: 5, insert: '---\n', cursor: 9 });
  });

  it('does not affect blocks that may interrupt a paragraph (code block)', () => {
    const plan = plan_block_insert(
      { caret: 3, at_line_start: false, next_char: '', above_blank: false },
      CODE_BLOCK,
      4,
    );
    expect(plan).toEqual({ from: 3, insert: '\n```\n\n```', cursor: 8 });
  });
});
