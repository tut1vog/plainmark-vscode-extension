import { ensureSyntaxTree } from '@codemirror/language';
import type { EditorState, Line, Text } from '@codemirror/state';

// A partial tree could misclassify a block's kind or truncate its span.
export const PARSE_BUDGET_MS = 1000;

export const BLANK = /^[ \t]*$/;

// A list can interrupt a paragraph only when its first line is a non-empty
// bullet or a non-empty ordered item numbered 1 (CommonMark). An empty `-`
// item would re-parse as a setext underline, and `2.`-style starts as text.
export const LIST_INTERRUPTS = /^ {0,3}([-+*]|1[.)])[ \t]+\S/;

// A bare `=`/`-` run directly under paragraph text is a setext underline.
export const SETEXT_UNDERLINE = /^ {0,3}(=+|-+)[ \t]*$/;

// A ≥4-indent line is indented code to CommonMark renderers and an inert
// CodeBlock here (CBLK-E-1); changing blanks beside one could change that
// render. The node already classifies as opaque / non-convertible — this
// edge-line check is the byte-safety backstop for indent-led lines inside
// other block shapes.
export const INDENT_LED = /^( {4,}|\t)/;

// The last line a node covers: a node ending exactly at a line start spans
// through the previous line.
export function node_last_line(doc: Text, from: number, to: number): Line {
  const last = doc.lineAt(to);
  if (last.from === to && last.number > doc.lineAt(from).number) {
    return doc.line(last.number - 1);
  }
  return last;
}

export interface LineSpan<K> {
  kind: K;
  first: number;
  last: number;
}

// Document-level blocks as first/last line spans, classified by the caller;
// a null classification drops the block. Null when the parse is incomplete.
export function top_level_line_spans<K>(
  state: EditorState,
  classify: (node_name: string) => K | null,
): LineSpan<K>[] | null {
  const tree = ensureSyntaxTree(state, state.doc.length, PARSE_BUDGET_MS);
  if (!tree) return null;
  const doc = state.doc;
  const spans: LineSpan<K>[] = [];
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    const kind = classify(node.name);
    if (kind === null) continue;
    spans.push({
      kind,
      first: doc.lineAt(node.from).number,
      last: node_last_line(doc, node.from, node.to).number,
    });
  }
  return spans;
}
