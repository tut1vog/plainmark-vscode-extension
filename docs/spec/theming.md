---
prefix: THEME
title: Theming & Spacing
kind: cross-cutting
---

# Theming & Spacing

Cross-cutting theming surface and inter-block vertical-spacing model that span
all constructs. This file OWNS:

- the `--plainmark-*` CSS custom-property surface — what variables exist, their
  declared `:root` defaults, and what each controls;
- theme resolution — how the host resolves the `plainmark.styles` user setting
  into webview `<link>` tags, the cascade order against the built-in defaults,
  and VS Code light/dark + `--vscode-*` integration;
- the GitHub-style default look (the `:root` defaults in the `ROOT_DEFAULTS_CSS`
  string plus the per-construct
  `var(--plainmark-…, <FALLBACK>)` fallbacks);
- the inter-block vertical-spacing model (the former `spacing` construct —
  collapsing doubled `.cm-line` padding on adjacent opt-in
  constructs).

Construct specs reference the variables they consume (e.g.
`--plainmark-blockquote-border-color`) in prose or via `[inherits:THEME-…]`;
this file does NOT restate construct-specific rendering. The webview-reboot
mechanism on a config change is owned by `sync-and-persistence.md` (`SYNC-P-12`,
`SYNC-P-8`/`SYNC-P-9`) and the config-change subscription wiring by the same
file; this file references them rather than restating the reload mechanism.

Section codes: `V` CSS-variable surface · `R` resolution / config→theme · `D`
default theme · `S` spacing model.

Notation in examples: `|` = caret, `→` = action/result, `\n` = literal newline.

## V — CSS-variable surface

The `--plainmark-*` custom-property surface every construct's decoration theme
consumes via `var(--plainmark-…, <FALLBACK>)`. Section code `V`.

- **THEME-V-1** — Every Plainmark-controlled visual property MUST be expressed as a `var(--plainmark-<name>, <FALLBACK>)` reference at its decoration/widget declaration site, so any property is overridable from a `plainmark.styles` stylesheet without touching the bundle.
  _Example:_ the blockquote bar color is emitted as `var(--plainmark-blockquote-border-color, color-mix(in srgb, var(--vscode-foreground) 30%, transparent))`, not a hard-coded color.

- **THEME-V-2** — The body/container surface MUST define `--plainmark-font-text`, `--plainmark-font-code`, `--plainmark-font-size`, `--plainmark-body-line-height`, `--plainmark-container-max-width`, and `--plainmark-container-padding-inline`; the CM6 content width MUST be computed as `min(--plainmark-container-max-width, 100%) - 2 * --plainmark-container-padding-inline`. The document surface MUST additionally define and consume the root aliases `--plainmark-editor-background` / `--plainmark-editor-foreground` (defaults chaining to `--vscode-editor-*`) on `body`, so a user stylesheet re-skins Plainmark documents without re-skinning the rest of VS Code.
  _Example:_ default `--plainmark-container-max-width: 1100px` and `--plainmark-container-padding-inline: 24px` → content column is `min(1100px,100%) - 48px`; setting `--plainmark-editor-background: #f4ecd8` in a `plainmark.styles` file tints only Plainmark documents.

- **THEME-V-3** — A shared code surface MUST define `--plainmark-code-background` and `--plainmark-code-color`, and the fenced-code, frontmatter, HTML-block, and inline-code constructs MUST chain their own `--plainmark-*` overrides down to these shared tokens (then to `--vscode-*`) so a single override re-themes all code surfaces.
  _Example:_ `--plainmark-html-background` falls back to `--plainmark-code-background`, which falls back to `--vscode-textCodeBlock-background`.

- **THEME-V-4** — Per-construct chrome variables MUST exist for each themable construct family: headings (`--plainmark-heading-*`, `--plainmark-h1-size`…`--plainmark-h6-weight`), blockquotes (`--plainmark-blockquote-*`), lists (`--plainmark-list-*`, `--plainmark-task-*`), callouts (`--plainmark-callout-*` plus per-type `--plainmark-callout-<type>-*`), tables (`--plainmark-table-*`), links (`--plainmark-link-*`), footnotes (`--plainmark-footnote-*`), images (`--plainmark-image-*`), math (`--plainmark-math-*`), mermaid (`--plainmark-mermaid-*`), horizontal rules (`--plainmark-hr-*`), text styles (`--plainmark-strong-*`/`--plainmark-em-*`/`--plainmark-strikethrough-*`/`--plainmark-inline-code-*`), and fenced-code (`--plainmark-fenced-code-*`).
  _Example:_ `--plainmark-h1-size` defaults to `2em`; `--plainmark-callout-warning-color` overrides only the warning callout's accent.

