import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { editor_extensions } from '../../src/webview/editor_extensions.js';

// Guards PARA-R-7: an item continuation line (lazy or
// indented — a line inside a list on which no ListItem starts) carries the
// paragraph gap, so a hard `\n` after the last bullet reads as a paragraph
// break instead of a soft wrap. Blank lines between loose items carry it
// too, and so does a marker line directly under a blank line (the loose
// seam) — a character typed on the blank run splits the list and reparses
// every one of those lines, so any of them differing between the in-list
// and out-of-list classification would move the layout on that keystroke.
// Only marker lines at a tight seam (under a non-blank line) stay tight.

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

  it('typing a character between loose items changes no line eligibility', async () => {
    // `x` typed on the middle blank line splits the one spanning list into
    // two, reparsing every line of the run — the flags must not move: blank
    // lines are eligible in or out of a list, and `- b` flips between
    // interior-marker-after-blank and first-of-list, both gapped.
    expect(await gap_flags('- a\n\n\n\n\n- b')).toEqual([false, true, true, true, true, true]);
    expect(await gap_flags('- a\n\nx\n\n\n- b')).toEqual([false, true, true, true, true, true]);
    // Caret directly above the marker line (owner repro): same invariance.
    expect(await gap_flags('- abc\n\n\n- def')).toEqual([false, true, true, true]);
    expect(await gap_flags('- abc\n\nx\n- def')).toEqual([false, true, true, true]);
  });

  it('blank line ending a list and the paragraph after both carry the gap', async () => {
    expect(await gap_flags('- a\n\nnext')).toEqual([false, true, true]);
  });
});
