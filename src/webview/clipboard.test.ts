import { markdown } from '@codemirror/lang-markdown';
import { EditorSelection, EditorState, type Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { GFM } from '@lezer/markdown';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebviewToHostMessage } from '../sync/protocol.js';
import { create_clipboard_paste_controller, cut_selection } from './clipboard.js';
import { table_markdown_from_tsv } from './paste_table.js';

function make_view(doc: string, anchor: number, head: number) {
  let state = EditorState.create({
    doc,
    selection: EditorSelection.single(anchor, head),
  });
  const view = {
    get state() {
      return state;
    },
    dispatch(spec: Parameters<EditorView['dispatch']>[0]) {
      state = state.update(spec as never).state;
    },
  } as unknown as EditorView;
  return view;
}

function stub_clipboard(): { resolve: () => void; written: () => string | null } {
  let written: string | null = null;
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  vi.stubGlobal('navigator', {
    clipboard: {
      writeText: (text: string) => {
        written = text;
        return gate;
      },
    },
  });
  return { resolve: release, written: () => written };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cut_selection', () => {
  it('deletes the copied selection when nothing interleaves', async () => {
    const view = make_view('hello world', 0, 5);
    const clip = stub_clipboard();
    const done = cut_selection(view);
    clip.resolve();
    expect(await done).toBe(true);
    expect(clip.written()).toBe('hello');
    expect(view.state.doc.toString()).toBe(' world');
  });

  it('skips the deletion when a dispatch lands while the clipboard write is pending', async () => {
    const view = make_view('hello world', 0, 5);
    const clip = stub_clipboard();
    const done = cut_selection(view);
    // Simulate a host sync arriving mid-write: rewrite the selected region.
    view.dispatch({ changes: { from: 0, to: 5, insert: 'HELLO' } });
    clip.resolve();
    expect(await done).toBe(false);
    expect(clip.written()).toBe('hello');
    expect(view.state.doc.toString()).toBe('HELLO world');
  });
});

// Parses markdown so the quote-prefix branch can find an enclosing Blockquote.
function make_paste_harness(doc: string, anchor: number) {
  let state = EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM] })],
    selection: EditorSelection.single(anchor),
  });
  const transactions: Transaction[] = [];
  let focus_calls = 0;
  const view = {
    get state() {
      return state;
    },
    dispatch(spec: Parameters<EditorView['dispatch']>[0]) {
      const tr = state.update(spec as never);
      transactions.push(tr);
      state = tr.state;
    },
    focus() {
      focus_calls++;
    },
  } as unknown as EditorView;
  const posted: WebviewToHostMessage[] = [];
  const controller = create_clipboard_paste_controller(view, (m) => posted.push(m));
  return {
    controller,
    posted,
    transactions,
    doc: () => state.doc.toString(),
    focus_calls: () => focus_calls,
  };
}

describe('create_clipboard_paste_controller — menu paste', () => {
  it('request posts read_clipboard and the reply is inserted at the caret as input.paste', () => {
    const h = make_paste_harness('ab', 1);
    h.controller.request();
    expect(h.posted).toEqual([{ type: 'read_clipboard' }]);
    h.controller.deliver('X');
    expect(h.doc()).toBe('aXb');
    expect(h.transactions).toHaveLength(1);
    expect(h.transactions[0].isUserEvent('input.paste')).toBe(true);
    expect(h.focus_calls()).toBe(1);
  });

  it('ignores clipboard text that arrives without a pending request', () => {
    const h = make_paste_harness('ab', 1);
    h.controller.deliver('X');
    expect(h.doc()).toBe('ab');
    expect(h.transactions).toHaveLength(0);
    expect(h.focus_calls()).toBe(0);
  });

  it('consumes the pending flag on the first reply so a duplicate reply is dropped', () => {
    const h = make_paste_harness('ab', 1);
    h.controller.request();
    h.controller.deliver('X');
    h.controller.deliver('Y');
    expect(h.doc()).toBe('aXb');
    expect(h.transactions).toHaveLength(1);
  });

  it('an empty clipboard inserts nothing and still clears the pending flag', () => {
    const h = make_paste_harness('ab', 1);
    h.controller.request();
    h.controller.deliver('');
    expect(h.transactions).toHaveLength(0);
    expect(h.focus_calls()).toBe(0);
    h.controller.deliver('late');
    expect(h.doc()).toBe('ab');
  });

  it('normalises CRLF clipboard text to LF before inserting', () => {
    const h = make_paste_harness('', 0);
    h.controller.request();
    h.controller.deliver('one\r\ntwo\r\n');
    expect(h.doc()).toBe('one\ntwo\n');
  });

  it('TBL-I-35: converts a qualifying TSV payload into a markdown table', () => {
    const h = make_paste_harness('', 0);
    h.controller.request();
    h.controller.deliver('a\tb\nc\td');
    expect(h.doc().trim()).toBe(table_markdown_from_tsv('a\tb\nc\td')!.trim());
    expect(h.doc()).not.toContain('\t');
    expect(h.focus_calls()).toBe(1);
  });

  it('inserts TSV literally when the paste-table conversion is switched off', () => {
    vi.stubGlobal('window', { __plainmark_paste_table_conversion: false });
    const h = make_paste_harness('', 0);
    h.controller.request();
    h.controller.deliver('a\tb\nc\td');
    expect(h.doc()).toBe('a\tb\nc\td');
  });

  it('BQ-I-13: re-prefixes a multi-line paste inside a blockquote', () => {
    const doc = '> quote ';
    const h = make_paste_harness(doc, doc.length);
    h.controller.request();
    h.controller.deliver('one\ntwo');
    expect(h.doc()).toBe('> quote one\n> two');
  });

  it('falls back to the raw text when the caret is not in a blockquote', () => {
    const doc = 'para ';
    const h = make_paste_harness(doc, doc.length);
    h.controller.request();
    h.controller.deliver('one\ntwo');
    expect(h.doc()).toBe('para one\ntwo');
  });
});
