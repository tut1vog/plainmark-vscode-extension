import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { completionStatus, startCompletion } from '@codemirror/autocomplete';
import { editor_extensions } from '../../src/webview/editor_extensions.js';
import { frames, next_frame } from './util.js';

// The fence auto-close Enter (CBLK-I-6) sits at Prec.highest ahead of the
// completion keymap; with the fence-tag popup open it must yield so Enter
// accepts the highlighted tag instead of closing the fence around a partial one.

describe('CBLK-I-18: Enter accepts the fence-tag completion instead of auto-closing', () => {
  let host: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    host = document.createElement('div');
    host.style.width = '600px';
    host.style.height = '300px';
    document.body.appendChild(host);
  });
  afterEach(() => {
    view?.destroy();
    view = undefined;
    host.remove();
  });

  it('inserts the selected tag on one line, no closing fence', async () => {
    const doc = '```py';
    view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: doc.length },
        extensions: [...editor_extensions],
      }),
      parent: host,
    });
    view.focus();
    await frames(2);
    startCompletion(view);
    for (let i = 0; i < 40 && completionStatus(view.state) !== 'active'; i++) {
      await next_frame();
    }
    expect(completionStatus(view.state)).toBe('active');
    // acceptCompletion declines within interactionMillis (75ms) of the popup opening.
    await new Promise((r) => setTimeout(r, 150));

    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }),
    );
    await frames(2);

    expect(view.state.doc.lines).toBe(1);
    expect(view.state.doc.toString()).toMatch(/^```[a-z0-9+#-]+$/);
  });
});
