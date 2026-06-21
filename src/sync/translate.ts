// EOL conversion helpers. The webview's CM6 doc always lives in LF coordinates
// (CM6's Text.of normalizes `\r\n` AND lone `\r` → `\n` via
// DefaultSplit = /\r\n?|\n/ in @codemirror/state). The host's TextDocument may
// use CRLF. We convert at the host boundary so the wire protocol and the loop
// stay LF-only. Lone `\r` (classic-Mac EOL) is normalized too — matching what
// CM6 would do anyway — so the host LF view equals the webview doc and the
// identity check holds with no edit; the declared consequence is that the
// first real edit rewrites legacy lone-`\r` EOLs file-wide (INV-SP-1 is scoped
// to `\n`/`\r\n` files).

export function native_to_lf(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

export function lf_to_native(lf_text: string, eol: '\r\n' | '\n'): string {
  if (eol === '\n') return lf_text;
  return lf_text.replace(/\n/g, '\r\n');
}
