// Outline click navigation (OUT-I-2): a `scroll_to_heading` {line, character}
// must move the caret to that position, scroll it to the top of the viewport, and
// focus the editor. Positions outside the document clamp into range.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { editor_extensions } from '../../src/webview/editor_extensions.js';
import { scroll_caret_to } from '../../src/webview/outline_scroll.js';

function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}

function build_doc(): { text: string; far_line: number; far_offset: number } {
  const lines = ['# Top'];
  for (let i = 0; i < 80; i++) lines.push(`body line ${i}`);
  const far_line = lines.length;
  const text = `${lines.join('\n')}\n## Far Heading\nafter`;
  return { text, far_line, far_offset: text.indexOf('## Far Heading') };
}

describe('outline scroll navigation OUT-I-2', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    view?.destroy();
    container.remove();
  });

  function mount(text: string): EditorView {
    const v = new EditorView({
      state: EditorState.create({
        doc: text,
        // Constrain height so scrollIntoView actually scrolls.
        extensions: [...editor_extensions, EditorView.theme({ '&': { height: '150px' } })],
      }),
      parent: container,
    });
    return v;
  }

  it('moves the caret to the heading position and scrolls it into view', async () => {
    const { text, far_line, far_offset } = build_doc();
    view = mount(text);
    await next_frame();
    await next_frame();

    scroll_caret_to(view, far_line, 0);
    await next_frame();
    await next_frame();

    expect(view.state.selection.main.head).toBe(far_offset);
    // The far heading sits below the fold, so scrolling to it moves the scroller.
    const far_top = view.scrollDOM.scrollTop;
    expect(far_top).toBeGreaterThan(0);

    scroll_caret_to(view, 0, 0);
    await next_frame();
    await next_frame();
    expect(view.state.selection.main.head).toBe(0);
    // Scrolling to the top heading moves the scroller back up toward the start.
    expect(view.scrollDOM.scrollTop).toBeLessThan(far_top);
  });

  it('clamps an out-of-range position into the document', async () => {
    const { text, far_line, far_offset } = build_doc();
    view = mount(text);
    await next_frame();

    scroll_caret_to(view, view.state.doc.lines + 50, 999);
    await next_frame();
    expect(view.state.selection.main.head).toBe(text.length);

    scroll_caret_to(view, -5, -50);
    await next_frame();
    expect(view.state.selection.main.head).toBe(0);

    scroll_caret_to(view, far_line, 999);
    await next_frame();
    expect(view.state.selection.main.head).toBe(far_offset + '## Far Heading'.length);
  });

  it('focuses the editor so the caret renders', async () => {
    const { text, far_line } = build_doc();
    view = mount(text);
    await next_frame();

    scroll_caret_to(view, far_line, 0);
    await next_frame();
    expect(view.hasFocus).toBe(true);
  });
});
