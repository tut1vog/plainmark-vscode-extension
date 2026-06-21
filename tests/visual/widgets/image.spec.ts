import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor, move_cursor } from '../util.js';

const sample_data_url =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAeIVWUMAAAAASUVORK5CYII=';

describe('image widget', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    view?.destroy();
    view = undefined;
    container.remove();
  });

  it('renders an image-only paragraph as <img>', () => {
    // Trailing blank line + prose so the cursor can sit outside the image range
    // (selection at end of the image paragraph still overlaps `info.to`).
    view = mount_editor(
      container,
      `![alt](${sample_data_url})\n\nworld`,
      'https://example.test/',
    );
    move_cursor(view, view.state.doc.length);
    const imgs = container.querySelectorAll('.plainmark-image-block img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute('alt')).toBe('alt');
    expect(imgs[0].getAttribute('src')).toBe(sample_data_url);
  });

  it('reveals source when cursor enters the range', () => {
    view = mount_editor(
      container,
      `![alt](${sample_data_url})\n\nworld`,
      'https://example.test/',
    );
    move_cursor(view, view.state.doc.length);
    expect(container.querySelectorAll('.plainmark-image-block img')).toHaveLength(1);
    move_cursor(view, 1);
    expect(container.querySelectorAll('.plainmark-image-block img')).toHaveLength(0);
  });

  it('re-renders when cursor leaves the range', () => {
    const doc = `hello\n\n![alt](${sample_data_url})\n\nworld`;
    view = mount_editor(container, doc, 'https://example.test/');
    move_cursor(view, doc.indexOf('!['));
    expect(container.querySelectorAll('.plainmark-image-block img')).toHaveLength(0);
    move_cursor(view, doc.length);
    expect(container.querySelectorAll('.plainmark-image-block img')).toHaveLength(1);
  });

  it('DEF-7: a covering selection (select-all) keeps the image rendered', () => {
    const doc = `hello\n\n![alt](${sample_data_url})\n\nworld`;
    view = mount_editor(container, doc, 'https://example.test/');
    move_cursor(view, doc.length);
    expect(container.querySelectorAll('.plainmark-image-block img')).toHaveLength(1);
    view.dispatch({ selection: { anchor: 0, head: doc.length } });
    expect(container.querySelectorAll('.plainmark-image-block img')).toHaveLength(1);
  });

  it('DEF-7: a drag selection entering the image does not reveal source mid-drag', () => {
    const doc = `hello\n\n![alt](${sample_data_url})\n\nworld`;
    view = mount_editor(container, doc, 'https://example.test/');
    move_cursor(view, 2);
    expect(container.querySelectorAll('.plainmark-image-block img')).toHaveLength(1);

    // Press: the pointer_state capture listener freezes the pre-press selection;
    // preventDefault keeps CM6's own mousedown handling out of the synthetic event.
    const prevent = (e: Event): void => e.preventDefault();
    view.contentDOM.addEventListener('mousedown', prevent, true);
    view.contentDOM.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }),
    );
    view.contentDOM.removeEventListener('mousedown', prevent, true);

    // Mid-drag the live selection crosses into the image — frozen pre-press
    // selection must keep the widget rendered (no flicker).
    const image_from = doc.indexOf('![');
    view.dispatch({ selection: { anchor: 2, head: image_from + 3 } });
    expect(container.querySelectorAll('.plainmark-image-block img')).toHaveLength(1);

    // Release: live selection takes over — now touching, not covering → reveal.
    document.dispatchEvent(new MouseEvent('mouseup'));
    expect(container.querySelectorAll('.plainmark-image-block img')).toHaveLength(0);
  });

  it('a click on the rendered image places the caret and reveals source (FIX-13)', async () => {
    const doc = `hello\n\n![alt](${sample_data_url})\n\nworld`;
    view = mount_editor(container, doc, 'https://example.test/');
    move_cursor(view, doc.length);
    const img = container.querySelector('.plainmark-image-block img') as HTMLElement;
    expect(img).not.toBeNull();

    const rect = img.getBoundingClientRect();
    const init = {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      button: 0,
    };
    img.dispatchEvent(new MouseEvent('mousedown', init));
    img.dispatchEvent(new MouseEvent('mouseup', init));
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    const image_from = doc.indexOf('![');
    const image_to = doc.indexOf(')') + 1;
    const head = view.state.selection.main.head;
    // A block-widget click may map to the position just past the range.
    expect(head).toBeGreaterThanOrEqual(image_from);
    expect(head).toBeLessThanOrEqual(image_to + 1);
    expect(container.querySelectorAll('.plainmark-image-block img')).toHaveLength(0);
  });

  it('IMG-E-6: a failed image load shows the broken-image placeholder', async () => {
    // Valid base64, undecodable as PNG → the <img> fires `error` deterministically (no network).
    const broken = 'data:image/png;base64,AAAAAA==';
    const doc = `hello\n\n![](${broken})\n\nworld`;
    view = mount_editor(container, doc, 'https://example.test/');
    move_cursor(view, doc.length);
    await vi.waitFor(() => {
      expect(container.querySelector('.plainmark-image-broken')).not.toBeNull();
    });
    const box = container.querySelector('.plainmark-image-broken')!;
    expect(box.querySelector('svg.plainmark-image-broken-icon')).not.toBeNull();
    expect(box.querySelector('.plainmark-image-broken-path')?.textContent).toBe(broken);
    expect(box.querySelector('img')).toBeNull();
  });
});
