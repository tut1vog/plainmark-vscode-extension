import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import type { EditorView } from '@codemirror/view';
import { mount_editor } from './util.js';
import { ensure_mathjax } from './mathjax-ready.js';
import { normalize_for_snapshot } from './normalize.js';

const fixture_md = import.meta.glob('./fixtures/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const fixtures = ['short', 'inline', 'math-sampler', 'large-doc', 'tables', 'phase4-constructs'] as const;

// `large-doc` is a ~24k-line scale fixture: rendering it whole would yield a
// multi-hundred-thousand-line golden, so it stays virtualized at a pinned
// viewport for a deterministic *partial* snapshot. Every other fixture is
// small enough to render in full.
const PARTIAL_FIXTURES = new Set<string>(['large-doc']);
const MATH_FIXTURES = new Set<string>(['math-sampler', 'large-doc', 'tables']);
// Fixtures whose goldens encode the settled broken-image placeholder — the
// `error` event for the unresolvable image base fires late on CI runners, so
// the snapshot must wait for the swap instead of racing it.
const BROKEN_IMAGE_FIXTURES = new Set<string>(['inline']);

const VIEWPORT_WIDTH = 1024;
// Pinned viewport height for the virtualized `large-doc` snapshot — fixed so
// the rendered slice stays stable across runs and is not at the mercy of the
// runner's default viewport size.
const PARTIAL_VIEWPORT_HEIGHT = 900;
// Headroom above the measured content height when fitting a small fixture:
// absorbs the height the CM6 height map under-estimates for not-yet-rendered
// lines, plus growth from async math typesetting once every line is in the DOM.
const VIEWPORT_HEADROOM = 4000;

function next_frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function settle(view: EditorView): Promise<void> {
  view.requestMeasure();
  await next_frame();
}

// CM6 only builds DOM for the lines inside its rendered viewport — everything
// past it collapses into a `.cm-gap` spacer that a snapshot silently misses.
// CM6 sizes that viewport against the iframe window, not the mount container,
// so grow the iframe until it clears the content height. Re-measure after each
// resize: a resize re-flows wrapped lines and can change the height again.
async function fit_viewport_to_document(view: EditorView): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    await settle(view);
    const needed = Math.ceil(view.contentHeight) + VIEWPORT_HEADROOM;
    if (window.innerHeight >= needed) break;
    await page.viewport(VIEWPORT_WIDTH, needed);
  }
  await settle(view);
}

describe('composition snapshots', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;
  let original_viewport: { width: number; height: number };

  beforeAll(() => {
    original_viewport = { width: window.innerWidth, height: window.innerHeight };
  });

  afterAll(async () => {
    await page.viewport(original_viewport.width, original_viewport.height);
  });

  beforeEach(async () => {
    await ensure_mathjax();
    container = document.createElement('div');
    // Fixed width keeps line wrapping deterministic regardless of viewport
    // width; height grows with content.
    container.style.width = '800px';
    document.body.appendChild(container);
  });

  afterEach(() => {
    view?.destroy();
    view = undefined;
    container.remove();
  });

  for (const name of fixtures) {
    it(`PARA-R-1 PARA-R-3: renders ${name}.md to a stable snapshot`, async () => {
      const md = fixture_md[`./fixtures/${name}.md`];
      expect(md, `fixture ./fixtures/${name}.md missing`).toBeTruthy();
      const partial = PARTIAL_FIXTURES.has(name);

      if (partial) await page.viewport(VIEWPORT_WIDTH, PARTIAL_VIEWPORT_HEIGHT);
      view = mount_editor(container, md, 'https://example.test/');

      if (partial) {
        await settle(view);
        await settle(view);
      } else {
        await fit_viewport_to_document(view);
      }

      if (MATH_FIXTURES.has(name)) {
        await expect
          .poll(
            () => container.querySelectorAll('.plainmark-math-pending').length,
            { timeout: 60000 },
          )
          .toBe(0);
        // Typeset math is taller than its pending placeholder — re-fit so the
        // grown tail does not slip back into a `.cm-gap`.
        if (!partial) await fit_viewport_to_document(view);
      }

      if (BROKEN_IMAGE_FIXTURES.has(name)) {
        await expect
          .poll(
            () => container.querySelectorAll('img[src^="https://example.test/"]').length,
            { timeout: 60000 },
          )
          .toBe(0);
        // The placeholder swap changes line heights — re-fit before snapshot.
        if (!partial) await fit_viewport_to_document(view);
      }

      if (!partial) {
        expect(
          container.querySelector('.cm-gap'),
          `${name}: document tail collapsed into a .cm-gap — viewport too small`,
        ).toBeNull();
      }

      const html = await normalize_for_snapshot(container);
      await expect(html).toMatchFileSnapshot(`./fixtures/${name}.golden.html`);

      if (name === 'math-sampler') {
        expect(container.querySelectorAll('mjx-container').length).toBeGreaterThan(0);
      }
      if (name === 'inline') {
        expect(container.querySelectorAll('mjx-container')).toHaveLength(0);
      }
    });
  }
});
