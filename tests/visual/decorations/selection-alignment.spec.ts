import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor } from '../util.js';

function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}

// BQ-R-12 / CALL-R-10 / SHELL-X-9 / SHELL-X-10: every selected line's highlight
// (drawn by clipped_selection_layer via per-line RectangleMarker.forRange) tracks
// that line's own text content-left, so a bar-style block aligns with a plain
// paragraph at every depth. The net-to-zero hanging indent (BQ-R-12 / CALL-R-10)
// keeps content at the editor content-left for layout.
describe('BQ-R-12 CALL-R-10 SHELL-X-9 SHELL-X-10: selection aligns over per-line-padded blocks', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '600px';
    document.body.appendChild(container);
  });
  afterEach(() => {
    view?.destroy();
    container.remove();
  });

  function content_left(line: Element): number {
    const rg = document.createRange();
    rg.selectNodeContents(line);
    return rg.getBoundingClientRect().left;
  }

  async function mount_and_select_all(doc: string): Promise<void> {
    view = mount_editor(container, doc);
    view.dispatch({ selection: { anchor: 0, head: doc.length } });
    await next_frame();
    await next_frame();
  }

  it('blockquote content origin aligns with a plain paragraph at depth 1 and 2', async () => {
    // First line a paragraph (padding 0) → CM6 leftSide comes from it.
    await mount_and_select_all('para\n> quote\n> > deep\nafter');
    const lines = Array.from(container.querySelectorAll('.cm-line'));
    const para_left = content_left(lines[0]);
    // line 1 = depth-1 quote, line 2 = depth-2 quote.
    expect(content_left(lines[1])).toBeCloseTo(para_left, 0);
    expect(content_left(lines[2])).toBeCloseTo(para_left, 0);

    const sels = Array.from(container.querySelectorAll('.cm-clippedSelectionBackground'));
    for (const s of sels) {
      if (s.getBoundingClientRect().width > 1) {
        expect(s.getBoundingClientRect().left).toBeCloseTo(para_left, 0);
      }
    }
  });

  it('BQ-R-10: nested blockquote content advances by a constant per-marker step (constant bar gap)', async () => {
    // Caret off the blockquote so every marker is hidden (color:transparent,
    // natural width). Bars are drawn per-marker (::before), so each deeper level
    // advances content by exactly one natural marker width and the bar sits at
    // that marker — a CONSTANT step keeps the bar-to-content gap constant.
    view = mount_editor(container, 'p\n> a\n> > a\n> > > a\n> > > > a');
    view.dispatch({ selection: { anchor: 0 } });
    await next_frame();
    await next_frame();
    const rights: number[] = [];
    for (let depth = 1; depth <= 4; depth++) {
      const line = view.state.doc.line(depth + 1);
      rights.push(view.coordsAtPos(line.to)!.left);
    }
    const steps = rights.slice(1).map((r, i) => r - rights[i]);
    for (const s of steps) {
      expect(s).toBeGreaterThan(0);
      expect(s).toBeCloseTo(steps[0], 0);
    }
  });

  it('BQ-R-12: wrapped continuation rows align with a separate quote line (measured marker width)', async () => {
    // A long depth-1 quote line that wraps, plus a separate short quote line.
    // The wrapped continuation rows hang at `padding-left`; the separate line's
    // visible text begins after the natural-width transparent `> ` marker. The
    // measured-marker-width indent makes those two columns equal.
    const long = `> ${Array(80).fill('word').join(' ')}`;
    view = mount_editor(container, `p\n${long}\n> sep`);
    view.dispatch({ selection: { anchor: 0 } });
    await next_frame();
    await next_frame();
    await next_frame();
    const wrapped = container.querySelectorAll('.cm-line')[1];
    const rg = document.createRange();
    rg.selectNodeContents(wrapped);
    const rects = Array.from(rg.getClientRects());
    // Group rects into visual rows by `top` (the marker span and the text yield
    // separate rects on the same row, so plain indexing is unreliable).
    const tops = [...new Set(rects.map((r) => Math.round(r.top)))].sort((a, b) => a - b);
    expect(tops.length).toBeGreaterThan(1); // confirm the line actually wrapped
    // A continuation row (any row after the first) hangs at `padding-left`.
    const continuation_left = Math.min(
      ...rects.filter((r) => Math.round(r.top) === tops[1]).map((r) => r.left),
    );
    const sep_line = view.state.doc.line(3);
    const sep_text_left = view.coordsAtPos(sep_line.from + 2)!.left; // after `> `
    expect(Math.abs(continuation_left - sep_text_left)).toBeLessThanOrEqual(1.5);
  });

  it('CALL-R-10: wrapped callout body rows align with the first row (measured marker width)', async () => {
    // A callout whose body line wraps. The continuation rows hang at the line's
    // `padding-left`; the first row's visible text begins after the transparent
    // `> ` marker. The measured-marker-width inline indent makes them equal — the
    // callout reuses the blockquote's marker-width measurement (BQ-R-12).
    const long = `> [!WARNING] Warn\n> ${Array(80).fill('word').join(' ')}`;
    view = mount_editor(container, long);
    view.dispatch({ selection: { anchor: 0 } });
    await next_frame();
    await next_frame();
    await next_frame();
    const body = container.querySelectorAll('.plainmark-callout-body')[0];
    const rg = document.createRange();
    rg.selectNodeContents(body);
    const rects = Array.from(rg.getClientRects());
    const tops = [...new Set(rects.map((r) => Math.round(r.top)))].sort((a, b) => a - b);
    expect(tops.length).toBeGreaterThan(1); // confirm the body actually wrapped
    const continuation_left = Math.min(
      ...rects.filter((r) => Math.round(r.top) === tops[1]).map((r) => r.left),
    );
    const body_line = view.state.doc.line(2);
    const first_text_left = view.coordsAtPos(body_line.from + 2)!.left; // after `> `
    expect(Math.abs(continuation_left - first_text_left)).toBeLessThanOrEqual(1.5);
  });

  it('BQ-R-12: wrapped rows align under the first VISIBLE glyph with leading content spaces', async () => {
    // `>` + 3 spaces → marker `> ` + 2 intentional leading content spaces, then a
    // long wrapping run. Option B: continuation rows hang under the first visible
    // glyph (after the 2 spaces), matching Obsidian — not under the marker.
    const doc = `p\n>   ${Array(80).fill('word').join(' ')}`;
    view = mount_editor(container, doc);
    view.dispatch({ selection: { anchor: 0 } });
    await next_frame();
    await next_frame();
    await next_frame();
    const qline = view.state.doc.line(2);
    // first visible glyph: line start + `> ` (2) + 2 leading content spaces = offset 4
    const first_glyph_left = view.coordsAtPos(qline.from + 4)!.left;
    const lineEl = container.querySelectorAll('.cm-line')[1];
    const rg = document.createRange();
    rg.selectNodeContents(lineEl);
    const rects = Array.from(rg.getClientRects());
    const tops = [...new Set(rects.map((r) => Math.round(r.top)))].sort((a, b) => a - b);
    expect(tops.length).toBeGreaterThan(1);
    const continuation_left = Math.min(
      ...rects.filter((r) => Math.round(r.top) === tops[1]).map((r) => r.left),
    );
    expect(Math.abs(continuation_left - first_glyph_left)).toBeLessThanOrEqual(1.5);
  });

  it('BQ-R-12: a tight `>text` first line does not break alignment of a later spaced quote', async () => {
    // The probe measures `>` and a space INDEPENDENTLY, so a tight first marker
    // (no trailing space) must not zero the space metric for every other line.
    // Line 2 is tight; line 4 has 2 leading content spaces and wraps.
    const doc = `p\n>tight quote text here\n\n>   ${Array(80).fill('word').join(' ')}`;
    view = mount_editor(container, doc);
    view.dispatch({ selection: { anchor: 0 } });
    await next_frame();
    await next_frame();
    await next_frame();
    const qline = view.state.doc.line(4);
    // first visible glyph: `> ` (2) + 2 leading content spaces = offset 4
    const first_glyph_left = view.coordsAtPos(qline.from + 4)!.left;
    const lineEl = container.querySelectorAll('.cm-line')[3];
    const rg = document.createRange();
    rg.selectNodeContents(lineEl);
    const rects = Array.from(rg.getClientRects());
    const tops = [...new Set(rects.map((r) => Math.round(r.top)))].sort((a, b) => a - b);
    expect(tops.length).toBeGreaterThan(1);
    const continuation_left = Math.min(
      ...rects.filter((r) => Math.round(r.top) === tops[1]).map((r) => r.left),
    );
    expect(Math.abs(continuation_left - first_glyph_left)).toBeLessThanOrEqual(1.5);
  });

  it('CALL-R-10: wrapped callout body aligns under the first glyph with leading spaces', async () => {
    // Callout body `>` + 4 spaces → marker `> ` + 3 leading content spaces. The
    // body paragraph's wrapped rows align under its own first visible glyph.
    const doc = `> [!WARNING] Warn\n>    ${Array(80).fill('word').join(' ')}`;
    view = mount_editor(container, doc);
    view.dispatch({ selection: { anchor: 0 } });
    await next_frame();
    await next_frame();
    await next_frame();
    const body_line = view.state.doc.line(2);
    // offset 5 = `> ` (2) + 3 leading content spaces
    const first_glyph_left = view.coordsAtPos(body_line.from + 5)!.left;
    const body = container.querySelectorAll('.plainmark-callout-body')[0];
    const rg = document.createRange();
    rg.selectNodeContents(body);
    const rects = Array.from(rg.getClientRects());
    const tops = [...new Set(rects.map((r) => Math.round(r.top)))].sort((a, b) => a - b);
    expect(tops.length).toBeGreaterThan(1);
    const continuation_left = Math.min(
      ...rects.filter((r) => Math.round(r.top) === tops[1]).map((r) => r.left),
    );
    expect(Math.abs(continuation_left - first_glyph_left)).toBeLessThanOrEqual(1.5);
  });

  it('BQ-R-11: revealing a blockquote line reflows NOTHING (Obsidian color:transparent model)', async () => {
    view = mount_editor(container, 'p\n> > > hello');
    const line = view.state.doc.line(2);
    view.dispatch({ selection: { anchor: 0 } });
    await next_frame();
    await next_frame();
    const content_off = view.coordsAtPos(line.to)!.left;
    const start_off = view.coordsAtPos(line.from)!.left;
    view.dispatch({ selection: { anchor: line.to } });
    await next_frame();
    await next_frame();
    const content_on = view.coordsAtPos(line.to)!.left;
    const start_on = view.coordsAtPos(line.from)!.left;
    // The `>` glyph keeps its natural inline box whether hidden (transparent) or
    // revealed (visible), so moving the caret onto the line moves NOTHING — no
    // shift of either the content or the line's leading glyph.
    expect(content_on).toBeCloseTo(content_off, 0);
    expect(start_on).toBeCloseTo(start_off, 0);
  });

  it('callout content origin aligns with a plain paragraph', async () => {
    await mount_and_select_all('para\n> [!TIP] hi\n> body\nafter');
    const lines = Array.from(container.querySelectorAll('.cm-line'));
    const para_left = content_left(lines[0]);
    const header = container.querySelector('.plainmark-callout-header')!;
    const body = container.querySelector('.plainmark-callout-body')!;
    expect(content_left(header)).toBeCloseTo(para_left, 0);
    expect(content_left(body)).toBeCloseTo(para_left, 0);
  });

  it('SHELL-X-10: a wrapped paragraph covers every selected glyph (no continuation-row bite)', async () => {
    // One logical line long enough to wrap into several visual rows. The bug class
    // left the first
    // glyphs of continuation rows unhighlighted. Assert every sampled glyph sits
    // inside some selection rectangle on its own row.
    const doc = Array(120).fill('word').join(' ');
    await mount_and_select_all(doc);
    const rects = Array.from(
      container.querySelectorAll<HTMLElement>('.cm-clippedSelectionBackground'),
    ).map((s) => s.getBoundingClientRect());
    expect(rects.length).toBeGreaterThan(1); // confirm it wrapped into rows

    const covered = (pos: number): boolean => {
      const c = view!.coordsAtPos(pos);
      if (!c) return false;
      const mid_y = (c.top + c.bottom) / 2;
      return rects.some(
        (r) =>
          mid_y >= r.top - 1 &&
          mid_y <= r.bottom + 1 &&
          c.left >= r.left - 1 &&
          c.right <= r.right + 1,
      );
    };

    for (let pos = 1; pos < doc.length; pos += 7) {
      expect(covered(pos), `glyph at ${pos} should be inside a selection rect`).toBe(true);
    }
  });

  it('SHELL-X-10: blank lines (empty + whitespace-only) all get one uniform thin stub', async () => {
    // Lines 2/4/6 are blank but differ in trailing whitespace ('', ' ', '  ');
    // each must draw the SAME stub width, and that width must be thinner than a
    // text line's selection.
    await mount_and_select_all('aaaa\n\nbbbb\n \ncccc\n  \ndddd');
    const rects = Array.from(
      container.querySelectorAll<HTMLElement>('.cm-clippedSelectionBackground'),
    ).map((s) => s.getBoundingClientRect());
    const width_at_top = (pos: number): number => {
      const top = view!.coordsAtPos(pos)!.top;
      const hit = rects.find((r) => Math.abs(r.top - top) < 4);
      return hit ? hit.width : NaN;
    };
    const blank_widths = [2, 4, 6].map((n) => width_at_top(view!.state.doc.line(n).from));
    const text_width = width_at_top(view!.state.doc.line(1).from); // 'aaaa'
    for (const w of blank_widths) {
      expect(w).toBeGreaterThan(0);
      expect(w).toBeCloseTo(blank_widths[0], 1);
      expect(w).toBeLessThan(text_width);
    }
  });
});
