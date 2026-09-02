import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { allow_console } from '../console-sentinel.js';
import { mount_editor, move_cursor } from '../util.js';

// A typeset whose promise REJECTS (as opposed to resolving with an mjx-merror
// node) must reach the same error presentation as invalid TeX.
describe('MATH-I-8 — a rejected preview typeset surfaces as an error', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;
  let saved_mathjax: Window['MathJax'];

  beforeEach(() => {
    saved_mathjax = window.MathJax;
    container = document.createElement('div');
    document.body.appendChild(container);
    // the main widget's typeset plugin fails on the same stub
    allow_console('typeset failed');
  });

  afterEach(() => {
    window.MathJax = saved_mathjax;
    view?.destroy();
    view = undefined;
    container.remove();
  });

  it('block preview: shows the rejection message when nothing has rendered yet', async () => {
    window.MathJax = {
      tex2chtmlPromise: () => Promise.reject(new Error('typeset boom')),
    };
    const doc = 'before\n\n$$\nx^2\n$$\n\nafter\n';
    view = mount_editor(container, doc);
    move_cursor(view, doc.indexOf('x^2') + 1);
    await expect
      .poll(() => document.querySelector('.plainmark-math-block-preview-error')?.textContent, {
        timeout: 10000,
        interval: 50,
      })
      .toBe('TeX error: typeset boom');
    expect(document.querySelector('.plainmark-math-block-preview-stale')).toBeNull();
  });

  it('block preview: keeps the last good render dimmed under the rejection', async () => {
    window.MathJax = {
      // the edit below adds `+`; everything before it typesets fine
      tex2chtmlPromise: (src: string) => {
        if (src.includes('+')) return Promise.reject(new Error('typeset boom'));
        const node = document.createElement('mjx-container');
        node.setAttribute('data-test', 'good');
        return Promise.resolve(node);
      },
    };
    const doc = 'before\n\n$$\nx^2\n$$\n\nafter\n';
    view = mount_editor(container, doc);
    move_cursor(view, doc.indexOf('x^2') + 1);
    await expect
      .poll(() => document.querySelectorAll('.plainmark-math-block-preview [data-test="good"]').length, {
        timeout: 10000,
        interval: 50,
      })
      .toBe(1);
    const at = doc.indexOf('x^2') + 3;
    view.dispatch({ changes: { from: at, insert: '+' }, selection: { anchor: at + 1 } });
    await expect
      .poll(() => document.querySelector('.plainmark-math-block-preview-error')?.textContent, {
        timeout: 10000,
        interval: 50,
      })
      .toBe('TeX error: typeset boom');
    expect(
      document.querySelector('.plainmark-math-block-preview-stale [data-test="good"]'),
    ).not.toBeNull();
  });

  it('inline preview: shows the rejection message in the tooltip', async () => {
    window.MathJax = {
      tex2chtmlPromise: () => Promise.reject(new Error('typeset boom')),
    };
    const doc = 'see $x^2$ here\n';
    view = mount_editor(container, doc);
    move_cursor(view, doc.indexOf('$x^2$') + 1);
    await expect
      .poll(() => document.querySelector('.plainmark-math-preview-error')?.textContent, {
        timeout: 10000,
        interval: 50,
      })
      .toBe('TeX error: typeset boom');
  });
});
