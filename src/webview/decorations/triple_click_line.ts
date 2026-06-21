import { EditorSelection } from '@codemirror/state';
import { EditorView, type MouseSelectionStyle } from '@codemirror/view';

// CM6's default triple-click selects the line PLUS its trailing newline
// (rangeForClick does `to++` when the line isn't last), landing the caret at the
// start of the NEXT line. Obsidian and most prose editors keep the caret at the
// clicked line's end. Override via the public mouseSelectionStyle facet (the
// supported escape hatch, per Marijn at discuss.codemirror.net/t/triple-click-
// behavior/4051): end the range at line.to so caret and clipboard both stop at
// the line's end, excluding the newline. Returns null for single/double clicks
// so CM6's defaults still own those gestures.
export const triple_click_select_line = EditorView.mouseSelectionStyle.of(
  (view, event): MouseSelectionStyle | null => {
    if (event.detail !== 3 || event.button !== 0) return null;
    let start = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (start === null) return null;
    let start_sel = view.state.selection;
    return {
      get(cur_event, extend, multiple) {
        const head = view.posAtCoords({ x: cur_event.clientX, y: cur_event.clientY });
        if (head === null) return start_sel;
        const anchor = extend ? start_sel.main.anchor : (start as number);
        const anchor_line = view.state.doc.lineAt(anchor);
        const head_line = view.state.doc.lineAt(head);
        const range =
          head >= anchor
            ? EditorSelection.range(anchor_line.from, head_line.to)
            : EditorSelection.range(anchor_line.to, head_line.from);
        return multiple ? start_sel.addRange(range) : EditorSelection.create([range]);
      },
      update(update) {
        start = update.changes.mapPos(start as number);
        start_sel = start_sel.map(update.changes);
      },
    };
  },
);
