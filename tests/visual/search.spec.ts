// CM6 in-document find: the search panel opens as a floating widget, highlights
// every occurrence from the document model (not just the rendered viewport),
// find-next walks the matches, the current match reads apart from the others,
// typing applies after a short pause, and the panel/match colors are themed off
// VS Code variables rather than CM6's light-mode baseTheme. The host-side
// Ctrl/Cmd+F muzzle is a VS Code keybinding concern verified by manual smoke,
// not reachable from this harness.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import {
  findNext,
  getSearchQuery,
  openSearchPanel,
  SearchQuery,
  setSearchQuery,
} from '@codemirror/search';
import { mount_editor, next_frame } from './util.js';

// editor_extensions wires the panel with a 200 ms input delay.
const DEBOUNCE_MS = 200;

async function open_with_query(view: EditorView, query: string): Promise<void> {
  openSearchPanel(view);
  view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: query })) });
  await next_frame();
}

function find_field(container: HTMLElement): HTMLInputElement {
  const field = container.querySelector('.cm-panel.cm-search input[name="search"]');
  if (!(field instanceof HTMLInputElement)) throw new Error('no find field');
  return field;
}

function type_into(field: HTMLInputElement, text: string): void {
  field.value = text;
  field.dispatchEvent(new InputEvent('input', { bubbles: true }));
}

function press(field: HTMLInputElement, key: string, shift = false): void {
  field.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      code: key,
      shiftKey: shift,
      bubbles: true,
      cancelable: true,
    }),
  );
}

async function wait_ms(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
  await next_frame();
}

describe('SHELL-X-16: CM6 in-document find (search panel)', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '800px';
    document.body.appendChild(container);
  });
  afterEach(() => {
    view?.destroy();
    container.remove();
  });

  it('opens the search panel on demand', async () => {
    view = mount_editor(container, 'alpha beta\n\ngamma delta\n');
    await next_frame();
    openSearchPanel(view);
    await next_frame();
    expect(container.querySelector('.cm-panel.cm-search')).not.toBeNull();
  });

  it('floats the panel over the top-right corner without pushing the document down', async () => {
    view = mount_editor(container, 'alpha beta\n\ngamma delta\n');
    await next_frame();
    openSearchPanel(view);
    await next_frame();
    const panels = container.querySelector('.cm-panels.cm-panels-top') as HTMLElement;
    const editor = view.dom.getBoundingClientRect();
    const panel = panels.getBoundingClientRect();
    const scroller = view.scrollDOM.getBoundingClientRect();
    expect(getComputedStyle(panels).position).toBe('absolute');
    const right_gap = editor.right - panel.right;
    expect(right_gap).toBeGreaterThan(0);
    expect(right_gap).toBeLessThanOrEqual(40);
    expect(panel.width).toBeLessThan(editor.width / 2 + 50);
    expect(scroller.top).toBe(editor.top);
  });

  it('sizes the panel controls at the widget font, not CM6 70%', async () => {
    view = mount_editor(container, 'alpha beta\n');
    await next_frame();
    openSearchPanel(view);
    await next_frame();
    const panel = container.querySelector('.cm-panel.cm-search') as HTMLElement;
    const panel_size = parseFloat(getComputedStyle(panel).fontSize);
    expect(panel_size).toBeGreaterThanOrEqual(12);
    expect(parseFloat(getComputedStyle(find_field(container)).fontSize)).toBe(panel_size);
    const button = panel.querySelector('button[name="next"]') as HTMLElement;
    expect(parseFloat(getComputedStyle(button).fontSize)).toBe(panel_size);
  });

  it('seeds the find field from the selected word', async () => {
    view = mount_editor(container, 'alpha beta\n');
    await next_frame();
    view.dispatch({ selection: { anchor: 0, head: 5 } });
    openSearchPanel(view);
    await next_frame();
    expect(find_field(container).value).toBe('alpha');
  });

  it('closes on Escape from the find field', async () => {
    view = mount_editor(container, 'alpha beta\n');
    await next_frame();
    openSearchPanel(view);
    await next_frame();
    press(find_field(container), 'Escape');
    await next_frame();
    expect(container.querySelector('.cm-panel.cm-search')).toBeNull();
  });

  it('highlights every occurrence from the document model', async () => {
    view = mount_editor(container, 'alpha beta alpha\n\ngamma alpha delta\n');
    await next_frame();
    await open_with_query(view, 'alpha');
    expect(container.querySelectorAll('.cm-searchMatch').length).toBe(3);
  });

  it('find-next selects the next match', async () => {
    view = mount_editor(container, 'alpha beta alpha\n\ngamma alpha delta\n');
    await next_frame();
    await open_with_query(view, 'alpha');
    findNext(view);
    await next_frame();
    const sel = view.state.selection.main;
    expect(sel.empty).toBe(false);
    expect(view.state.sliceDoc(sel.from, sel.to)).toBe('alpha');
  });

  it('themes the match highlight (not CM6 default yellow)', async () => {
    view = mount_editor(container, 'alpha beta alpha\n');
    await next_frame();
    await open_with_query(view, 'alpha');
    const match = container.querySelector('.cm-searchMatch');
    if (!match) throw new Error('no .cm-searchMatch rendered');
    // CM6's light baseTheme default is #ffff0054 = rgba(255, 255, 0, 0.33); the
    // search_panel_theme override must replace it.
    expect(getComputedStyle(match).backgroundColor).not.toBe('rgba(255, 255, 0, 0.33)');
  });

  it('keeps a match inside inline code visible', async () => {
    view = mount_editor(container, '`alpha` beta\n');
    await next_frame();
    await open_with_query(view, 'alpha');
    const code = container.querySelector('.cm-searchMatch .plainmark-inline-code');
    if (!code) throw new Error('no inline-code span inside the match');
    expect(getComputedStyle(code).backgroundColor).toBe('rgba(0, 0, 0, 0)');
  });
});

