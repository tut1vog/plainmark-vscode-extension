import { EditorSelection, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

// Open delimiter → matching close delimiter. The emphasis-family chars are
// symmetric (open == close); brackets close with their mirror.
const WRAP_PAIRS: ReadonlyMap<string, string> = new Map([
  ['*', '*'],
  ['`', '`'],
  ['~', '~'],
  ['$', '$'],
  ['[', ']'],
  ['(', ')'],
  ['{', '}'],
]);

// Typing a wrap open-delimiter over a non-empty selection surrounds it with the
// delimiter pair instead of replacing it. The wrapped text stays selected so a
// repeated press nests (`*` → `*x*` → `**x**`; `[` → `[x]` → `[[x]]`). Empty
// ranges fall through to a plain insert.
export function wrap_selection_input(
  view: EditorView,
  _from: number,
  _to: number,
  text: string,
): boolean {
  const close = WRAP_PAIRS.get(text);
  if (close === undefined) return false;
  const { state } = view;
  if (state.selection.ranges.every((r) => r.empty)) return false;
  const spec = state.changeByRange((range) => {
    if (range.empty) {
      return {
        changes: { from: range.from, insert: text },
        range: EditorSelection.cursor(range.from + text.length),
      };
    }
    return {
      changes: [
        { from: range.from, insert: text },
        { from: range.to, insert: close },
      ],
      range: EditorSelection.range(
        range.from + text.length,
        range.to + text.length,
      ),
    };
  });
  view.dispatch({ ...spec, userEvent: 'input.type', scrollIntoView: true });
  return true;
}

export const selection_wrap_extension: Extension =
  EditorView.inputHandler.of(wrap_selection_input);
