// Pure routing classifier for a webview `link_click` message. Kept vscode-free —
// like full_replace.ts / styles_resolve.ts — so vitest can exercise the routing
// decision (fragment vs. external scheme vs. workspace-relative vs. dropped)
// without a live `vscode.Uri` / `vscode.env`. The vscode wiring
// (`vscode.env.openExternal` / `vscode.commands.executeCommand('vscode.open')`
// and the `vscode.Uri.joinPath` resolution) stays in provider.ts and switches on
// the returned decision.
//
// Contract: SHELL-M-3 (allowlisted scheme → openExternal; `file:` → vscode.open,
// never openExternal; non-allowlisted scheme → dropped; document-relative →
// resolve against the document dir + vscode.open; bare `#fragment` → ignore;
// relative on a parentless document → drop), LINK-I-9 (empty href dropped before
// it can reach openExternal), LINK-I-12 (an allowlisted scheme-bearing href
// opens verbatim; a relative href is percent-decoded and resolves against the
// document URI's directory).

// Matches any RFC-3986 scheme — non-scheme hrefs are treated as document-relative.
// Anchored at the start with no allowance for leading whitespace, so a
// whitespace/control-char-prefixed href (` javascript:…`) is NOT recognized as a
// scheme and falls through to workspace-relative resolution instead of reaching
// openExternal.
const SCHEME_RE = /^([a-z][a-z0-9+.-]*):/i;

// Schemes allowed to reach `vscode.env.openExternal` (SHELL-M-3). Everything else
// scheme-shaped is dropped: VS Code's trusted-domains prompt gates only
// http/https, so any other scheme handed to openExternal reaches the OS shell
// handler unchecked (`javascript:`, `data:`, `.desktop`/UNC vectors, …). `file:`
// is deliberately absent — it routes to `vscode.open` (in-editor) instead, so a
// hostile document cannot launch the OS default-app handler on a local path.
const ALLOWED_EXTERNAL_SCHEMES: ReadonlySet<string> = new Set([
  'http',
  'https',
  'mailto',
  'vscode',
  'vscode-insiders',
]);

export type LinkClickDecision =
  // Missing / empty href — dropped so a degenerate link never reaches openExternal (LINK-I-9).
  | { kind: 'ignore-empty' }
  // Bare `#fragment` — in-document anchor, ignored (SHELL-M-3).
  | { kind: 'ignore-fragment' }
  // Allowlisted scheme-bearing href — opened verbatim with vscode.env.openExternal (SHELL-M-3 / LINK-I-12).
  | { kind: 'open-external'; href: string }
  // `file:` href — opened inside the editor with vscode.open, never openExternal (SHELL-M-3).
  | { kind: 'open-file'; href: string }
  // Scheme-bearing href off the allowlist — dropped, no side effects (SHELL-M-3).
  | { kind: 'blocked-scheme'; href: string; scheme: string }
  // Document-relative href — resolved against the document dir + vscode.open (SHELL-M-3).
  | { kind: 'open-workspace-relative'; href: string }
  // Relative href on a parentless (e.g. untitled:) document — dropped (SHELL-M-3).
  | { kind: 'noop-untitled'; href: string };

export interface LinkClickContext {
  // Whether the bound document has a meaningful parent directory. False for
  // untitled: and other parentless schemes (compute_document_dir_uri === null).
  has_document_dir: boolean;
}

// Markdown destinations are URI-shaped: `a%20b.pdf` names `a b.pdf` on disk.
// `vscode.Uri.joinPath` treats its segment argument literally (no decoding), so
// the decode must happen before resolution. Malformed escape sequences (a
// literal `%` in a filename, e.g. `100%.md`) fall back to the raw string.
// Decoding runs strictly AFTER scheme classification, so an encoded scheme
// (`javascript%3A…`) can never decode its way onto the openExternal path — it
// stays a workspace-relative filename handed to vscode.open.
function decode_relative_href(href: string): string {
  try {
    return decodeURIComponent(href);
  } catch {
    return href;
  }
}

export function classify_link_click(href: unknown, ctx: LinkClickContext): LinkClickDecision {
  if (typeof href !== 'string' || href.length === 0) return { kind: 'ignore-empty' };
  if (href.startsWith('#')) return { kind: 'ignore-fragment' };
  const scheme_match = SCHEME_RE.exec(href);
  if (scheme_match) {
    const scheme = scheme_match[1].toLowerCase();
    if (scheme === 'file') return { kind: 'open-file', href };
    if (ALLOWED_EXTERNAL_SCHEMES.has(scheme)) return { kind: 'open-external', href };
    return { kind: 'blocked-scheme', href, scheme };
  }
  if (!ctx.has_document_dir) return { kind: 'noop-untitled', href };
  return { kind: 'open-workspace-relative', href: decode_relative_href(href) };
}
