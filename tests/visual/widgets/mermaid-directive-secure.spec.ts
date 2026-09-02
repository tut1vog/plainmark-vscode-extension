import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor } from '../util.js';

interface MermaidGlobal {
  PlainmarkMermaid?: {
    initialize(config: Record<string, unknown>): void;
    render(id: string, text: string): Promise<{ svg: string }>;
  };
}

describe('MMD-E-13: diagram directives cannot inject document CSS', () => {
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

  it('initializes mermaid with themeCSS on the secure list', async () => {
    const configs: Array<Record<string, unknown>> = [];
    (window as MermaidGlobal).PlainmarkMermaid = {
      initialize: (config) => void configs.push(config),
      render: () => Promise.resolve({ svg: '<svg data-test="mermaid-ok"></svg>' }),
    };
    view = mount_editor(container, '```mermaid\ngraph TD; A-->B\n```\n\ntail');
    await expect
      .poll(() => container.querySelectorAll('[data-test="mermaid-ok"]').length, {
        timeout: 10000,
        interval: 50,
      })
      .toBe(1);
    expect(configs.length).toBeGreaterThan(0);
    for (const config of configs) {
      expect(config.securityLevel).toBe('strict');
      expect(config.secure).toContain('themeCSS');
      expect(config.secure).toContain('securityLevel');
    }
  });
});