- **THEME-V-5** — Syntax-highlighting colors MUST be driven by a `--plainmark-syntax-<token>-color` family (keyword, comment, string, number, function, variable, type, property, tag, meta, punctuation, invalid), consumed uniformly by the fenced-code, frontmatter, and HTML-block highlighters via the shared syntax-palette helper, which emits `var(--plainmark-syntax-<token>-color, <light-palette hex>)` — the inline hex fallback (THEME-V-1 discipline) keeps tokens colored even if the `:root` defaults injection is absent (THEME-D-6).
  _Example:_ a highlighted `keyword` span is colored `var(--plainmark-syntax-keyword-color, #0000ff)`, shared across all three code surfaces.

- **THEME-V-6** — The list indent/marker machinery MUST drive horizontal layout and marker geometry from custom properties: `--plainmark-list-depth` (set per line by the list-item line decoration), `--plainmark-list-indent`, and the per-level marker sizes `--plainmark-list-bullet-size`, `--plainmark-list-bullet-2-size`, `--plainmark-list-bullet-3-size`. (The character-glyph variables `--plainmark-list-bullet[-2|-3]` are retired — markers are CSS box geometry per LIST-R-3, so a character override cannot be honored.)
  _Example:_ overriding `--plainmark-list-bullet-size: 0.4em` resizes the top-level bullet live without re-parsing source.

- **THEME-V-7** `[accepted]` — Mermaid diagram interior colors MUST NOT be drawn from the `--plainmark-*` surface; only the diagram's outer container variables (`--plainmark-mermaid-padding`, `--plainmark-mermaid-align`, `--plainmark-mermaid-background`, `--plainmark-mermaid-error-color`, `--plainmark-mermaid-preview-*`, `--plainmark-mermaid-pending-opacity`) are themable here. Mermaid's own theming engine owns the rendered-graph colors (see `mermaid.md` `MMD-E-9`).
  _Example:_ overriding `--plainmark-mermaid-background` re-tints the diagram's frame, but node fills come from Mermaid's theme, not `--plainmark-*`.

- **THEME-V-8** `[smoke]` — A variable referenced by an inline `var(--plainmark-…, <FALLBACK>)` MUST resolve to its `<FALLBACK>` when neither the `:root` defaults nor a user stylesheet declares it, so an unenumerated token still renders sensibly.
  _Example:_ `--plainmark-blockquote-margin` (declared-but-not-injected under the Option-Y lean) renders from the inline fallback at the blockquote decoration site.

- **THEME-V-9** — The public theming contract MUST be limited to `--plainmark-*` custom-property names: a published variable name MUST keep working across releases (rename = alias-forever), while DOM class names (`.plainmark-*`), `data-*` attributes, and element structure are internal and MAY change in any release with no compatibility path; the `plainmark.styles` setting description MUST state this boundary.
  _Example:_ a user stylesheet setting `--plainmark-h1-size` is guaranteed across versions; one targeting `.plainmark-list-bullet::before` may break when list rendering changes.

- **THEME-V-10** — Cross-cutting primitives MUST exist where ≥2 wired construct families share a semantic chain target, and the per-construct defaults MUST chain through the primitive so one override re-tints the cluster while per-construct overrides still win: `--plainmark-muted-color` (consumed by link/list marker colors, checked-task text, the unknown-callout accent, footnote definition text, and code language labels) and `--plainmark-popover-background` / `--plainmark-popover-border-color` (consumed by the footnote popover, mermaid live-preview, and autocomplete popup panels).
  _Example:_ setting `--plainmark-muted-color: #8a7a66` re-tints list bullets, link brackets, checked tasks, and language labels in one declaration; setting `--plainmark-list-marker-color` afterwards still wins for bullets alone.

