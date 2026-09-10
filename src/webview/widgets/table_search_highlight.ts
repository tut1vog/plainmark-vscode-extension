import { type Extension, Text as CMText } from '@codemirror/state';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { type SearchQuery, getSearchQuery, searchPanelOpen } from '@codemirror/search';
import { set_typeset_effect } from './math.js';
import { get_active_cell_snapshot, locate_table_extraction } from './table.js';
import { set_cell_search_query } from './table_cell_search.js';

// Rendered cells live inside a block replace widget, so CM6's cm-searchMatch
// marks never reach them; paint the matches with CSS custom highlights over
// the widget's own text nodes instead — no DOM mutation the widget's redraws
// would have to know about.
export const MATCH_HIGHLIGHT = 'plainmark-search-match';
export const CURRENT_MATCH_HIGHLIGHT = 'plainmark-search-match-current';
const CELL_RENDERED_EVENT = 'plainmark-table-cell-rendered';

// The Set / Map surface of the registry is typed in DOM.Iterable, which the
// project's lib set leaves out; type only what is used.
interface HighlightSet {
  add(range: AbstractRange): void;
}
interface HighlightRegistryMap {
  set(name: string, highlight: HighlightSet): void;
  delete(name: string): boolean;
}

function highlight_registry(): HighlightRegistryMap | null {
  if (typeof Highlight === 'undefined' || typeof CSS === 'undefined' || !('highlights' in CSS)) {
    return null;
  }
  return CSS.highlights as unknown as HighlightRegistryMap;
}

function cell_match_ranges(td: HTMLElement, query: SearchQuery): Range[] {
  const walker = document.createTreeWalker(td, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = '';
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.data === '​') continue;
    nodes.push(node);
    starts.push(text.length);
    text += node.data;
  }
  if (text.length === 0) return [];
  const locate = (offset: number, end: boolean): [Text, number] => {
    let i = nodes.length - 1;
    while (i > 0 && (end ? starts[i] >= offset : starts[i] > offset)) i--;
    return [nodes[i], offset - starts[i]];
  };
  const ranges: Range[] = [];
  const cursor = query.getCursor(CMText.of(text.split('\n')));
  for (let step = cursor.next(); !step.done; step = cursor.next()) {
    const { from, to } = step.value;
    if (from === to) continue;
    const range = document.createRange();
    const [start_node, start_offset] = locate(from, false);
    const [end_node, end_offset] = locate(to, true);
    range.setStart(start_node, start_offset);
    range.setEnd(end_node, end_offset);
    ranges.push(range);
  }
  return ranges;
}

const table_search_highlight_plugin = ViewPlugin.fromClass(
  class {
    private readonly on_cell_rendered = (): void => this.schedule();

    constructor(private readonly view: EditorView) {
      view.dom.addEventListener(CELL_RENDERED_EVENT, this.on_cell_rendered);
      if (searchPanelOpen(view.state)) this.schedule();
    }

    update(update: ViewUpdate): void {
      const was_open = searchPanelOpen(update.startState);
      const open = searchPanelOpen(update.state);
      const query_changed = !getSearchQuery(update.state).eq(getSearchQuery(update.startState));
      if (was_open !== open || query_changed) this.push_to_active_cell(open);
      if (!open && !was_open) return;
      if (
        was_open !== open ||
        query_changed ||
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        update.transactions.some((tr) => tr.effects.some((e) => e.is(set_typeset_effect)))
      ) {
        this.schedule();
      }
    }

    destroy(): void {
      this.view.dom.removeEventListener(CELL_RENDERED_EVENT, this.on_cell_rendered);
      const registry = highlight_registry();
      registry?.delete(MATCH_HIGHLIGHT);
      registry?.delete(CURRENT_MATCH_HIGHLIGHT);
    }

    private push_to_active_cell(open: boolean): void {
      const snapshot = get_active_cell_snapshot(this.view);
      if (!snapshot) return;
      const query = open ? getSearchQuery(this.view.state) : null;
      snapshot.sub_view.dispatch({ effects: set_cell_search_query.of(query) });
    }

    private schedule(): void {
      if (!highlight_registry()) return;
      this.view.requestMeasure({ key: this, read: () => null, write: () => this.apply() });
    }

    private apply(): void {
      const registry = highlight_registry();
      if (!registry) return;
      const { state } = this.view;
      const query = getSearchQuery(state);
      const matches = new Highlight() as unknown as HighlightSet;
      const current = new Highlight() as unknown as HighlightSet;
      if (searchPanelOpen(state) && query.valid) {
        const selection = state.selection.main;
        for (const block of Array.from(
          this.view.dom.querySelectorAll<HTMLElement>('.plainmark-table-block'),
        )) {
          const table_from = Number(block.dataset.tableFrom);
          const cells = locate_table_extraction(state, table_from)?.info.cells ?? [];
          const current_cell = cells.find(
            (c) => selection.from >= c.cell_from && selection.to <= c.cell_to,
          );
          for (const td of Array.from(block.querySelectorAll<HTMLTableCellElement>('td, th'))) {
            if (td.querySelector('.plainmark-table-cell-edit')) continue;
            const is_current =
              current_cell !== undefined &&
              Number(td.dataset.rowIndex) === current_cell.row_index &&
              Number(td.dataset.colIndex) === current_cell.col_index;
            for (const range of cell_match_ranges(td, query)) {
              (is_current ? current : matches).add(range);
            }
          }
        }
      }
      registry.set(MATCH_HIGHLIGHT, matches);
      registry.set(CURRENT_MATCH_HIGHLIGHT, current);
    }
  },
);

// ::highlight() takes only color / background-color / text-decoration, so the
// current cell is told apart by an underline rather than the outline used on
// cm-searchMatch-selected.
const table_search_highlight_theme = EditorView.theme({
  [`.plainmark-table-block *::highlight(${MATCH_HIGHLIGHT})`]: {
    backgroundColor: 'var(--vscode-editor-findMatchHighlightBackground, rgba(234, 92, 0, 0.33))',
  },
  [`.plainmark-table-block *::highlight(${CURRENT_MATCH_HIGHLIGHT})`]: {
    backgroundColor: 'var(--vscode-editor-findMatchBackground, rgba(234, 92, 0, 0.6))',
    textDecoration:
      'underline 2px var(--vscode-editor-findMatchBorder, var(--vscode-focusBorder, #0078d4))',
  },
});

export const table_search_highlight: Extension = [
  table_search_highlight_plugin,
  table_search_highlight_theme,
];
