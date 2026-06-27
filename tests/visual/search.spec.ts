// CM6 in-document find: the search panel opens, highlights every occurrence
// from the document model (not just the rendered viewport), find-next walks the
// matches, and the panel/match colors are themed off VS Code variables rather
// than CM6's light-mode baseTheme. The host-side Ctrl/Cmd+F muzzle is a VS Code
// keybinding concern verified by manual smoke, not reachable from this harness.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';
import {
  findNext,
  openSearchPanel,
  SearchQuery,
  setSearchQuery,
} from '@codemirror/search';
import { mount_editor } from './util.js';

function next_frame(): Promise<void> {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}

async function open_with_query(view: EditorView, query: string): Promise<void> {
  openSearchPanel(view);
  view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: query })) });
  await next_frame();
}

describe('SHELL-X-16: CM6 in-document find (search panel)', () => {
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

  it('opens the search panel on demand', async () => {
    view = mount_editor(container, 'alpha beta\n\ngamma delta\n');
    await next_frame();
    openSearchPanel(view);
    await next_frame();
    expect(container.querySelector('.cm-panel.cm-search')).not.toBeNull();
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
});
