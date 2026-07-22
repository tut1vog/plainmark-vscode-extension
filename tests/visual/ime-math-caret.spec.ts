// IME caret placement after an inline math widget (regression coverage).
//
// Smoke-reported bug: with a Chinese IME, pressing '：' at `$x$ a<caret>a`
// inserted the character correctly but left the caret at line end
// (`$x$ a：a<caret>`) instead of after the '：'. The inline-math
// Decoration.replace widget earlier on the line was required to trigger it.
//
// This spec pins every IME commit path reachable from the agent harness:
// - CDP `Input.imeSetComposition` + `Input.insertText` (real Chromium IME
//   pipeline, Windows-pinyin-style one-shot composition commit);
// - CDP `Input.insertText` alone (macOS-style direct punctuation commit);
// - synthetic CompositionEvents + direct text-node mutation + observer flush
//   (CM6 webtest-composition.ts technique), with the mutation record arriving
//   before vs after `compositionend` (pinyin IMEs commonly deliver it a few
//   ms after compositionend, inside CM6's 50ms grace window).
//
// None of these reproduced the smoke bug on @codemirror/view 6.42.1 — the
// live OS-IME path goes through Chromium input machinery CDP cannot emulate —
// so the authoritative check for the original symptom stays with the owner
// smoke test. These cases guard the emulatable neighborhood of the same
// geometry (caret slots around the widget) against regressions.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { EditorView } from '@codemirror/view';
import { mount_editor, move_cursor } from './util.js';
import { ensure_mathjax } from './mathjax-ready.js';

declare module 'vitest/browser' {
  interface BrowserCommands {
    ime_commit: (text: string) => Promise<void>;
    ime_insert_text: (text: string) => Promise<void>;
  }
}

// Pin the contenteditable path (CM6 enables EditContext only on Android; the
// VS Code webview targets are desktop Chromium).
(EditorView as unknown as { EDIT_CONTEXT: boolean }).EDIT_CONTEXT = false;

interface ObserverView {
  observer: { flush(): void };
}

function comp_event(view: EditorView, type: string): void {
  view.contentDOM.dispatchEvent(new CompositionEvent(type));
}

function flush(view: EditorView): void {
  (view as unknown as ObserverView).observer.flush();
}

// Mimic the IME: splice `text` into the DOM text node and collapse the DOM
// selection right after it (what the browser does on a punctuation commit).
function ime_splice(node: Text, text: string, at: number): void {
  const val = node.nodeValue ?? '';
  node.nodeValue = val.slice(0, at) + text + val.slice(at);
  document.getSelection()?.collapse(node, at + text.length);
}

async function settle_composition(view: EditorView): Promise<void> {
  // Cover CM6's 50ms post-compositionend window plus a frame.
  await new Promise((resolve) => setTimeout(resolve, 80));
  view.update([]);
}

describe('IME punctuation after inline math', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(async () => {
    await ensure_mathjax();
    container = document.createElement('div');
    container.style.width = '800px';
    document.body.appendChild(container);
  });

  afterEach(() => {
    view?.destroy();
    view = undefined;
    container.remove();
  });

  async function mount_and_place(doc: string, caret: number): Promise<EditorView> {
    view = mount_editor(container, doc);
    // Wait for the math widget to leave its pending state so the DOM carries
    // the rendered inline widget, matching the user-visible repro.
    if (doc.includes('$')) {
      await expect
        .poll(() => container.querySelectorAll('.plainmark-math-pending').length, {
          timeout: 30000,
        })
        .toBe(0);
    }
    view.focus();
    move_cursor(view, caret);
    return view;
  }

  function type_fullwidth_colon(v: EditorView, pos: number, mutation_after_end: boolean): void {
    const { node, offset } = v.domAtPos(pos);
    expect(node.nodeType, 'expected a text node at the caret').toBe(Node.TEXT_NODE);
    comp_event(v, 'compositionstart');
    comp_event(v, 'compositionupdate');
    if (mutation_after_end) {
      comp_event(v, 'compositionend');
      ime_splice(node as Text, '：', offset);
      flush(v);
    } else {
      ime_splice(node as Text, '：', offset);
      flush(v);
      comp_event(v, 'compositionend');
      flush(v);
    }
  }

  it("CDP IME: keeps the caret after the inserted '：' with inline math on the line", async () => {
    const v = await mount_and_place('$x$ aa', 5);
    expect(v.hasFocus, 'editor must be focused for a faithful IME repro').toBe(true);
    await commands.ime_commit('：');
    await settle_composition(v);
    expect(v.state.doc.toString()).toBe('$x$ a：a');
    expect(v.state.selection.main.head).toBe(6);
  });

  it("CDP IME control: keeps the caret after the inserted '：' without math", async () => {
    const v = await mount_and_place('yx. aa', 5);
    expect(v.hasFocus, 'editor must be focused for a faithful IME repro').toBe(true);
    await commands.ime_commit('：');
    await settle_composition(v);
    expect(v.state.doc.toString()).toBe('yx. a：a');
    expect(v.state.selection.main.head).toBe(6);
  });

  it("CDP direct insertText (macOS-style commit): caret after '：' with inline math", async () => {
    const v = await mount_and_place('$x$ aa', 5);
    expect(v.hasFocus, 'editor must be focused for a faithful IME repro').toBe(true);
    await commands.ime_insert_text('：');
    await settle_composition(v);
    expect(v.state.doc.toString()).toBe('$x$ a：a');
    expect(v.state.selection.main.head).toBe(6);
  });

  // Sweep every caret slot after the widget on `$x$ aa` — the user repro sits
  // at 5, but the decisive geometry may be widget adjacency.
  for (const pos of [4, 5, 6]) {
    it(`CDP IME sweep: caret slot ${pos} on '$x$ aa'`, async () => {
      const v = await mount_and_place('$x$ aa', pos);
      expect(v.hasFocus, 'editor must be focused for a faithful IME repro').toBe(true);
      await commands.ime_commit('：');
      await settle_composition(v);
      const doc = '$x$ aa'.slice(0, pos) + '：' + '$x$ aa'.slice(pos);
      expect(v.state.doc.toString()).toBe(doc);
      expect(v.state.selection.main.head).toBe(pos + 1);
    });
  }

  for (const after_end of [false, true]) {
    const label = after_end ? 'mutation after compositionend' : 'mutation before compositionend';

    it(`keeps the caret after the inserted '：' with inline math on the line (${label})`, async () => {
      const v = await mount_and_place('$x$ aa', 5);
      expect(v.hasFocus, 'editor must be focused for a faithful IME repro').toBe(true);
      type_fullwidth_colon(v, 5, after_end);
      await settle_composition(v);
      expect(v.state.doc.toString()).toBe('$x$ a：a');
      expect(v.state.selection.main.head).toBe(6);
    });

    it(`control: keeps the caret after the inserted '：' without math (${label})`, async () => {
      const v = await mount_and_place('yx. aa', 5);
      expect(v.hasFocus, 'editor must be focused for a faithful IME repro').toBe(true);
      type_fullwidth_colon(v, 5, after_end);
      await settle_composition(v);
      expect(v.state.doc.toString()).toBe('yx. a：a');
      expect(v.state.selection.main.head).toBe(6);
    });
  }
});
