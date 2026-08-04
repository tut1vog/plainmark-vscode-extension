import { syntaxTree } from '@codemirror/language';
import { Transaction, type EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { native_to_lf } from '../sync/translate.js';

// Markers only, plus the single trailing space when present. Matched against
// the pre-caret slice (not the whole line) so a paste between nested markers
// continues at the depth the caret actually sits at.
const QUOTE_PREFIX_RE = /^[ \t]*>(?:[ \t]*>)*[ \t]?/;

// Quote-aware paste (BQ-I-13): with the selection start on a Blockquote line
// (callouts included), each pasted line after the first gains the caret line's
// pre-caret quote-marker run, so the paste stays one quote instead of the
// marker-less lines exiting it (BQ-E-1). Returns null — caller falls through
// to the default paste — for single-line text, multi-range selections, a
// selection start at or before the line's first `>`, and `>`-led lines outside
// a Blockquote node (a quote-looking line in a code fence).
export function quote_prefixed_paste_text(state: EditorState, text: string): string | null {
  if (!text.includes('\n')) return null;
  if (state.selection.ranges.length !== 1) return null;
  const { from } = state.selection.main;
  const line = state.doc.lineAt(from);
  const prefix = QUOTE_PREFIX_RE.exec(line.text.slice(0, from - line.from))?.[0];
  if (prefix === undefined) return null;
  const cursor = syntaxTree(state).cursorAt(line.from, 1);
  let in_blockquote = false;
  do {
    if (cursor.name === 'Blockquote') {
      in_blockquote = true;
      break;
    }
  } while (cursor.parent());
  if (!in_blockquote) return null;
  return text.split('\n').join('\n' + prefix);
}

// Runs after image_paste_extension (IMG-I-6) and table_paste_extension
// (TBL-I-35); a non-qualifying paste falls through to CM6's default. Main view
// only — table cells hold no blockquotes (TBL-I-19 keeps cell pastes literal).
export const quote_paste_extension: Extension = EditorView.domEventHandlers({
  paste(event, view) {
    const data = event.clipboardData;
    if (!data) return false;
    const text = data.getData('text/plain');
    if (text.length === 0) return false;
    const prefixed = quote_prefixed_paste_text(view.state, native_to_lf(text));
    if (prefixed === null) return false;
    event.preventDefault();
    view.dispatch({
      ...view.state.replaceSelection(prefixed),
      annotations: [Transaction.userEvent.of('input.paste')],
      scrollIntoView: true,
    });
    return true;
  },
});
