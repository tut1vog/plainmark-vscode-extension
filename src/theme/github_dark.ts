// Values from github-markdown-css v5.9.0 (e494017) + @primer/primitives 11.9.0.
// Only vars whose root default chains
// to --vscode-* (or diverges from its --plainmark-* chain) are pinned; vars chaining
// to pinned --plainmark-* primitives resolve through them at use time.
// No backticks inside this template literal — a stray one silently turns the export into a boolean comparison (THEME-D-6)
export const GITHUB_DARK_CSS = `:root {
  --plainmark-editor-background: #0d1117;
  --plainmark-editor-foreground: #f0f6fc;
  --plainmark-editor-scrollbar-thumb-color: #3d444d;
  --plainmark-font-text: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
  --plainmark-font-code: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
  --plainmark-code-background: #151b23;
  --plainmark-code-color: #f0f6fc;
  --plainmark-muted-color: #9198a1;
  --plainmark-popover-background: #010409;
  --plainmark-popover-border-color: #3d444d;
  --plainmark-table-border-color: #3d444d;
  --plainmark-table-row-alt-background: #151b23;
  --plainmark-inline-code-background: #656c7633;
  --plainmark-inline-code-border-color: transparent;
  --plainmark-heading-border-color: #3d444db3;
  --plainmark-link-color: #4493f8;
  --plainmark-link-color-hover: #4493f8;
  --plainmark-task-checkbox-background: #0d1117;
  --plainmark-task-checkbox-border-color: #3d444d;
  --plainmark-task-checkbox-mark-color: #f0f6fc;
  --plainmark-blockquote-color: #9198a1;
  --plainmark-blockquote-background: transparent;
  --plainmark-blockquote-border-color: #3d444d;
  --plainmark-callout-note-color: #4493f8;
  --plainmark-callout-tip-color: #3fb950;
  --plainmark-callout-important-color: #ab7df8;
  --plainmark-callout-warning-color: #d29922;
  --plainmark-callout-caution-color: #f85149;
  --plainmark-footnote-marker-color: #4493f8;
  --plainmark-footnote-marker-broken-color: #f85149;
  --plainmark-hr-color: #3d444d;
  --plainmark-mermaid-error-color: #f85149;
  --plainmark-mermaid-node-background: #151b23;
  --plainmark-mermaid-node-border-color: #3d444d;
  --plainmark-autocomplete-selected-background: #1f6feb;
  --plainmark-autocomplete-selected-foreground: #ffffff;
  --plainmark-autocomplete-scrollbar-thumb-color: #3d444d;
  --plainmark-selection-background: #1f6febb3;
  --plainmark-cursor-color: #f0f6fc;

  --plainmark-syntax-keyword-color: #ff7b72;
  --plainmark-syntax-comment-color: #9198a1;
  --plainmark-syntax-string-color: #a5d6ff;
  --plainmark-syntax-number-color: #79c0ff;
  --plainmark-syntax-function-color: #d2a8ff;
  --plainmark-syntax-variable-color: #ffa657;
  --plainmark-syntax-type-color: #d2a8ff;
  --plainmark-syntax-property-color: #f0f6fc;
  --plainmark-syntax-tag-color: #7ee787;
  --plainmark-syntax-meta-color: #d2a8ff;
  --plainmark-syntax-punctuation-color: #f0f6fc;
  --plainmark-syntax-invalid-color: #f85149;
}
/* Fixed appearance: repeat tokens at body.vscode-* specificity so this block (later source order) out-cascades root_defaults' body.vscode-dark overrides while user CSS using the same idiom still wins. */
body.vscode-light, body.vscode-dark, body.vscode-high-contrast, body.vscode-high-contrast-light {
  --plainmark-syntax-keyword-color: #ff7b72;
  --plainmark-syntax-comment-color: #9198a1;
  --plainmark-syntax-string-color: #a5d6ff;
  --plainmark-syntax-number-color: #79c0ff;
  --plainmark-syntax-function-color: #d2a8ff;
  --plainmark-syntax-variable-color: #ffa657;
  --plainmark-syntax-type-color: #d2a8ff;
  --plainmark-syntax-property-color: #f0f6fc;
  --plainmark-syntax-tag-color: #7ee787;
  --plainmark-syntax-meta-color: #d2a8ff;
  --plainmark-syntax-punctuation-color: #f0f6fc;
  --plainmark-syntax-invalid-color: #f85149;
}
`;
