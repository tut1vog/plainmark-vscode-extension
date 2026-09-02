import type { Text } from '@codemirror/state';

// {line, character} on the wire (zero-based, VS Code semantics): the webview doc
// is LF-normalized while the host may be CRLF. Clamps both coordinates so an
// over-shoot from the host lands on a legal offset instead of throwing.
export function position_to_offset(doc: Text, line: number, character: number): number {
  const doc_line = doc.line(Math.max(0, Math.min(line, doc.lines - 1)) + 1);
  return doc_line.from + Math.max(0, Math.min(character, doc_line.length));
}
