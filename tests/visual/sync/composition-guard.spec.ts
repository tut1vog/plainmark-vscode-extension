import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { dispatch_host_sync_to_view } from '../../../src/webview/sync.js';

// Drives the real CM6 composition state machine via DOM events. The actual
// IME-driven caret-drift symptom (cursor jumps to end-of-region after Chinese
// punctuation commit) requires the browser's IME state machine to participate,
// which neither @vitest/browser nor Playwright can simulate. This suite pins
// the guard contract — CM6's `composing` / `compositionStarted` flags react to
// compositionstart/compositionend events the same way the IME drives them, so
// our guard's behavior is exercised against the actual CM6 implementation.

describe('dispatch_host_sync_to_view — composition guard against real CM6 view', () => {
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

  function mount(doc: string, anchor: number): EditorView {
    return new EditorView({
      state: EditorState.create({ doc, selection: { anchor } }),
      parent: container,
    });
  }

  function fire(target: Element, type: string): void {
    target.dispatchEvent(new CompositionEvent(type, { bubbles: true, cancelable: true }));
  }

  it('view.composing/compositionStarted react to DOM composition events', () => {
    view = mount('中文', 1);
    expect(view.composing).toBe(false);
    expect(view.compositionStarted).toBe(false);

    fire(view.contentDOM, 'compositionstart');
    expect(view.compositionStarted).toBe(true);

    fire(view.contentDOM, 'compositionend');
    expect(view.compositionStarted).toBe(false);
  });

  it('defers sync during composition; doc and cursor unchanged', () => {
    view = mount('中文', 1);
    fire(view.contentDOM, 'compositionstart');

    dispatch_host_sync_to_view(view, '中，文');

    expect(view.state.doc.toString()).toBe('中文');
    expect(view.state.selection.main.head).toBe(1);
  });

  it('applies the deferred sync after composition ends', async () => {
    view = mount('中文', 1);
    fire(view.contentDOM, 'compositionstart');

    dispatch_host_sync_to_view(view, '中，文');
    expect(view.state.doc.toString()).toBe('中文');

    fire(view.contentDOM, 'compositionend');

    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    expect(view.state.doc.toString()).toBe('中，文');
  });

  it('applies the sync immediately outside composition', () => {
    view = mount('中文', 1);
    dispatch_host_sync_to_view(view, '中，文');
    expect(view.state.doc.toString()).toBe('中，文');
  });

  it('demonstrates the unguarded leak: full-doc replace during composition collapses cursor', () => {
    // Bypass the guard to show what would happen if we dispatched a whole-doc
    // replace mid-composition — the CM6 selection mapping (assoc=-1 default)
    // dumps the cursor to position 0. On top of this, in a real IME session,
    // CM6's docView.hasComposition gets nulled and the IME's pending commit
    // lands at end-of-contenteditable — the user-visible "cursor at end" bug.
    view = mount('中文', 1);
    fire(view.contentDOM, 'compositionstart');
    expect(view.compositionStarted).toBe(true);

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: '中，文' },
    });

    expect(view.state.doc.toString()).toBe('中，文');
    expect(view.state.selection.main.head).toBe(0);

    fire(view.contentDOM, 'compositionend');
  });
});
