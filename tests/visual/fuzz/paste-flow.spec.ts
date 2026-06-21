// Paste-flow tests (T28.6).
//
// For each fixture in `tests/fuzz/fixtures/paste-corpus/index.json`, mount
// the production editor with a seed document, dispatch a synthetic
// `ClipboardEvent('paste')` carrying a real (native) `DataTransfer`, and
// assert:
//   1. The dispatch does not throw.
//   2. The sentinel-clean console invariant from T28.1 holds.
//   3. Bytes outside the caret position pre-paste are byte-identical to
//      bytes before the caret / after the inserted span post-paste —
//      the INV-SP-1 invariant.
//
// Chromium's ClipboardEvent constructor rejects any `clipboardData` value
// that is not a real DataTransfer instance, so the Lexical-style
// `DataTransferMock` clone in `tests/fuzz/data-transfer-mock.ts` is kept
// for hypothetical non-browser tiers but not used here — a freshly
// constructed `new DataTransfer()` supports `setData('text/html', ...)` /
// `setData('text/plain', ...)` in the Playwright + Chromium environment.

import { afterAll, beforeAll, describe, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { editor_extensions } from '../../../src/webview/editor_extensions.js';
import corpus from '../../fuzz/fixtures/paste-corpus/index.json';
import { allow_console, unexpected_console_snapshot } from '../console-sentinel.js';

interface PasteFixture {
  name: string;
  text_plain: string;
  text_html?: string;
}

const SEED_DOC = '# Heading\n\nFirst paragraph.\n\nSecond paragraph.\n';
const CARET_OFFSET = SEED_DOC.indexOf('First paragraph.') + 'First paragraph.'.length;

describe('paste flow: synthetic ClipboardEvent into the production editor', () => {
  let container: HTMLElement;
  let view: EditorView;

  beforeAll(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    view = new EditorView({
      state: EditorState.create({ doc: SEED_DOC, extensions: [...editor_extensions] }),
      parent: container,
    });
  });

  afterAll(() => {
    view?.destroy();
    container?.remove();
  });

  for (const fixture of (corpus as { entries: PasteFixture[] }).entries) {
    it(`pastes ${fixture.name} without throwing and preserves bytes outside the paste range`, () => {
      // Math/mermaid widget warnings are orthogonal to paste correctness.
      allow_console(/math.*typeset failed/);
      allow_console(/mermaid render failed/);
      allow_console(/mermaid bundle load failed/);

      // Reset the editor to the seed doc + caret position. This isolates
      // fixtures from each other: a fixture that inserts content into the
      // doc doesn't pollute the next fixture's assertions.
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: SEED_DOC },
        selection: { anchor: CARET_OFFSET },
      });
      view.contentDOM.focus();

      // Chromium's `new ClipboardEvent('paste', { clipboardData })` constructor
      // refuses any non-DataTransfer instance; use a real DataTransfer (which
      // is freely constructible in modern browsers — supports setData on
      // every MIME type we exercise here).
      const dt = new DataTransfer();
      dt.setData('text/plain', fixture.text_plain);
      if (fixture.text_html) dt.setData('text/html', fixture.text_html);

      const before_text = view.state.doc.toString();
      const before_head = before_text.slice(0, CARET_OFFSET);
      const before_tail = before_text.slice(CARET_OFFSET);

      let threw: unknown = null;
      try {
        const event = new ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        });
        view.contentDOM.dispatchEvent(event);
      } catch (err) {
        threw = err;
      }

      if (threw) {
        throw new Error(
          `T28.6 paste flow: dispatch threw for fixture "${fixture.name}": ` +
            `${threw instanceof Error ? threw.stack ?? threw.message : String(threw)}`,
        );
      }

      const after_text = view.state.doc.toString();
      const new_caret = view.state.selection.main.head;
      const inserted_length = after_text.length - before_text.length;

      if (after_text.slice(0, CARET_OFFSET) !== before_head) {
        throw new Error(
          `T28.6 paste flow: head bytes diverged for fixture "${fixture.name}"\n` +
            `expected head: ${JSON.stringify(before_head)}\n` +
            `   actual head: ${JSON.stringify(after_text.slice(0, CARET_OFFSET))}`,
        );
      }

      const tail_after = after_text.slice(CARET_OFFSET + Math.max(0, inserted_length));
      if (tail_after !== before_tail) {
        throw new Error(
          `T28.6 paste flow: tail bytes diverged for fixture "${fixture.name}"\n` +
            `expected tail: ${JSON.stringify(before_tail)}\n` +
            `   actual tail: ${JSON.stringify(tail_after)}\n` +
            `inserted: ${JSON.stringify(after_text.slice(CARET_OFFSET, new_caret))}`,
        );
      }

      const captured = unexpected_console_snapshot();
      if (captured.length > 0) {
        throw new Error(
          `T28.6 paste flow: console error/warn for fixture "${fixture.name}":\n  ` +
            captured.map((c) => `[${c.channel}] ${c.text}`).join('\n  '),
        );
      }
    });
  }
});
