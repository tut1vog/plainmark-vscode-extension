import {
  type CharCategory,
  EditorSelection,
  type EditorState,
  findClusterBreak,
  type SelectionRange,
} from '@codemirror/state';
import { Direction, EditorView, type KeyBinding } from '@codemirror/view';

const segmenter =
  typeof Intl !== 'undefined' && Intl.Segmenter
    ? new Intl.Segmenter(undefined, { granularity: 'word' })
    : null;

// Upstream applies this Intl.Segmenter refinement to subword motion only
// (@codemirror/commands 6.2.5); group motion (Ctrl/Alt+Arrow) and group
// deletion (Ctrl/Alt+Backspace/Delete) never got it.
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

// Mirrors the group walk of deleteByGroup (@codemirror/commands 6.10.3),
// including its single-space and line-edge rules, then refines the span like
// motion does. Exported for unit tests.
export function delete_group_head(state: EditorState, head: number, forward: boolean): number {
  const line = state.doc.lineAt(head);
  const categorize = state.charCategorizer(head);
  let pos = head;
  for (let cat: CharCategory | null = null; ; ) {
    if (pos === (forward ? line.to : line.from)) {
      if (pos === head && line.number !== (forward ? state.doc.lines : 1)) pos += forward ? 1 : -1;
      break;
    }
    const next = findClusterBreak(line.text, pos - line.from, forward) + line.from;
    const next_char = line.text.slice(Math.min(pos, next) - line.from, Math.max(pos, next) - line.from);
    const next_cat = categorize(next_char);
    if (cat !== null && next_cat !== cat) break;
    if (next_char !== ' ' || pos !== head) cat = next_cat;
    pos = next;
  }
  const from = Math.min(head, pos);
  const to = Math.max(head, pos);
  const refined = refine_cjk_group_head(state.sliceDoc(from, to), from, forward);
  return refined ?? pos;
}

function skip_atomic(view: EditorView, pos: number, forward: boolean): number {
  for (const ranges of view.state.facet(EditorView.atomicRanges).map((f) => f(view))) {
    ranges.between(pos, pos, (range_from, range_to) => {
      if (range_from < pos && range_to > pos) pos = forward ? range_to : range_from;
    });
  }
  return pos;
}

// Mirrors deleteBy (@codemirror/commands 6.10.3) with the refined group head.
function delete_by_group_cjk(view: EditorView, forward: boolean): boolean {
  if (view.state.readOnly) return false;
  const { state } = view;
  let event = 'delete.selection';
  const changes = state.changeByRange((range) => {
    let { from, to } = range;
    if (from === to) {
      let towards = delete_group_head(state, range.head, forward);
      if (towards < from) {
        event = 'delete.backward';
        towards = skip_atomic(view, towards, false);
      } else if (towards > from) {
        event = 'delete.forward';
        towards = skip_atomic(view, towards, true);
      }
      from = Math.min(from, towards);
      to = Math.max(to, towards);
    } else {
      from = skip_atomic(view, from, false);
      to = skip_atomic(view, to, true);
    }
    return from === to
      ? { range }
      : { changes: { from, to }, range: EditorSelection.cursor(from, from < range.head ? -1 : 1) };
  });
  if (changes.changes.empty) return false;
  view.dispatch(
    state.update(changes, {
      scrollIntoView: true,
      userEvent: event,
      effects:
        event === 'delete.selection'
          ? EditorView.announce.of(state.phrase('Selection deleted'))
          : undefined,
    }),
  );
  return true;
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
  {
    key: 'Mod-Backspace',
    mac: 'Alt-Backspace',
    run: (view) => delete_by_group_cjk(view, false),
    preventDefault: true,
  },
  {
    key: 'Mod-Delete',
    mac: 'Alt-Delete',
    run: (view) => delete_by_group_cjk(view, true),
    preventDefault: true,
  },
];
