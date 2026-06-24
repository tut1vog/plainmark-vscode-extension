// MATH-I-15: a plain single click on a rendered math widget selects its inner
// LaTeX (delimiters excluded), so the source reveals with the content already
// selected and ready to copy. Exercises the real mouseSelectionStyle +
// posAtCoords path with a real MouseEvent on the rendered widget.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor } from '../util.js';
import { ensure_mathjax } from '../mathjax-ready.js';

function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}

// Real plain primary single-click at the centre of a rendered widget element,
// then release. CM6's mousedown handler reads button/detail to pick the style.
function click_center(el: HTMLElement): void {
  const r = el.getBoundingClientRect();
  el.dispatchEvent(
    new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      detail: 1,
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
    }),
  );
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}

describe('MATH-I-15: click a rendered math widget selects its inner LaTeX', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(async () => {
    await ensure_mathjax();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    view?.destroy();
    view = undefined;
    container.remove();
  });

  it('inline: selects the content between the $…$', async () => {
    const doc = 'text $x^2$ more';
    view = mount_editor(container, doc);
    view.dispatch({ selection: { anchor: 0 } }); // caret outside → math renders
    await expect
      .poll(() => container.querySelector('.plainmark-math-inline mjx-container'), {
        timeout: 30000,
        interval: 100,
      })
      .toBeTruthy();
    await next_frame();

    const widget = container.querySelector<HTMLElement>('.plainmark-math-inline');
    if (!widget) throw new Error('no rendered inline math widget');
    view.focus();
    click_center(widget);
    await next_frame();
    await next_frame();

    const main = view.state.selection.main;
    expect(view.state.sliceDoc(main.from, main.to)).toBe('x^2');
    expect(main.from).toBe(6);
    expect(main.to).toBe(9);
  });

  it('block: selects the inner content lines, fences excluded', async () => {
    const doc = 'text\n$$\na = b\n$$';
    view = mount_editor(container, doc);
    view.dispatch({ selection: { anchor: 0 } }); // caret outside → block renders
    await expect
      .poll(() => container.querySelector('.plainmark-math-block mjx-container'), {
        timeout: 30000,
        interval: 100,
      })
      .toBeTruthy();
    await next_frame();

    const widget = container.querySelector<HTMLElement>('.plainmark-math-block');
    if (!widget) throw new Error('no rendered block math widget');
    view.focus();
    click_center(widget);
    await next_frame();
    await next_frame();

    const main = view.state.selection.main;
    expect(view.state.sliceDoc(main.from, main.to)).toBe('a = b');
  });
});
