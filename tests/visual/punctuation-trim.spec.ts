// A hidden `**` between `）` and `，` used to leave both glyphs at full
// width; the pair must render as tight as it does in plain text.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor, next_frame } from './util.js';

const DOC = '隔离队列（Quarantine），同时\n**隔离队列（Quarantine）**，同时\nzz\n';

function glyph_width(line: Element, ch: string): number {
  const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const i = node.textContent!.indexOf(ch);
    if (i < 0) continue;
    const range = document.createRange();
    range.setStart(node, i);
    range.setEnd(node, i + 1);
    return range.getBoundingClientRect().width;
  }
  throw new Error(`no ${ch} in line`);
}

describe('MRS-R-10: fullwidth punctuation trims across a hidden marker', () => {
  let container: HTMLElement;
  let view: EditorView;

  beforeEach(async () => {
    container = document.createElement('div');
    container.style.fontFamily = '"PingFang SC", "Noto Sans CJK SC", sans-serif';
    document.body.appendChild(container);
    view = mount_editor(container, DOC);
    await next_frame();
    await next_frame();
  });
  afterEach(() => {
    view.destroy();
    container.remove();
  });

  it('the `）` before a hidden `**` is as wide as in plain text', () => {
    const lines = container.querySelectorAll('.cm-line');
    const plain = lines[0];
    const bold = lines[1];
    expect(bold.querySelector('.plainmark-punctuation-trim')?.textContent).toBe('）');
    expect(glyph_width(bold, '）')).toBeCloseTo(glyph_width(plain, '）'), 1);
    expect(glyph_width(bold, '，')).toBeCloseTo(glyph_width(plain, '，'), 1);
  });
});
