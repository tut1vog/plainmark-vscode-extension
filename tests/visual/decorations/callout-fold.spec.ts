import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { frames, mount_editor, move_cursor } from '../util.js';

// CALL-R-8 / CALL-R-13 / CALL-I-8 / CALL-I-9: a `-` callout opens collapsed, `+` opens
// expanded, the chevron toggles, and a caret entering the body unfolds it.
// Every fold is view state only — the document bytes never change (CALL-SP-1).

function bodies(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll('.plainmark-callout-body'));
}

function header(container: HTMLElement): HTMLElement | null {
  return container.querySelector('.plainmark-callout-header');
}

function chevron(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('.plainmark-callout-fold-marker');
  if (!el) throw new Error('no fold chevron rendered');
  return el;
}

function click(el: HTMLElement): void {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
}

describe('callout folding', () => {
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

  it('a `-` callout mounts collapsed: body hidden, header padded, chevron rotated', async () => {
    const doc = 'para\n> [!NOTE]- Title\n> body\n> more';
    view = mount_editor(container, doc);
    await frames(3);
    expect(bodies(container)).toHaveLength(0);
    expect(header(container)?.classList.contains('plainmark-callout-folded')).toBe(true);
    expect(getComputedStyle(chevron(container)).transform).not.toBe('none');
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('a `+` callout mounts expanded', async () => {
    view = mount_editor(container, '> [!NOTE]+ Title\n> body');
    await frames(3);
    expect(bodies(container)).toHaveLength(1);
    expect(header(container)?.classList.contains('plainmark-callout-folded')).toBe(false);
    expect(getComputedStyle(chevron(container)).transform).toBe('none');
  });

  it('clicking the chevron toggles the fold without touching bytes or moving the caret', async () => {
    const doc = '> [!TIP]- Title\n> body\n> more';
    view = mount_editor(container, doc);
    await frames(3);
    expect(bodies(container)).toHaveLength(0);
    const head_before = view.state.selection.main.head;

    click(chevron(container));
    await frames(2);
    expect(bodies(container)).toHaveLength(2);
    expect(header(container)?.classList.contains('plainmark-callout-folded')).toBe(false);
    expect(container.querySelector('.plainmark-callout-title')).not.toBeNull();
    expect(view.state.selection.main.head).toBe(head_before);
    // The fold split the viewport into two ranges around the callout; its
    // handlers must not have run once per range (no doubled line classes).
    for (const line of Array.from(container.querySelectorAll('.cm-line'))) {
      const classes = Array.from(line.classList);
      expect(new Set(classes).size).toBe(classes.length);
    }

    click(chevron(container));
    await frames(2);
    expect(bodies(container)).toHaveLength(0);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('a caret moved into the hidden body unfolds the callout', async () => {
    const doc = '> [!NOTE]- Title\n> body\n> more';
    view = mount_editor(container, doc);
    await frames(3);
    expect(bodies(container)).toHaveLength(0);
    move_cursor(view, doc.indexOf('body') + 2);
    await frames(2);
    expect(bodies(container)).toHaveLength(2);
  });

  it('a caret on the header line reveals the raw header but keeps the body folded', async () => {
    const doc = '> [!NOTE]- Title\n> body';
    view = mount_editor(container, doc);
    await frames(3);
    move_cursor(view, 3);
    await frames(2);
    expect(container.querySelector('.plainmark-callout-title')).toBeNull();
    expect(bodies(container)).toHaveLength(0);
  });

  it('typing the `-` marker onto an open callout collapses it; removing it re-arms the default', async () => {
    const doc = '> [!NOTE] Title\n> body';
    view = mount_editor(container, doc);
    await frames(3);
    expect(bodies(container)).toHaveLength(1);
    const marker_pos = doc.indexOf(']') + 1;
    view.dispatch({ changes: { from: marker_pos, insert: '-' } });
    await frames(3);
    expect(bodies(container)).toHaveLength(0);

    click(chevron(container));
    await frames(2);
    expect(bodies(container)).toHaveLength(1);

    view.dispatch({ changes: { from: marker_pos, to: marker_pos + 1 } });
    await frames(3);
    expect(bodies(container)).toHaveLength(1);
    view.dispatch({ changes: { from: marker_pos, insert: '-' } });
    await frames(3);
    expect(bodies(container)).toHaveLength(0);
  });

  it('a bare `-` header with no body renders a chevron and no fold', async () => {
    view = mount_editor(container, 'para\n> [!NOTE]- Title');
    move_cursor(view, 0);
    await frames(3);
    expect(chevron(container)).toBeTruthy();
    expect(header(container)?.classList.contains('plainmark-callout-folded')).toBe(false);
  });
});
