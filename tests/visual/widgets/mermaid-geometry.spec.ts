// DOM-geometry oracles for the mermaid block widget: normalize.ts
// strips styles, so an SVG that overflowed its container or an error box that
// collapsed still passes every snapshot. These relational assertions
// (nonzero rects, contained-within, fits-content-width) fail on gross layout
// breakage without asserting any font-rasterized absolute pixel value.
//
// mermaid.render is mocked (window.PlainmarkMermaid, the same seam the
// mermaid-scroll-snap / mermaid-load-error specs use) so the SVG geometry is
// deterministic across platforms; the production render path (MMD-R-6) and the
// widget CSS (MMD-R-8) are exercised unchanged.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { allow_console } from '../console-sentinel.js';
import { mount_editor, move_cursor } from '../util.js';

interface MermaidGlobal {
  PlainmarkMermaid?: {
    initialize(config: Record<string, unknown>): void;
    render(id: string, text: string): Promise<{ svg: string }>;
  };
}

// A viewBox-sized SVG with an inline max-width cap: renders deterministically at
// 200×120 regardless of font metrics, and comfortably narrower than the content
// column so containment is meaningful rather than incidental.
const OK_SVG =
  '<svg data-test="mermaid-ok" xmlns="http://www.w3.org/2000/svg" ' +
  'viewBox="0 0 200 120" style="max-width:200px;width:100%" role="img">' +
  '<rect width="200" height="120" fill="#888"/></svg>';

function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}
async function frames(n: number): Promise<void> {
  for (let i = 0; i < n; i++) await next_frame();
}

describe('mermaid widget geometry oracles', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '600px';
    document.body.appendChild(container);
    (window as MermaidGlobal).PlainmarkMermaid = {
      initialize: () => {},
      // "Broken" source rejects so the same mock drives both the success and
      // error oracles; a valid source resolves the fixed SVG.
      render: (_id, text) =>
        text.includes('BROKEN')
          ? Promise.reject(new Error('parse boom'))
          : Promise.resolve({ svg: OK_SVG }),
    };
  });
  afterEach(() => {
    delete (window as MermaidGlobal).PlainmarkMermaid;
    view?.destroy();
    view = undefined;
    container.remove();
  });

  it('MMD-R-4 MMD-R-8: a rendered SVG has nonzero size, fits its widget container, and the container fits the content width', async () => {
    const doc = 'above\n\n```mermaid\ngraph TD; A-->B\n```\n\nbelow';
    view = mount_editor(container, doc);
    move_cursor(view, doc.length); // caret off the block so the diagram renders (MMD-I-1)
    await expect
      .poll(() => container.querySelectorAll('[data-test="mermaid-ok"]').length, {
        timeout: 30000,
        interval: 50,
      })
      .toBe(1);
    await frames(3);

    const content = view.contentDOM.getBoundingClientRect();
    const block = container
      .querySelector('.plainmark-mermaid-block')!
      .getBoundingClientRect();
    const svg = container
      .querySelector('[data-test="mermaid-ok"]')!
      .getBoundingClientRect();

    // Nonzero rendered size.
    expect(svg.width).toBeGreaterThan(0);
    expect(svg.height).toBeGreaterThan(0);

    // SVG contained within its widget container (1px tolerance).
    expect(svg.left).toBeGreaterThanOrEqual(block.left - 1);
    expect(svg.right).toBeLessThanOrEqual(block.right + 1);
    expect(svg.top).toBeGreaterThanOrEqual(block.top - 1);
    expect(svg.bottom).toBeLessThanOrEqual(block.bottom + 1);

    // Container fits within the editor content width — no silent overflow past
    // the prose column (MMD-R-8 caps the SVG and scrolls the block instead).
    expect(block.left).toBeGreaterThanOrEqual(content.left - 1);
    expect(block.right).toBeLessThanOrEqual(content.right + 1);
  });

  it('MMD-R-5: a broken diagram renders a visible error element with nonzero height that fits the content width', async () => {
    allow_console('mermaid render failed');
    const doc = '```mermaid\nBROKEN\n```\n\ntail';
    view = mount_editor(container, doc);
    move_cursor(view, doc.length);
    await expect
      .poll(() => container.querySelectorAll('.plainmark-mermaid-error').length, {
        timeout: 30000,
        interval: 50,
      })
      .toBe(1);
    await frames(3);

    const content = view.contentDOM.getBoundingClientRect();
    const err = container
      .querySelector('.plainmark-mermaid-error')!
      .getBoundingClientRect();

    // Visible (nonzero height) — a collapsed error box would swallow the failure.
    expect(err.height).toBeGreaterThan(0);
    // And it stays within the content width rather than overflowing the column.
    expect(err.left).toBeGreaterThanOrEqual(content.left - 1);
    expect(err.right).toBeLessThanOrEqual(content.right + 1);
  });
});
