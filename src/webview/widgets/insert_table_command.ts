import { Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { request_cell_focus } from './table.js';
import { make_starter_table_markdown } from './table_autocomplete.js';
import { table_insert_suffix } from './table_serialize.js';
import { create_logger } from '../../log.js';

const log = create_logger('widget');

export function insert_table_at_caret(view: EditorView): void {
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  if (active && active.closest && active.closest('.plainmark-table-block')) {
    log.warn('insertTable ignored: focus is inside a table cell');
    return;
  }
  // A non-empty selection is replaced, as with a pasted table (TBL-I-35).
  const { from, to } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const at_line_start = from === line.from;
  // from === 0 always needs a leading \n — the table would otherwise sit at offset 0 with no caret-targetable line above it.
  const prefix = from === 0 ? '\n' : at_line_start ? '' : '\n';
  const table = make_starter_table_markdown();
  const insert = prefix + table + table_insert_suffix(view.state.doc, to);
  const table_from = from + prefix.length;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: table_from + 2 },
    annotations: [Transaction.userEvent.of('input')],
  });
  request_cell_focus(view, table_from, 0, 0);
}
