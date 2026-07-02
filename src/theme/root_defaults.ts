// Canonical `:root` defaults for every actively-consumed `--plainmark-*` token.
// Injected by `host/provider.ts` `getHtml()` as an inline `<style nonce="...">`
// block before the script tags.
// Pattern B1 (host-template inline) — `EditorView.theme({':root':...})` is
// structurally dead per `@codemirror/view` `theme.ts:10–24`. Option Y (lean) —
// declare only consumed vars; deferred/unwired vars stay reserved (THEME-D-1,
// e.g. `--plainmark-blockquote-margin`, `--plainmark-list-numbered-style`,
// `--plainmark-callout-border-radius`).
//
// Per-construct `var(--plainmark-foo, <FALLBACK>)` at theme declaration sites
// is retained as belt-and-suspenders (THEME-V-1) — consolidation here is additive.

// No backticks inside this template literal — a stray one silently turns the export into a boolean comparison (THEME-D-6)
export const ROOT_DEFAULTS_CSS = `:root {
  /* Primitives layer / root aliases (THEME-V-2). 'font-text' (.cm-content body font) and 'font-code' (inline-code-font-family chain) both have active consumers. 'font-text' is a C-class literal — Primer's sans-serif stack, no --vscode-* chain. 'editor-background' / 'editor-foreground' are consumed by the body rule below — Plainmark-scoped re-skin without touching the rest of VS Code. */
  --plainmark-editor-background: var(--vscode-editor-background);
  --plainmark-editor-foreground: var(--vscode-editor-foreground);
  /* Editor scrollbar thumb; the track is held transparent at the .cm-scroller rule so the themed page background shows through (THEME-V-12). */
  --plainmark-editor-scrollbar-thumb-color: var(--vscode-scrollbarSlider-background, rgba(121, 121, 121, 0.4));
  --plainmark-font-text: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
  --plainmark-font-code: var(--vscode-editor-font-family);
  --plainmark-code-background: var(--vscode-textCodeBlock-background, var(--vscode-textPreformat-background, transparent));
  --plainmark-code-color: var(--vscode-foreground, inherit);
  /* Cross-cutting primitives: one knob re-tints every muted/dim surface; the popover pair re-skins the popup panels (footnote popover, mermaid preview, autocomplete popup). Per-construct overrides still win. */
  --plainmark-muted-color: var(--vscode-descriptionForeground, currentColor);
  --plainmark-popover-background: var(--vscode-editorHoverWidget-background, var(--vscode-editor-background));
  --plainmark-popover-border-color: var(--vscode-editorHoverWidget-border, currentColor);

  /* Image */
  --plainmark-image-max-width: 100%;
  --plainmark-image-max-height: none;

  /* Math */
  --plainmark-math-color: inherit;
  --plainmark-math-size: 1.21em;
  --plainmark-math-padding: 0.25em 0;
  --plainmark-math-align: center;
  --plainmark-math-pending-opacity: 0.5;
  --plainmark-math-preview-size: 1.3em;

  /* Table */
  --plainmark-table-margin: 0.5em 0;
  --plainmark-table-width: 100%;
  --plainmark-table-layout: auto;
  --plainmark-table-border-color: var(--vscode-widget-border, currentColor);
  --plainmark-table-cell-padding: 6px 13px;
  --plainmark-table-cell-min-width: 2em;
  --plainmark-table-cell-word-break: break-word;
  --plainmark-table-header-weight: 600;
  --plainmark-table-row-alt-background: color-mix(in srgb, var(--vscode-foreground) 4%, transparent);

  /* Text styles */
  --plainmark-strong-color: inherit;
  --plainmark-strong-weight: 600;
  --plainmark-em-color: inherit;
  --plainmark-em-style: italic;
  --plainmark-strikethrough-color: inherit;
  --plainmark-strikethrough-decoration: line-through;
  --plainmark-inline-code-color: var(--plainmark-code-color, var(--vscode-textPreformat-foreground, inherit));
  --plainmark-inline-code-background: var(--plainmark-code-background, var(--vscode-textPreformat-background, var(--vscode-textCodeBlock-background, transparent)));
  --plainmark-inline-code-border-color: var(--vscode-textPreformat-border, transparent);
  --plainmark-inline-code-padding: 0.2em 0.4em;
  --plainmark-inline-code-border-radius: 6px;
  --plainmark-inline-code-font-family: var(--plainmark-font-code, monospace);
  --plainmark-inline-code-font-size: 85%;

  /* Headings — shared */
  --plainmark-heading-color: inherit;
  --plainmark-heading-font-family: inherit;
  --plainmark-heading-line-height: 1.5;
  --plainmark-heading-padding-top: 0.4em;
  --plainmark-heading-padding-bottom: 0.3em;
  --plainmark-heading-border-color: var(--vscode-textSeparator-foreground, color-mix(in srgb, var(--vscode-foreground) 35%, transparent));
  --plainmark-heading-border-width: 1px;

  /* Headings — per-level */
  --plainmark-h1-size: 2em;
  --plainmark-h1-weight: 600;
  --plainmark-h2-size: 1.5em;
  --plainmark-h2-weight: 600;
  --plainmark-h3-size: 1.25em;
  --plainmark-h3-weight: 600;
  --plainmark-h4-size: 1em;
  --plainmark-h4-weight: 600;
  --plainmark-h5-size: 0.875em;
  --plainmark-h5-weight: 600;
  --plainmark-h6-size: 0.85em;
  --plainmark-h6-weight: 600;

  /* Links — '-color-hover' / '-decoration-hover' wired noop per PatternFly theming-hooks idiom. */
  --plainmark-link-color: var(--vscode-textLink-foreground, currentColor);
  --plainmark-link-color-hover: var(--vscode-textLink-activeForeground, var(--vscode-textLink-foreground, currentColor));
  --plainmark-link-decoration: underline;
  --plainmark-link-decoration-hover: underline;
  --plainmark-link-marker-color: var(--plainmark-muted-color, var(--vscode-descriptionForeground, currentColor));
  --plainmark-link-cursor: text;

  /* Lists / task lists */
  --plainmark-list-marker-color: var(--plainmark-muted-color, var(--vscode-descriptionForeground, currentColor));
  --plainmark-list-bullet: '●';
  --plainmark-list-bullet-2: '○';
  --plainmark-list-bullet-3: '■';
  --plainmark-list-item-spacing: 0.25em;
  --plainmark-task-checkbox-size: 0.85em;
  --plainmark-task-checkbox-background: var(--vscode-checkbox-background, transparent);
  --plainmark-task-checkbox-border-color: var(--vscode-checkbox-border, currentColor);
  --plainmark-task-checkbox-mark-color: var(--vscode-checkbox-foreground, currentColor);
  --plainmark-task-checked-color: var(--plainmark-muted-color, var(--vscode-descriptionForeground, inherit));
  --plainmark-task-checked-decoration: line-through;

  /* Blockquote */
  --plainmark-blockquote-color: color-mix(in srgb, var(--vscode-foreground, currentColor) 70%, transparent);
  --plainmark-blockquote-background: color-mix(in srgb, var(--vscode-foreground) 5%, transparent);
  --plainmark-blockquote-border-color: color-mix(in srgb, var(--vscode-foreground) 30%, transparent);
  --plainmark-blockquote-border-width: 4px;
  --plainmark-blockquote-padding-y: 0.25em;
  /* These are the PRE-MEASURE fallback only: the authoritative blockquote hanging
     indent is a per-line inline padding-left/text-indent set from the measured
     '> ' marker width (BQ-R-12), which outranks the theme rule that consumes these
     vars. They cover the first frame before the marker-width probe runs. */
  --plainmark-blockquote-indent-per-depth: 1em;
  --plainmark-blockquote-text-gap: 0.5em;
  --plainmark-blockquote-style: normal;

  /* Callouts — shared shape */
  --plainmark-callout-padding-x: 1em;
  --plainmark-callout-padding-y: 0.5em;
  --plainmark-callout-margin-x: 0px;
  --plainmark-callout-border-width: 4px;
  --plainmark-callout-title-weight: 500;
  --plainmark-callout-title-size: 1em;
  --plainmark-callout-title-padding-bottom: 0.25em;

  /* Callouts — per-type accent (A-class chains to --vscode-charts-*) */
  --plainmark-callout-note-color: var(--vscode-charts-blue, #4dafff);
  --plainmark-callout-tip-color: var(--vscode-charts-green, #89d185);
  --plainmark-callout-important-color: var(--vscode-charts-purple, #b180d7);
  --plainmark-callout-warning-color: var(--vscode-charts-yellow, #cca700);
  --plainmark-callout-caution-color: var(--vscode-charts-red, #f48771);
  --plainmark-callout-unknown-color: var(--plainmark-muted-color, var(--vscode-descriptionForeground, currentColor));

  /* Callouts — per-type derived (background via color-mix; border / title default to accent) */
  --plainmark-callout-note-background: color-mix(in srgb, var(--plainmark-callout-note-color) 10%, transparent);
  --plainmark-callout-note-border-color: var(--plainmark-callout-note-color);
  --plainmark-callout-note-title-color: var(--plainmark-callout-note-color);
  --plainmark-callout-tip-background: color-mix(in srgb, var(--plainmark-callout-tip-color) 10%, transparent);
  --plainmark-callout-tip-border-color: var(--plainmark-callout-tip-color);
  --plainmark-callout-tip-title-color: var(--plainmark-callout-tip-color);
  --plainmark-callout-important-background: color-mix(in srgb, var(--plainmark-callout-important-color) 10%, transparent);
  --plainmark-callout-important-border-color: var(--plainmark-callout-important-color);
  --plainmark-callout-important-title-color: var(--plainmark-callout-important-color);
  --plainmark-callout-warning-background: color-mix(in srgb, var(--plainmark-callout-warning-color) 10%, transparent);
  --plainmark-callout-warning-border-color: var(--plainmark-callout-warning-color);
  --plainmark-callout-warning-title-color: var(--plainmark-callout-warning-color);
  --plainmark-callout-caution-background: color-mix(in srgb, var(--plainmark-callout-caution-color) 10%, transparent);
  --plainmark-callout-caution-border-color: var(--plainmark-callout-caution-color);
  --plainmark-callout-caution-title-color: var(--plainmark-callout-caution-color);
  --plainmark-callout-unknown-background: color-mix(in srgb, var(--plainmark-callout-unknown-color) 10%, transparent);
  --plainmark-callout-unknown-border-color: var(--plainmark-callout-unknown-color);
  --plainmark-callout-unknown-title-color: var(--plainmark-callout-unknown-color);

  /* Footnotes */
  --plainmark-footnote-size: 0.75em;
  --plainmark-footnote-marker-color: var(--vscode-textLink-foreground, currentColor);
  --plainmark-footnote-marker-broken-color: var(--vscode-errorForeground, currentColor);
  --plainmark-footnote-definition-background: transparent;
  --plainmark-footnote-definition-padding: 0.5em 1em;
  --plainmark-footnote-definition-color: var(--plainmark-muted-color, var(--vscode-descriptionForeground, inherit));
  --plainmark-footnote-label-opacity: 0.6;
  --plainmark-footnote-popover-background: var(--plainmark-popover-background, var(--vscode-editorHoverWidget-background, var(--vscode-editor-background)));
  --plainmark-footnote-popover-border: var(--plainmark-popover-border-color, var(--vscode-editorHoverWidget-border, currentColor));

  /* Horizontal rule */
  --plainmark-hr-color: var(--vscode-textSeparator-foreground, var(--vscode-contrastBorder, currentColor));
  --plainmark-hr-width: 1px;
  --plainmark-hr-padding-y: 0.4em;

  /* Fenced code blocks */
  --plainmark-fenced-code-padding-x: 1em;
  --plainmark-fenced-code-padding-y: 0.5em;
  --plainmark-fenced-code-margin-x: 0px;
  --plainmark-fenced-code-border-radius: 6px;
  --plainmark-fenced-code-line-height: 1.45;
  --plainmark-fenced-code-size: 1em;
  --plainmark-fenced-code-language-label-color: var(--plainmark-muted-color, var(--vscode-descriptionForeground, currentColor));
  --plainmark-fenced-code-language-label-size: 0.75em;

  /* Frontmatter — chained defaults via --plainmark-fenced-code-* / --plainmark-code-* */
  --plainmark-frontmatter-background: var(--plainmark-code-background, var(--vscode-textCodeBlock-background, var(--vscode-textPreformat-background, transparent)));
  --plainmark-frontmatter-color: var(--plainmark-code-color, var(--vscode-foreground, inherit));
  --plainmark-frontmatter-padding-x: var(--plainmark-fenced-code-padding-x, 1em);
  --plainmark-frontmatter-padding-y: var(--plainmark-fenced-code-padding-y, 0.5em);
  --plainmark-frontmatter-margin-x: var(--plainmark-fenced-code-margin-x, 0px);
  --plainmark-frontmatter-line-height: var(--plainmark-fenced-code-line-height, 1.5);
  --plainmark-frontmatter-size: var(--plainmark-fenced-code-size, 0.9em);
  --plainmark-frontmatter-language-label-color: var(--plainmark-fenced-code-language-label-color, var(--vscode-descriptionForeground, currentColor));
  --plainmark-frontmatter-language-label-size: var(--plainmark-fenced-code-language-label-size, 0.75em);

  /* HTML blocks and inline raw HTML — block chrome chains via --plainmark-fenced-code-* / --plainmark-code-*; inline is typography-only (inline-code idiom). */
  --plainmark-html-background: var(--plainmark-code-background, var(--vscode-textCodeBlock-background, var(--vscode-textPreformat-background, transparent)));
  --plainmark-html-color: var(--plainmark-code-color, var(--vscode-foreground, inherit));
  --plainmark-html-padding-x: var(--plainmark-fenced-code-padding-x, 1em);
  --plainmark-html-padding-y: var(--plainmark-fenced-code-padding-y, 0.5em);
  --plainmark-html-margin-x: var(--plainmark-fenced-code-margin-x, 0px);
  --plainmark-html-line-height: var(--plainmark-fenced-code-line-height, 1.5);
  --plainmark-html-size: var(--plainmark-fenced-code-size, 0.9em);
  --plainmark-html-inline-color: var(--plainmark-html-color, var(--plainmark-code-color, inherit));
  --plainmark-html-inline-font-family: var(--plainmark-font-code, monospace);
  --plainmark-html-inline-size: var(--plainmark-html-size, 0.9em);

  /* Container — no --vscode-* chain; VS Code exposes no readable-line-width primitive. Override max-width to 'none' for full-pane (VS Code preview convention); override padding-inline to 0 to flush prose to the pane edges. */
  --plainmark-container-max-width: 1100px;
  --plainmark-container-padding-inline: 24px;

  /* Body typography — no --vscode-* chain; VS Code editor font-size is 12px (macOS) / 14px (Linux/Windows) and underdelivers vs GitHub's 16px baseline. Hard-coded 16px is the prevailing pattern across MPE, github-markdown-css, Typora, and Obsidian, and is CM6-safe for content font overrides. */
  --plainmark-font-size: 16px;
  --plainmark-body-line-height: 1.5;

  /* Selection and caret — selection-background is the wash actually painted (the clipped selection layer sits above text, so the value must stay translucent); the 40% mix lives here, not at the consumption site, so themes/users pin final colors with their own alpha. */
  --plainmark-selection-background: color-mix(in srgb, var(--vscode-editor-selectionBackground, rgb(0, 102, 204)) 40%, transparent);
  --plainmark-cursor-color: var(--vscode-editorCursor-foreground, currentColor);

  /* Mermaid — node-background/-border-color are read at render time via getComputedStyle and baked into the SVG (no CSS rule consumes them); the rest is widget chrome. */
  --plainmark-mermaid-padding: 0.5em 0;
  --plainmark-mermaid-background: transparent;
  --plainmark-mermaid-align: center;
  --plainmark-mermaid-pending-opacity: 0.5;
  --plainmark-mermaid-error-color: var(--vscode-errorForeground, #f14c4c);
  --plainmark-mermaid-node-background: var(--vscode-editorWidget-background);
  --plainmark-mermaid-node-border-color: var(--vscode-widget-border);
  --plainmark-mermaid-preview-background: var(--plainmark-popover-background, var(--vscode-editorHoverWidget-background, var(--vscode-editor-background)));
  --plainmark-mermaid-preview-border: var(--plainmark-popover-border-color, var(--vscode-editorHoverWidget-border, currentColor));

  /* Autocomplete popup — shared completion tooltip (latex / callout / table sources); panel chrome chains the popover pair, selected row and scrollbar thumb chain the suggest-widget / scrollbar tokens. */
  --plainmark-autocomplete-background: var(--plainmark-popover-background, var(--vscode-editorHoverWidget-background, var(--vscode-editor-background)));
  --plainmark-autocomplete-border-color: var(--plainmark-popover-border-color, var(--vscode-editorHoverWidget-border, currentColor));
  --plainmark-autocomplete-selected-background: var(--vscode-editorSuggestWidget-selectedBackground, rgba(0, 102, 204, 0.5));
  --plainmark-autocomplete-selected-foreground: var(--vscode-editorSuggestWidget-selectedForeground, inherit);
  --plainmark-autocomplete-scrollbar-thumb-color: var(--vscode-scrollbarSlider-background, rgba(121, 121, 121, 0.4));

  /* Syntax token palette — light defaults; dark overrides in body.vscode-dark below. Values aligned with VS Code Light+ TextMate theme. */
  --plainmark-syntax-keyword-color: #0000ff;
  --plainmark-syntax-comment-color: #008000;
  --plainmark-syntax-string-color: #a31515;
  --plainmark-syntax-number-color: #098658;
  --plainmark-syntax-function-color: #795e26;
  --plainmark-syntax-variable-color: #001080;
  --plainmark-syntax-type-color: #267f99;
  --plainmark-syntax-property-color: #001080;
  --plainmark-syntax-tag-color: #800000;
  --plainmark-syntax-meta-color: #000000;
  --plainmark-syntax-punctuation-color: #000000;
  --plainmark-syntax-invalid-color: #cd3131;
}
/* Bound the editor to the viewport so .cm-scroller (not the page body) is the scroll container — CM6's scroll-stabilization measure loop only engages when it owns the scroller, otherwise a fast scrollbar drag flashes the viewport back on release. */
html, body { height: 100%; margin: 0; }
#editor { height: 100%; }

/* root-alias consumption — body covers the full document surface even where .cm-editor doesn't reach; defaults resolve to the values VS Code's webview already paints, so this is a no-op until a user stylesheet overrides the alias. */
body {
  background-color: var(--plainmark-editor-background, var(--vscode-editor-background));
  color: var(--plainmark-editor-foreground, var(--vscode-editor-foreground));
}
body.vscode-dark {
  /* Syntax token palette — dark overrides, aligned with VS Code Dark+ TextMate theme. */
  --plainmark-syntax-keyword-color: #569cd6;
  --plainmark-syntax-comment-color: #6a9955;
  --plainmark-syntax-string-color: #ce9178;
  --plainmark-syntax-number-color: #b5cea8;
  --plainmark-syntax-function-color: #dcdcaa;
  --plainmark-syntax-variable-color: #9cdcfe;
  --plainmark-syntax-type-color: #4ec9b0;
  --plainmark-syntax-property-color: #9cdcfe;
  --plainmark-syntax-tag-color: #569cd6;
  --plainmark-syntax-meta-color: #c586c0;
  --plainmark-syntax-punctuation-color: #d4d4d4;
  --plainmark-syntax-invalid-color: #f48771;
}
`;
