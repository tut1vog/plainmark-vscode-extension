import { describe, expect, it } from 'vitest';
import { EditorState, type StateCommand } from '@codemirror/state';
import {
  insertNewlineContinueMarkup,
  insertNewlineContinueMarkupCommand,
  markdown,
} from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';

// Two guards on list Enter behavior:
//
// 1. The PLAINMARK PATCH (lazy-continuation-enter) carried in
//    patches/@codemirror__lang-markdown@6.5.0.patch. Upstream's empty-item test
//    measures the caret line against the item FIRST line's marker width, so a
//    lazy continuation line no longer than the marker (`1. a\n2. we\ndfd|`) was
//    misread as an empty item line and Enter inserted the newline at line START
//    — the line and caret visibly shifted down, violating PARA-SP-2 (one `\n`
//    at the caret). If a lang-markdown bump drops the patch, these fail.
//
// 2. The `nonTightLists: false` Enter binding wired in editor_extensions.ts
//    (LIST-I-7): Enter on an empty item exits the list in a single press
//    (top-level: marker deleted; nested: dedents one level) instead of
//    upstream's default tight-list loosening. The unconfigured rows double as
//    patch guards proving the patch left upstream's default branch intact.

function press(cmd: StateCommand, doc: string): { doc: string; caret: number } | null {
  const state = EditorState.create({
    doc,
    selection: { anchor: doc.length },
    extensions: [markdown({ extensions: [GFM] })],
  });
  let after: EditorState | null = null;
  const claimed = cmd({
    state,
    dispatch: (tr) => {
      after = tr.state;
    },
  });
  if (!claimed || !after) return null;
  const result: EditorState = after;
  return { doc: result.doc.toString(), caret: result.selection.main.head };
}

const press_enter = (doc: string) => press(insertNewlineContinueMarkup, doc);
const press_enter_configured = (doc: string) =>
  press(insertNewlineContinueMarkupCommand({ nonTightLists: false }), doc);

describe('Enter on a list lazy continuation line (lang-markdown patch)', () => {
  it('inserts the newline at the caret when the lazy line is as short as the ordered marker', () => {
    expect(press_enter('1. 12\n2. we\ndfd')).toEqual({ doc: '1. 12\n2. we\ndfd\n', caret: 16 });
  });

  it('inserts the newline at the caret when the lazy line is shorter than the bullet marker', () => {
    expect(press_enter('- a\n- b\ndf')).toEqual({ doc: '- a\n- b\ndf\n', caret: 11 });
  });

  it('keeps the already-correct behavior for lazy lines longer than the marker', () => {
    expect(press_enter('1. 12\n2. we\ndfdd')).toEqual({ doc: '1. 12\n2. we\ndfdd\n', caret: 17 });
  });

  it('preserves the upstream empty-item feature: Enter on an empty ordered item makes the list non-tight', () => {
    expect(press_enter('1. a\n2. ')).toEqual({ doc: '1. a\n\n2. ', caret: 9 });
  });

  it('preserves the upstream empty-item feature for bullets', () => {
    expect(press_enter('- a\n- ')).toEqual({ doc: '- a\n\n- ', caret: 7 });
  });

  it('preserves marker continuation on a non-empty item line', () => {
    expect(press_enter('1. a')).toEqual({ doc: '1. a\n2. ', caret: 8 });
  });
});

describe('Enter on an empty list item with nonTightLists: false (LIST-I-7 wiring)', () => {
  it('exits a two-item bullet list in a single press, deleting the marker', () => {
    expect(press_enter_configured('- dfd\n- ')).toEqual({ doc: '- dfd\n', caret: 6 });
  });

  it('exits a two-item ordered list in a single press', () => {
    expect(press_enter_configured('1. a\n2. ')).toEqual({ doc: '1. a\n', caret: 5 });
  });

  it('keeps the single-press exit on a third empty item (unchanged path)', () => {
    expect(press_enter_configured('- a\n- b\n- ')).toEqual({ doc: '- a\n- b\n', caret: 8 });
  });

  it('dedents an empty nested item one level instead of inserting a stray line', () => {
    expect(press_enter_configured('- a\n  - b\n  - ')).toEqual({
      doc: '- a\n  - b\n- ',
      caret: 12,
    });
  });

  it('keeps the patched lazy-continuation behavior under the configured command', () => {
    expect(press_enter_configured('1. 12\n2. we\ndfd')).toEqual({
      doc: '1. 12\n2. we\ndfd\n',
      caret: 16,
    });
  });

  it('keeps marker continuation on a non-empty item line', () => {
    expect(press_enter_configured('- a')).toEqual({ doc: '- a\n- ', caret: 6 });
  });
});
