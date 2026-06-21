// T19.23 — link navigation defers from mousedown to click (post-mouseup), so
// the pointer-state reveal gate completes its cycle before the page changes.
// Only Cmd/Ctrl-click navigates; a plain click always defers to caret placement.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { mount_editor } from '../util.js';

function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}

function find_link_span(container: HTMLElement, href: string): HTMLElement {
  const el = container.querySelector(`[data-plainmark-href="${href}"]`) as HTMLElement | null;
  if (!el) throw new Error(`no link span for href ${href}`);
  return el;
}

describe('link navigation timing (T19.23)', () => {
  let container: HTMLElement;
  let view: EditorView;
  let dispatched: string[];
  let listener: (e: Event) => void;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatched = [];
    listener = (e: Event) => {
      const ce = e as CustomEvent<{ href: string }>;
      dispatched.push(ce.detail.href);
    };
    document.addEventListener('plainmark-link-click', listener);
  });

  afterEach(() => {
    document.removeEventListener('plainmark-link-click', listener);
    view?.destroy();
    container.remove();
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  it('does NOT navigate on mousedown alone — navigation waits for click', async () => {
    // Doc: link on line 1, caret parked off the link's line.
    const doc = '[lk](http://e.co) xy\nhello\n';
    view = mount_editor(container, doc);
    view.dispatch({ selection: { anchor: doc.length } });
    await next_frame();
    await next_frame();

    const link = find_link_span(container, 'http://e.co');
    const rect = link.getBoundingClientRect();
    link.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: rect.left + 5,
        clientY: rect.top + rect.height / 2,
      }),
    );
    await next_frame();

    expect(dispatched).toEqual([]);
  });

  it('does NOT navigate on a plain click from a different line — navigation requires a modifier', async () => {
    const doc = '[lk](http://e.co) xy\nhello\n';
    view = mount_editor(container, doc);
    // Park caret on line 2 ('hello'), away from the link line.
    view.dispatch({ selection: { anchor: 23 } }); // mid 'hello' on line 2
    await next_frame();
    await next_frame();

    const link = find_link_span(container, 'http://e.co');
    const rect = link.getBoundingClientRect();
    const coords = {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };
    link.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, ...coords }),
    );
    // Simulate CM6's mousedown caret move into the link on line 1.
    view.dispatch({ selection: { anchor: 2 } });
    link.dispatchEvent(
      new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0, ...coords }),
    );
    link.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...coords }),
    );
    await next_frame();

    expect(dispatched).toEqual([]);
  });

  it('does NOT navigate on a plain click whose pre-mousedown caret was already on the link line', async () => {
    const doc = '[lk](http://e.co) xy\nhello\n';
    view = mount_editor(container, doc);
    view.dispatch({ selection: { anchor: 19 } }); // 'y' on line 1
    await next_frame();
    await next_frame();

    const link = find_link_span(container, 'http://e.co');
    const rect = link.getBoundingClientRect();
    const coords = {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };
    link.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, ...coords }),
    );
    // Simulate CM6's mousedown caret move (synthetic events don't fire CM6's
    // internal pointer logic reliably — manually move caret into the link).
    view.dispatch({ selection: { anchor: 2 } }); // mid-link on line 1
    link.dispatchEvent(
      new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0, ...coords }),
    );
    link.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...coords }),
    );
    await next_frame();

    expect(dispatched).toEqual([]);
  });

  it('Cmd/Ctrl-click navigates regardless of caret line (even when pre-mousedown caret was already on link line)', async () => {
    const doc = '[lk](http://e.co) xy\nhello\n';
    view = mount_editor(container, doc);
    view.dispatch({ selection: { anchor: 19 } }); // same line as link
    await next_frame();
    await next_frame();

    const link = find_link_span(container, 'http://e.co');
    const rect = link.getBoundingClientRect();
    const coords = {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };
    link.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true, cancelable: true, button: 0, metaKey: true, ...coords,
      }),
    );
    view.dispatch({ selection: { anchor: 2 } }); // simulate caret move
    link.dispatchEvent(
      new MouseEvent('mouseup', {
        bubbles: true, cancelable: true, button: 0, metaKey: true, ...coords,
      }),
    );
    link.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true, cancelable: true, button: 0, metaKey: true, ...coords,
      }),
    );
    await next_frame();

    expect(dispatched).toEqual(['http://e.co']);
  });

  it('navigation target is the snapshot href, not the click target (which may have shifted after marker reveal)', async () => {
    // Simulates the real F5 layout-shift scenario: between mousedown and
    // click, the pointer_state gate clears on mouseup, markers reveal, the
    // DOM shifts and the click target's `closest('[data-plainmark-href]')`
    // might miss. The snapshot's href must still drive navigation.
    const doc = '[lk](http://e.co) xy\nhello\n';
    view = mount_editor(container, doc);
    view.dispatch({ selection: { anchor: 23 } }); // line 2 'hello'
    await next_frame();
    await next_frame();

    const link = find_link_span(container, 'http://e.co');
    const rect = link.getBoundingClientRect();
    const coords = {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };
    link.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, metaKey: true, ...coords }),
    );
    view.dispatch({ selection: { anchor: 2 } }); // CM6 caret-move to link line
    link.dispatchEvent(
      new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0, metaKey: true, ...coords }),
    );
    // Fire the modified click on a non-link sibling — simulates the
    // shift-broke-target case. Snapshot-based navigation should still fire
    // because the href came from the mousedown snapshot, not this target.
    const non_link = container.querySelector('.cm-line') as HTMLElement;
    non_link.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, metaKey: true, ...coords }),
    );
    await next_frame();

    expect(dispatched).toEqual(['http://e.co']);
  });
});
