import { EditorSelection, type SelectionRange } from '@codemirror/state';
import { Direction, EditorView, type KeyBinding } from '@codemirror/view';

const segmenter =
  typeof Intl !== 'undefined' && Intl.Segmenter
    ? new Intl.Segmenter(undefined, { granularity: 'word' })
    : null;

// Upstream applies this Intl.Segmenter refinement to subword motion only
// (@codemirror/commands 6.2.5); group motion (Ctrl/Alt+Arrow) never got it.
export function refine_cjk_group_head(
  skipped: string,
  from: number,
  forward: boolean,
): number | null {
  if (!segmenter || skipped.length < 2) return null;
  if (!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(skipped)) return null;
  const segments = Array.from(segmenter.segment(skipped));
  if (segments.length < 2) return null;
  const boundary = forward ? segments[1] : segments[segments.length - 1];
  return from + boundary.index;
}

function move_by_group_cjk(
  view: EditorView,
  range: SelectionRange,
  forward: boolean,
): SelectionRange {
  const end = view.moveByGroup(range, forward);
  const doc = view.state.doc;
  if (doc.lineAt(range.head).number !== doc.lineAt(end.head).number) return end;
  const from = Math.min(range.head, end.head);
  const to = Math.max(range.head, end.head);
  const refined = refine_cjk_group_head(view.state.sliceDoc(from, to), from, forward);
  if (refined === null || refined === end.head) return end;
  return EditorSelection.cursor(refined, forward ? -1 : 1);
}

function range_end(range: SelectionRange, forward: boolean): SelectionRange {
  return EditorSelection.cursor(forward ? range.to : range.from);
}

function apply_selection(view: EditorView, selection: EditorSelection): boolean {
  if (selection.eq(view.state.selection, true)) return false;
  view.dispatch({ selection, scrollIntoView: true, userEvent: 'select' });
  return true;
}

function cursor_by_group(view: EditorView, forward: boolean): boolean {
  return apply_selection(
    view,
    EditorSelection.create(
      view.state.selection.ranges.map((range) =>
        range.empty ? move_by_group_cjk(view, range, forward) : range_end(range, forward),
      ),
      view.state.selection.mainIndex,
    ),
  );
}

function select_by_group(view: EditorView, forward: boolean): boolean {
  return apply_selection(
    view,
    EditorSelection.create(
      view.state.selection.ranges.map((range) => {
        const head = move_by_group_cjk(view, range, forward);
        return EditorSelection.range(range.anchor, head.head, head.goalColumn);
      }),
      view.state.selection.mainIndex,
    ),
  );
}

function ltr_at_cursor(view: EditorView): boolean {
  return view.textDirectionAt(view.state.selection.main.head) === Direction.LTR;
}

export const cjk_word_motion_keymap: KeyBinding[] = [
  {
    key: 'Mod-ArrowLeft',
    mac: 'Alt-ArrowLeft',
    run: (view) => cursor_by_group(view, !ltr_at_cursor(view)),
    shift: (view) => select_by_group(view, !ltr_at_cursor(view)),
    preventDefault: true,
  },
  {
    key: 'Mod-ArrowRight',
    mac: 'Alt-ArrowRight',
    run: (view) => cursor_by_group(view, ltr_at_cursor(view)),
    shift: (view) => select_by_group(view, ltr_at_cursor(view)),
    preventDefault: true,
  },
];
