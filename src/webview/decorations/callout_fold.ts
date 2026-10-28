import {
  codeFolding,
  foldEffect,
  foldedRanges,
  syntaxTree,
  unfoldEffect,
} from '@codemirror/language';
import {
  type EditorState,
  type Extension,
  MapMode,
  type Range,
  type StateEffect,
  StateField,
} from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import {
  doc_change_regions,
  frontier_growth,
  merge_regions,
  tree_rebuilt_unbounded,
} from '../region_rebuild.js';
import type { OffsetRange } from '../ranges.js';
import { detect_callout } from './callout_detect.js';

// The span a callout folds: the header line's end through the node's last line
// end, so the header stays and every body line hides. Null for a bare header.
function callout_body_range(state: EditorState, node: SyntaxNode): OffsetRange | null {
  const header = state.doc.lineAt(node.from);
  const to = state.doc.lineAt(node.to).to;
  return to > header.to ? { from: header.to, to } : null;
}

function outermost_blockquote_at(state: EditorState, pos: number): SyntaxNode | null {
  let found: SyntaxNode | null = null;
  for (let node: SyntaxNode | null = syntaxTree(state).resolve(pos, 1); node; node = node.parent) {
    if (node.name === 'Blockquote') found = node;
  }
  return found;
}

function fold_at(state: EditorState, range: OffsetRange): boolean {
  let folded = false;
  foldedRanges(state).between(range.from, range.to, (from, to) => {
    if (from === range.from && to === range.to) folded = true;
  });
  return folded;
}

// Fold or unfold the callout whose header line contains `header_pos`. View-only:
// the `-`/`+` byte is never written (CALL-SP-1).
export function toggle_callout_fold(view: EditorView, header_pos: number): boolean {
  const state = view.state;
  const node = outermost_blockquote_at(state, header_pos);
  if (!node || detect_callout(state, node) === null) return false;
  const range = callout_body_range(state, node);
  if (!range) return false;
  view.dispatch({
    effects: fold_at(state, range) ? unfoldEffect.of(range) : foldEffect.of(range),
  });
  return true;
}

// `-` callouts start collapsed (Obsidian). Each header gets its default applied
// once — when it first appears, by load, edit, or parse progress — and is then
// left to the user's toggles; dropping the `-` and re-adding it re-arms it.
class DefaultFoldPlugin {
  private applied = new Set<number>();
  private destroyed = false;

  constructor(view: EditorView) {
    this.apply(view, [{ from: 0, to: view.state.doc.length }]);
  }

  update(update: ViewUpdate): void {
    if (update.docChanged) {
      const remapped = new Set<number>();
      for (const pos of this.applied) {
        const mapped = update.changes.mapPos(pos, -1, MapMode.TrackDel);
        if (mapped !== null) remapped.add(mapped);
      }
      this.applied = remapped;
    }
    const tree_changed = syntaxTree(update.startState) !== syntaxTree(update.state);
    if (!update.docChanged && !tree_changed) return;
    const { startState, state } = update;
    if (tree_rebuilt_unbounded(startState, state, update.docChanged)) {
      this.apply(update.view, [{ from: 0, to: state.doc.length }]);
      return;
    }
    const regions: OffsetRange[] = [];
    if (update.docChanged) {
      for (const pair of doc_change_regions(startState, state, update.changes)) {
        regions.push(pair.new_region);
      }
    }
    const growth = frontier_growth(startState, state, update.docChanged ? update.changes : null);
    if (growth) regions.push(growth);
    this.apply(update.view, merge_regions(regions));
  }

  destroy(): void {
    this.destroyed = true;
  }

  private apply(view: EditorView, regions: OffsetRange[]): void {
    const state = view.state;
    const effects: StateEffect<OffsetRange>[] = [];
    for (const region of regions) {
      const found = new Set<number>();
      syntaxTree(state).iterate({
        from: region.from,
        to: region.to,
        enter: (node) => {
          if (node.name !== 'Blockquote') return;
          const info = detect_callout(state, node.node);
          if (info?.fold === '-') {
            found.add(node.from);
            if (!this.applied.has(node.from)) {
              const range = callout_body_range(state, node.node);
              if (range && !fold_at(state, range)) effects.push(foldEffect.of(range));
            }
          }
          return false;
        },
      });
      for (const pos of this.applied) {
        if (pos >= region.from && pos <= region.to && !found.has(pos)) this.applied.delete(pos);
      }
      for (const pos of found) this.applied.add(pos);
    }
    if (effects.length === 0) return;
    // A plugin may not dispatch inside an update; the fold lands right after it.
    queueMicrotask(() => {
      if (!this.destroyed) view.dispatch({ effects });
    });
  }
}

const folded_header_line = Decoration.line({ class: 'plainmark-callout-folded' });

function build_folded_headers(state: EditorState): DecorationSet {
  const out: Range<Decoration>[] = [];
  foldedRanges(state).between(0, state.doc.length, (from) => {
    out.push(folded_header_line.range(state.doc.lineAt(from).from));
  });
  return Decoration.set(out, true);
}

// Callout folds are the only folds in the editor, so every fold start is a
// callout header; the class restores the bottom padding its hidden last line
// would have carried (CALL-R-4).
const folded_headers_field = StateField.define<DecorationSet>({
  create: build_folded_headers,
  update(value, tr) {
    if (!tr.docChanged && foldedRanges(tr.startState) === foldedRanges(tr.state)) return value;
    return build_folded_headers(tr.state);
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const callout_fold_extension: Extension = [
  codeFolding({
    placeholderDOM: () => {
      const el = document.createElement('span');
      el.className = 'plainmark-callout-fold-placeholder';
      el.setAttribute('aria-hidden', 'true');
      return el;
    },
  }),
  folded_headers_field,
  ViewPlugin.fromClass(DefaultFoldPlugin),
];
