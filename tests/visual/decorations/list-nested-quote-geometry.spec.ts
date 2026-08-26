// DOM-geometry oracles for blockquotes and callouts nested in list items: the
// quote bar / callout accent must sit on the list content column (the column
// the item's wrapped rows hang at), the content must keep the same offset from
// the bar as at the top level, and nothing may shift when the caret enters.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { mount_editor, move_cursor } from '../util.js';

function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}
async function frames(n: number): Promise<void> {
  for (let i = 0; i < n; i++) await next_frame();
}

const left = (el: Element): number => el.getBoundingClientRect().left;
// The depth-grid column of a list line: its padding edge, where wrapped rows hang.
const grid_column = (line: Element): number =>
  left(line) + parseFloat(getComputedStyle(line).paddingLeft);
// Left edge of the first background layer (the callout accent bar).
const accent_x = (line: Element): number => {
  const cs = getComputedStyle(line);
  return (
    left(line) +
    parseFloat(cs.borderLeftWidth) +
    parseFloat(cs.backgroundPositionX.split(',')[0])
  );
};

describe('list-nested blockquote and callout — content-column geometry BQ-R-14 CALL-R-12', () => {
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

  async function mount(doc: string, anchor = doc.length): Promise<EditorView> {
    view = mount_editor(container, doc);
    move_cursor(view, anchor);
    await frames(6);
    return view;
  }

  it('BQ-R-14: the quote bar lands on the list content column at depth 1 and 2', async () => {
    const doc = '1. abc\n   > quote one\n\n- top\n  - deep\n    > quote two\n\ntail';
    await mount(doc);
    const items = container.querySelectorAll('.plainmark-list-item');
    const markers = container.querySelectorAll('.plainmark-quote-marker');
    expect(markers).toHaveLength(2);
    expect(Math.abs(left(markers[0]) - grid_column(items[0]))).toBeLessThanOrEqual(1);
    expect(Math.abs(left(markers[1]) - grid_column(items[2]))).toBeLessThanOrEqual(1);
  });

  it('BQ-R-14: quote text sits one prefix past the bar and keeps its x when the caret enters', async () => {
    const doc = '- abc\n  > quote text\n\ntail';
    const v = await mount(doc);
    const text_pos = doc.indexOf('quote');
    const marker = container.querySelector('.plainmark-quote-marker')!;
    const before = v.coordsAtPos(text_pos)!.left;
    expect(before).toBeGreaterThan(left(marker) + 4);

    move_cursor(v, text_pos + 2);
    await frames(4);
    expect(Math.abs(v.coordsAtPos(text_pos)!.left - before)).toBeLessThanOrEqual(1);
  });

  it('BQ-R-14: wrapped rows of a nested quote hang under the first row text', async () => {
    const body = 'word '.repeat(40).trim();
    const doc = `- abc\n  > ${body}\n\ntail`;
    const v = await mount(doc);
    const start = doc.indexOf('word');
    const first = v.coordsAtPos(start)!;
    let wrapped: { left: number; top: number } | null = null;
    for (let pos = start; pos < start + body.length && !wrapped; pos++) {
      const c = v.coordsAtPos(pos)!;
      if (c.top > first.top + 2) wrapped = c;
    }
    expect(wrapped).not.toBeNull();
    expect(Math.abs(wrapped!.left - first.left)).toBeLessThanOrEqual(1);
  });

  it('BQ-R-14 LIST-R-11: a quote opening on the marker line keeps the marker at the margin and the bar on the column', async () => {
    const doc = '1. ref\n\n- > bullet form\n  > cont\n\n1. > ordered form\n   > cont\n\ntail';
    const v = await mount(doc);
    const content_left = left(v.contentDOM);
    // The opening lines are list AND quote lines: their padding is the quote's
    // inline prefix hang, so the list column is the nest border edge.
    const items = container.querySelectorAll('.plainmark-list-item');
    const nest_column = (line: Element): number =>
      left(line) + parseFloat(getComputedStyle(line).borderLeftWidth);
    const markers = container.querySelectorAll('.plainmark-quote-marker');
    expect(markers).toHaveLength(4);

    // Bullet form: the bullet is pulled back into the nest border by one unit,
    // so both lines' bars sit at the item's content column.
    const bullet = container.querySelector('.plainmark-list-bullet')!;
    const unit = nest_column(items[1]) - content_left;
    expect(unit).toBeGreaterThan(4);
    expect(
      Math.abs(parseFloat(getComputedStyle(bullet, '::before').marginLeft) + unit),
    ).toBeLessThanOrEqual(1);
    expect(Math.abs(left(markers[0]) - nest_column(items[1]))).toBeLessThanOrEqual(1);
    expect(Math.abs(left(markers[1]) - nest_column(items[1]))).toBeLessThanOrEqual(1);

    // Ordered form: `1. ` stays in flow at the margin, so the opening line's
    // bar sits where a plain item's text starts; the continuation line sits
    // on the grid.
    const digits = container.querySelectorAll('.plainmark-list-marker')[1];
    expect(Math.abs(left(digits) - content_left)).toBeLessThanOrEqual(1);
    const ref_text_x = v.coordsAtPos(doc.indexOf('ref'))!.left;
    expect(Math.abs(left(markers[2]) - ref_text_x)).toBeLessThanOrEqual(1);
    expect(Math.abs(left(markers[3]) - nest_column(items[2]))).toBeLessThanOrEqual(1);
  });

  it('CALL-R-12: the accent lands on the list content column with the top-level bar-to-title gap', async () => {
    const doc = '> [!NOTE] Top\n> body\n\n- abc\n  > [!NOTE] Nested\n  > body\n\ntail';
    await mount(doc);
    const headers = container.querySelectorAll('.plainmark-callout-header');
    const titles = container.querySelectorAll('.plainmark-callout-title');
    expect(headers).toHaveLength(2);
    expect(titles).toHaveLength(2);
    const item = container.querySelector('.plainmark-list-item')!;

    expect(headers[1].classList.contains('plainmark-callout-nested')).toBe(true);
    expect(
      container.querySelector('.plainmark-callout-body.plainmark-callout-nested'),
    ).not.toBeNull();
    expect(Math.abs(accent_x(headers[1]) - grid_column(item))).toBeLessThanOrEqual(1);

    const gap_top = left(titles[0]) - accent_x(headers[0]);
    const gap_nested = left(titles[1]) - accent_x(headers[1]);
    expect(Math.abs(gap_nested - gap_top)).toBeLessThanOrEqual(1);
  });

  it('BQ-R-14 LIST-R-11: a list inside a nested quote puts its first-level bullet at the quote text column', async () => {
    const doc = '- abc\n  > text\n  > - item\n\ntail';
    const v = await mount(doc);
    const bullets = container.querySelectorAll('.plainmark-list-bullet');
    expect(bullets).toHaveLength(2);
    const quote_text_x = v.coordsAtPos(doc.indexOf('text'))!.left;
    expect(Math.abs(left(bullets[1]) - quote_text_x)).toBeLessThanOrEqual(1);
    // The item's text steps one indent unit past the bullet, like the outer list.
    const unit = v.coordsAtPos(doc.indexOf('abc'))!.left - left(bullets[0]);
    const item_x = v.coordsAtPos(doc.indexOf('item'))!.left;
    expect(Math.abs(item_x - (quote_text_x + unit))).toBeLessThanOrEqual(1);
  });
});
