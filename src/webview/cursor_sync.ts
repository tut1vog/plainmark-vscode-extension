import { EditorView, type ViewUpdate } from '@codemirror/view';
import type { EditorState } from '@codemirror/state';
import type { PostMessage } from './sync.js';

// Broadcast the main-view caret as (line, character) so the host can
// seed VS Code's text editor with the same position on a Plainmark → text
// editor toggle. Cell subviews are intentionally not wired (per design
// checkpoint: table-cell cursor precision is deferred); when the caret sits
// inside a table widget the main-view selection points at the widget's source
// range, which is a coarse but sensible fallback.
export function cursor_position_from_state(state: EditorState): {
  line: number;
  character: number;
} {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  return { line: line.number - 1, character: head - line.from };
}

export function create_cursor_sync_listener(
  post_message: PostMessage,
): (update: ViewUpdate) => void {
  let last_line = -1;
  let last_character = -1;
  return (update) => {
    if (!update.selectionSet && !update.docChanged) return;
    const pos = cursor_position_from_state(update.state);
    if (pos.line === last_line && pos.character === last_character) return;
    last_line = pos.line;
    last_character = pos.character;
    post_message({ type: 'cursor_changed', line: pos.line, character: pos.character });
  };
}

export const cursor_sync_extension = (post_message: PostMessage) =>
  EditorView.updateListener.of(create_cursor_sync_listener(post_message));