describe('SHELL-X-17: find input delay and current-match styling', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '800px';
    document.body.appendChild(container);
  });
  afterEach(() => {
    view?.destroy();
    container.remove();
  });

  it('applies typed text only after a pause', async () => {
    view = mount_editor(container, 'alpha beta alpha\n');
    await next_frame();
    openSearchPanel(view);
    await next_frame();
    type_into(find_field(container), 'alpha');
    await next_frame();
    expect(getSearchQuery(view.state).search).toBe('');
    expect(container.querySelectorAll('.cm-searchMatch').length).toBe(0);
    await wait_ms(DEBOUNCE_MS + 100);
    expect(getSearchQuery(view.state).search).toBe('alpha');
    expect(container.querySelectorAll('.cm-searchMatch').length).toBe(2);
  });

  it('Enter applies pending text at once and selects the next match', async () => {
    view = mount_editor(container, 'alpha beta alpha\n');
    await next_frame();
    openSearchPanel(view);
    await next_frame();
    const field = find_field(container);
    type_into(field, 'beta');
    press(field, 'Enter');
    await next_frame();
    expect(getSearchQuery(view.state).search).toBe('beta');
    const sel = view.state.selection.main;
    expect(view.state.sliceDoc(sel.from, sel.to)).toBe('beta');
  });

  it('styles the current match apart from the other matches', async () => {
    view = mount_editor(container, 'alpha beta alpha\n');
    await next_frame();
    await open_with_query(view, 'alpha');
    findNext(view);
    await next_frame();
    const current = container.querySelector('.cm-searchMatch-selected');
    const other = container.querySelector('.cm-searchMatch:not(.cm-searchMatch-selected)');
    if (!current || !other) throw new Error('expected one current and one other match');
    const current_style = getComputedStyle(current);
    expect(current_style.backgroundColor).not.toBe(getComputedStyle(other).backgroundColor);
    expect(current_style.outlineStyle).toBe('solid');
    expect(current_style.outlineColor).not.toBe('rgba(0, 0, 0, 0)');
  });
});
