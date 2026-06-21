import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor, move_cursor } from '../util.js';
import { ensure_mathjax } from '../mathjax-ready.js';

describe('math inline widget', () => {
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

  it('renders $x^2$ as an inline mjx-container', async () => {
    const doc = `prose with $x^2$ math\n\ntail`;
    view = mount_editor(container, doc);
    await expect
      .poll(
        () =>
          container.querySelectorAll('.plainmark-math-inline mjx-container mjx-msup').length,
        { timeout: 30000, interval: 100 },
      )
      .toBeGreaterThan(0);
  });

  it('reveals source when cursor enters the inline range', async () => {
    const doc = `prose with $x^2$ math\n\ntail`;
    view = mount_editor(container, doc);
    await expect
      .poll(() => container.querySelectorAll('mjx-container').length, { timeout: 30000, interval: 100 })
      .toBeGreaterThan(0);
    move_cursor(view, doc.indexOf('$x^2$') + 1);
    expect(container.querySelectorAll('mjx-container').length).toBe(0);
    const line_text = Array.from(container.querySelectorAll('.cm-line'))
      .map((l) => l.textContent ?? '')
      .join('\n');
    expect(line_text).toContain('$x^2$');
  });

  it('re-renders when cursor leaves the inline range', async () => {
    const doc = `prose with $x^2$ math\n\ntail`;
    view = mount_editor(container, doc);
    await expect
      .poll(() => container.querySelectorAll('mjx-container').length, { timeout: 30000, interval: 100 })
      .toBeGreaterThan(0);
    move_cursor(view, doc.indexOf('$x^2$') + 1);
    expect(container.querySelectorAll('mjx-container').length).toBe(0);
    move_cursor(view, doc.length);
    await expect
      .poll(() => container.querySelectorAll('mjx-container').length, { timeout: 30000, interval: 100 })
      .toBeGreaterThan(0);
  });
});
