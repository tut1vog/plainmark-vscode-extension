import { Text } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { split_selection_range_by_line } from './clipped_selection.js';

// `ddfd\nd` — line 1 [0,4], line 2 [5,6].
const SHORT = Text.of(['ddfd', 'd']);
// Three lines, middle one blank — line 1 [0,2] `ab`, line 2 [3,3] ``, line 3 [4,6] `cd`.
const BLANK_MID = Text.of(['ab', '', 'cd']);

describe('SHELL-X-10: split_selection_range_by_line', () => {
  it('returns no segments for an empty range', () => {
    expect(split_selection_range_by_line(SHORT, 2, 2)).toEqual([]);
  });

  it('keeps a single-line range intact (both ends clip to text coords downstream)', () => {
    expect(split_selection_range_by_line(SHORT, 1, 3)).toEqual([{ from: 1, to: 3 }]);
  });

  it('clips each line of a multi-line selection to its own text end', () => {
    // Select from line-1 start through into line 2: first line ends at its text
    // end (4), not full width; last line clips to the actual `to`.
    expect(split_selection_range_by_line(SHORT, 0, 6)).toEqual([
      { from: 0, to: 4 },
      { from: 5, to: 6 },
    ]);
  });

  it('drops a final empty segment when the selection ends at a line break', () => {
    // `to` lands exactly at line-2 start (5): line 2 gets no rectangle.
    expect(split_selection_range_by_line(SHORT, 0, 5)).toEqual([{ from: 0, to: 4 }]);
  });

  it('keeps an empty segment for an interior blank line (forRange paints a stub)', () => {
    expect(split_selection_range_by_line(BLANK_MID, 0, 6)).toEqual([
      { from: 0, to: 2 },
      { from: 3, to: 3 },
      { from: 4, to: 6 },
    ]);
  });

  it('clips the first line when the selection starts mid-line', () => {
    expect(split_selection_range_by_line(BLANK_MID, 1, 5)).toEqual([
      { from: 1, to: 2 },
      { from: 3, to: 3 },
      { from: 4, to: 5 },
    ]);
  });
});