- **THEME-V-11** — The shared completion tooltip (latex / callout / table sources) MUST be themable via `--plainmark-autocomplete-*`: panel `-background` / `-border-color` chaining the popover pair, `-selected-background` / `-selected-foreground` chaining `--vscode-editorSuggestWidget-selected*`, and `-scrollbar-thumb-color` applied as a standard `scrollbar-color` declaration on the scrolling list element itself (webkit pseudo-element rules alone MUST NOT be relied on — VS Code webviews inject `html { scrollbar-color }`, which disables the webkit path per CSS Scrollbars L1 / Chrome 121+) — neither CM6's baseTheme colors nor the webview's VS Code-themed scrollbar may leak into the popup.
  _Example:_ under `github-light` on a dark VS Code theme, the LaTeX command list renders the theme's popover surface and Primer-accent selected row, not Dark+'s suggest colors or a dark scrollbar thumb.

- **THEME-V-12** `[smoke]` — The main editor scrollbar MUST follow the Plainmark theme, not the ambient VS Code theme: `--plainmark-editor-scrollbar-thumb-color` (chaining `--vscode-scrollbarSlider-background`) MUST be applied as a standard `scrollbar-color` declaration on the `.cm-scroller` element with a transparent track, so the themed page background shows through the track (webkit pseudo-element rules alone MUST NOT be relied on — VS Code webviews inject `html { scrollbar-color }`, which disables the webkit path per CSS Scrollbars L1 / Chrome 121+); the webview's VS Code-themed scrollbar MUST NOT leak over the Plainmark page.
  _Example:_ under the sepia starter theme (`--plainmark-editor-background: #f4ecd8`) on a light VS Code theme, the editor scrollbar track reads as the sepia page, not VS Code's white track.

## R — resolution / config → theme

How the host turns the `plainmark.styles` setting and the ambient VS Code theme
into the webview's CSS environment. Section code `R`.

- **THEME-R-1** — The user-customization channel MUST be the `plainmark.styles` setting (a string array, resolved per-document with `getConfiguration('plainmark', document_uri)`); a non-array value MUST resolve to an empty style set with no warnings.
  _Example:_ `"plainmark.styles": ["./.vscode/plainmark.css"]` → one resolved stylesheet; `"plainmark.styles": 42` → empty set.

- **THEME-R-2** — Each entry MUST be classified by `classify_style_entry` into exactly one of: `file:` URI, absolute path (POSIX `/…` or Windows drive `C:\…`/`c:/…`), workspace-relative path, declined remote (`http:`/`https:`), or invalid (non-string / empty string).
  _Example:_ `"file:///Users/me/x.css"` → `file_uri`; `"styles/x.css"` → `relative_path`; `"https://cdn/x.css"` → `declined_remote`; `""` → `invalid`.

- **THEME-R-3** — A `declined_remote` or `invalid` entry MUST be skipped and MUST surface an operator warning via `showWarningMessage`; it MUST NOT abort resolution of the remaining entries.
  _Example:_ `["https://cdn/x.css", "./ok.css"]` → one warning for the remote URL, `./ok.css` still resolved.

- **THEME-R-4** — A relative entry MUST resolve against the first workspace folder, falling back to the bound document's directory when no workspace folder exists; an absolute path MUST resolve via `Uri.file`; a `file:` URI MUST resolve via `Uri.parse`.
  _Example:_ in a folderless window, `"theme.css"` resolves next to the open document.

- **THEME-R-5** — For each resolved stylesheet the host MUST add the stylesheet's parent directory to the webview `localResourceRoots` (deduplicated) and expose a webview-loadable `href` via `webview.asWebviewUri`.
  _Example:_ two stylesheets in the same `.vscode/` folder add that folder once to `localResourceRoots`.

- **THEME-R-6** — The webview HTML MUST inject the built-in `ROOT_DEFAULTS_CSS` as an inline `<style nonce>` BEFORE the user stylesheet `<link>` tags, so user `plainmark.styles` declarations cascade later and win over the defaults.
  _Example:_ a user stylesheet setting `--plainmark-h1-size` overrides the `:root` default because its `<link>` follows the defaults `<style>`.

- **THEME-R-7** — `plainmark.styles` MUST be injected as external `<link rel="stylesheet" href="…">` tags (never an inline `<style>` of the file body); the CSP MUST permit them via `style-src ${webview.cspSource} 'unsafe-inline'`.
  _Example:_ each resolved entry becomes one `<link>` whose `href` is the `asWebviewUri` string.

