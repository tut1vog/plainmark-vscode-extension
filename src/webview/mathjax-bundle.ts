// MathJax v4 sync-after-preload bundle for the Plainmark webview.
// Import-order fix verified against node_modules/@mathjax/src/components/
// mjs/tex-chtml/tex-chtml.js: startup-init must come first so each
// component's `if (MathJax.startup) { register... }` block actually fires.
// Use init.js (sets up MathJax.startup as a side effect) rather than
// startup.js (which also auto-runs the async startup chain we don't want).

import '@mathjax/src/components/js/startup/init.js';
import '@mathjax/src/components/js/core/core.js';

import '@mathjax/src/components/js/input/tex-base/tex-base.js';
import '@mathjax/src/components/js/input/tex/extensions/ams/ams.js';
import '@mathjax/src/components/js/input/tex/extensions/newcommand/newcommand.js';

import '@mathjax/src/components/js/output/chtml/chtml.js';

import { MathJaxNewcmFont } from '@mathjax/mathjax-newcm-font/js/chtml.js';

import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/accents.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/accents-b-i.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/arabic.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/arrows.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/braille.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/braille-d.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/calligraphic.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/cherokee.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/cyrillic.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/cyrillic-ss.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/devanagari.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/double-struck.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/fraktur.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/greek.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/greek-ss.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/hebrew.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/latin.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/latin-b.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/latin-bi.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/latin-i.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/marrows.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/math.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/monospace.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/monospace-ex.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/monospace-l.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/mshapes.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/phonetics.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/phonetics-ss.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/PUA.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/sans-serif.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/sans-serif-b.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/sans-serif-bi.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/sans-serif-ex.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/sans-serif-i.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/sans-serif-r.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/script.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/shapes.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/symbols.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/symbols-b-i.js';
import '@mathjax/mathjax-newcm-font/js/chtml/dynamic/variants.js';

import { MathJax } from '@mathjax/src/js/components/global.js';
import { insert } from '@mathjax/src/js/util/Options.js';
import { create_logger } from '../log.js';

const log = create_logger('init');

declare global {
  interface Window {
    __mathjax_font_url?: string;
  }
}

const mj = MathJax as unknown as {
  config: Record<string, unknown>;
  startup: {
    defaultReady: () => void;
    output?: { font?: unknown };
  };
};

const font_url = (typeof window !== 'undefined' && window.__mathjax_font_url) || './fonts/';

insert(
  mj.config,
  {
    tex: { packages: { '[+]': ['ams', 'newcommand'] } },
    chtml: { fontData: MathJaxNewcmFont, fontURL: font_url },
  },
  false,
);

mj.startup.defaultReady();

const font = mj.startup.output?.font;
const dyn = (
  MathJaxNewcmFont as unknown as {
    dynamicFiles: Record<string, { setup: (f: unknown) => void }>;
  }
).dynamicFiles;
if (font) {
  for (const name of Object.keys(dyn)) {
    try {
      dyn[name].setup(font);
    } catch (err) {
      log.warn('mathjax dynamic range setup failed', { name, err });
    }
  }
}

(window as unknown as { MathJax: unknown }).MathJax = MathJax;
log.debug('mathjax bundle ready', {
  has_tex2chtml_promise:
    typeof (MathJax as unknown as { tex2chtmlPromise?: unknown }).tex2chtmlPromise === 'function',
});
