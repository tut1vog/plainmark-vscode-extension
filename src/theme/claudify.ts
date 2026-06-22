// Anthropic-inspired warm "cream + terracotta" palette. Source hexes from
// Anthropic's official brand guidelines (Clay #d97757, Slate #141413, warm
// neutrals Oat/Pampas/Cloud) plus a contrast-validated warm syntax set anchored
// to Solarized Light / GitHub Light: docs/research/anthropic-brand-palette-2026.md.
// Fixed appearance: no --vscode-* chains, palette holds in any VS Code color mode.
// Anthropic's display typefaces (Copernicus/Tiempos serif, Styrene sans) cannot be
// bundled, so headings fall back to a Palatino-led serif and body to a system sans.
// No backticks inside this template literal — a stray one silently turns the export into a boolean comparison (THEME-D-6)
export const CLAUDIFY_CSS = `:root {
  --plainmark-editor-background: #f0eee6;
  --plainmark-editor-foreground: #141413;
  --plainmark-editor-scrollbar-thumb-color: #c8c3b8;
  --plainmark-font-text: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
  --plainmark-font-code: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
  --plainmark-heading-font-family: "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
  --plainmark-code-background: #e8e6dc;
  --plainmark-code-color: #141413;
  --plainmark-muted-color: #73706a;
  --plainmark-popover-background: #faf9f5;
  --plainmark-popover-border-color: #d6d1c4;
  --plainmark-table-border-color: #d6d1c4;
  --plainmark-table-row-alt-background: #e8e6dc;
  --plainmark-inline-code-background: #b0aea533;
  --plainmark-inline-code-border-color: transparent;
  --plainmark-heading-border-color: #d6d1c4b3;
  --plainmark-link-color: #b5420c;
  --plainmark-link-color-hover: #8a3008;
  --plainmark-task-checkbox-background: #faf9f5;
  --plainmark-task-checkbox-border-color: #c8c3b8;
  --plainmark-task-checkbox-mark-color: #141413;
  --plainmark-blockquote-color: #73706a;
  --plainmark-blockquote-background: transparent;
  --plainmark-blockquote-border-color: #c8c3b8;
  --plainmark-callout-note-color: #0969da;
  --plainmark-callout-tip-color: #1a7f37;
  --plainmark-callout-important-color: #8250df;
  --plainmark-callout-warning-color: #9a6700;
  --plainmark-callout-caution-color: #d1242f;
  --plainmark-footnote-marker-color: #b5420c;
  --plainmark-footnote-marker-broken-color: #d1242f;
  --plainmark-hr-color: #d6d1c4;
  --plainmark-mermaid-error-color: #d1242f;
  --plainmark-mermaid-node-background: #e8e6dc;
  --plainmark-mermaid-node-border-color: #c8c3b8;
  --plainmark-autocomplete-selected-background: #b5420c;
  --plainmark-autocomplete-selected-foreground: #ffffff;
  --plainmark-autocomplete-scrollbar-thumb-color: #c8c3b8;
  --plainmark-selection-background: #cc785c38;
  --plainmark-cursor-color: #cc785c;

  --plainmark-syntax-keyword-color: #b5420c;
  --plainmark-syntax-comment-color: #7e7b72;
  --plainmark-syntax-string-color: #4d7a5a;
  --plainmark-syntax-number-color: #8a5d00;
  --plainmark-syntax-function-color: #6639ba;
  --plainmark-syntax-variable-color: #953800;
  --plainmark-syntax-type-color: #6639ba;
  --plainmark-syntax-property-color: #141413;
  --plainmark-syntax-tag-color: #3d6b47;
  --plainmark-syntax-meta-color: #8250df;
  --plainmark-syntax-punctuation-color: #141413;
  --plainmark-syntax-invalid-color: #d1242f;
}
/* Fixed appearance: repeat tokens at body.vscode-* specificity so this block (later source order) out-cascades root_defaults' body.vscode-dark overrides while user CSS using the same idiom still wins. */
body.vscode-light, body.vscode-dark, body.vscode-high-contrast, body.vscode-high-contrast-light {
  --plainmark-syntax-keyword-color: #b5420c;
  --plainmark-syntax-comment-color: #7e7b72;
  --plainmark-syntax-string-color: #4d7a5a;
  --plainmark-syntax-number-color: #8a5d00;
  --plainmark-syntax-function-color: #6639ba;
  --plainmark-syntax-variable-color: #953800;
  --plainmark-syntax-type-color: #6639ba;
  --plainmark-syntax-property-color: #141413;
  --plainmark-syntax-tag-color: #3d6b47;
  --plainmark-syntax-meta-color: #8250df;
  --plainmark-syntax-punctuation-color: #141413;
  --plainmark-syntax-invalid-color: #d1242f;
}
`;
