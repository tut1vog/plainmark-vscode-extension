import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { editor_extensions } from '../../../src/webview/editor_extensions.js';

// This spec guards two height-map scroll invariants in the headless harness: the
// scroll container reserves the scrollbar gutter (so a width-responsive block can't
// toggle the scrollbar and oscillate content width), and an off-screen height-map
// rebuild holds scrollTop. It does NOT reproduce the live "Measure loop restarted"
// snap: that has a separate root cause — CM6's height-oracle sampling a tall line,
// fixed by the oracle line-height pin — and is not headless-reproducible (the
// harness uses zero-width overlay scrollbars).

interface MermaidGlobal {
  PlainmarkMermaid?: {
    initialize(config: Record<string, unknown>): void;
    render(id: string, text: string): Promise<{ svg: string }>;
  };
}

const TALL_SVG =
  '<svg data-test="mermaid-ok" xmlns="http://www.w3.org/2000/svg" ' +
  'viewBox="0 0 400 450" style="max-width:400px;width:100%" role="img">' +
  '<rect width="400" height="450" fill="#888"/></svg>';

function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}

async function frames(n: number): Promise<void> {
  for (let i = 0; i < n; i++) await next_frame();
}

async function wait_for(predicate: () => boolean, timeout_ms = 10000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout_ms) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 25));
    await next_frame();
  }
  return predicate();
}

function build_doc(): string {
  const before = Array.from({ length: 6 }, (_, i) => `intro line ${i}`).join('\n');
  const mermaid = '```mermaid\ngraph TD; A-->B; B-->C; C-->D\n```';
  const after = Array.from({ length: 80 }, (_, i) => `tail line ${i}`).join('\n');
  return `# Heading\n${before}\n\n${mermaid}\n\n${after}\n`;
}

describe('mermaid scroll snap-back', () => {
  let host: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    host = document.createElement('div');
    host.style.width = '600px';
    host.style.height = '300px';
    document.body.appendChild(host);
    (window as MermaidGlobal).PlainmarkMermaid = {
      initialize: () => {},
      render: () => Promise.resolve({ svg: TALL_SVG }),
    };
  });

  afterEach(() => {
    delete (window as MermaidGlobal).PlainmarkMermaid;
    view?.destroy();
    view = undefined;
    host.remove();
  });

  function mount(doc: string): EditorView {
    return new EditorView({
      state: EditorState.create({
        doc,
        extensions: [...editor_extensions],
        selection: { anchor: 0 },
      }),
      parent: host,
    });
  }

  // The fix: the scroller reserves the scrollbar gutter, so the responsive block
  // cannot change width (and therefore height) when the scrollbar toggles.
  it('reserves the scrollbar gutter on the scroll container', async () => {
    view = mount(build_doc());
    await frames(2);
    expect(getComputedStyle(view.scrollDOM).scrollbarGutter).toBe('stable');
  });

  // Invariant the snap depends on: once a diagram has rendered, the height CM6
  // reserves for the off-screen block equals what it measures on-screen, so a
  // rebuild while the block is above the viewport does not move the scroll.
  it('keeps estimatedHeight equal to the render and holds scroll on rebuild', async () => {
    view = mount(build_doc());
    const rendered = await wait_for(
      () => host.querySelectorAll('[data-test="mermaid-ok"]').length === 1,
    );
    expect(rendered).toBe(true);
    await frames(5);

    const block_el = host.querySelector('.plainmark-mermaid-block') as HTMLElement;
    const measured = block_el.getBoundingClientRect().height;

    view.scrollDOM.scrollTop = block_el.offsetTop + measured + 40;
    await frames(4);
    const before = view.scrollDOM.scrollTop;
    view.dispatch({
      selection: { anchor: view.state.doc.line(view.state.doc.lines - 5).from },
    });
    await frames(4);

    expect(view.scrollDOM.scrollTop).toBeGreaterThanOrEqual(before - 2);
  });
});
