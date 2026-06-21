import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor } from '../util.js';

function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}

// SHELL-X-10: a task-list line mixes three inline geometries — the font-size:0
// hidden "- " span (zero-height caret rect at the baseline), the checkbox
// replace widget (shorter box, vertical-align: middle), and text. The clipped
// selection layer's visual-row detection must neither seed nor split rows on
// these height differences, and each row's rectangle must cover the tallest
// sampled box. Regression for the 2026-06-12 owner report: full-width band +
// darker double-painted box over the text on selected task lists.
describe('SHELL-X-10: selection rectangles on task-list lines', () => {
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

  function selection_rects(): DOMRect[] {
    return Array.from(
      container.querySelectorAll<HTMLElement>(
        '.cm-clippedSelectionLayer .cm-clippedSelectionBackground',
      ),
    ).map((el) => el.getBoundingClientRect());
  }

  async function mount_and_select(doc: string, from: number, to: number): Promise<void> {
    view = mount_editor(container, doc);
    view.focus();
    view.dispatch({ selection: { anchor: from, head: to } });
    await next_frame();
    await next_frame();
  }

  it('a selection across three task items paints exactly one text-clipped rect per line', async () => {
    const doc = '- [ ] task pending\n- [x] task done\n- [ ] another pending\n';
    await mount_and_select(doc, 0, doc.length - 1);
    const rects = selection_rects();
    // The bug painted 6 rects: per line one bogus full-width "wrapped row"
    // seeded by the zero-height hidden-marker span plus one mis-heighted rect.
    expect(rects.length).toBe(3);

    const content_right = container
      .querySelector('.cm-content')!
      .getBoundingClientRect().right;
    for (let n = 1; n <= 3; n++) {
      const line = view!.state.doc.line(n);
      // Text band measured mid-text (well past the marker + checkbox).
      const text = view!.coordsAtPos(line.from + 8, 1)!;
      const line_end = view!.coordsAtPos(line.to, -1)!;
      const rect = rects.find((r) => same_band(r, text));
      expect(rect, `line ${n} should have a rect on its text band`).toBeDefined();
      // Full text height — not the checkbox's shorter box.
      expect(rect!.top).toBeLessThanOrEqual(text.top + 0.5);
      expect(rect!.bottom).toBeGreaterThanOrEqual(text.bottom - 0.5);
      // Clipped to the selection/text end — not a full-width interior band.
      expect(rect!.right).toBeCloseTo(line_end.right, 0);
      expect(rect!.right).toBeLessThan(content_right - 10);
      // Starts at the checkbox (the selected widget is covered by the wash).
      const checkbox_left = view!.coordsAtPos(line.from + 2, 1)!.left;
      expect(rect!.left).toBeLessThanOrEqual(checkbox_left + 0.5);
    }
  });

  it('a wrapped task line keeps the interior-row/final-row split at full text height', async () => {
    const doc = `- [ ] ${Array(60).fill('word').join(' ')}\n`;
    await mount_and_select(doc, 0, doc.length - 1);
    const rects = selection_rects();
    expect(rects.length).toBeGreaterThan(1); // confirm it wrapped

    const content_right = container
      .querySelector('.cm-content')!
      .getBoundingClientRect().right;
    const text = view!.coordsAtPos(8, 1)!;
    const text_h = text.bottom - text.top;
    const sorted = [...rects].sort((a, b) => a.top - b.top);
    for (const [i, r] of sorted.entries()) {
      expect(r.height).toBeGreaterThanOrEqual(text_h - 0.5);
      if (i < sorted.length - 1) {
        // Interior wrapped rows extend to the content-column right edge.
        expect(r.right).toBeCloseTo(content_right, 0);
      } else {
        expect(r.right).toBeLessThan(content_right - 10);
      }
    }
  });

  it('plain bullet items still paint one rect per line (control)', async () => {
    const doc = '- alpha\n- beta\n';
    await mount_and_select(doc, 0, doc.length - 1);
    expect(selection_rects().length).toBe(2);
  });
});

function same_band(r: DOMRect, c: { top: number; bottom: number }): boolean {
  const mid = (c.top + c.bottom) / 2;
  return r.top <= mid && r.bottom >= mid;
}
