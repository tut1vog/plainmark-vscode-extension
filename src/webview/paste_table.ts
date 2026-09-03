import { type Extension, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { parse_clipboard_html, table_markdown_from_element } from './html_to_markdown.js';
import { serialize_table, table_insert_suffix } from './widgets/table_serialize.js';

declare global {
  interface Window {
    __plainmark_paste_table_conversion?: boolean;
  }
}

// The host injects the resolved `plainmark.paste.convertTables` value at boot
// (TBL-I-37); absent means enabled (the headless harness has no host).
export function paste_table_conversion_enabled(): boolean {
  return typeof window === 'undefined' || window.__plainmark_paste_table_conversion !== false;
}

// Strict TSV gate (TBL-I-36): ≥2 lines, a tab on every line, equal column
// counts, and a non-empty first column — tab-indented prose/code stays plain.
export function table_markdown_from_tsv(text: string): string | null {
  const lf = text.replace(/\r\n?/g, '\n');
  const body = lf.endsWith('\n') ? lf.slice(0, -1) : lf;
  const lines = body.split('\n');
  if (lines.length < 2) return null;
  if (lines.some((line) => !line.includes('\t'))) return null;
  const rows = lines.map((line) => line.split('\t').map((cell) => cell.trim()));
  if (rows.some((row) => row.length !== rows[0].length)) return null;
  if (rows.every((row) => row[0].length === 0)) return null;
  return serialize_table({
    rows,
    alignment: rows[0].map(() => null),
  });
}

// HTML gate (TBL-I-36): the payload must be essentially one <table> — no
// non-whitespace text outside it; spans, ragged rows, and a lone cell decline
// in the element converter.
export function table_markdown_from_html(html: string): string | null {
  const doc = parse_clipboard_html(html);
  if (doc === null) return null;
  const tables = doc.querySelectorAll('table');
  if (tables.length !== 1) return null;
  const table = tables[0];
  const outside = (doc.body.textContent ?? '').replace(/\s+/g, '');
  const inside = (table.textContent ?? '').replace(/\s+/g, '');
  if (outside !== inside) return null;
  return table_markdown_from_element(table);
}

export interface PasteClipboardPayload {
  html: string;
  text: string;
}

// HTML first — spreadsheets/webpages put HTML + TSV on the clipboard together
// and the HTML flavor keeps inline formatting; a declined payload falls through
// to the stricter TSV gate, then to the plain-text paste.
export function convert_pasted_table(payload: PasteClipboardPayload): string | null {
  if (payload.html.length > 0) {
    const from_html = table_markdown_from_html(payload.html);
    if (from_html !== null) return from_html;
  }
  if (payload.text.length > 0) return table_markdown_from_tsv(payload.text);
  return null;
}

// Own-line placement mirrors insert_table_at_caret (TA2 + leading-\n rules);
// the caret lands at the start of the line after the table, never at the
// table's end offset where the widget-corner caret renders (TBL-I-21).
export function insert_pasted_table(view: EditorView, table_markdown: string): void {
  const { from, to } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const prefix = from === 0 ? '\n' : from === line.from ? '' : '\n';
  const suffix = table_insert_suffix(view.state.doc, to);
  const insert = prefix + table_markdown + suffix;
  view.dispatch({
    changes: { from, to, insert },
    // Start of the line directly after the table: past the first trailing newline, inserted or pre-existing.
    selection: { anchor: from + prefix.length + table_markdown.length + 1 },
    annotations: [Transaction.userEvent.of('input.paste')],
    scrollIntoView: true,
  });
}

// Runs after image_paste_extension (image blobs win, IMG-I-6); a qualifying
// table payload converts (TBL-I-35), anything else falls through to CM6's
// default paste. Main view only — a cell-subview paste stays literal (TBL-I-19).
export const table_paste_extension: Extension = EditorView.domEventHandlers({
  paste(event, view) {
    if (!paste_table_conversion_enabled()) return false;
    const data = event.clipboardData;
    if (!data) return false;
    const markdown = convert_pasted_table({
      html: data.getData('text/html'),
      text: data.getData('text/plain'),
    });
    if (markdown === null) return false;
    event.preventDefault();
    insert_pasted_table(view, markdown);
    return true;
  },
});