- **THEME-R-8** — On the bound document, a `plainmark.styles` configuration change MUST re-resolve styles and reset `webview.html`, rebooting the webview so new `<link>` tags take effect. The reboot/handshake mechanism is owned by `sync-and-persistence.md` (`SYNC-P-12`); this clause owns only the trigger (`affectsConfiguration('plainmark.styles', document.uri)`).
  _Example:_ edit `plainmark.styles` in settings → `onDidChangeConfiguration` fires → HTML is rebuilt with the new links.

- **THEME-R-9** — For each resolved stylesheet the host MUST register a `createFileSystemWatcher` whose `onDidChange`/`onDidCreate` posts `{ type: 'style_reload', href }` to the webview so the matching `<link>` is cache-busted live without rebooting CM6; watcher-registration failures (e.g. paths unwatchable on `vscode.dev`) MUST be swallowed, falling back to manual reload.
  _Example:_ saving the linked `plainmark.css` re-applies it without losing the caret/selection.

- **THEME-R-10** `[smoke]` — Plainmark colors MUST integrate with the active VS Code theme by deferring, through the `var(--plainmark-…, var(--vscode-…))` fallback chains, to live `--vscode-*` variables the webview host injects; switching the VS Code color theme MUST re-color Plainmark surfaces that fall through to `--vscode-*` without a Plainmark code change.
  _Example:_ switching from a dark to a light VS Code theme re-tints `--plainmark-code-background` (→ `--vscode-textCodeBlock-background`) live.

- **THEME-R-11** `[smoke]` — Light/dark adaptation MUST key off the `vscode-dark` / `vscode-light` / `vscode-high-contrast` class VS Code itself places on the webview document `<body>` (Plainmark host code sets no theme class): the `ROOT_DEFAULTS_CSS` `body.vscode-dark` block overrides the syntax-token palette, and the mermaid widget reads `document.body.classList` to pick its diagram theme. Plainmark MUST NOT inject or recompute its own body theme class.
  _Example:_ a fenced-code `keyword` renders `#569cd6` under `body.vscode-dark` and `#0000ff` otherwise, switched purely by VS Code's body class.

- **THEME-R-12** `[inherits:INV-HOST-1]` `[build]` — The host style-resolution code MUST NOT import Node built-ins; path classification is string-based and URI handling uses `vscode.Uri`, so the Web host resolves `plainmark.styles` without `node:path`/`node:fs`.
  _Example:_ adding `import { join } from 'node:path'` to the host style-resolution code fails the browser-target bundle.

- **THEME-R-13** `[smoke]` — `plainmark.styles` MUST be listed in `capabilities.untrustedWorkspaces.restrictedConfigurations` (`supported: "limited"`) so that in a Restricted Mode workspace VS Code itself drops workspace- and folder-scope values while user-scope values still apply; the host MUST NOT add its own trust checks (the platform filter is the single enforcement point), and the trust-grant transition MUST work through the existing THEME-R-8 path — granting trust fires `onDidChangeConfiguration` for restricted keys, no `onDidGrantWorkspaceTrust` listener. Where the embedder disables Workspace Trust (vscode.dev default), every workspace is implicitly trusted and the restriction is inert — documented behavior, not a defect.
  _Example:_ an untrusted workspace's `.vscode/settings.json` styles entry is ignored (user-scope styles still load); clicking "Trust" applies the workspace styles with no manual reload.

## D — default theme

The built-in GitHub-style default look: the `:root` declarations in
`ROOT_DEFAULTS_CSS` plus the per-construct inline fallbacks.
Section code `D`.

- **THEME-D-1** — `ROOT_DEFAULTS_CSS` MUST declare a single `:root` block (plus a `body.vscode-dark` syntax-palette override) covering the actively-consumed `--plainmark-*` tokens, so the cascade origin the user overrides is a real declaration; under the Option-Y lean only consumed tokens are declared and deferred/unwired tokens (e.g. `--plainmark-blockquote-margin`) rely on inline `var()` fallbacks alone.
  _Example:_ `--plainmark-font-text`'s default is declared in the `:root` block; an unwired token's default lives only at the construct's inline `var(…, <FALLBACK>)` site.

- **THEME-D-2** — The default body font MUST be the system UI sans-serif stack (`--plainmark-font-text`), and the default code font MUST follow the editor's font (`--plainmark-font-code: var(--vscode-editor-font-family)`); the default body size MUST be `16px` with `1.5` line-height.
  _Example:_ unstyled prose renders in the OS UI font at 16px/1.5; fenced code uses the VS Code editor font.

