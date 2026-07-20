import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { completionStatus, startCompletion } from '@codemirror/autocomplete';
import { editor_extensions } from '../../src/webview/editor_extensions.js';

// Guards the keymap precedence between the completion accept and the
// configured list-continuation Enter (LIST-I-7). The completion keymap is
// Prec.highest (registered by autocompletion()); the configured
// insertNewlineContinueMarkupCommand binding must sit at Prec.high — when a
// regression once placed it in the earlier Prec.highest block, it outranked
// the accept at equal precedence (earlier-in-array wins) and Enter on an open
// callout popup inserted a newline into the quote instead of the selection.

function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r(null as never)));
}
async function frames(n: number): Promise<void> {
  for (let i = 0; i < n; i++) await next_frame();
}

describe('Enter accepts the callout completion inside a quote', () => {
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

  it('inserts the selected callout type, not a newline', async () => {
    const doc = '> [';
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
    // acceptCompletion declines within interactionMillis (75ms) of the popup
    // opening; wait past it like a real keypress would land.
    await new Promise((r) => setTimeout(r, 150));

    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }),
    );
    await frames(2);

    // Whichever option the popup pre-selects, Enter must insert it — one
    // line, no `\n> ` quote continuation.
    expect(view.state.doc.toString()).toMatch(/^> \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\] $/);
    expect(view.state.doc.lines).toBe(1);
  });
});
