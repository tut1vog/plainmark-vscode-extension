import {
  type EditorState,
  type Extension,
  Transaction,
  type TransactionSpec,
} from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown_from_html } from './html_to_markdown.js';
import { quote_prefixed_paste_text } from './paste_quote.js';
import { table_insert_suffix } from './widgets/table_serialize.js';

declare global {
  interface Window {
    __plainmark_paste_rich_text?: boolean;
  }
}

// The host injects the resolved `plainmark.paste.convertRichText` value at
// boot; absent means enabled (the headless harness has no host).
function paste_rich_text_enabled(): boolean {
  return typeof window === 'undefined' || window.__plainmark_paste_rich_text !== false;
}

const BLOCK_START_RE = /^(?:#{1,6} |- |\d+\. |> |---$|```|\|)/;

// A lone paragraph pastes inline like plain text; anything that would only
// parse at a line start takes its own lines.
function is_inline_result(markdown: string): boolean {
  return !markdown.includes('\n') && !BLOCK_START_RE.test(markdown);
}

export function pasted_markdown_transaction(state: EditorState, markdown: string): TransactionSpec {
  const annotations = [Transaction.userEvent.of('input.paste')];
  if (is_inline_result(markdown)) {
    return { ...state.replaceSelection(markdown), annotations, scrollIntoView: true };
  }
  const { from, to } = state.selection.main;
  const prefix = from === state.doc.lineAt(from).from ? '' : '\n';
  const body = prefix + markdown;
  const own_lines = body + table_insert_suffix(state.doc, to);
  const quoted = quote_prefixed_paste_text(state, own_lines);
  const insert = quoted ?? own_lines;
  // Start of the line after the pasted blocks, never a table's end offset (TBL-I-21).
  const anchor = quoted === null ? from + body.length + 1 : from + insert.length;
  return {
    changes: { from, to, insert },
    selection: { anchor },
    annotations,
    scrollIntoView: true,
  };
}

// Runs after table_paste_extension (a lone table converts there, TBL-I-35);
// any other HTML with formatting converts here, the rest falls through to the
// quote re-prefix and CM6's default paste. Main view only (TBL-I-19).
export const rich_text_paste_extension: Extension = EditorView.domEventHandlers({
  paste(event, view) {
    if (!paste_rich_text_enabled()) return false;
    const html = event.clipboardData?.getData('text/html') ?? '';
    if (html.length === 0) return false;
    const markdown = markdown_from_html(html);
    if (markdown === null) return false;
    event.preventDefault();
    view.dispatch(pasted_markdown_transaction(view.state, markdown));
    return true;
  },
});