- **THEME-D-3** `[smoke]` — The default look MUST be GitHub-style: alternating-row table backgrounds (`--plainmark-table-row-alt-background`), an under-rule on h1/h2 (`--plainmark-heading-border-*`), rounded inline-code chips (`--plainmark-inline-code-border-radius: 6px`, `0.2em 0.4em` padding, `85%` size), and a left accent bar on blockquotes — all derived from `--vscode-*` so they read correctly in both light and dark.
  _Example:_ a default table shows zebra striping at ~4% foreground tint; inline `` `code` `` renders as a rounded chip.

- **THEME-D-4** `[smoke]` — Default accent and surface colors MUST be derived from `--vscode-*` tokens (optionally via `color-mix`), not fixed hex values, so the default theme adapts to the active VS Code theme; only syntax-highlight tokens MAY carry a hard-coded hex fallback after their `--vscode-symbolIcon-*` reference.
  _Example:_ `--plainmark-blockquote-color` is `color-mix(in srgb, var(--vscode-foreground) 70%, transparent)`; `--plainmark-syntax-keyword-color` falls back to `#c586c0` only if `--vscode-symbolIcon-keywordForeground` is absent.

- **THEME-D-5** — The default heading scale MUST follow a GitHub-like ramp (`--plainmark-h1-size` 2em down to `--plainmark-h6-size` 0.85em) with weight 600, and headings MUST default to the inherited body color/font rather than a distinct heading color.
  _Example:_ `# A` renders at 2em/600; `###### F` at 0.85em/600.

- **THEME-D-6** — `ROOT_DEFAULTS_CSS` MUST evaluate to a single string of valid CSS: balanced braces/parens/comments and NO backtick characters. The export is a TypeScript template literal, so a stray backtick (e.g. a markdown-style code span in a CSS comment) splits it into a string comparison that compiles cleanly, evaluates to a boolean, and makes the host inject `<style>true</style>` — silently killing every root default (the 2026-05-31 regression whose visible symptom was dead syntax highlighting).
  _Example:_ a CSS comment writes the blockquote marker as '> ' (single quotes), never backtick-quoted.

## S — spacing model

The inter-block vertical-spacing model — margins/padding between adjacent blocks
and the collapse of doubled `.cm-line` padding. Section code `S`.

- **THEME-S-1** — Inter-block vertical spacing MUST be expressed as `.cm-line` padding (per-construct `padding-top`/`padding-bottom`), never as `margin`, because CM6's height-map forbids margins on `.cm-line`.
  _Example:_ a heading's gap is `--plainmark-heading-padding-top`/`-bottom`, and a list item's is `--plainmark-list-item-spacing` as `padding-top`, not a margin.

- **THEME-S-2** — When two adjacent `.cm-line` elements both carry the `plainmark-collapse-adjacent` class, the spacing extension MUST zero the upper line's `padding-bottom` so the two constructs' paddings do not stack into a doubled gap.
  _Example:_ two consecutive opt-in blocks render with a single inter-block gap, not the sum of both lines' bottom padding.

- **THEME-S-3** — The collapse MUST be selector-driven (`.cm-line.plainmark-collapse-adjacent:has(+ .cm-line.plainmark-collapse-adjacent)`), applying only between two opted-in adjacent lines; a collapse-adjacent line followed by a non-opted-in line MUST keep its `padding-bottom`.
  _Example:_ an opt-in block followed by a plain paragraph keeps its full bottom padding.

- **THEME-S-4** — `spacing_extension` MUST be exported as a non-null CM6 `Extension` (an `EditorView.theme`) so it can be composed into the editor's extension set.
  _Example:_ the editor includes `spacing_extension` in its extensions array; it is defined and non-null.

- **THEME-S-5** `[smoke]` — Blank lines between blocks MUST follow CM6's default line layout (each blank source line is its own `.cm-line`); Plainmark MUST NOT inject or remove blank-line bytes to tune spacing, and MUST NOT collapse a user's blank line into zero height.
  _Example:_ `# A\n\nbody` keeps the blank line as its own rendered line; spacing between heading and body comes from padding, not byte changes.

- **THEME-S-6** `[inherits:INV-SP-1]` — The spacing model is render-only (decorations/theme CSS); applying or collapsing spacing MUST NOT modify document bytes.
  _Example:_ toggling adjacency by editing around a block changes rendered padding but never rewrites source.
