import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor, move_cursor } from '../util.js';

async function next_frame(): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

interface SetupHandle {
  container: HTMLElement;
  view?: EditorView;
}

function make_setup(): SetupHandle {
  return { container: document.createElement('div') };
}

describe('html block + inline raw HTML — line and mark chrome', () => {
  let h: SetupHandle;
  beforeEach(() => {
    h = make_setup();
    document.body.appendChild(h.container);
  });
  afterEach(() => {
    h.view?.destroy();
    h.container.remove();
  });

  it('renders .plainmark-html-block line decorations on a multi-line HTMLBlock', async () => {
    const doc = '<div>\n  <p>inner</p>\n</div>\n\nProse.\n';
    h.view = mount_editor(h.container, doc);
    move_cursor(h.view, doc.length);
    await next_frame();

    const block_lines = h.container.querySelectorAll('.plainmark-html-block');
    expect(block_lines.length).toBe(3);
  });

  it('renders .plainmark-html-inline marks on inline HTMLTag in prose', async () => {
    const doc = 'Hello <sub>x</sub> world.\n';
    h.view = mount_editor(h.container, doc);
    move_cursor(h.view, 0);
    await next_frame();

    const inline_marks = h.container.querySelectorAll('.plainmark-html-inline');
    expect(inline_marks.length).toBe(2);
    expect(inline_marks[0].textContent).toBe('<sub>');
    expect(inline_marks[1].textContent).toBe('</sub>');
  });

  it('renders lang-html overlay tokens with .plainmark-syntax-tag inside a block', async () => {
    const doc = '<div class="x">\n  hello\n</div>\n\nProse.\n';
    h.view = mount_editor(h.container, doc);
    move_cursor(h.view, doc.length);
    await next_frame();

    // The lang-html overlay annotates TagName via tags.tagName, which the
    // HighlightStyle wraps with .plainmark-syntax-tag. The block scope rule
    // (.plainmark-html-block .plainmark-syntax-tag) makes it visible.
    const tag_spans = h.container.querySelectorAll(
      '.plainmark-html-block .plainmark-syntax-tag',
    );
    expect(tag_spans.length).toBeGreaterThanOrEqual(1);
  });
});
