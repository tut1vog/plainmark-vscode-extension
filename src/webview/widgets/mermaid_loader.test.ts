import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MermaidBlockPreviewWidget } from './mermaid.js';

// load_mermaid mirrors load_mathjax: a module-level one-shot promise guards the
// lazy <script> injection. Each case gets a fresh module instance via
// vi.resetModules() + dynamic import; window/document are stubbed per-test since
// the loader only touches them lazily.

type MermaidWindow = {
  PlainmarkMermaid?: unknown;
  __plainmark_mermaid?: { url: string; nonce: string };
};

let win: MermaidWindow;
let create_element: ReturnType<typeof vi.fn>;

async function load_module() {
  vi.resetModules();
  return import('./mermaid.js');
}

describe('load_mermaid lazy-load contract MMD-E-8', () => {
  beforeEach(() => {
    win = {};
    create_element = vi.fn(() => ({
      nonce: '',
      src: '',
      addEventListener: vi.fn(),
      remove: vi.fn(),
    }));
    (globalThis as { window?: unknown }).window = win;
    (globalThis as { document?: unknown }).document = {
      createElement: create_element,
      head: { appendChild: vi.fn() },
    };
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { document?: unknown }).document;
    vi.restoreAllMocks();
  });

  it('resolves immediately without injecting a script when the bundle is already exposed', async () => {
    win.PlainmarkMermaid = { initialize: vi.fn(), render: vi.fn() };
    const { load_mermaid } = await load_module();
    await expect(load_mermaid()).resolves.toBeUndefined();
    expect(create_element).not.toHaveBeenCalled();
  });

  it('rejects with "mermaid bootstrap missing" when no bundle and no bootstrap exist', async () => {
    const { load_mermaid } = await load_module();
    await expect(load_mermaid()).rejects.toThrow('mermaid bootstrap missing');
    expect(create_element).not.toHaveBeenCalled();
  });

  it('resets the cache after a failure so the next call returns a fresh, retryable promise', async () => {
    const { load_mermaid } = await load_module();
    const first = load_mermaid();
    await expect(first).rejects.toThrow('mermaid bootstrap missing');
    // Let the loader's own promise.catch (which nulls mermaid_load_promise) run.
    await Promise.resolve();

    win.PlainmarkMermaid = { initialize: vi.fn(), render: vi.fn() };
    const second = load_mermaid();
    expect(second).not.toBe(first);
    await expect(second).resolves.toBeUndefined();
  });
});

describe('MermaidBlockPreviewWidget.eq MMD-R-7', () => {
  it('true when src and theme match', () => {
    expect(
      new MermaidBlockPreviewWidget('graph TD', 'light').eq(
        new MermaidBlockPreviewWidget('graph TD', 'light'),
      ),
    ).toBe(true);
  });

  it('false when src differs', () => {
    expect(
      new MermaidBlockPreviewWidget('a', 'light').eq(
        new MermaidBlockPreviewWidget('b', 'light'),
      ),
    ).toBe(false);
  });

  it('false when theme differs', () => {
    expect(
      new MermaidBlockPreviewWidget('a', 'light').eq(
        new MermaidBlockPreviewWidget('a', 'dark'),
      ),
    ).toBe(false);
  });
});
