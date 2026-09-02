import { EditorView } from '@codemirror/view';
import { position_to_offset } from './position.js';

// OUT-I-2 — drive the main view to a heading the outline asked for: clamp the
// host-supplied position into the document, move the caret there, scroll that
// position to the top of the viewport, and focus so the caret renders.
export function scroll_caret_to(view: EditorView, line: number, character: number): void {
  const pos = position_to_offset(view.state.doc, line, character);
  view.dispatch({
    selection: { anchor: pos, head: pos },
    effects: EditorView.scrollIntoView(pos, { y: 'start' }),
  });
  view.focus();
}
