import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor, move_cursor, next_frame } from '../util.js';

describe('spacing_extension THEME-S-4', () => {
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

  it('zeroes the bottom padding of a collapse-adjacent line only when another follows it', async () => {
    const doc = '> one\n> two\n\nprose';
    view = mount_editor(container, doc);
    move_cursor(view, doc.length);
    await next_frame();
    const lines = Array.from(
      container.querySelectorAll<HTMLElement>('.cm-line.plainmark-collapse-adjacent'),
    );
    expect(lines).toHaveLength(2);
    const [first, last] = lines.map((l) => getComputedStyle(l).paddingBottom);
    expect(first).toBe('0px');
    expect(last).not.toBe('0px');
  });
});
