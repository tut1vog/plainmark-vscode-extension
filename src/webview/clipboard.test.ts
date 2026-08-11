import { EditorSelection, EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cut_selection } from './clipboard.js';

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
