import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { editor_extensions } from '../../src/webview/editor_extensions.js';

// Guards PARA-R-7: an item continuation line (lazy or
// indented — a line inside a list on which no ListItem starts) carries the
// paragraph gap, so a hard `\n` after the last bullet reads as a paragraph
// break instead of a soft wrap. Marker-line spacing is seam-local: tight
// only directly under another marker line, gapped under anything else,
// regardless of the marker's first-of-list vs interior role — lazy
// continuation lets one character typed lines away merge or split lists
// and flip that role on untouched lines, so role-keyed spacing would
// reflow them. Blank lines carry the gap in and out of lists alike.

const GAP_CLASS = 'plainmark-paragraph-gap';

function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}
async function frames(n: number): Promise<void> {
  for (let i = 0; i < n; i++) await next_frame();
}

describe('paragraph gap on list continuation lines (PARA-R-7)', () => {
  let host: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    host = document.createElement('div');
    host.style.width = '600px';
    host.style.height = '300px';
    document.body.appendChild(host);
  });
  afterEach(() => {
    view?.destroy();
    view = undefined;
    host.remove();
  });

  async function gap_flags(doc: string): Promise<boolean[]> {
    view?.destroy();
    view = new EditorView({
      state: EditorState.create({ doc, extensions: [...editor_extensions] }),
      parent: host,
    });
    await frames(4);
    return Array.from(host.querySelectorAll('.cm-content > .cm-line')).map((el) =>
      el.classList.contains(GAP_CLASS),
    );
  }

  it('lazy continuation after the last bullet carries the gap', async () => {
    expect(await gap_flags('- a\n- b\nnext')).toEqual([false, false, true]);
  });

  it('ordered-list lazy continuation carries the gap', async () => {
    expect(await gap_flags('1. a\n2. b\nnext')).toEqual([false, false, true]);
  });

  it('indented item continuation carries the gap', async () => {
    expect(await gap_flags('- a\n  more')).toEqual([false, true]);
  });

  it('first-of-list keeps the gap; interior marker lines stay tight', async () => {
    expect(await gap_flags('para\n- x\n- y')).toEqual([false, true, false]);
  });

  it('the loose seam carries the gap on the blank line and the marker line under it', async () => {
    expect(await gap_flags('- a\n\n- b')).toEqual([false, true, true]);
  });

  it('typing a character between loose items changes no line eligibility (split direction)', async () => {
    // `x` typed on the middle blank line splits the one spanning list into
    // two, reparsing every line of the run — the flags must not move: blank
    // lines are eligible in or out of a list, and marker spacing keys on
    // the seam, not the marker's first-of-list vs interior role.
    expect(await gap_flags('- a\n\n\n\n\n- b')).toEqual([false, true, true, true, true, true]);
    expect(await gap_flags('- a\n\nx\n\n\n- b')).toEqual([false, true, true, true, true, true]);
    expect(await gap_flags('- abc\n\n\n- def')).toEqual([false, true, true, true]);
    expect(await gap_flags('- abc\n\nx\n- def')).toEqual([false, true, true, true]);
  });

  it('lazy-continuation merges change no line eligibility (merge direction)', async () => {
    // Typing on the blank directly under `- abc` absorbs that line — and
    // any prose below it — into the item, merging the two lists into one.
    // Seam-local spacing keeps every flag identical across the merge.
    expect(await gap_flags('- abc\n\n- def')).toEqual([false, true, true]);
    expect(await gap_flags('- abc\nx\n- def')).toEqual([false, true, true]);
    expect(await gap_flags('- abc\n\nd\n- def')).toEqual([false, true, true, true]);
    expect(await gap_flags('- abc\nx\nd\n- def')).toEqual([false, true, true, true]);
  });

  it('a marker under a continuation line carries the gap; nested and dedented markers stay tight', async () => {
    expect(await gap_flags('- a\n  cont\n- b')).toEqual([false, true, true]);
    expect(await gap_flags('- a\n  - b\n- c')).toEqual([false, false, false]);
  });

  it('blank line ending a list and the paragraph after both carry the gap', async () => {
    expect(await gap_flags('- a\n\nnext')).toEqual([false, true, true]);
  });
});
