// pointer_down latch wiring (mousedown on editor → document mouseup).
// Verifies the DOM event handlers and the document-level mouseup cleanup that
// the reveal gate in text_styles.ts / links.ts depends on.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  pointer_down_field,
  pointer_state_extension,
} from '../../src/webview/decorations/pointer_state.js';

describe('pointer_state DOM wiring', () => {
  let container: HTMLElement;
  let view: EditorView;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    view = new EditorView({
      state: EditorState.create({
        doc: 'hello world',
        extensions: [pointer_state_extension],
      }),
      parent: container,
    });
  });

  afterEach(() => {
    view.destroy();
    container.remove();
  });

  it('starts with pointer_down = false', () => {
    expect(view.state.field(pointer_down_field)).toBe(false);
  });

  it('sets pointer_down = true on editor mousedown', () => {
    view.contentDOM.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
    );
    expect(view.state.field(pointer_down_field)).toBe(true);
  });

  it('clears pointer_down on document-level mouseup', () => {
    view.contentDOM.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
    );
    expect(view.state.field(pointer_down_field)).toBe(true);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(view.state.field(pointer_down_field)).toBe(false);
  });

  it('clears pointer_down even when mouseup fires outside the editor DOM', () => {
    view.contentDOM.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
    );
    // Release on body, not on the editor's contentDOM (drag-release outside).
    document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(view.state.field(pointer_down_field)).toBe(false);
  });

  it('recovers a stuck latch on in-editor movement with no button held (MRS-P-6)', () => {
    // Models a release outside the webview iframe: the mouseup never reaches
    // this document, so the latch would stay stuck. The next button-less move
    // over the editor must clear it.
    view.contentDOM.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
    );
    expect(view.state.field(pointer_down_field)).toBe(true);
    view.contentDOM.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 0 }));
    expect(view.state.field(pointer_down_field)).toBe(false);
  });

  it('does not clear the latch on a mid-drag move with a button held (MRS-P-6)', () => {
    view.contentDOM.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
    );
    view.contentDOM.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 1 }));
    expect(view.state.field(pointer_down_field)).toBe(true);
  });

  it('removes the movement-recovery listener on view destroy (MRS-P-6)', () => {
    view.contentDOM.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
    );
    const dom = view.contentDOM;
    view.destroy();
    expect(() => {
      dom.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 0 }));
    }).not.toThrow();
    view = new EditorView({
      state: EditorState.create({ doc: 'x' }),
      parent: container,
    });
  });

  it('does not dispatch a transaction when mouseup fires without a prior mousedown', () => {
    let dispatched = 0;
    const original = view.dispatch.bind(view);
    view.dispatch = ((...args: Parameters<typeof view.dispatch>) => {
      dispatched += 1;
      return original(...args);
    }) as typeof view.dispatch;
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(dispatched).toBe(0);
    expect(view.state.field(pointer_down_field)).toBe(false);
  });

  it('removes the document-level mouseup listener on view destroy', () => {
    view.contentDOM.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
    );
    view.destroy();
    // After destroy, the listener must be gone — dispatching mouseup must not
    // throw (a stale handler would touch the destroyed view's state).
    expect(() => {
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    }).not.toThrow();
    // Recreate so afterEach's destroy is a no-op on a fresh view.
    view = new EditorView({
      state: EditorState.create({ doc: 'x' }),
      parent: container,
    });
  });

  it('repeated mousedowns do not dispatch redundant transactions', () => {
    view.contentDOM.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
    );
    let dispatched = 0;
    const original = view.dispatch.bind(view);
    view.dispatch = ((...args: Parameters<typeof view.dispatch>) => {
      dispatched += 1;
      return original(...args);
    }) as typeof view.dispatch;
    // A second mousedown while already down — the handler guards on the field.
    view.contentDOM.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
    );
    expect(dispatched).toBe(0);
    expect(view.state.field(pointer_down_field)).toBe(true);
  });
});
