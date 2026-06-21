import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor, move_cursor } from '../util.js';
import { ensure_mathjax } from '../mathjax-ready.js';

function preview(): HTMLElement | null {
  return document.querySelector('.plainmark-math-preview');
}

describe('inline math preview tooltip', () => {
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

  it('shows a preview tooltip when the caret enters inline math', async () => {
    const doc = 'see $x^2$ here\n';
    view = mount_editor(container, doc);
    move_cursor(view, doc.length);
    expect(preview()).toBeNull();
    move_cursor(view, doc.indexOf('$x^2$') + 1);
    await expect
      .poll(() => preview() != null, { timeout: 5000, interval: 50 })
      .toBe(true);
  });

  it('renders MathJax output for valid TeX', async () => {
    const doc = 'see $x^2$ here\n';
    view = mount_editor(container, doc);
    move_cursor(view, doc.indexOf('$x^2$') + 1);
    await expect
      .poll(
        () => preview()?.querySelectorAll('mjx-container mjx-msup').length ?? 0,
        { timeout: 30000, interval: 100 },
      )
      .toBeGreaterThan(0);
  });

  it('shows an error alert for invalid TeX', async () => {
    const doc = 'see $\\frac{1$ here\n';
    view = mount_editor(container, doc);
    move_cursor(view, doc.indexOf('$\\frac') + 1);
    await expect
      .poll(() => preview()?.querySelector('.plainmark-math-preview-error') != null, {
        timeout: 30000,
        interval: 100,
      })
      .toBe(true);
    const err = preview()?.querySelector('.plainmark-math-preview-error');
    expect(err?.textContent ?? '').toContain('TeX error:');
  });

  it('anchors the preview below the whole equation even with the caret on the first wrapped line', async () => {
    container.style.width = '260px';
    const long = `a^2 + b^2 + ${'c + '.repeat(40)}z`;
    const doc = `prefix $${long}$ tail\n`;
    view = mount_editor(container, doc);
    const open = doc.indexOf('$');
    const close = open + 1 + long.length; // the closing `$`
    move_cursor(view, open + 2); // caret on the FIRST wrapped line of the math
    await expect
      .poll(() => preview() != null, { timeout: 5000, interval: 50 })
      .toBe(true);
    // The math wraps across several screen lines: the closing `$` sits lower
    // than the opening `$`. The popover must clear the whole revealed span.
    const start_rect = view.coordsAtPos(open);
    const end_rect = view.coordsAtPos(close);
    expect(start_rect).not.toBeNull();
    expect(end_rect).not.toBeNull();
    expect(end_rect!.top).toBeGreaterThan(start_rect!.top + 1); // genuinely wrapped
    await expect
      .poll(
        () => {
          const box = preview()?.getBoundingClientRect();
          const e = view!.coordsAtPos(close);
          return box && e ? box.top >= e.bottom - 1 : false;
        },
        { timeout: 5000, interval: 50 },
      )
      .toBe(true);
  });

  it('removes the tooltip when the caret leaves the construct', async () => {
    const doc = 'see $x^2$ here\n';
    view = mount_editor(container, doc);
    move_cursor(view, doc.indexOf('$x^2$') + 1);
    await expect
      .poll(() => preview() != null, { timeout: 5000, interval: 50 })
      .toBe(true);
    move_cursor(view, doc.length);
    await expect
      .poll(() => preview() == null, { timeout: 5000, interval: 50 })
      .toBe(true);
  });
});

function block_preview(): HTMLElement | null {
  return document.querySelector('.plainmark-math-block-preview');
}

describe('block math preview widget', () => {
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

  it('shows an in-flow preview widget when the caret enters block math', async () => {
    const doc = 'before\n\n$$\nx^2\n$$\n\nafter\n';
    view = mount_editor(container, doc);
    move_cursor(view, doc.length);
    expect(block_preview()).toBeNull();
    move_cursor(view, doc.indexOf('x^2') + 1);
    await expect
      .poll(() => block_preview() != null, { timeout: 5000, interval: 50 })
      .toBe(true);
  });

  it('renders a display-style mjx-container for valid block TeX', async () => {
    const doc = 'before\n\n$$\n\\frac{a}{b}\n$$\n\nafter\n';
    view = mount_editor(container, doc);
    move_cursor(view, doc.indexOf('\\frac') + 1);
    await expect
      .poll(
        () =>
          block_preview()?.querySelectorAll('mjx-container mjx-mfrac').length ?? 0,
        { timeout: 30000, interval: 100 },
      )
      .toBeGreaterThan(0);
    expect(
      block_preview()?.querySelector('mjx-container')?.getAttribute('display'),
    ).toBe('true');
  });

  it('shows an error box for invalid block TeX', async () => {
    const doc = 'before\n\n$$\n\\frac{1\n$$\n\nafter\n';
    view = mount_editor(container, doc);
    move_cursor(view, doc.indexOf('\\frac') + 1);
    await expect
      .poll(
        () =>
          block_preview()?.querySelector('.plainmark-math-block-preview-error') !=
          null,
        { timeout: 30000, interval: 100 },
      )
      .toBe(true);
    const err = block_preview()?.querySelector(
      '.plainmark-math-block-preview-error',
    );
    expect(err?.textContent ?? '').toContain('TeX error:');
  });

  it('removes the preview widget when the caret leaves the block', async () => {
    const doc = 'before\n\n$$\nx^2\n$$\n\nafter\n';
    view = mount_editor(container, doc);
    move_cursor(view, doc.indexOf('x^2') + 1);
    await expect
      .poll(() => block_preview() != null, { timeout: 5000, interval: 50 })
      .toBe(true);
    move_cursor(view, doc.length);
    await expect
      .poll(() => block_preview() == null, { timeout: 5000, interval: 50 })
      .toBe(true);
  });

  it('keeps the last-good render dimmed when edited to invalid TeX', async () => {
    const doc = 'before\n\n$$\n\\frac{a}{b}\n$$\n\nafter\n';
    view = mount_editor(container, doc);
    const tex_from = doc.indexOf('\\frac{a}{b}');
    move_cursor(view, tex_from + 1);
    await expect
      .poll(
        () =>
          block_preview()?.querySelectorAll('mjx-container mjx-mfrac').length ?? 0,
        { timeout: 30000, interval: 100 },
      )
      .toBeGreaterThan(0);
    view.dispatch({
      changes: { from: tex_from, to: tex_from + '\\frac{a}{b}'.length, insert: '\\frac{a' },
    });
    await expect
      .poll(
        () =>
          block_preview()?.querySelector('.plainmark-math-block-preview-error') !=
          null,
        { timeout: 30000, interval: 100 },
      )
      .toBe(true);
    const stale = block_preview()?.querySelector(
      '.plainmark-math-block-preview-stale',
    );
    expect(stale?.querySelector('mjx-container')).not.toBeNull();
  });
});
