// Values from github-markdown-css v5.9.0 (e494017) + @primer/primitives 11.9.0.
// Only vars whose root default chains
// to --vscode-* (or diverges from its --plainmark-* chain) are pinned; vars chaining
// to pinned --plainmark-* primitives resolve through them at use time.
// No backticks inside this template literal — a stray one silently turns the export into a boolean comparison (THEME-D-6)
export const GITHUB_LIGHT_CSS = `:root {
  --plainmark-editor-background: #ffffff;
  --plainmark-editor-foreground: #1f2328;
  --plainmark-editor-scrollbar-thumb-color: #d1d9e0;
  --plainmark-font-text: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
  --plainmark-font-code: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
  --plainmark-code-background: #f6f8fa;
  --plainmark-code-color: #1f2328;
  --plainmark-muted-color: #59636e;
  --plainmark-popover-background: #ffffff;
  --plainmark-popover-border-color: #d1d9e0;
  --plainmark-table-border-color: #d1d9e0;
  --plainmark-table-row-alt-background: #f6f8fa;
  --plainmark-inline-code-background: #818b981f;
  --plainmark-inline-code-border-color: transparent;
  --plainmark-heading-border-color: #d1d9e0b3;
  --plainmark-link-color: #0969da;
  --plainmark-link-color-hover: #0969da;
  --plainmark-task-checkbox-background: #ffffff;
  --plainmark-task-checkbox-border-color: #d1d9e0;
  --plainmark-task-checkbox-mark-color: #1f2328;
  --plainmark-blockquote-color: #59636e;
  --plainmark-blockquote-background: transparent;
  --plainmark-blockquote-border-color: #d1d9e0;
  --plainmark-callout-note-color: #0969da;
  --plainmark-callout-tip-color: #1a7f37;
  --plainmark-callout-important-color: #8250df;
  --plainmark-callout-warning-color: #9a6700;
  --plainmark-callout-caution-color: #d1242f;
  --plainmark-footnote-marker-color: #0969da;
  --plainmark-footnote-marker-broken-color: #d1242f;
  --plainmark-hr-color: #d1d9e0;
  --plainmark-mermaid-error-color: #d1242f;
  --plainmark-mermaid-node-background: #f6f8fa;
  --plainmark-mermaid-node-border-color: #d1d9e0;
  --plainmark-autocomplete-selected-background: #0969da;
  --plainmark-autocomplete-selected-foreground: #ffffff;
  --plainmark-autocomplete-scrollbar-thumb-color: #d1d9e0;
  --plainmark-selection-background: #0969da33;
  --plainmark-cursor-color: #1f2328;

  --plainmark-syntax-keyword-color: #cf222e;
  --plainmark-syntax-comment-color: #59636e;
  --plainmark-syntax-string-color: #0a3069;
  --plainmark-syntax-number-color: #0550ae;
  --plainmark-syntax-function-color: #6639ba;
  --plainmark-syntax-variable-color: #953800;
  --plainmark-syntax-type-color: #6639ba;
  --plainmark-syntax-property-color: #1f2328;
  --plainmark-syntax-tag-color: #0550ae;
  --plainmark-syntax-meta-color: #8250df;
  --plainmark-syntax-punctuation-color: #1f2328;
  --plainmark-syntax-invalid-color: #d1242f;
}
/* Fixed appearance: repeat tokens at body.vscode-* specificity so this block (later source order) out-cascades root_defaults' body.vscode-dark overrides while user CSS using the same idiom still wins. */
body.vscode-light, body.vscode-dark, body.vscode-high-contrast, body.vscode-high-contrast-light {
  --plainmark-syntax-keyword-color: #cf222e;
  --plainmark-syntax-comment-color: #59636e;
  --plainmark-syntax-string-color: #0a3069;
  --plainmark-syntax-number-color: #0550ae;
  --plainmark-syntax-function-color: #6639ba;
  --plainmark-syntax-variable-color: #953800;
  --plainmark-syntax-type-color: #6639ba;
  --plainmark-syntax-property-color: #1f2328;
  --plainmark-syntax-tag-color: #0550ae;
  --plainmark-syntax-meta-color: #8250df;
  --plainmark-syntax-punctuation-color: #1f2328;
  --plainmark-syntax-invalid-color: #d1242f;
}
`;
