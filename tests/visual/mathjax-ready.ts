interface MathJaxRuntime {
  startup: {
    promise: Promise<void>;
    output: { clearCache: () => void };
  };
  texReset?: () => void;
  tex2chtmlPromise: (
    src: string,
    options: { display: boolean },
  ) => Promise<HTMLElement>;
  chtmlStylesheet?: () => HTMLStyleElement;
  config: Record<string, unknown>;
}

declare global {
  interface Window {
    __mathjax_font_url?: string;
  }
}

let initialized = false;

function get_mathjax(): MathJaxRuntime {
  const mj = (window as unknown as { MathJax?: MathJaxRuntime }).MathJax;
  if (!mj) throw new Error('MathJax global not initialized');
  return mj;
}

export async function ensure_mathjax(): Promise<void> {
  if (initialized) {
    const mj = get_mathjax();
    mj.startup.output.clearCache();
    mj.texReset?.();
    return;
  }
  window.__mathjax_font_url = '/woff2/';
  // mathjax-bundle.ts calls defaultReady() at module load, so loadAllFontFiles
  // cannot be flipped after import. Instead we warmup-typeset to force the
  // common dynamic ranges to fetch, then await document.fonts.ready so
  // subsequent typesets don't race lazy WOFF2 loading.
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/dist/mathjax.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('failed to load /dist/mathjax.js — run `pnpm run build:dev` first'));
    document.head.appendChild(script);
  });
  const mj = get_mathjax();
  await mj.startup.promise;
  await mj.tex2chtmlPromise(
    'x + \\frac{a}{b} + \\sum_{i=1}^n i + \\int_0^1 f',
    { display: true },
  );
  const sheet = mj.chtmlStylesheet?.();
  if (sheet && !sheet.isConnected) document.head.appendChild(sheet);
  await document.fonts.ready;
  initialized = true;
}
