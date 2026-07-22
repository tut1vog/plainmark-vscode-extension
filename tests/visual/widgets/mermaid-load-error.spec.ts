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

describe('mermaid bundle load failure renders a visible error', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    delete (window as MermaidGlobal).PlainmarkMermaid;
    view?.destroy();
    view = undefined;
    container.remove();
  });

  // One test covers the whole arc: the module-level load promise caches the
  // first successful load for the realm, so failure phases must run before it.
  it('renders a visible error on load failure and recovers once a load succeeds', async () => {
    allow_console('mermaid bundle load failed');
    allow_console('mermaid block preview load failed');
    // No window.__plainmark_mermaid bootstrap in this harness, so every
    // load_mermaid attempt rejects — same path as a failed script load.
    const doc = '```mermaid\ngraph TD; A-->B\n```\n\ntail';
    view = mount_editor(container, doc);

    // Replace widget: load failure must render an error, not a blank pending box.
    await expect
      .poll(() => container.querySelectorAll('.plainmark-mermaid-error').length, {
        timeout: 30000,
        interval: 50,
      })
      .toBe(1);
    expect(container.querySelector('.plainmark-mermaid-error')?.textContent).toContain(
      'mermaid bootstrap missing',
    );
    expect(container.querySelectorAll('.plainmark-mermaid-pending').length).toBe(0);

    // Preview widget (cursor inside the fence): a fresh load attempt is made
    // (promise cleared on rejection) and its failure renders visibly too.
    move_cursor(view, doc.indexOf('graph') + 2);
    await expect
      .poll(
        () =>
          container.querySelectorAll('.plainmark-mermaid-block-preview-error').length,
        { timeout: 30000, interval: 50 },
      )
      .toBe(1);

    // Once a load succeeds, the cached load-failure result is refreshed.
    (window as MermaidGlobal).PlainmarkMermaid = {
      initialize: () => {},
      render: (_id: string, _text: string) =>
        Promise.resolve({ svg: '<svg data-test="mermaid-ok"></svg>' }),
    };
    move_cursor(view, doc.length);
    await expect
      .poll(() => container.querySelectorAll('[data-test="mermaid-ok"]').length, {
        timeout: 30000,
        interval: 50,
      })
      .toBe(1);
    expect(container.querySelectorAll('.plainmark-mermaid-error').length).toBe(0);
  });
});
