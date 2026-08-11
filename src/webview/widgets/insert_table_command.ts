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
  const caret = view.state.selection.main.head;
  const line = view.state.doc.lineAt(caret);
  const at_line_start = caret === line.from;
  // caret === 0 always needs a leading \n — the table would otherwise sit at offset 0 with no caret-targetable line above it.
  const prefix = caret === 0 ? '\n' : at_line_start ? '' : '\n';
  const table = make_starter_table_markdown();
  const insert = prefix + table + table_insert_suffix(view.state.doc, caret);
  const table_from = caret + prefix.length;
  view.dispatch({
    changes: { from: caret, insert },
    selection: { anchor: table_from + 2 },
    annotations: [Transaction.userEvent.of('input')],
  });
  request_cell_focus(view, table_from, 0, 0);
}
