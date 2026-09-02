import type { EditorState } from '@codemirror/state';

// Line span the main selection covers; a selection ending exactly at a line
// start excludes that line (mirrors CM6).
export function selected_lines(state: EditorState): { first: number; last: number } {
  const { main } = state.selection;
  const first = state.doc.lineAt(main.from).number;
  let last = state.doc.lineAt(main.to).number;
  if (!main.empty && main.to === state.doc.line(last).from && last > first) last--;
  return { first, last };
}
