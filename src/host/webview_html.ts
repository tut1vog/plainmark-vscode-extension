// Pure builder for the webview HTML scaffold + Content-Security-Policy the host
// emits from `PlainmarkEditorProvider.getHtml`. Kept vscode-free — like
// full_replace.ts / styles_resolve.ts / outline_model.ts — so vitest can
// exercise the security-critical string construction (CSP directives, the
// per-render nonce, user-input escaping, and `</script>` neutralization of the
// inline keybindings JSON) without a live `vscode.Webview`. The vscode-dependent
// values (`webview.asWebviewUri`, `webview.cspSource`, the `plainmark.theme`
// config) are gathered in provider.ts and passed in as plain strings, so this
// function's output is byte-identical to the previous inline template for
// identical inputs (INV-HOST-1).
//
// Contract: SHELL-W-1 (single `<div id="editor">` mount), SHELL-W-2
// (`default-src 'none'`), SHELL-W-3 (`script-src` restricted to the per-render
// nonce, every `<script>` carries it), SHELL-W-4 (nonce via Web Crypto, fresh
// per call), SHELL-W-5 (`style-src`/`img-src`/`font-src` directives), SHELL-W-8
// (nonce-scoped bootstrap globals before the scripts load), SHELL-W-9 (cascade
// order: `:root` defaults `<style>` → theme → user `<link>` → scripts),
// SHELL-W-10 (user `<link>` hrefs are attribute-escaped).

import { ROOT_DEFAULTS_CSS } from '../theme/root_defaults.js';
import type { ResolvedTableKeybindings } from '../common/table_keybindings.js';

export interface WebviewHtmlInput {
  // Per-render nonce (32-char hex from getNonce, or an injected value in tests).
  // Reused in the CSP `script-src` and on every `<script>`/`<style>` tag.
  nonce: string;
  // `webview.cspSource` — the sandboxed webview origin the CSP whitelists.
  cspSource: string;
  // `asWebviewUri`-resolved URIs, already stringified by the caller.
  scriptUri: string;
  mathjaxUri: string;
  mermaidUri: string;
  // Bundled-font base URL (trailing slash included by the caller).
  fontsBase: string;
  // Normalized theme id (constrained to the ThemeId union) — injected as the
  // `window.__plainmark_theme` bootstrap global.
  themeId: string;
  // Active theme CSS block; empty string when the theme is the adaptive default.
  themeCss: string;
  // Raw (unescaped) user `plainmark.styles` hrefs — escaped here (SHELL-W-10).
  styleHrefs: readonly string[];
  // Resolved table keybindings — serialized into a nonce-scoped inline script;
  // user-settable string values are `</script>`-neutralized here.
  keybindings: ResolvedTableKeybindings;
}

export function build_webview_html(input: WebviewHtmlInput): string {
  const {
    nonce,
    cspSource,
    scriptUri,
    mathjaxUri,
    mermaidUri,
    fontsBase,
    themeId,
    themeCss,
    styleHrefs,
    keybindings,
  } = input;

  // `style-src` widens to include `${cspSource}` so user `<link>` tags load — THEME-R-7.
  const csp = [
    `default-src 'none'`,
    `style-src 'unsafe-inline' ${cspSource}`,
    `img-src ${cspSource} https:`,
    `font-src ${cspSource}`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');
  // Theme block sits between root defaults and user links — cascade contract: root defaults → active theme → user styles.
  const theme_style = themeCss ? `<style nonce="${nonce}">${themeCss}</style>` : '';
  // User `<link>` tags follow the `:root` defaults `<style>` so user values win — THEME-R-6 cascade order.
  const user_links = styleHrefs
    .map(
      (href) =>
        `<link rel="stylesheet" href="${escape_attribute(href)}" data-plainmark-style="${escape_attribute(href)}">`,
    )
    .join('\n  ');
  // `<style>` precedes script tags so CM6's style-mod insertion stays lower-precedence than our `:root` defaults.
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Plainmark</title>
  <style nonce="${nonce}">${ROOT_DEFAULTS_CSS}</style>
  ${theme_style}
  ${user_links}
</head>
<body>
  <div id="editor"></div>
  <script nonce="${nonce}">window.__mathjax_font_url = ${JSON.stringify(fontsBase)};</script>
  <script nonce="${nonce}">window.__plainmark_mathjax = ${JSON.stringify({ url: mathjaxUri, nonce })};</script>
  <script nonce="${nonce}">window.__plainmark_mermaid = ${JSON.stringify({ url: mermaidUri, nonce })};</script>
  <script nonce="${nonce}">window.__plainmark_theme = ${JSON.stringify(themeId)};</script>
  <script nonce="${nonce}">window.__plainmark_table_keybindings = ${
    // user-settable strings can contain "</script>", which would terminate the inline script
    JSON.stringify(keybindings).replace(/</g, '\\u003c')
  };</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

export function getNonce(): string {
  // globalThis.crypto (Web Crypto) works in both Node 22 and browser — no Node import needed (SHELL-W-4).
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Escape the three characters that could break out of a double-quoted HTML
// attribute value or start a tag: `&` first (so it does not double-escape the
// entities produced below), then `"` (attribute delimiter) and `<` (SHELL-W-10).
export function escape_attribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}
