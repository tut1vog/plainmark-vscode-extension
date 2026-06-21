import type { Text } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

// {line, character} on the wire: the webview doc is LF-normalized while the host may be CRLF.
export function position_to_offset(doc: Text, line: number, character: number): number {
  const doc_line = doc.line(Math.max(0, Math.min(line, doc.lines - 1)) + 1);
  return doc_line.from + Math.max(0, Math.min(character, doc_line.length));
}

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
