// Reproduction harness for the F5-reported "click-drag selection invisible in
// html / yaml / codeblock / blockquote (callout works)" bug. The bug is
// VISUAL: selection state extends correctly, but the selection rectangle is
// painted in a Layer.below (DOM order: before .cm-content), so opaque
// `background-image` chrome on .cm-line covers it. Callout escapes because its
// bg tint is `color-mix(... 10%, transparent)`. (Plainmark now draws the
// clipped layer; the same z-index elevation applies.)
//
// Fix: bump `.cm-clippedSelectionLayer { z-index: 1 }` in editor_extensions.ts so the
// layer paints above .cm-content while .cm-cursorLayer (Layer.above) remains
// on top.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';
import { mount_editor } from './util.js';

interface SetupHandle {
  container: HTMLElement;
  view?: EditorView;
}

function make_setup(): SetupHandle {
  return { container: document.createElement('div') };
}

async function next_frame(): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

async function set_selection(view: EditorView, from: number, to: number): Promise<void> {
  view.focus();
  view.dispatch({ selection: EditorSelection.single(from, to) });
  await next_frame();
}

function selection_rect_visible(container: HTMLElement, line_el: Element): boolean {
  // clipped_selection_layer draws .cm-clippedSelectionBackground inside .cm-clippedSelectionLayer.
  // For the selection to be VISIBLE on a chromed line, the .cm-clippedSelectionLayer
  // must paint at or above the line's stacking position. CM6's base theme
  // sets `.cm-layer-below { z-index: -1 }`; our hotfix overrides to `0` so the
  // layer paints above .cm-content.
  const layer = container.querySelector<HTMLElement>('.cm-clippedSelectionLayer');
  if (!layer) return false;
  const z_raw = getComputedStyle(layer).zIndex;
  const z = z_raw === 'auto' ? -1 : Number(z_raw);
  if (!Number.isFinite(z) || z < 0) return false;
  // Selection rectangle exists.
  const rects = layer.querySelectorAll('.cm-clippedSelectionBackground');
  if (rects.length === 0) return false;
  // Rectangle intersects the target line vertically.
  const line_rect = line_el.getBoundingClientRect();
  for (const rect of Array.from(rects)) {
    const r = rect.getBoundingClientRect();
    if (r.bottom > line_rect.top && r.top < line_rect.bottom) return true;
  }
  return false;
}

