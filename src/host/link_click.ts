// Pure routing classifier for a webview `link_click` message. Kept vscode-free —
// like full_replace.ts / styles_resolve.ts — so vitest can exercise the routing
// decision (fragment vs. external scheme vs. workspace-relative vs. dropped)
// without a live `vscode.Uri` / `vscode.env`. The vscode wiring
// (`vscode.env.openExternal` / `vscode.commands.executeCommand('vscode.open')`
// and the `vscode.Uri.joinPath` resolution) stays in provider.ts and switches on
// the returned decision.
//
// Contract: SHELL-M-3 (scheme → openExternal; document-relative → resolve
// against the document dir + vscode.open; bare `#fragment` → ignore; relative on
// a parentless document → drop), LINK-I-9 (empty href dropped before it can
// reach openExternal), LINK-I-12 (a scheme-bearing href opens verbatim; a
// relative href resolves against the document URI's directory).

// Matches any RFC-3986 scheme — non-scheme hrefs are treated as document-relative.
// Anchored at the start with no allowance for leading whitespace, so a
// whitespace/control-char-prefixed href (` javascript:…`) is NOT recognized as a
// scheme and falls through to workspace-relative resolution instead of reaching
// openExternal.
export const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

export type LinkClickDecision =
  // Missing / empty href — dropped so a degenerate link never reaches openExternal (LINK-I-9).
  | { kind: 'ignore-empty' }
  // Bare `#fragment` — in-document anchor, ignored (SHELL-M-3).
  | { kind: 'ignore-fragment' }
  // Scheme-bearing href — opened verbatim with vscode.env.openExternal (SHELL-M-3 / LINK-I-12).
  | { kind: 'open-external'; href: string }
  // Document-relative href — resolved against the document dir + vscode.open (SHELL-M-3).
  | { kind: 'open-workspace-relative'; href: string }
  // Relative href on a parentless (e.g. untitled:) document — dropped (SHELL-M-3).
  | { kind: 'noop-untitled'; href: string };

export interface LinkClickContext {
  // Whether the bound document has a meaningful parent directory. False for
  // untitled: and other parentless schemes (compute_document_dir_uri === null).
  has_document_dir: boolean;
}

export function classify_link_click(href: unknown, ctx: LinkClickContext): LinkClickDecision {
  if (typeof href !== 'string' || href.length === 0) return { kind: 'ignore-empty' };
  if (href.startsWith('#')) return { kind: 'ignore-fragment' };
  if (SCHEME_RE.test(href)) return { kind: 'open-external', href };
  if (!ctx.has_document_dir) return { kind: 'noop-untitled', href };
  return { kind: 'open-workspace-relative', href };
}
