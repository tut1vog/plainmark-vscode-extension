// Pure outline model: convert the symbol tree returned by
// `vscode.executeDocumentSymbolProvider` into the heading-node tree the
// TreeDataProvider renders. No `vscode` import so this stays unit-testable.
// vscode.DocumentSymbol is structurally a superset of RawSymbol.

export interface RawSymbol {
  name: string;
  range: { start: { line: number; character: number } };
  children: readonly RawSymbol[];
}

export interface HeadingNode {
  label: string;
  line: number;
  character: number;
  children: HeadingNode[];
}

export function clean_label(name: string): string {
  return name.replace(/^#{1,6}\s*/, '').trim();
}

export function build_heading_tree(symbols: readonly RawSymbol[]): HeadingNode[] {
  return symbols.map((s) => ({
    label: clean_label(s.name),
    line: s.range.start.line,
    character: s.range.start.character,
    children: build_heading_tree(s.children ?? []),
  }));
}

function flatten_headings(roots: readonly HeadingNode[]): HeadingNode[] {
  const out: HeadingNode[] = [];
  const walk = (nodes: readonly HeadingNode[]): void => {
    for (const n of nodes) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(roots);
  return out;
}

// OUT-I-4 — the heading a caret line sits under: the last heading (document
// order) whose start line is <= the caret line. Null when the caret precedes
// the first heading.
export function find_enclosing_heading(
  roots: readonly HeadingNode[],
  line: number,
): HeadingNode | null {
  let best: HeadingNode | null = null;
  for (const n of flatten_headings(roots)) {
    if (n.line <= line) best = n;
  }
  return best;
}