describe('drag-selection visibility on chromed lines (T17.14 hotfix)', () => {
  let h: SetupHandle;
  beforeEach(() => {
    h = make_setup();
    document.body.appendChild(h.container);
  });
  afterEach(() => {
    h.view?.destroy();
    h.container.remove();
  });

  it('selection layer z-index is elevated above .cm-content (CM6 default is -2 inline)', async () => {
    h.view = mount_editor(h.container, 'plain text\n');
    await next_frame();
    const layer = h.container.querySelector<HTMLElement>('.cm-clippedSelectionLayer');
    expect(layer).not.toBeNull();
    const z_raw = getComputedStyle(layer!).zIndex;
    const z = z_raw === 'auto' ? -1 : Number(z_raw);
    // CM6 sets z-index: -2 inline on the layer; our editor_extensions override
    // with `0 !important` to surface selection above chromed-line backgrounds.
    expect(z).toBeGreaterThanOrEqual(0);
  });

  it('elevated selection layer keeps pointer-events: none so clicks on a selection still reach .cm-content (T19.4d)', async () => {
    // Once the layer is elevated to z-index: 0, the painted selection
    // rectangle would intercept mouse events before .cm-content unless
    // pointer-events: none is set. CM6's base theme sets pointer-events: none
    // on .cm-cursorLayer (verified at @codemirror/view src index.cjs ~line
    // 6823) but NOT on .cm-clippedSelectionLayer (the latter relied on default
    // z-index: -2 to stay below content). Our editor_extensions pins the
    // layer with `pointerEvents: 'none'` to restore click pass-through; this
    // regression test catches future overrides that drop it.
    h.view = mount_editor(h.container, 'The quick brown fox.\n');
    await next_frame();
    const layer = h.container.querySelector<HTMLElement>('.cm-clippedSelectionLayer');
    expect(layer).not.toBeNull();
    expect(getComputedStyle(layer!).pointerEvents).toBe('none');
  });

  it('selection background is translucent so text under the selection stays readable', async () => {
    const doc = 'The quick brown fox.\n';
    h.view = mount_editor(h.container, doc);
    h.view.focus();
    h.view.dispatch({ selection: EditorSelection.single(4, 15) });
    await next_frame();
    const bg = h.container.querySelector<HTMLElement>(
      '.cm-clippedSelectionLayer .cm-clippedSelectionBackground',
    );
    expect(bg).not.toBeNull();
    const computed = getComputedStyle(bg!).backgroundColor;
    // Chromium normalizes color-mix() to `color(srgb r g b / a)` form;
    // legacy rgba/rgb forms also surface depending on the input. Match either.
    const color_alpha = /color\([^)]+\/\s*([0-9.]+)\s*\)$/.exec(computed);
    const rgba_alpha = /rgba?\([^)]+,\s*([0-9.]+)\s*\)$/.exec(computed);
    const alpha = color_alpha
      ? parseFloat(color_alpha[1])
      : rgba_alpha
        ? parseFloat(rgba_alpha[1])
        : NaN;
    if (!Number.isFinite(alpha)) {
      throw new Error(`expected translucent selection bg with explicit alpha; got: ${computed}`);
    }
    expect(alpha).toBeLessThan(1);
  });

  it('callout body — selection visible (baseline; was working pre-fix)', async () => {
    const doc = '> [!NOTE]\n> The quick brown fox jumps over the lazy dog.\n';
    h.view = mount_editor(h.container, doc);
    await next_frame();
    const body_line = h.container.querySelector('.plainmark-callout-body');
    expect(body_line).not.toBeNull();
    await set_selection(h.view, 14, 25);
    expect(selection_rect_visible(h.container, body_line!)).toBe(true);
  });

  it('blockquote — selection visible (F5 regression on bars + bg)', async () => {
    const doc = '> The quick brown fox jumps over the lazy dog.\n';
    h.view = mount_editor(h.container, doc);
    await next_frame();
    const bq_line = h.container.querySelector('.plainmark-blockquote');
    expect(bq_line).not.toBeNull();
    await set_selection(h.view, 6, 17);
    expect(selection_rect_visible(h.container, bq_line!)).toBe(true);
  });

  it('fenced code body — selection visible (F5 regression)', async () => {
    const doc = '```\nThe quick brown fox jumps over the lazy dog.\n```\n';
    h.view = mount_editor(h.container, doc);
    await next_frame();
    const fc_lines = h.container.querySelectorAll('.plainmark-fenced-code');
    expect(fc_lines.length).toBeGreaterThanOrEqual(2);
    await set_selection(h.view, 8, 19);
    expect(selection_rect_visible(h.container, fc_lines[1])).toBe(true);
  });

  it('frontmatter body — selection visible (F5 regression)', async () => {
    const doc = '---\ntitle: The quick brown fox\n---\n';
    h.view = mount_editor(h.container, doc);
    await next_frame();
    const fm_line = h.container.querySelector('.plainmark-frontmatter');
    expect(fm_line).not.toBeNull();
    await set_selection(h.view, 11, 22);
    expect(selection_rect_visible(h.container, fm_line!)).toBe(true);
  });

  it('html block body — selection visible (F5 regression — T17.14 trigger)', async () => {
    const doc = '<div>\n  The quick brown fox.\n</div>\n';
    h.view = mount_editor(h.container, doc);
    await next_frame();
    const html_lines = h.container.querySelectorAll('.plainmark-html-block');
    expect(html_lines.length).toBeGreaterThanOrEqual(2);
    await set_selection(h.view, 12, 23);
    expect(selection_rect_visible(h.container, html_lines[1])).toBe(true);
  });

  it('plain paragraph — selection visible (control; unchromed line)', async () => {
    const doc = 'The quick brown fox.\n';
    h.view = mount_editor(h.container, doc);
    await next_frame();
    const lines = h.container.querySelectorAll('.cm-line');
    await set_selection(h.view, 4, 15);
    expect(selection_rect_visible(h.container, lines[0])).toBe(true);
  });
});

describe('selection rectangle width — must not overshoot the prose column (T19.14)', () => {
  let h: SetupHandle;
  beforeEach(() => {
    h = make_setup();
    document.body.appendChild(h.container);
  });
  afterEach(() => {
    h.view?.destroy();
    h.container.remove();
  });

  it('a multi-line selection paints no rectangle wider than the .cm-content text column', async () => {
    // CM6's drawSelection() clamps open-ended selection rectangles (the
    // full-width rows of a multi-line selection, the run-to-end-of-line edges)
    // to `.cm-content`'s border-box offset by the first `.cm-line`'s padding —
    // it never reads `.cm-content`'s own padding. prose_column_theme folds the
    // prose-column inset into max-width (not `.cm-content` padding) so the
    // border-box equals the text column and these rectangles land flush.
    h.view = mount_editor(h.container, 'AAA\nBBB\nCCC\n');
    await next_frame();
    h.view.focus();
    h.view.dispatch({ selection: EditorSelection.single(0, 11) });
    await next_frame();

    const content = h.container.querySelector<HTMLElement>('.cm-content');
    expect(content).not.toBeNull();
    const cc = content!.getBoundingClientRect();
    const cs = getComputedStyle(content!);
    const text_left = cc.left + parseFloat(cs.paddingLeft);
    const text_right = cc.right - parseFloat(cs.paddingRight);

    const rects = h.container.querySelectorAll<HTMLElement>(
      '.cm-clippedSelectionLayer .cm-clippedSelectionBackground',
    );
    expect(rects.length).toBeGreaterThan(0);
    for (const rect of Array.from(rects)) {
      const r = rect.getBoundingClientRect();
      expect(r.left).toBeGreaterThanOrEqual(text_left - 1);
      expect(r.right).toBeLessThanOrEqual(text_right + 1);
    }
  });
});
