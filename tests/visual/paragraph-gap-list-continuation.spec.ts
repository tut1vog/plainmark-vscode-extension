import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { editor_extensions } from '../../src/webview/editor_extensions.js';

// Guards PARA-R-7: an item continuation line (lazy or
// indented — a line inside a list on which no ListItem starts) carries the
// paragraph gap, so a hard `\n` after the last bullet reads as a paragraph
// break instead of a soft wrap. Blank lines between loose items carry it
// too — a character typed on one splits the list and moves the whole blank
// run outside it, so list-dependent eligibility would reflow every blank
// line at once. Only marker lines stay tight.

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

  it('blank line between loose items carries the gap', async () => {
    expect(await gap_flags('- a\n\n- b')).toEqual([false, true, false]);
  });

  it('a blank run between items keeps its gaps when a typed character splits the list', async () => {
    expect(await gap_flags('- a\n\n\n\n\n- b')).toEqual([false, true, true, true, true, false]);
    // Same doc with `x` typed on the middle blank line: the list splits and
    // the blank run leaves it, but no blank line changes eligibility — only
    // the second list's first line picks up the first-of-list gap.
    expect(await gap_flags('- a\n\nx\n\n\n- b')).toEqual([false, true, true, true, true, true]);
  });

  it('blank line ending a list and the paragraph after both carry the gap', async () => {
    expect(await gap_flags('- a\n\nnext')).toEqual([false, true, true]);
  });
});
