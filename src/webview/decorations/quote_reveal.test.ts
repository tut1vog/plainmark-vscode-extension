import { markdown } from '@codemirror/lang-markdown';
import { EditorSelection, EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import {
  frozen_reveal_selection_field,
  set_frozen_reveal_selection,
} from './pointer_state.js';
import { line_revealed } from './quote_reveal.js';

// `> a\n> b`: line 1 spans [0, 3] (content `a` at 2), line 2 spans [4, 7].
const LINE_A = { from: 0, to: 3 };
const LINE_B = { from: 4, to: 7 };

function make_state(caret: number): EditorState {
  return EditorState.create({
    doc: '> a\n> b',
    extensions: [markdown({ extensions: [GFM] }), frozen_reveal_selection_field],
    selection: EditorSelection.single(caret),
  });
}

describe('BQ-R-2 BQ-I-11 BQ-I-12: line_revealed', () => {
  it('reveals only the caret line when no pointer is held (live selection)', () => {
    const state = make_state(6); // caret on line B
    expect(line_revealed(state, LINE_A.from, LINE_A.to)).toBe(false);
    expect(line_revealed(state, LINE_B.from, LINE_B.to)).toBe(true);
  });

  it('freezes reveal to the pre-press selection while a pointer is held, ignoring the live caret', () => {
    // Live caret moved to line B, but the pre-press selection was on line A.
    const state = make_state(6).update({
      effects: set_frozen_reveal_selection.of(EditorSelection.single(2)),
    }).state;
    // Frozen wins: line A stays revealed, line B stays hidden — the live caret
    // at B does not reveal B until the press is released.
    expect(line_revealed(state, LINE_A.from, LINE_A.to)).toBe(true);
    expect(line_revealed(state, LINE_B.from, LINE_B.to)).toBe(false);
  });

  it('returns to the live selection once the frozen selection is cleared on release', () => {
    const state = make_state(6)
      .update({ effects: set_frozen_reveal_selection.of(EditorSelection.single(2)) })
      .state.update({ effects: set_frozen_reveal_selection.of(null) }).state;
    expect(line_revealed(state, LINE_A.from, LINE_A.to)).toBe(false);
    expect(line_revealed(state, LINE_B.from, LINE_B.to)).toBe(true);
  });
});
