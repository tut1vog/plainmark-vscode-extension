import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor, move_cursor } from '../util.js';
import { ensure_mathjax } from '../mathjax-ready.js';

describe('math block widget', () => {
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

  it('renders $$\\frac{a}{b}$$ as a CHTML mjx-container', async () => {
    const doc = `$$\n\\frac{a}{b}\n$$\n\ntail`;
    view = mount_editor(container, doc);
    move_cursor(view, doc.length);
    await expect
      .poll(
        () =>
          container.querySelectorAll('mjx-container[display="true"] mjx-mfrac').length,
        { timeout: 30000, interval: 100 },
      )
      .toBeGreaterThan(0);
  });

  it('reveals source when cursor enters the block range', async () => {
    const doc = `$$\n\\frac{a}{b}\n$$\n\ntail`;
    view = mount_editor(container, doc);
    move_cursor(view, doc.length);
    await expect
      .poll(() => container.querySelectorAll('mjx-container').length, { timeout: 30000, interval: 100 })
      .toBeGreaterThan(0);
    move_cursor(view, 3);
    expect(container.querySelectorAll('mjx-container').length).toBe(0);
    const line_text = Array.from(container.querySelectorAll('.cm-line'))
      .map((l) => l.textContent ?? '')
      .join('\n');
    expect(line_text).toContain('\\frac{a}{b}');
  });

  it('re-renders when cursor leaves the block range', async () => {
    const doc = `text\n\n$$\n\\frac{a}{b}\n$$\n\nother`;
    view = mount_editor(container, doc);
    move_cursor(view, doc.length);
    await expect
      .poll(() => container.querySelectorAll('mjx-container').length, { timeout: 30000, interval: 100 })
      .toBeGreaterThan(0);
    move_cursor(view, doc.indexOf('$$') + 3);
    expect(container.querySelectorAll('mjx-container').length).toBe(0);
    move_cursor(view, doc.length);
    await expect
      .poll(() => container.querySelectorAll('mjx-container').length, { timeout: 30000, interval: 100 })
      .toBeGreaterThan(0);
  });
});
