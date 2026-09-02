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

  it('MATH-E-17: stops injecting scripts after three failed loads and reports not loadable', async () => {
    win.__plainmark_mathjax = { url: 'mathjax.js', nonce: 'n' };
    const scripts: Array<{ handlers: Record<string, () => void> }> = [];
    create_element.mockImplementation(() => {
      const script = {
        nonce: '',
        src: '',
        handlers: {} as Record<string, () => void>,
        addEventListener(name: string, fn: () => void) {
          script.handlers[name] = fn;
        },
        remove: vi.fn(),
      };
      scripts.push(script);
      return script;
    });
    const { load_mathjax, mathjax_loadable } = await load_module();
    let last: Promise<void> | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(mathjax_loadable()).toBe(true);
      last = load_mathjax();
      scripts[attempt].handlers['error']();
      await expect(last).rejects.toThrow('mathjax bundle failed to load');
      await Promise.resolve();
    }
    expect(scripts).toHaveLength(3);
    // Fourth call: the spent cap hands back the cached rejection, no new <script>.
    const again = load_mathjax();
    expect(again).toBe(last);
    await expect(again).rejects.toThrow();
    expect(scripts).toHaveLength(3);
    expect(mathjax_loadable()).toBe(false);
    // A bundle that does appear later is still honoured.
    win.MathJax = { tex2chtmlPromise: () => Promise.resolve() };
    await expect(load_mathjax()).resolves.toBeUndefined();
    expect(mathjax_loadable()).toBe(true);
  });
});
