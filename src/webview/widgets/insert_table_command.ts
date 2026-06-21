import { Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { request_cell_focus } from './table.js';
import { make_starter_table_markdown } from './table_autocomplete.js';
import { create_logger } from '../../log.js';

const log = create_logger('widget');

export function insert_table_at_caret(view: EditorView): void {
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  if (active && active.closest && active.closest('.plainmark-table-block')) {
    log.warn('insertTable ignored: focus is inside a table cell');
    return;
  }
  const caret = view.state.selection.main.head;
  const line = view.state.doc.lineAt(caret);
  const at_line_start = caret === line.from;
  const doc_len = view.state.doc.length;
  const next_char = caret < doc_len ? view.state.doc.sliceString(caret, caret + 1) : '';
  // caret === 0 always needs a leading \n — the table would otherwise sit at offset 0 with no caret-targetable line above it.
  const prefix = caret === 0 ? '\n' : at_line_start ? '' : '\n';
  const table = make_starter_table_markdown();
  // End-of-doc gets one trailing \n (TA2) so the table isn't the last byte — gives ArrowDown / click-below a caret-targetable line.
  const suffix = next_char === '' ? '\n' : next_char === '\n' ? '' : '\n';
  const insert = prefix + table + suffix;
  const table_from = caret + prefix.length;
  view.dispatch({
    changes: { from: caret, insert },
    selection: { anchor: table_from + 2 },
    annotations: [Transaction.userEvent.of('input')],
  });
  request_cell_focus(view, table_from, 0, 0);
}
