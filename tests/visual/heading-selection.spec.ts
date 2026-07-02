// Regression: a drag-selection within a heading must never paint more
// than one selection rectangle.
//
// A heading line begins with its ATX marker (`# `) hidden. When the marker was
// hidden with a `Decoration.replace`, CM6 rendered a contenteditable=false span
// flanked by `cm-widgetBuffer` <img>s at the line start. With `EditorView.line-
// Wrapping` on, `drawSelection`'s `wrappedLine` probes the line edges via
// `posAtCoords`; the zero-width replace widget makes `posAtCoords` resolve the
// line-start x ambiguously, so `wrappedLine(from)` and `wrappedLine(to)`
// intermittently disagree and `drawSelection` mistakes the single heading line
// for a multi-line selection — painting a spurious whole-line rectangle that
// blinks as the drag head moves. headings.ts hides the marker with a zero-
// font-size `Decoration.mark` instead, keeping `# ` ordinary text.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor } from './util.js';

function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}

describe('heading drag-selection draws a single rectangle', () => {
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

  async function bad_selections(doc: string, line_no: number): Promise<string[]> {
    view?.destroy();
    view = mount_editor(container, doc);
    await next_frame();
    await next_frame();
    const v = view;
    const line = v.state.doc.line(line_no);
    const text_from = line.from + line.text.indexOf(' ') + 1; // past the `#…# ` marker
    const bad: string[] = [];
    const check = async (anchor: number, head: number): Promise<void> => {
      v.dispatch({ selection: { anchor, head } });
      await next_frame();
      const n = container.querySelectorAll('.cm-clippedSelectionBackground').length;
      if (n !== 1) {
        bad.push(`"${doc.trim()}" [${Math.min(anchor, head)},${Math.max(anchor, head)}]=${n}`);
      }
    };
    // Sweep the drag head across the heading text from both anchor ends.
    for (let head = text_from; head < line.to; head++) await check(line.to, head);
    for (let head = text_from + 1; head <= line.to; head++) await check(text_from, head);
    return bad;
  }

  it('HEAD-R-5: never paints a second rectangle for a within-heading selection', async () => {
    const cases: Array<[string, number]> = [
      ['# abcdefgh\n', 1],
      ['### deep enough heading\n', 1],
      ['plain intro\n\n## heading on line three\n', 3],
    ];
    const bad: string[] = [];
    for (const [doc, line_no] of cases) {
      bad.push(...(await bad_selections(doc, line_no)));
    }
    expect(bad).toEqual([]);
  });

  it('HEAD-R-5: keeps the ATX marker collapsed to zero width', async () => {
    view = mount_editor(container, '# Heading\n');
    await next_frame();
    await next_frame();
    // `#`, ` `, and the start of `Heading` (offsets 0, 1, 2) all sit at the
    // line's left edge once the marker is hidden.
    const c0 = view.coordsAtPos(0);
    const c2 = view.coordsAtPos(2);
    expect(c0).not.toBeNull();
    expect(c2).not.toBeNull();
    expect(Math.round(c0!.left)).toBe(Math.round(c2!.left));
  });
});
