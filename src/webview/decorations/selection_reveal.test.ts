import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import {
  frozen_reveal_selection_field,
  pointer_down_field,
  set_frozen_reveal_selection,
  set_pointer_down,
} from './pointer_state.js';
import { should_reveal_for_selection } from './selection_reveal.js';

function state_with_selection(anchor: number, head: number = anchor): EditorState {
  return EditorState.create({
    doc: 'x **bold** y\nzz\n',
    selection: { anchor, head },
    extensions: [frozen_reveal_selection_field],
  });
}

// Simulate an in-progress press: the live selection has already moved to
// `live`, but `frozen` holds the pre-press selection the reveal must freeze to.
function state_during_press(
  live: { anchor: number; head?: number },
  frozen: { anchor: number; head?: number },
): EditorState {
  const base = state_with_selection(live.anchor, live.head ?? live.anchor);
  return base.update({
    effects: set_frozen_reveal_selection.of(
      EditorSelection.single(frozen.anchor, frozen.head ?? frozen.anchor),
    ),
  }).state;
}

// Construct boundaries for `**bold**` in 'x **bold** y\nzz\n':
//   node.from = 2, node.to = 10
const NODE_FROM = 2;
const NODE_TO = 10;

describe('should_reveal_for_selection MRS-R-2 MRS-R-3 MRS-R-4 MRS-R-5 MRS-P-1 MRS-P-2 MRS-P-5', () => {
  describe('empty caret', () => {
    it('reveals when caret is inside the construct', () => {
      const state = state_with_selection(5);
      expect(should_reveal_for_selection(state, NODE_FROM, NODE_TO)).toBe(true);
    });

    it('reveals when caret touches the opening boundary', () => {
      const state = state_with_selection(NODE_FROM);
      expect(should_reveal_for_selection(state, NODE_FROM, NODE_TO)).toBe(true);
    });

    it('reveals when caret touches the closing boundary', () => {
      const state = state_with_selection(NODE_TO);
      expect(should_reveal_for_selection(state, NODE_FROM, NODE_TO)).toBe(true);
    });

    it('does not reveal when caret is outside the construct', () => {
      const state = state_with_selection(0);
      expect(should_reveal_for_selection(state, NODE_FROM, NODE_TO)).toBe(false);
    });
  });

  describe('non-empty selection (pointer up)', () => {
    it('hides when the selection strictly extends past on both sides', () => {
      const state = state_with_selection(0, 12);
      expect(should_reveal_for_selection(state, NODE_FROM, NODE_TO)).toBe(false);
    });

    it('reveals when selection equals construct boundaries exactly', () => {
      const state = state_with_selection(NODE_FROM, NODE_TO);
      expect(should_reveal_for_selection(state, NODE_FROM, NODE_TO)).toBe(true);
    });

    it('reveals when selection extends past on left only (ends at closing boundary)', () => {
      const state = state_with_selection(0, NODE_TO);
      expect(should_reveal_for_selection(state, NODE_FROM, NODE_TO)).toBe(true);
    });

    it('reveals when selection extends past on right only (starts at opening boundary)', () => {
      const state = state_with_selection(NODE_FROM, 12);
      expect(should_reveal_for_selection(state, NODE_FROM, NODE_TO)).toBe(true);
    });

    it('reveals when selection is strictly inside the construct', () => {
      const state = state_with_selection(5, 7);
      expect(should_reveal_for_selection(state, NODE_FROM, NODE_TO)).toBe(true);
    });

    it('does not reveal when selection is disjoint from the construct', () => {
      const state = state_with_selection(13, 15);
      expect(should_reveal_for_selection(state, NODE_FROM, NODE_TO)).toBe(false);
    });
  });

  // MRS-P-1/P-2: while the pointer is down the predicate runs against the frozen
  // pre-press selection, so reveal neither flips on press nor on mid-drag motion;
  // it lands only when mouseup clears the frozen field and the live selection
  // takes over.
  describe('pointer-down freeze', () => {
    it('keeps a revealed construct revealed when the live caret moves away mid-press', () => {
      const state = state_during_press({ anchor: 0 }, { anchor: 5 });
      expect(should_reveal_for_selection(state, NODE_FROM, NODE_TO)).toBe(true);
    });

    it('keeps a hidden construct hidden when the live caret moves inside mid-press', () => {
      const state = state_during_press({ anchor: 5 }, { anchor: 0 });
      expect(should_reveal_for_selection(state, NODE_FROM, NODE_TO)).toBe(false);
    });

    it('does not reveal while a drag grows into the construct from outside', () => {
      const state = state_during_press({ anchor: 0, head: 5 }, { anchor: 0 });
      expect(should_reveal_for_selection(state, NODE_FROM, NODE_TO)).toBe(false);
    });

    it('keeps a construct revealed while a drag started inside it grows outward', () => {
      const state = state_during_press({ anchor: 5, head: 12 }, { anchor: 5 });
      expect(should_reveal_for_selection(state, NODE_FROM, NODE_TO)).toBe(true);
    });

    // Table cell activation: the subview seeds pointer_down without a frozen
    // selection (no off-construct caret exists in a single-construct cell), so a
    // pressed-but-unfrozen state hard-suppresses reveal until release.
    it('hard-suppresses reveal when pressed with no frozen selection (subview seed)', () => {
      const base = EditorState.create({
        doc: 'x **bold** y\nzz\n',
        selection: { anchor: 5 },
        extensions: [frozen_reveal_selection_field, pointer_down_field],
      });
      const state = base.update({ effects: set_pointer_down.of(true) }).state;
      expect(should_reveal_for_selection(state, NODE_FROM, NODE_TO)).toBe(false);
    });
  });

  describe('multi-cursor', () => {
    it('reveals if any single range would individually trigger reveal', () => {
      const state = EditorState.create({
        doc: 'x **bold** y\nzz\n',
        selection: EditorSelection.create(
          [EditorSelection.range(0, 0), EditorSelection.range(5, 6)],
          1,
        ),
        extensions: [frozen_reveal_selection_field],
      });
      expect(should_reveal_for_selection(state, NODE_FROM, NODE_TO)).toBe(true);
    });

    it('does not reveal if no range individually triggers reveal', () => {
      const state = EditorState.create({
        doc: 'x **bold** y\nzz\n',
        selection: EditorSelection.create(
          [EditorSelection.range(0, 0), EditorSelection.range(13, 13)],
          0,
        ),
        extensions: [frozen_reveal_selection_field],
      });
      expect(should_reveal_for_selection(state, NODE_FROM, NODE_TO)).toBe(false);
    });
  });
});
