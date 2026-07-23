// NAV-N-6: word-wise motion (Ctrl+Arrow; Alt+Arrow on macOS) must stop at
// Intl.Segmenter word boundaries inside an unspaced CJK run instead of
// skipping the whole run as one group. Latin group motion must be unchanged.
//
// CM6's keymap resolves `key:` vs `mac:` from navigator.platform, so the
// modifier under test is platform-dependent — the same key users press.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import type { EditorView } from '@codemirror/view';
import { mount_editor, move_cursor } from './util.js';

const mac = /Mac/.test(navigator.platform);
const mod_open = mac ? '{Alt>}' : '{Control>}';
const mod_close = mac ? '{/Alt}' : '{/Control}';

async function word_key(arrow: 'ArrowLeft' | 'ArrowRight', shift = false): Promise<void> {
  const inner = shift ? `{Shift>}{${arrow}}{/Shift}` : `{${arrow}}`;
  await userEvent.keyboard(`${mod_open}${inner}${mod_close}`);
}

describe('word motion over CJK — NAV-N-6', () => {
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

  it('forward motion stops at a word boundary inside a CJK run', async () => {
    view = mount_editor(container, '你好世界hello\n');
    view.focus();
    move_cursor(view, 0);
    await word_key('ArrowRight');
    expect(view.state.selection.main.head).toBe(2);
    await word_key('ArrowRight');
    expect(view.state.selection.main.head).toBe(4);
  });

  it('backward motion stops at the previous word start', async () => {
    view = mount_editor(container, '你好世界\n');
    view.focus();
    move_cursor(view, 4);
    await word_key('ArrowLeft');
    expect(view.state.selection.main.head).toBe(2);
  });

  it('shift extends the selection by one CJK word', async () => {
    view = mount_editor(container, '你好世界\n');
    view.focus();
    move_cursor(view, 0);
    await word_key('ArrowRight', true);
    expect(view.state.selection.main.anchor).toBe(0);
    expect(view.state.selection.main.head).toBe(2);
  });

  it('latin word motion is unchanged', async () => {
    view = mount_editor(container, 'hello world\n');
    view.focus();
    move_cursor(view, 0);
    await word_key('ArrowRight');
    expect(view.state.selection.main.head).toBe(5);
  });
});
