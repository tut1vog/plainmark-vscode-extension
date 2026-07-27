import { describe, expect, it } from 'vitest';
import { EditorState, type StateCommand } from '@codemirror/state';
import {
  insertNewlineContinueMarkup,
  insertNewlineContinueMarkupCommand,
  markdown,
} from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';

// Three guards on list Enter behavior:
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
//
// 3. The PLAINMARK PATCH (lazy-continuation-loose-list-enter) in the same
//    patch file. Enter on a lazy continuation line creates no new item, yet
//    upstream still renumbered every following ordered marker (violating
//    LIST-SP-2: bytes on untouched lines changed), and in a LOOSE list also
//    prepended a blank line — two `\n` at the caret instead of PARA-SP-2's
//    one. The patch skips both side effects on that path; real item lines
//    keep upstream's blank-line + marker + renumber continuation.

function press(
  cmd: StateCommand,
  doc: string,
  caret = doc.length,
): { doc: string; caret: number } | null {
  const state = EditorState.create({
    doc,
    selection: { anchor: caret },
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

const press_enter = (doc: string, caret?: number) =>
  press(insertNewlineContinueMarkup, doc, caret);
const press_enter_configured = (doc: string, caret?: number) =>
  press(insertNewlineContinueMarkupCommand({ nonTightLists: false }), doc, caret);

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

describe('Enter mid-document on a lazy continuation line (lang-markdown patch, loose lists)', () => {
  it('inserts one newline at the caret in a loose ordered list, leaving the next item unrenumbered', () => {
    expect(press_enter_configured('1. item 1\nline 1\n\n2. item 2\n', 16)).toEqual({
      doc: '1. item 1\nline 1\n\n\n2. item 2\n',
      caret: 17,
    });
  });

  it('keeps the single newline under the unconfigured upstream command', () => {
    expect(press_enter('1. item 1\nline 1\n\n2. item 2\n', 16)).toEqual({
      doc: '1. item 1\nline 1\n\n\n2. item 2\n',
      caret: 17,
    });
  });

  it('does not renumber the next item on a tight-list lazy continuation', () => {
    expect(press_enter_configured('1. item 1\nline 1\n2. item 2\n', 16)).toEqual({
      doc: '1. item 1\nline 1\n\n2. item 2\n',
      caret: 17,
    });
  });

  it('inserts one newline on a loose bullet-list lazy continuation', () => {
    expect(press_enter_configured('- a\nlazy\n\n- b\n', 8)).toEqual({
      doc: '- a\nlazy\n\n\n- b\n',
      caret: 9,
    });
  });

  it('preserves upstream continuation on a real loose-list item line: blank line, marker, renumber', () => {
    expect(press_enter_configured('1. a\n\n2. b\n\n3. c\n', 10)).toEqual({
      doc: '1. a\n\n2. b\n\n3. \n\n4. c\n',
      caret: 15,
    });
  });

  it('preserves upstream continuation on a real tight-list item line: marker and renumber', () => {
    expect(press_enter_configured('1. a\n2. b\n3. c\n', 9)).toEqual({
      doc: '1. a\n2. b\n3. \n4. c\n',
      caret: 13,
    });
  });
});
