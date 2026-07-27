import type { DecorationSet, EditorView } from '@codemirror/view';

const HIDDEN_MARKER_CLASS = 'plainmark-inline-marker-hidden';

export interface HiddenRunSource {
  readonly decorations: DecorationSet;
}

// Registered by InlineDecorationsPlugin instances so consumers read the
// hidden-marker runs actually rendered — recomputing them from the syntax tree
// would duplicate every handler's reveal / reference-resolution logic.
const sources = new WeakMap<EditorView, Set<HiddenRunSource>>();

export function register_hidden_run_source(
  view: EditorView,
  source: HiddenRunSource,
): void {
  let set = sources.get(view);
  if (!set) {
    set = new Set();
    sources.set(view, set);
  }
  set.add(source);
}

export function unregister_hidden_run_source(
  view: EditorView,
  source: HiddenRunSource,
): void {
  sources.get(view)?.delete(source);
}

export interface HiddenRun {
  readonly from: number;
  readonly to: number;
}

export function walk_back_through_runs(
  runs: readonly HiddenRun[],
  pos: number,
): number {
  const sorted = [...runs].sort((a, b) => b.to - a.to);
  let p = pos;
  for (const run of sorted) {
    if (run.to >= p && run.from < p) p = run.from;
  }
  return p;
}

// Largest position <= pos with a visible glyph directly before it: walks left
// from `pos` through the contiguous hidden-marker runs on its line. Returns
// `pos` unchanged when the preceding glyph is already visible.
export function visible_end_before(view: EditorView, pos: number): number {
  const set = sources.get(view);
  if (!set) return pos;
  const line_from = view.state.doc.lineAt(pos).from;
  const runs: HiddenRun[] = [];
  for (const source of set) {
    source.decorations.between(line_from, pos, (from, to, deco) => {
      if ((deco.spec as { class?: string }).class === HIDDEN_MARKER_CLASS) {
        runs.push({ from, to });
      }
    });
  }
  return Math.max(line_from, walk_back_through_runs(runs, pos));
}
