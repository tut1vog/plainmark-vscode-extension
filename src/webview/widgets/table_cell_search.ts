import { type Extension, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import type { SearchQuery } from '@codemirror/search';

// The active cell is a nested EditorView without the main view's search
// state; the main view pushes its query in through this effect.
export const set_cell_search_query = StateEffect.define<SearchQuery | null>();

const cell_search_query_field = StateField.define<SearchQuery | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(set_cell_search_query)) value = effect.value;
    }
    return value;
  },
});

const match_mark = Decoration.mark({ class: 'cm-searchMatch' });

function build_marks(view: EditorView): DecorationSet {
  const query = view.state.field(cell_search_query_field);
  if (!query?.valid) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const cursor = query.getCursor(view.state, from, to);
    for (let step = cursor.next(); !step.done; step = cursor.next()) {
      builder.add(step.value.from, step.value.to, match_mark);
    }
  }
  return builder.finish();
}

const cell_search_highlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build_marks(view);
    }
    update(update: ViewUpdate): void {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.state.field(cell_search_query_field) !==
          update.startState.field(cell_search_query_field)
      ) {
        this.decorations = build_marks(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

export function cell_search_extension(initial: SearchQuery | null): Extension {
  return [cell_search_query_field.init(() => initial), cell_search_highlighter];
}
