import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { frames, mount_editor } from '../util.js';

interface MermaidGlobal {
  PlainmarkMermaid?: {
    initialize(config: Record<string, unknown>): void;
    render(id: string, text: string): Promise<{ svg: string }>;
  };
}

const WIDE_SVG =
  '<svg data-test="mermaid-ok" xmlns="http://www.w3.org/2000/svg" ' +
  'viewBox="0 0 2000 120" style="min-width:2000px;height:120px" role="img">' +
  '<rect width="2000" height="120" fill="#888"/></svg>';

const DOC = '```mermaid\ngraph LR; A-->B\n```\n\ntail line\n';

function press(target: HTMLElement, client_y: number): void {
  const rect = target.getBoundingClientRect();
  target.dispatchEvent(
    new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: rect.left + rect.width / 2,
      clientY: client_y,
    }),
  );
  // reveal is frozen while the button is held; release so it re-evaluates
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
}

describe('MMD-I-6 — press on the mermaid block scrollbar strip', () => {
  let host: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    host = document.createElement('div');
    host.style.width = '600px';
    document.body.appendChild(host);
    (window as MermaidGlobal).PlainmarkMermaid = {
      initialize: () => {},
      render: () => Promise.resolve({ svg: WIDE_SVG }),
    };
  });

  afterEach(() => {
    delete (window as MermaidGlobal).PlainmarkMermaid;
    view?.destroy();
    view = undefined;
    host.remove();
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  async function mount_rendered(): Promise<HTMLElement> {
    view = mount_editor(host, DOC);
    await expect
      .poll(() => host.querySelectorAll('[data-test="mermaid-ok"]').length, { timeout: 10000 })
      .toBe(1);
    await frames(2);
    return host.querySelector('.plainmark-mermaid-block') as HTMLElement;
  }

  it('a press below the content box (scrollbar strip) keeps the diagram rendered', async () => {
    const block = await mount_rendered();
    const rect = block.getBoundingClientRect();
    press(block, rect.top + block.clientHeight + 4);
    await frames(2);
    expect(host.querySelector('.plainmark-mermaid-block')).not.toBeNull();
    expect(view!.state.selection.main.head).toBe(DOC.length);
  });

  it('a press on the diagram itself still reveals the source (MMD-I-5)', async () => {
    const block = await mount_rendered();
    const rect = block.getBoundingClientRect();
    press(block, rect.top + 10);
    await frames(2);
    expect(host.querySelector('.plainmark-mermaid-block')).toBeNull();
  });
});
