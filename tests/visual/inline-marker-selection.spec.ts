// Regression: a drag-selection within a line that begins with an
// inline text style (bold / italic / strikethrough / inline code) must never
// paint more than one selection rectangle.
//
// text_styles.ts hides each construct's markers. An empty Decoration.replace({})
// renders a contenteditable=false zero-width widget, and a font-size:0 mark
// leaves a zero-area box; either way a hidden mid-line closing marker mis-probes
// drawSelection's wrappedLine via posAtCoords under EditorView.lineWrapping and
// a spurious whole-line rectangle blinks through the drag. Fixed by hiding the
// markers with a display:none Decoration.mark (empty getClientRects). Same
// defect class as the heading drag-selection flicker; see heading-selection.spec.ts.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor } from './util.js';

function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}

describe('inline-marker drag-selection draws no spurious rectangle', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    view?.destroy();
    container.remove();
  });

  // Sweep the drag head across line 1 from both ends; collect every within-line
  // selection that paints more than one rectangle — the flicker signature.
  async function flickering_selections(doc: string): Promise<string[]> {
    view?.destroy();
    view = mount_editor(container, doc);
    await next_frame();
    await next_frame();
    const v = view;
    const line = v.state.doc.line(1);
    const bad: string[] = [];
    const check = async (anchor: number, head: number): Promise<void> => {
      v.dispatch({ selection: { anchor, head } });
      await next_frame();
      const n = container.querySelectorAll('.cm-clippedSelectionBackground').length;
      if (n > 1) {
        bad.push(`[${Math.min(anchor, head)},${Math.max(anchor, head)}]=${n}`);
      }
    };
    for (let head = line.from + 1; head < line.to; head++) await check(line.to, head);
    for (let head = line.from + 1; head < line.to; head++) await check(line.from, head);
    return bad;
  }

  const at_line_start: Array<[string, string]> = [
    ['bold', '**bd** xy zw\n'],
    ['italic', '*it* xy zw\n'],
    ['inline code', '`cd` xy zw\n'],
    ['strikethrough', '~~st~~ xy zw\n'],
    ['link', '[lk](http://e.co) xy zw\n'],
    ['autolink', '<http://e.co> xy zw\n'],
  ];

  for (const [name, doc] of at_line_start) {
    it(`${name} at line start: no spurious second rectangle`, async () => {
      expect(await flickering_selections(doc)).toEqual([]);
    });
  }

  it('control — bold not at line start: no spurious second rectangle', async () => {
    expect(await flickering_selections('zw xy **bd** more\n')).toEqual([]);
  });
});
