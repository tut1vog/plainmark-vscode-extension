// NAV-N-7: word-wise deletion (Ctrl+Backspace / Ctrl+Delete; Alt on macOS)
// must remove only up to the nearest Intl.Segmenter word boundary inside an
// unspaced CJK run instead of the whole run. Latin deletion must be unchanged.
//
// CM6's keymap resolves `key:` vs `mac:` from navigator.platform, so the
// modifier under test is platform-dependent — the same key users press.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import type { EditorView } from '@codemirror/view';
import { get_line_text, mount_editor, move_cursor } from './util.js';

const mac = /Mac/.test(navigator.platform);
const mod_open = mac ? '{Alt>}' : '{Control>}';
const mod_close = mac ? '{/Alt}' : '{/Control}';

async function word_delete(key: 'Backspace' | 'Delete'): Promise<void> {
  await userEvent.keyboard(`${mod_open}{${key}}${mod_close}`);
}

describe('word deletion over CJK — NAV-N-7', () => {
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

  it('backspace removes one CJK word, not the whole run', async () => {
    view = mount_editor(container, '你好世界\n');
    view.focus();
    move_cursor(view, 4);
    await word_delete('Backspace');
    expect(get_line_text(view, 0)).toBe('你好');
    expect(view.state.selection.main.head).toBe(2);
  });

  it('delete removes the first CJK word forward', async () => {
    view = mount_editor(container, '你好世界\n');
    view.focus();
    move_cursor(view, 0);
    await word_delete('Delete');
    expect(get_line_text(view, 0)).toBe('世界');
  });

  it('latin word deletion is unchanged', async () => {
    view = mount_editor(container, 'hello world\n');
    view.focus();
    move_cursor(view, 11);
    await word_delete('Backspace');
    expect(get_line_text(view, 0)).toBe('hello ');
  });
});
