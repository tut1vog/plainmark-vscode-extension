// Quote-aware paste (BQ-I-13): dispatch a synthetic ClipboardEvent at a caret
// inside a blockquote/callout and assert the pasted lines are re-prefixed so
// the block stays one quote. The pure transform is tier-a
// (src/webview/paste_quote.test.ts); this tier owns the dispatch path —
// extension ordering, CRLF normalization, single-undo-step.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { undo } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { editor_extensions } from '../../src/webview/editor_extensions.js';

describe('BQ-I-13 paste dispatch re-prefixes multi-line text inside a quote', () => {
  let container: HTMLElement;
  let view: EditorView;

  beforeAll(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    view = new EditorView({
      state: EditorState.create({ doc: '', extensions: [...editor_extensions] }),
      parent: container,
    });
  });

  afterAll(() => {
    view?.destroy();
    container?.remove();
  });

  function paste(seed: string, caret: number, text_plain: string): void {
    view.setState(EditorState.create({ doc: seed, extensions: [...editor_extensions] }));
    view.dispatch({ selection: { anchor: caret } });
    view.contentDOM.focus();
    const dt = new DataTransfer();
    dt.setData('text/plain', text_plain);
    view.contentDOM.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  }

  it('a depth-1 paste keeps the following quote line quoted', () => {
    paste('> alpha\n> beta\n', '> alpha'.length, 'one\ntwo');
    expect(view.state.doc.toString()).toBe('> alphaone\n> two\n> beta\n');
  });

  it('a depth-2 paste preserves nesting', () => {
    paste('> > deep\n', '> > deep'.length, 'a\nb');
    expect(view.state.doc.toString()).toBe('> > deepa\n> > b\n');
  });

  it('a paste into a callout body stays in the callout', () => {
    const seed = '> [!NOTE] Title\n> body\n';
    paste(seed, seed.indexOf('> body') + '> body'.length, 'x\ny');
    expect(view.state.doc.toString()).toBe('> [!NOTE] Title\n> bodyx\n> y\n');
  });

  it('CRLF clipboard text normalizes to LF before prefixing', () => {
    paste('> alpha\n', '> alpha'.length, 'one\r\ntwo');
    expect(view.state.doc.toString()).toBe('> alphaone\n> two\n');
  });

  it('the whole paste reverts in a single undo step', () => {
    paste('> alpha\n> beta\n', '> alpha'.length, 'one\ntwo');
    undo(view);
    expect(view.state.doc.toString()).toBe('> alpha\n> beta\n');
  });

  it('a caret outside a quote falls through to the default paste', () => {
    paste('plain paragraph\n', 'plain'.length, 'one\ntwo');
    expect(view.state.doc.toString()).toBe('plainone\ntwo paragraph\n');
  });
});
