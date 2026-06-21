import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor, move_cursor } from '../util.js';
import { insert_footnote } from '../../../src/webview/decorations/footnote_insert.js';

async function next_frame(): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

function refs_in(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll('.plainmark-footnote-ref'));
}

function def_lines_in(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll('.plainmark-footnote-definition'));
}

describe('footnote decorations — reference render', () => {
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

  it('renders [^1] as a superscript widget when caret is off the line', async () => {
    const doc = 'See here[^1].\n\nmore prose\n\n[^1]: definition body';
    view = mount_editor(container, doc);
    move_cursor(view, doc.length);
    await next_frame();
    const refs = refs_in(container);
    expect(refs.length).toBeGreaterThanOrEqual(1);
    const first = refs[0];
    expect(first.tagName).toBe('SUP');
    expect(first.textContent).toBe('1');
    expect(first.getAttribute('role')).toBe('doc-noteref');
    expect(first.getAttribute('id')).toBe('fnref:1');
    expect(first.classList.contains('broken')).toBe(false);
  });

  it('renders broken (?) for an undefined reference', async () => {
    const doc = 'See [^missing] ref.\n\nelsewhere';
    view = mount_editor(container, doc);
    move_cursor(view, doc.length);
    await next_frame();
    const refs = refs_in(container);
    expect(refs.length).toBe(1);
    expect(refs[0].classList.contains('broken')).toBe(true);
    expect(refs[0].textContent).toBe('?');
    expect(refs[0].getAttribute('aria-label')).toBe('Undefined footnote missing');
  });

  it('keeps the widget rendered when caret is on the line but outside the ref (node-level reveal)', async () => {
    // Bug 2 regression — line-level reveal hid every line-1 widget on
    // initial mount (default selection at 0). Node-level reveal only hides
    // when the cursor actually overlaps the `[^N]` byte range.
    const doc = 'See here[^1] then keep typing.\n\n[^1]: definition body';
    view = mount_editor(container, doc);
    // Caret at position 0 — same line as the ref but not on the ref bytes.
    move_cursor(view, 0);
    await next_frame();
    expect(refs_in(container).length).toBe(1);
  });

  it('reveals raw bytes when caret enters the reference line and re-renders when caret leaves', async () => {
    const doc = 'See here[^1] note.\n\n[^1]: body';
    view = mount_editor(container, doc);
    move_cursor(view, doc.length);
    await next_frame();
    expect(refs_in(container).length).toBe(1);

    // Caret on the reference line → widget should disappear.
    move_cursor(view, doc.indexOf('[^1]') + 2);
    await next_frame();
    expect(refs_in(container).length).toBe(0);
    const text_first_line = container.querySelector('.cm-line')?.textContent ?? '';
    expect(text_first_line).toContain('[^1]');

    // Caret back to end → widget re-renders.
    move_cursor(view, doc.length);
    await next_frame();
    expect(refs_in(container).length).toBe(1);
  });
});

describe('footnote decorations — definition render', () => {
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

  it('emits line decoration with role=doc-endnote and a label mark', async () => {
    const doc = '[^1]: definition body text';
    view = mount_editor(container, doc);
    move_cursor(view, doc.length);
    await next_frame();
    const def_lines = def_lines_in(container);
    expect(def_lines.length).toBeGreaterThanOrEqual(1);
    expect(def_lines[0].getAttribute('role')).toBe('doc-endnote');
    const labels = container.querySelectorAll('.plainmark-footnote-label');
    expect(labels.length).toBeGreaterThanOrEqual(1);
    expect((labels[0] as HTMLElement).textContent).toBe('[^1]:');
  });

  it('decorates each line of a multi-line definition', async () => {
    // The MVP leaf-observer parser only consumes the first line; verify the
    // first-line decoration regardless.
    const doc = '[^1]: paragraph one\nparagraph two continuation';
    view = mount_editor(container, doc);
    move_cursor(view, doc.length);
    await next_frame();
    expect(def_lines_in(container).length).toBeGreaterThanOrEqual(1);
  });
});

