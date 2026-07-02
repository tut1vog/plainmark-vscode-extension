// Regression: vertical cursor motion must step one visual line at a
// time past a block widget. A CSS `margin` on a block-widget container is
// excluded from getBoundingClientRect().height, which desyncs CM6's height
// map and collapses ArrowUp to the line above the widget regardless of how
// many lines sit between. Block widgets must use padding, not margin.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cursorLineDown, cursorLineUp, history } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { GFM } from '@lezer/markdown';
import { ensure_mathjax } from '../mathjax-ready.js';
import { math_extension as math_grammar_extension } from '../../../src/webview/grammar/math.js';
import { math_extension } from '../../../src/webview/widgets/math.js';
import { table_extension } from '../../../src/webview/widgets/table.js';

// A table / math block at lines 3-5, paragraphs above and below. The widget
// occupies three source lines but one visual block, so one ArrowUp crosses it.
const TABLE_DOC =
  'intro\n\n| h1 | h2 |\n|----|----|\n| a | b |\n\npara one\n\npara two\n\npara three';
const MATH_DOC = 'intro\n\n$$\nx^2\n$$\n\npara one\n\npara two\n\npara three';

// Visual order: [L1][L2][WIDGET=L3-5][L6][L7][L8][L9][L10][L11].
// From L11, stepping up one visual line at a time: L11→10→9→8→7→6→(skip
// widget)→2→1.
const EXPECT_UP = [10, 9, 8, 7, 6, 2, 1];
const EXPECT_DOWN = [2, 6, 7, 8, 9, 10, 11];

function mount(parent: HTMLElement, doc: string, anchor: number, extra: Extension): EditorView {
  return new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor },
      extensions: [history(), markdown({ extensions: [GFM, math_grammar_extension] }), extra],
    }),
    parent,
  });
}

async function settle(view: EditorView): Promise<void> {
  for (let i = 0; i < 4; i++) {
    view.requestMeasure();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }
}

function walk(view: EditorView, step: (v: EditorView) => boolean, presses: number): number[] {
  const lines: number[] = [];
  for (let i = 0; i < presses; i++) {
    step(view);
    lines.push(view.state.doc.lineAt(view.state.selection.main.head).number);
  }
  return lines;
}

describe('block-widget vertical navigation', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.height = '600px';
    container.style.width = '800px';
    document.body.appendChild(container);
  });
  afterEach(() => {
    view?.destroy();
    view = undefined;
    container.remove();
  });

  it('ArrowUp steps one visual line at a time below a table widget', async () => {
    view = mount(container, TABLE_DOC, TABLE_DOC.length, table_extension);
    await settle(view);
    expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(11);
    expect(walk(view, cursorLineUp, 7)).toEqual(EXPECT_UP);
  });

  it('ArrowDown steps one visual line at a time below a table widget', async () => {
    view = mount(container, TABLE_DOC, 0, table_extension);
    await settle(view);
    expect(walk(view, cursorLineDown, 7)).toEqual(EXPECT_DOWN);
  });

  it('ArrowUp steps one visual line at a time below a math block widget', async () => {
    await ensure_mathjax();
    view = mount(container, MATH_DOC, MATH_DOC.length, math_extension);
    await settle(view);
    expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(11);
    expect(walk(view, cursorLineUp, 7)).toEqual(EXPECT_UP);
  });
});
