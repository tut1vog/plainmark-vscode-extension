// LIST-I-16 / LIST-I-17: a list continuation line's hidden indent is one
// atomic unit the caret never rests inside; Backspace/Delete join across it,
// ArrowLeft/ArrowRight cross it in one step, and whitespace beyond the
// item's content column stays visible (LIST-R-12).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import type { EditorView } from '@codemirror/view';
import { get_line_text, mount_editor, move_cursor, next_frame } from './util.js';

describe('list continuation indent — LIST-I-16 LIST-I-17 LIST-R-12', () => {
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

  async function mount(doc: string, anchor: number): Promise<EditorView> {
    view = mount_editor(container, doc);
    view.focus();
    await next_frame();
    move_cursor(view, anchor);
    await next_frame();
    return view;
  }

  it('LIST-I-17 ArrowLeft from the text start reaches the previous line end in one press', async () => {
    const v = await mount('5. abc\n   我们', 10);
    await userEvent.keyboard('{ArrowLeft}');
    expect(v.state.selection.main.head).toBe(6);
  });

  it('LIST-I-17 ArrowRight from the previous line end lands after the hidden indent', async () => {
    const v = await mount('5. abc\n   我们', 6);
    await userEvent.keyboard('{ArrowRight}');
    expect(v.state.selection.main.head).toBe(10);
    await userEvent.keyboard('{ArrowRight}');
    expect(v.state.selection.main.head).toBe(11);
  });

  it('LIST-I-17 a caret dispatched into the hidden indent rests at its end', async () => {
    const v = await mount('5. abc\n   我们', 8);
    expect(v.state.selection.main.head).toBe(10);
    move_cursor(v, 7);
    expect(v.state.selection.main.head).toBe(10);
  });

  it('LIST-I-17 ArrowDown onto the line start rests after the hidden indent', async () => {
    const v = await mount('5. abc\n   我们', 0);
    await userEvent.keyboard('{ArrowDown}');
    expect(v.state.selection.main.head).toBe(10);
  });

  it('LIST-I-16 Backspace at the text start joins the line above in one press', async () => {
    const v = await mount('5. abc\n   我们', 10);
    await userEvent.keyboard('{Backspace}');
    expect(v.state.doc.toString()).toBe('5. abc我们');
    expect(v.state.selection.main.head).toBe(6);
  });

  it('LIST-I-16 Delete at the previous line end joins without surfacing the indent', async () => {
    const v = await mount('5. abc\n   我们', 6);
    await userEvent.keyboard('{Delete}');
    expect(v.state.doc.toString()).toBe('5. abc我们');
    expect(v.state.selection.main.head).toBe(6);
  });

  it('LIST-R-12 spaces typed at the text start are visible, and Backspace removes one at a time', async () => {
    const v = await mount('5. abc\n   我们', 10);
    await userEvent.keyboard('  ');
    expect(v.state.doc.toString()).toBe('5. abc\n     我们');
    expect(get_line_text(v, 1)).toBe('  我们');
    await userEvent.keyboard('{Backspace}');
    expect(v.state.doc.toString()).toBe('5. abc\n    我们');
    expect(get_line_text(v, 1)).toBe(' 我们');
    await userEvent.keyboard('{Backspace}');
    expect(v.state.doc.toString()).toBe('5. abc\n   我们');
    expect(get_line_text(v, 1)).toBe('我们');
  });
});
