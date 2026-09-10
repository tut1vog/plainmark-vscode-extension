// Find matches inside tables: rendered cells sit in a block replace widget, so
// they are painted with CSS custom highlights; the active cell subview gets
// cm-searchMatch marks pushed from the main view's query.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import {
  closeSearchPanel,
  findNext,
  openSearchPanel,
  SearchQuery,
  setSearchQuery,
} from '@codemirror/search';
import { get_active_cell_snapshot } from '../../../src/webview/widgets/table.js';
import {
  CURRENT_MATCH_HIGHLIGHT,
  MATCH_HIGHLIGHT,
} from '../../../src/webview/widgets/table_search_highlight.js';
import { frames, get_cell, mount_editor, next_frame } from '../util.js';

const DOC = 'Intro alpha\n\n| Name | Value |\n|---|---|\n| alpha | 1 |\n| beta | alpha two |\n';

function highlight_ranges(name: string): AbstractRange[] {
  const registry = (CSS as unknown as { highlights: Map<string, Set<AbstractRange>> }).highlights;
  const highlight = registry.get(name);
  return highlight ? Array.from(highlight) : [];
}

async function open_with_query(view: EditorView, query: string): Promise<void> {
  openSearchPanel(view);
  view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: query })) });
  await frames(3);
}

async function activate(td: HTMLElement): Promise<void> {
  td.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await frames(3);
}

async function settle(): Promise<void> {
  // Blur teardown rides focusout → setTimeout(0); drain a macrotask plus frames.
  await new Promise((r) => setTimeout(r, 20));
  await frames(3);
}

describe('TBL-R-19: find matches inside tables', () => {
  let container: HTMLElement;
  let view: EditorView | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '800px';
    document.body.appendChild(container);
  });
  afterEach(() => {
    view?.destroy();
    view = undefined;
    container.remove();
  });

  it('highlights matches in rendered cells', async () => {
    view = mount_editor(container, DOC);
    await next_frame();
    await open_with_query(view, 'alpha');
    const ranges = highlight_ranges(MATCH_HIGHLIGHT);
    expect(ranges.length).toBe(2);
    expect(ranges.some((r) => get_cell(container, 1, 0).contains(r.startContainer))).toBe(true);
    expect(ranges.some((r) => get_cell(container, 2, 1).contains(r.startContainer))).toBe(true);
    expect(container.querySelectorAll('.cm-searchMatch').length).toBe(1);
  });

  it('marks the cell that holds the current match', async () => {
    view = mount_editor(container, DOC);
    await next_frame();
    await open_with_query(view, 'alpha');
    findNext(view);
    findNext(view);
    await frames(3);
    const current = highlight_ranges(CURRENT_MATCH_HIGHLIGHT);
    expect(current.length).toBe(1);
    expect(get_cell(container, 1, 0).contains(current[0].startContainer)).toBe(true);
    expect(highlight_ranges(MATCH_HIGHLIGHT).length).toBe(1);
  });

  it('clears rendered-cell highlights when the panel closes', async () => {
    view = mount_editor(container, DOC);
    await next_frame();
    await open_with_query(view, 'alpha');
    closeSearchPanel(view);
    await frames(3);
    expect(highlight_ranges(MATCH_HIGHLIGHT).length).toBe(0);
    expect(highlight_ranges(CURRENT_MATCH_HIGHLIGHT).length).toBe(0);
  });

  it('highlights inside the active cell and follows query changes', async () => {
    view = mount_editor(container, DOC);
    await next_frame();
    await open_with_query(view, 'alpha');
    const td = get_cell(container, 2, 1);
    await activate(td);
    expect(get_active_cell_snapshot(view)).not.toBeNull();
    expect(td.querySelectorAll('.cm-content .cm-searchMatch').length).toBe(1);
    expect(highlight_ranges(MATCH_HIGHLIGHT).length).toBe(1);

    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: 'two' })) });
    await frames(3);
    const marks = td.querySelectorAll('.cm-content .cm-searchMatch');
    expect(marks.length).toBe(1);
    expect(marks[0].textContent).toBe('two');
    expect(highlight_ranges(MATCH_HIGHLIGHT).length).toBe(0);
  });

  it('repaints a cell after it deactivates', async () => {
    view = mount_editor(container, DOC);
    await next_frame();
    await open_with_query(view, 'alpha');
    await activate(get_cell(container, 1, 0));
    expect(highlight_ranges(MATCH_HIGHLIGHT).length).toBe(1);
    get_active_cell_snapshot(view)!.sub_view.contentDOM.blur();
    await settle();
    expect(get_active_cell_snapshot(view)).toBeNull();
    // Activation seeded the main selection into the cell, so its match is now the current one.
    const current = highlight_ranges(CURRENT_MATCH_HIGHLIGHT);
    expect(current.length).toBe(1);
    expect(get_cell(container, 1, 0).contains(current[0].startContainer)).toBe(true);
    expect(highlight_ranges(MATCH_HIGHLIGHT).length).toBe(1);
  });
});
