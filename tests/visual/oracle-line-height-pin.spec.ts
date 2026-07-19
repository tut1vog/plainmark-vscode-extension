import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { editor_extensions } from '../../src/webview/editor_extensions.js';

// Guards SHELL-X-15. CM6 derives the document-wide oracle line-height by sampling
// the first short (<=20 char), all-text, ASCII rendered line. A revealed `##`
// heading is exactly that — short and all-text once its marker mark is dropped —
// and it is tall, so without the oracle pin CM6 samples it and the height map
// thrashes as the viewport moves (the live "Measure loop restarted" snap, not
// headless-reproducible). These
// guard that the pin holds the sample at body height regardless of viewport content.

interface DocViewMeasured {
  docView: { measureTextSize: () => { lineHeight: number; charWidth: number; textHeight: number } };
}

function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}
async function frames(n: number): Promise<void> {
  for (let i = 0; i < n; i++) await next_frame();
}
function sampled_line_height(view: EditorView): number {
  return (view as unknown as DocViewMeasured).docView.measureTextSize().lineHeight;
}

describe('oracle line-height pin', () => {
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

  function mount(doc: string, anchor: number): EditorView {
    return new EditorView({
      state: EditorState.create({ doc, extensions: [...editor_extensions], selection: { anchor } }),
      parent: host,
    });
  }

  // anchor 1 sits inside the `##` marker range [0,3) → the heading reveals, drops
  // its marker mark, and becomes an all-text line that qualifies as CM6's sample.
  it('samples body height even when a revealed tall heading qualifies', async () => {
    view = mount('## Hi\nplain paragraph body line, well over twenty characters\n', 1);
    await frames(4);

    const heading_el = host.querySelector('.cm-line.plainmark-h2') as HTMLElement;
    const body_el = Array.from(host.querySelectorAll('.cm-content > .cm-line')).find(
      (el) => !el.classList.contains('plainmark-h2'),
    ) as HTMLElement;
    expect(heading_el).toBeTruthy();
    expect(body_el).toBeTruthy();

    const heading_h = heading_el.getBoundingClientRect().height;
    // The body line follows a hard newline, so it carries the paragraph-gap
    // padding-top; the oracle samples a bare synthetic line, which has none.
    const body_h =
      body_el.getBoundingClientRect().height -
      parseFloat(getComputedStyle(body_el).paddingTop);
    // sanity: the harness renders the heading tall, so a sampled heading would diverge
    expect(heading_h).toBeGreaterThan(body_h + 5);

    const sampled = sampled_line_height(view);
    expect(Math.abs(sampled - body_h)).toBeLessThan(1.5); // pinned to body
    expect(sampled).toBeLessThan(heading_h - 5); // did NOT sample the tall heading
  });

  // Without the pin, the top viewport (revealed heading) would sample tall while
  // the scrolled-down body viewport samples short — the >0.3px flip that rebuilds
  // the map. The pin must report the same height in both.
  it('returns a stable sample regardless of which lines are in the viewport', async () => {
    const body = Array.from({ length: 60 }, (_, i) => `body paragraph line number ${i} with enough text`).join('\n');
    view = mount(`## Hi\n${body}\n`, 1);
    await frames(4);
    const top_sample = sampled_line_height(view);

    view.scrollDOM.scrollTop = view.scrollDOM.scrollHeight;
    await frames(4);
    const bottom_sample = sampled_line_height(view);

    expect(Math.abs(bottom_sample - top_sample)).toBeLessThan(1.5);
  });
});
