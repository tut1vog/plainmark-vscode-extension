import { describe, expect, it } from 'vitest';
import { plan_block_insert } from './insert_block.js';

const CODE_BLOCK = '```\n\n```';

describe('CTX-I-10 plan_block_insert', () => {
  it('at the start of an empty line: no prefix, no suffix, cursor inside the block', () => {
    const plan = plan_block_insert(
      { caret: 6, at_line_start: true, next_char: '' },
      CODE_BLOCK,
      4,
    );
    expect(plan).toEqual({ from: 6, insert: '```\n\n```', cursor: 10 });
  });

  it('mid-line at end of line: newline prefix pushes the block to a fresh line', () => {
    const plan = plan_block_insert(
      { caret: 5, at_line_start: false, next_char: '\n' },
      CODE_BLOCK,
      4,
    );
    expect(plan).toEqual({ from: 5, insert: '\n```\n\n```', cursor: 10 });
  });

  it('mid-line with text after the caret: newline on both sides splits the line', () => {
    const plan = plan_block_insert(
      { caret: 5, at_line_start: false, next_char: 'w' },
      CODE_BLOCK,
      4,
    );
    expect(plan).toEqual({ from: 5, insert: '\n```\n\n```\n', cursor: 10 });
  });

  it('line start with text at the caret: block lands above, suffix newline keeps the text on its own line', () => {
    const plan = plan_block_insert(
      { caret: 0, at_line_start: true, next_char: 'h' },
      '---\n',
      4,
    );
    expect(plan).toEqual({ from: 0, insert: '---\n\n', cursor: 4 });
  });

  it('horizontal rule at end of doc: trailing newline gives the cursor a line below the rule', () => {
    const plan = plan_block_insert(
      { caret: 12, at_line_start: false, next_char: '' },
      '---\n',
      4,
    );
    expect(plan).toEqual({ from: 12, insert: '\n---\n', cursor: 17 });
  });

  it('math block cursor offset lands between the delimiters', () => {
    const plan = plan_block_insert(
      { caret: 0, at_line_start: true, next_char: '' },
      '$$\n\n$$',
      3,
    );
    expect(plan.cursor).toBe(3);
    expect(plan.insert).toBe('$$\n\n$$');
  });
});
