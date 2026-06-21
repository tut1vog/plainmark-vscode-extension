import { syntaxTree } from '@codemirror/language';
import { EditorSelection, Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { FOOTNOTE_HEAD_SLICE, parse_footnote_label } from './footnote_parser.js';

function collect_used_numeric_labels(view: EditorView): Set<number> {
  const used = new Set<number>();
  const state = view.state;
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'FootnoteReference' && node.name !== 'FootnoteDefinition') return;
      const head = state.doc.sliceString(
        node.from,
        Math.min(node.to, node.from + FOOTNOTE_HEAD_SLICE),
      );
      const label = parse_footnote_label(head);
      if (!label) return;
      const n = Number(label);
      if (Number.isInteger(n) && n > 0 && String(n) === label) used.add(n);
    },
  });
  return used;
}

function find_definition_insert_pos(view: EditorView): number {
  const state = view.state;
  let last_def_to = -1;
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === 'FootnoteDefinition') {
        if (node.to > last_def_to) last_def_to = node.to;
      }
    },
  });
  if (last_def_to >= 0) return last_def_to;
  return state.doc.length;
}

export function insert_footnote(view: EditorView): boolean {
  const state = view.state;
  const pos = state.selection.main.head;
  const used = collect_used_numeric_labels(view);
  let n = 1;
  while (used.has(n)) n++;
  const label = String(n);
  const def_pos_before_insert = find_definition_insert_pos(view);
  const ref_text = `[^${label}]`;
  const def_text = `\n\n[^${label}]: `;

  // Build the two changes; their relative order in `changes` doesn't matter
  // — CM6 sorts by `from`. Both apply in a single transaction → one undo.
  const changes = [
    { from: pos, insert: ref_text },
    { from: def_pos_before_insert, insert: def_text },
  ];

  // Compute the post-transaction caret position. It lands at the end of the
  // freshly inserted definition stub so the user can type the body.
  const ref_first = pos <= def_pos_before_insert;
  const final_def_start =
    def_pos_before_insert + (ref_first ? ref_text.length : 0);
  const cursor = final_def_start + def_text.length;

  view.dispatch({
    changes,
    selection: EditorSelection.cursor(cursor),
    annotations: [Transaction.userEvent.of('input')],
  });
  return true;
}
