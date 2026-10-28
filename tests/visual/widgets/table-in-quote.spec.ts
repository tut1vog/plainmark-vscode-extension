import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { frames, get_cell, get_table_block, mount_editor, move_cursor, next_frame } from '../util.js';

// TBL-R-20 / BQ-E-9: a table inside a blockquote or callout renders as a
// widget inside the quote's own line chrome, and cell edits keep every row's
// `> ` prefix (TBL-SP-13).

const QUOTED = 'para\n> intro\n>\n> | A | B |\n> |---|---|\n> | 1 | 2 |\n> | 3 | 4 |\n> after';
const CALLOUT = '> [!NOTE] Title\n>\n> | A | B |\n> |---|---|\n> | 1 | 2 |\n> after';

function active_subview(): EditorView {
  const el = document.querySelector('.plainmark-table-cell-edit .cm-content');
  const v = el ? EditorView.findFromDOM(el as HTMLElement) : null;
  if (!v) throw new Error('no active cell subview');
  return v;
}

async function activate(container: HTMLElement, row: number, col: number): Promise<void> {
  get_cell(container, row, col).dispatchEvent(
    new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
  );
  await frames(2);
}

describe('table inside a blockquote or callout', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '600px';
    document.body.appendChild(container);
  });
  afterEach(() => {
    view?.destroy();
    view = undefined;
    container.remove();
  });

  it('renders the widget inside a quote line, with the quote chrome on the line', async () => {
    view = mount_editor(container, QUOTED);
    move_cursor(view, 0);
    await frames(3);
    const block = get_table_block(container);
    expect(block.classList.contains('plainmark-table-quoted')).toBe(true);
    expect(block.classList.contains('plainmark-block-gap-above')).toBe(false);
    const line = block.parentElement!;
    expect(line.classList.contains('cm-line')).toBe(true);
    expect(line.classList.contains('plainmark-blockquote')).toBe(true);
    expect(line.getAttribute('data-blockquote-depth')).toBe('1');
    // The replaced `> ` markers cannot draw their bar; the line's ::before does.
    expect(getComputedStyle(line, '::before').content).toBe('""');
    // The absorbed trailing line stays a plain quote line below the widget.
    const texts = Array.from(container.querySelectorAll('.cm-line')).map((l) => l.textContent);
    expect(texts[texts.length - 1]).toContain('after');
    expect(block.getAttribute('data-table-from')).toBe(String(QUOTED.indexOf('| A')));
    // Inline-block widget between CM6's widget buffers: no empty line box above
    // or below, and the table starts at the line's content column, not under
    // the bar (the line's hanging text-indent is zeroed).
    const lb = line.getBoundingClientRect();
    const bb = block.getBoundingClientRect();
    expect(bb.top - lb.top).toBeLessThan(8);
    expect(lb.bottom - bb.bottom).toBeLessThan(8);
    expect(Math.round(bb.left)).toBe(
      Math.round(lb.left + parseFloat(getComputedStyle(line).paddingLeft)),
    );
    // The stripe is translucent so the quote tint shows through it.
    const stripe = getComputedStyle(block.querySelector('tbody tr:nth-child(even)')!).backgroundColor;
    const alpha = /(?:\/\s*|,\s*)([\d.]+)\)$/.exec(stripe)?.[1];
    expect(alpha, stripe).toBeDefined();
    expect(parseFloat(alpha!)).toBeLessThan(0.2);
  });

  it('renders the widget inside a callout body line', async () => {
    view = mount_editor(container, CALLOUT);
    await frames(3);
    const block = get_table_block(container);
    const line = block.parentElement!;
    expect(line.classList.contains('plainmark-callout-body')).toBe(true);
    expect(line.getAttribute('data-callout-type')).toBe('note');
    expect(container.querySelector('.plainmark-callout-title')).not.toBeNull();
  });

  it('a cell edit keeps every row prefixed with `> ` and leaves the rest of the quote intact', async () => {
    view = mount_editor(container, QUOTED);
    move_cursor(view, 0);
    await frames(3);
    await activate(container, 1, 1);
    const sub = active_subview();
    sub.dispatch({
      changes: { from: sub.state.doc.length, insert: 'x' },
      userEvent: 'input.type',
    });
    await next_frame();
    await frames(2);
    expect(view.state.doc.toString()).toBe(
      'para\n> intro\n>\n> | A   | B   |\n> | --- | --- |\n> | 1   | 2x  |\n> | 3   | 4   |\n> after',
    );
    expect(get_cell(container, 1, 1).textContent).toBe('2x');
  });
});
