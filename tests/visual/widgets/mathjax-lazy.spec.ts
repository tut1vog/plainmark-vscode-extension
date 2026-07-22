import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor, move_cursor } from '../util.js';

// Runs in its own iframe (vitest browser isolation), so window.MathJax starts
// absent here even though other spec files load the bundle via ensure_mathjax.

function set_boot(): void {
  (
    window as unknown as { __plainmark_mathjax?: { url: string; nonce: string } }
  ).__plainmark_mathjax = { url: '/dist/mathjax.js', nonce: '' };
}

function mathjax_script_count(): number {
  return document.querySelectorAll('script[src*="mathjax"]').length;
}

describe('mathjax lazy load', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    set_boot();
  });

  afterEach(() => {
    view?.destroy();
    view = undefined;
    container.remove();
  });

  it('a math-free document never injects the bundle', async () => {
    view = mount_editor(container, 'hello\n\nworld');
    await new Promise((r) => setTimeout(r, 100));
    expect(mathjax_script_count()).toBe(0);
    expect((window as unknown as { MathJax?: unknown }).MathJax).toBeUndefined();
  });

  it('first math encounter shows pending (not error) and typesets once the bundle lands', async () => {
    view = mount_editor(container, 'x\n\n$$a+b$$\n\ny');
    move_cursor(view, 0);

    // Mid-load: pending style, never the raw-source error flash.
    const widget = container.querySelector('.plainmark-math-block');
    expect(widget).not.toBeNull();
    expect(widget!.classList.contains('plainmark-math-pending')).toBe(true);
    expect(container.querySelector('.plainmark-math-error')).toBeNull();
    expect(mathjax_script_count()).toBe(1);

    await expect
      .poll(() => container.querySelectorAll('mjx-container').length, { timeout: 30000 })
      .toBeGreaterThan(0);
    expect(container.querySelector('.plainmark-math-error')).toBeNull();
  });
});
