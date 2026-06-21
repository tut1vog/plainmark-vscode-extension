import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { request_cell_focus } from './table.js';
import { type TableModel, serialize_table } from './table_serialize.js';

export function make_starter_table_markdown(): string {
  const model: TableModel = {
    rows: [
      ['', '', ''],
      ['', '', ''],
      ['', '', ''],
    ],
    alignment: [null, null, null],
    header_row_count: 1,
  };
  return serialize_table(model);
}

export function table_completions(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const before = line.text.slice(0, context.pos - line.from);
  if (before !== '|') return null;
  if (line.text.trim() !== '|') return null;
  return {
    from: line.from,
    to: line.to,
    filter: false,
    options: [
      {
        label: 'Insert table (3×3)',
        apply: (view: EditorView, _completion, from: number, to: number) => {
          const table = make_starter_table_markdown();
          const doc_len = view.state.doc.length;
          // TA2 — inject one trailing `\n` only when there's no `\n` immediately
          // after the insertion point (mirrors table.ts handle_cell_edit).
          const next_byte = to < doc_len ? view.state.doc.sliceString(to, to + 1) : '';
          const ta2_needed = next_byte !== '\n';
          // Symmetric leading-\n when the new table would sit at offset 0 — gives ArrowUp / click-above a caret-targetable source line.
          const lead_needed = from === 0;
          const insert = (lead_needed ? '\n' : '') + table + (ta2_needed ? '\n' : '');
          const table_from = from + (lead_needed ? 1 : 0);
          view.dispatch({
            changes: { from, to, insert },
            selection: { anchor: table_from + 2 },
            annotations: [Transaction.userEvent.of('input')],
          });
          request_cell_focus(view, table_from, 0, 0);
        },
      },
    ],
  };
}
