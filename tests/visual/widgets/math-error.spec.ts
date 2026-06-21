import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { allow_console } from '../console-sentinel.js';
import { mount_editor, move_cursor } from '../util.js';

describe('math typeset failure FIX-8', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;
  let saved_mathjax: Window['MathJax'];

  beforeEach(() => {
    saved_mathjax = window.MathJax;
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    window.MathJax = saved_mathjax;
    view?.destroy();
    view = undefined;
    container.remove();
  });

  it('caches the rejection, renders an error widget, and does not retry on selection-only updates', async () => {
    allow_console('math typeset failed');
    let calls = 0;
    window.MathJax = {
      tex2chtmlPromise: () => {
        calls += 1;
        return Promise.reject(new Error('typeset boom'));
      },
    };
    const doc = 'prose with $x^2$ math\n\ntail';
    view = mount_editor(container, doc);
    await expect
      .poll(() => container.querySelectorAll('.plainmark-math-error').length, {
        timeout: 30000,
        interval: 50,
      })
      .toBeGreaterThan(0);
    const el = container.querySelector('.plainmark-math-error');
    expect(el?.textContent).toBe('$x^2$');
    expect(el?.getAttribute('title')).toBe('typeset boom');
    expect(el?.classList.contains('plainmark-math-pending')).toBe(false);
    expect(calls).toBe(1);

    move_cursor(view, 0);
    move_cursor(view, doc.length);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(calls).toBe(1);
    expect(container.querySelectorAll('.plainmark-math-error').length).toBeGreaterThan(0);
  });

  it('renders raw source when the MathJax bundle is unavailable', async () => {
    window.MathJax = undefined;
    const doc = 'inline $a+b$ here\n\n$$\nc^2\n$$\n\ntail';
    view = mount_editor(container, doc);
    await expect
      .poll(() => container.querySelectorAll('.plainmark-math-error').length, {
        timeout: 30000,
        interval: 50,
      })
      .toBeGreaterThanOrEqual(2);
    const texts = Array.from(container.querySelectorAll('.plainmark-math-error')).map(
      (e) => e.textContent,
    );
    expect(texts).toContain('$a+b$');
    expect(texts).toContain('$$c^2$$');
  });
});
