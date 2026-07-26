import { ensureSyntaxTree } from '@codemirror/language';
import {
  Transaction,
  type ChangeSpec,
  type EditorState,
  type TransactionSpec,
} from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

// A partial tree could truncate an item's span and dedent only part of it.
const PARSE_BUDGET_MS = 1000;

export function normalize_list_indent_spec(state: EditorState): TransactionSpec | null {
  const tree = ensureSyntaxTree(state, state.doc.length, PARSE_BUDGET_MS);
  if (!tree) return null;
  const doc = state.doc;
  const changes: ChangeSpec[] = [];
  for (let list = tree.topNode.firstChild; list; list = list.nextSibling) {
    if (list.name !== 'BulletList' && list.name !== 'OrderedList') continue;
    for (let item = list.firstChild; item; item = item.nextSibling) {
      if (item.name !== 'ListItem') continue;
      const mark = item.getChild('ListMark');
      if (!mark) continue;
      const first_line = doc.lineAt(mark.from);
      const indent = mark.from - first_line.from;
      // 0 is already normal; a top-level marker sits at most 3 columns in.
      if (indent < 1 || indent > 3) continue;
      if (!/^ +$/.test(first_line.text.slice(0, indent))) continue;
      let last_line = doc.lineAt(item.to);
      if (last_line.from === item.to && last_line.number > first_line.number) {
        last_line = doc.line(last_line.number - 1);
      }
      const item_changes: ChangeSpec[] = [];
      let tab_indented = false;
      for (let n = first_line.number; n <= last_line.number; n++) {
        const line = doc.line(n);
        const leading = /^[ \t]*/.exec(line.text)?.[0] ?? '';
        if (leading.includes('\t')) {
          tab_indented = true;
          break;
        }
        const remove = Math.min(indent, leading.length);
        if (remove > 0) item_changes.push({ from: line.from, to: line.from + remove });
      }
      // A tab's width depends on its start column, so a uniform space strip
      // could re-parse the item's interior — leave tab-indented items alone.
      if (tab_indented) continue;
      changes.push(...item_changes);
    }
  }
  if (changes.length === 0) return null;
  return { changes, annotations: Transaction.userEvent.of('delete.dedent') };
}

export function normalize_list_indent(view: EditorView): boolean {
  const spec = normalize_list_indent_spec(view.state);
  if (!spec) return false;
  view.dispatch(spec);
  return true;
}