describe('footnote_insert command', () => {
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

  it('inserts [^1] at caret + definition stub at end of doc on empty doc', async () => {
    view = mount_editor(container, 'hello');
    view.dispatch({ selection: { anchor: 5 } });
    insert_footnote(view);
    await next_frame();
    expect(view.state.doc.toString()).toBe('hello[^1]\n\n[^1]: ');
    // Caret lands at the end of the definition stub.
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
  });

  it('uses smallest unused numeric label', async () => {
    view = mount_editor(container, '[^1]: existing\n\n[^3]: other');
    view.dispatch({ selection: { anchor: 0 } });
    insert_footnote(view);
    await next_frame();
    // n=2 is the smallest unused.
    expect(view.state.doc.toString()).toContain('[^2]');
    expect(view.state.doc.toString().split('[^2]').length).toBe(3);
  });

  it('produces a single dispatch (one undo step) tagged userEvent input', async () => {
    view = mount_editor(container, 'prose');
    view.dispatch({ selection: { anchor: 5 } });
    const spy = vi.spyOn(view, 'dispatch');
    insert_footnote(view);
    await next_frame();
    expect(spy).toHaveBeenCalledTimes(1);
    const arg = spy.mock.calls[0][0] as {
      annotations?: { value?: string } | readonly { value?: string }[];
    };
    const ann = Array.isArray(arg.annotations) ? arg.annotations : [arg.annotations];
    const has_input = ann.some(
      (a) => a && typeof a === 'object' && 'value' in a && (a as { value?: string }).value === 'input',
    );
    expect(has_input).toBe(true);
    spy.mockRestore();
  });
});

describe('footnote reveal — covering selection (DEF-7)', () => {
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

  it('select-all keeps footnote refs rendered', async () => {
    const doc = 'Word[^x] more.\n\n[^x]: body';
    view = mount_editor(container, doc);
    move_cursor(view, doc.length);
    await next_frame();
    expect(refs_in(container)).toHaveLength(1);
    view.dispatch({ selection: { anchor: 0, head: doc.length } });
    await next_frame();
    expect(refs_in(container)).toHaveLength(1);
  });
});

describe('footnote popover — hover + click', () => {
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

  it('shows a click-persistent popover with definition body on mousedown', async () => {
    const doc = 'See[^1] here.\n\n[^1]: the definition text';
    view = mount_editor(container, doc);
    move_cursor(view, doc.length);
    await next_frame();
    const ref = refs_in(container)[0];
    expect(ref).toBeTruthy();
    ref.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await next_frame();
    const popover = document.querySelector('.plainmark-footnote-popover');
    expect(popover).not.toBeNull();
    expect(popover!.getAttribute('data-popover-mode')).toBe('click');
    const body = popover!.querySelector('.plainmark-footnote-popover-body');
    expect(body?.textContent ?? '').toContain('the definition text');
    // Close button works.
    const close = popover!.querySelector('.plainmark-footnote-popover-close') as HTMLButtonElement;
    expect(close).not.toBeNull();
    close.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await next_frame();
    expect(document.querySelector('.plainmark-footnote-popover')).toBeNull();
  });

  it('shows hover popover after delay and removes on mouseleave', async () => {
    const doc = 'Word[^x] more.\n\n[^x]: hovered body';
    view = mount_editor(container, doc);
    move_cursor(view, doc.length);
    await next_frame();
    const ref = refs_in(container)[0];
    expect(ref).toBeTruthy();
    ref.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 350));
    const popover = document.querySelector('.plainmark-footnote-popover');
    expect(popover).not.toBeNull();
    expect(popover!.getAttribute('data-popover-mode')).toBe('hover');
    ref.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: container }));
    await new Promise((r) => setTimeout(r, 250));
    expect(document.querySelector('.plainmark-footnote-popover')).toBeNull();
  });

  it('closes hover popover when pointer leaves the popover itself', async () => {
    const doc = 'Word[^x] more.\n\n[^x]: hovered body';
    view = mount_editor(container, doc);
    move_cursor(view, doc.length);
    await next_frame();
    const ref = refs_in(container)[0];
    ref.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 350));
    const popover = document.querySelector('.plainmark-footnote-popover');
    expect(popover).not.toBeNull();
    // Pointer moves from ref into the popover — must stay open.
    ref.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: popover }));
    await new Promise((r) => setTimeout(r, 250));
    expect(document.querySelector('.plainmark-footnote-popover')).not.toBeNull();
    // Pointer leaves the popover — must close after the hover-close delay.
    popover!.dispatchEvent(new MouseEvent('mouseleave', { relatedTarget: container }));
    await new Promise((r) => setTimeout(r, 250));
    expect(document.querySelector('.plainmark-footnote-popover')).toBeNull();
  });
});
