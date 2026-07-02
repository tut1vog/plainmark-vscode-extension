// Regression — after a mousedown + mouseup cycle that lands the caret
// inside a text-style construct, the markers must actually become visible.
//
// MRS-P-1/P-2 freeze model: the capture-phase mousedown listener snapshots the
// pre-click (off-construct) selection into frozen_reveal_selection_field; CM6
// then moves the caret inside as it handles the same press. While the button is
// held the reveal predicate runs against that frozen off-construct selection, so
// markers stay hidden mid-press and reveal only on release. A document-level
// mouseup clears the latch via a state-effect-only dispatch (no selection or doc
// change); InlineDecorationsPlugin.update() rebuilds decorations only on
// docChanged / viewportChanged / selectionSet / pointer-latch flip — the latch
// guard is what makes the release rebuild fire so the caret-inside reveal lands.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { editor_extensions } from '../../src/webview/editor_extensions.js';

function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}

describe('marker reveal after mousedown/mouseup cycle (regression)', () => {
  let container: HTMLElement;
  let view: EditorView;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    view.destroy();
    container.remove();
  });

  // Each fixture: a single-line doc with one construct, plus the caret
  // position that lands inside the content area and the count of hidden-marker
  // spans we expect AFTER a press/release.
  const fixtures: Array<{
    name: string;
    doc: string;
    caret: number;
  }> = [
    { name: 'strong', doc: '**bold** xy\n', caret: 4 },
    { name: 'em', doc: '*it* xy\n', caret: 2 },
    { name: 'strikethrough', doc: '~~st~~ xy\n', caret: 3 },
    { name: 'inline code', doc: '`cd` xy\n', caret: 2 },
    { name: 'link', doc: '[lk](http://e.co) xy\n', caret: 2 },
  ];

  for (const fx of fixtures) {
    it(`${fx.name}: markers reveal after mousedown + mouseup with caret inside`, async () => {
      view = new EditorView({
        state: EditorState.create({
          doc: fx.doc,
          extensions: editor_extensions,
          selection: { anchor: fx.doc.length }, // start off-construct
        }),
        parent: container,
      });
      await next_frame();
      await next_frame();

      // Baseline: caret off-construct → markers are hidden.
      const hidden_before = container.querySelectorAll(
        '.plainmark-inline-marker-hidden',
      ).length;
      expect(hidden_before).toBeGreaterThan(0);

      // Press first: the capture-phase listener freezes the current
      // off-construct selection. CM6 then moves the caret inside as part of
      // handling the same press (modeled by the dispatch after mousedown).
      view.contentDOM.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
      );
      view.dispatch({ selection: { anchor: fx.caret } });
      await next_frame();

      // Mid-press the predicate runs against the frozen off-construct selection,
      // so the caret-inside construct stays hidden until release.
      const hidden_during_press = container.querySelectorAll(
        '.plainmark-inline-marker-hidden',
      ).length;
      expect(hidden_during_press).toBeGreaterThan(0);

      // Release: document-level mouseup clears pointer_down. Rebuild must
      // fire so the caret-inside reveal applies.
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await next_frame();

      const hidden_after_release = container.querySelectorAll(
        '.plainmark-inline-marker-hidden',
      ).length;
      expect(hidden_after_release).toBe(0);
    });
  }
});
