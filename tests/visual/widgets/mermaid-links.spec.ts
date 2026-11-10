// Strict mode keeps a `click A href "…"` directive as an SVG anchor; any live
// href in the inserted diagram would be opened by the webview on a plain click.
// mermaid.render is mocked (window.PlainmarkMermaid) with an SVG carrying each
// anchor form, so every insertion path is checked against the same markup.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor, move_cursor } from '../util.js';

interface MermaidGlobal {
  PlainmarkMermaid?: {
    initialize(config: Record<string, unknown>): void;
    render(id: string, text: string): Promise<{ svg: string }>;
  };
}

const XLINK_NS = 'http://www.w3.org/1999/xlink';

const LINKED_SVG =
  '<svg data-test="mermaid-links" xmlns="http://www.w3.org/2000/svg" ' +
  'xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 120 40">' +
  '<a xlink:href="https://example.com/xlink" target="_blank"><rect width="30" height="40"/></a>' +
  '<a href="https://example.com/svg2"><rect x="40" width="30" height="40"/></a>' +
  '<foreignObject x="80" width="40" height="40">' +
  '<div xmlns="http://www.w3.org/1999/xhtml"><a href="https://example.com/html">l</a></div>' +
  '</foreignObject></svg>';

function anchors(root: Element): { total: number; linked: number } {
  const all = Array.from(root.querySelectorAll('a'));
  return {
    total: all.length,
    linked: all.filter((a) => a.hasAttribute('href') || a.hasAttributeNS(XLINK_NS, 'href'))
      .length,
  };
}

describe('MMD-I-5: diagram link directives cannot navigate', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;
  let widget_renders: number;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    widget_renders = 0;
    (window as MermaidGlobal).PlainmarkMermaid = {
      initialize: () => {},
      render: (id) => {
        if (!id.includes('preview')) widget_renders++;
        return Promise.resolve({ svg: LINKED_SVG });
      },
    };
  });

  afterEach(() => {
    delete (window as MermaidGlobal).PlainmarkMermaid;
    view?.destroy();
    view = undefined;
    container.remove();
  });

  it('MMD-I-5: the widget (fresh render and cache hit) and the live preview carry no anchor href', async () => {
    const doc = 'above\n\n```mermaid\ngraph TD; A-->B\nclick A href "https://example.com"\n```\n\nbelow';
    view = mount_editor(container, doc);
    move_cursor(view, doc.length);

    const widget_svg = (): Element | null =>
      container.querySelector('.plainmark-mermaid-block [data-test="mermaid-links"]');
    await expect.poll(() => widget_svg() !== null, { timeout: 30000, interval: 50 }).toBe(true);
    expect(anchors(widget_svg()!)).toEqual({ total: 3, linked: 0 });
    expect(widget_renders).toBe(1);

    move_cursor(view, doc.indexOf('graph') + 2);
    const preview_svg = (): Element | null =>
      container.querySelector('.plainmark-mermaid-block-preview [data-test="mermaid-links"]');
    await expect.poll(() => preview_svg() !== null, { timeout: 30000, interval: 50 }).toBe(true);
    expect(anchors(preview_svg()!)).toEqual({ total: 3, linked: 0 });

    move_cursor(view, doc.length);
    await expect.poll(() => widget_svg() !== null, { timeout: 30000, interval: 50 }).toBe(true);
    expect(anchors(widget_svg()!)).toEqual({ total: 3, linked: 0 });
    expect(widget_renders).toBe(1);
  });
});
