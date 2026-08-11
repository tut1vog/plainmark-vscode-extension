import { Transaction, type EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { native_to_lf } from '../sync/translate.js';
import { quote_prefixed_paste_text } from './paste_quote.js';
import {
  insert_pasted_table,
  paste_table_conversion_enabled,
  table_markdown_from_tsv,
} from './paste_table.js';
import type { PostMessage } from './sync.js';
import { create_logger } from '../log.js';

const log = create_logger('widget');

// Menu "Paste" cannot read the clipboard in the webview (no user-gesture paste
// event, open permission bugs) — it round-trips through the host instead. The
// menu extension has no post_message handle, so it raises this event and
// index.ts forwards it to the controller (same pattern as image paste).
export const PASTE_REQUEST_EVENT = 'plainmark-paste-request';

export function request_clipboard_paste(): void {
  document.dispatchEvent(new CustomEvent(PASTE_REQUEST_EVENT));
}

function selection_text(state: EditorState): string {
  return state.selection.ranges
    .filter((r) => !r.empty)
    .map((r) => state.sliceDoc(r.from, r.to))
    .join(state.lineBreak);
}

export async function copy_selection(view: EditorView): Promise<boolean> {
  const text = selection_text(view.state);
  if (text.length === 0) return false;
  if (typeof navigator === 'undefined' || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    log.warn('clipboard write failed', { detail: String(err) });
    return false;
  }
}

export async function cut_selection(view: EditorView): Promise<boolean> {
  const pre_state = view.state;
  const written = await copy_selection(view);
  // Never delete what didn't reach the clipboard.
  if (!written) return false;
  // A dispatch during the async write (e.g. a host sync) remaps the selection — deleting then destroys uncopied text.
  if (view.state !== pre_state) return false;
  view.dispatch({
    changes: pre_state.selection.ranges
      .filter((r) => !r.empty)
      .map((r) => ({ from: r.from, to: r.to })),
    annotations: [Transaction.userEvent.of('delete.cut')],
    scrollIntoView: true,
  });
  return true;
}

export interface ClipboardPasteController {
  request(): void;
  deliver(text: string): void;
}

export function create_clipboard_paste_controller(
  view: EditorView,
  post_message: PostMessage,
): ClipboardPasteController {
  let pending = false;
  return {
    request() {
      pending = true;
      post_message({ type: 'read_clipboard' });
    },
    deliver(text) {
      if (!pending) return;
      pending = false;
      if (text.length === 0) return;
      // The CM6 doc is always the LF-normalized form; host clipboard text may carry CRLF.
      const lf_text = native_to_lf(text);
      // The host round-trip carries only text/plain, so only the TSV branch of
      // the paste-table conversion applies here (TBL-I-35 / CTX-I-3).
      if (paste_table_conversion_enabled()) {
        const table_markdown = table_markdown_from_tsv(lf_text);
        if (table_markdown !== null) {
          insert_pasted_table(view, table_markdown);
          view.focus();
          return;
        }
      }
      // Menu paste shares the quote-aware re-prefix with the DOM paste path (BQ-I-13).
      const insert = quote_prefixed_paste_text(view.state, lf_text) ?? lf_text;
      view.dispatch({
        ...view.state.replaceSelection(insert),
        annotations: [Transaction.userEvent.of('input.paste')],
        scrollIntoView: true,
      });
      view.focus();
    },
  };
}
