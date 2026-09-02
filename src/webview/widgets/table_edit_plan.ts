import type { EditorState } from '@codemirror/state';
import { type TableInfo, build_model_from_extraction, locate_table_extraction } from './table.js';
import { type TableModel, serialize_table } from './table_serialize.js';

export type TableEditPlan =
  | { kind: 'missing' }
  | { kind: 'unchanged'; info: TableInfo }
  | { kind: 'replace'; info: TableInfo; from: number; to: number; insert: string; model: TableModel };

// The one whole-table replace every table mutation writes (TBL-SP-1, TBL-SP-2):
// [info.from, info.to] becomes the serialized model, plus the TA2 trailing `\n`
// when the byte after the table is not already one (TBL-SP-7). Pure, so the
// source-preservation suite exercises the exact bytes the editor dispatches.
export function plan_table_edit(
  state: EditorState,
  table_from: number,
  mutator: (model: TableModel) => TableModel,
): TableEditPlan {
  const extraction = locate_table_extraction(state, table_from);
  if (!extraction) return { kind: 'missing' };
  const model = build_model_from_extraction(extraction, state.doc);
  const next = mutator(model);
  if (next === model) return { kind: 'unchanged', info: extraction.info };
  const serialized = serialize_table(next);
  const { from, to } = extraction.info;
  const doc_len = state.doc.length;
  const next_byte = to < doc_len ? state.doc.sliceString(to, to + 1) : '';
  return {
    kind: 'replace',
    info: extraction.info,
    from,
    to,
    insert: next_byte !== '\n' ? serialized + '\n' : serialized,
    model: next,
  };
}
