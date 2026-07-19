import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// mathjax_loader keeps a module-level one-shot promise (mathjax_load_promise),
// so each case gets a fresh module instance via vi.resetModules() + dynamic
// import. window/document are absent in the node unit env; the loader only
// touches them lazily inside load_mathjax, so we stub them per-test.

type MathjaxWindow = {
  MathJax?: { tex2chtmlPromise?: unknown };
  __plainmark_mathjax?: { url: string; nonce: string };
};

let win: MathjaxWindow;
let create_element: ReturnType<typeof vi.fn>;

async function load_module() {
  vi.resetModules();
  return import('./mathjax_loader.js');
}

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

describe('load_mathjax lazy-load contract MATH-R-5', () => {
  it('resolves immediately without injecting a script when MathJax is already ready', async () => {
    win.MathJax = { tex2chtmlPromise: () => Promise.resolve() };
    const { load_mathjax } = await load_module();
    await expect(load_mathjax()).resolves.toBeUndefined();
    // Fast path (bundle already exposed its API): no <script> element created.
    expect(create_element).not.toHaveBeenCalled();
  });

  it('rejects with "mathjax bootstrap missing" when no bundle and no bootstrap exist', async () => {
    // win.MathJax and win.__plainmark_mathjax both absent.
    const { load_mathjax } = await load_module();
    await expect(load_mathjax()).rejects.toThrow('mathjax bootstrap missing');
    expect(create_element).not.toHaveBeenCalled();
  });

  it('resets the cache after a failure so the next call returns a fresh, retryable promise', async () => {
    const { load_mathjax } = await load_module();
    const first = load_mathjax();
    await expect(first).rejects.toThrow('mathjax bootstrap missing');
    // Let the loader's own promise.catch (which nulls mathjax_load_promise) run.
    await Promise.resolve();

    // A transient failure must not poison the cache: the bundle now appears
    // ready, so a retry must NOT return the same rejected promise.
    win.MathJax = { tex2chtmlPromise: () => Promise.resolve() };
    const second = load_mathjax();
    expect(second).not.toBe(first);
    await expect(second).resolves.toBeUndefined();
  });
});
