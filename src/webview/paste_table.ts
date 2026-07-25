import { type Extension, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { serialize_table } from './widgets/table_serialize.js';

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
    header_row_count: 1,
  });
}

const INLINE_MARKERS: Record<string, string> = {
  strong: '**',
  b: '**',
  em: '*',
  i: '*',
  del: '~~',
  s: '~~',
  strike: '~~',
  code: '`',
};

function wrap_inline(content: string, marker: string): string {
  // Markers never land against whitespace (CTX-I-6 parity) — shift it outside.
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(content) as RegExpExecArray;
  if (match[2].length === 0) return content;
  return match[1] + marker + match[2] + marker + match[3];
}

function inline_markdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.nodeValue ?? '').replace(/\s+/g, ' ');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (tag === 'br') return '\n';
  const content = Array.from(el.childNodes).map(inline_markdown).join('');
  const marker = INLINE_MARKERS[tag];
  if (marker !== undefined) return wrap_inline(content, marker);
  if (tag === 'a') {
    const href = el.getAttribute('href');
    const label = content.trim();
    if (href && label.length > 0) return `[${label}](${href})`;
  }
  // Block children inside a cell stack as soft breaks (`<br>` on serialize).
  if (tag === 'p' || tag === 'div') return content + '\n';
  return content;
}

function cell_markdown(cell: Element): string {
  return inline_markdown(cell).trim();
}

// HTML gate (TBL-I-36): the payload must be essentially one <table> — no
// non-whitespace text outside it, no row/col spans, at least two cells.
export function table_markdown_from_html(html: string): string | null {
  if (typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tables = doc.querySelectorAll('table');
  if (tables.length !== 1) return null;
  const table = tables[0];
  const outside = (doc.body.textContent ?? '').replace(/\s+/g, '');
  const inside = (table.textContent ?? '').replace(/\s+/g, '');
  if (outside !== inside) return null;
  const rows: string[][] = [];
  for (const tr of Array.from(table.querySelectorAll('tr'))) {
    const cells = Array.from(tr.querySelectorAll('td, th'));
    if (cells.length === 0) continue;
    for (const cell of cells) {
      const colspan = cell.getAttribute('colspan') ?? '1';
      const rowspan = cell.getAttribute('rowspan') ?? '1';
      if (colspan !== '1' || rowspan !== '1') return null;
    }
    rows.push(cells.map(cell_markdown));
  }
  if (rows.length === 0) return null;
  if (rows.length < 2 && rows[0].length < 2) return null;
  return serialize_table({
    rows,
    alignment: rows[0].map(() => null),
    header_row_count: 1,
  });
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
  const doc_len = view.state.doc.length;
  const next_char = to < doc_len ? view.state.doc.sliceString(to, to + 1) : '';
  const suffix = next_char === '\n' ? '' : '\n';
  const insert = prefix + table_markdown + suffix;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length + (suffix === '' ? 1 : 0) },
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
