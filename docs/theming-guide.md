# Plainmark Theming Guide

Every visual property in Plainmark is driven by a `--plainmark-*` CSS custom property. To re-theme anything — from the H1 size to the blockquote accent bar — you override variables from your own CSS file. You never edit the extension.

## Quick start

1. Create a CSS file, e.g. `.vscode/plainmark.css` in your workspace:

   ```css
   :root {
     --plainmark-h1-size: 2.5em;
     --plainmark-editor-background: #f4ecd8; /* sepia page, Plainmark only */
   }
   ```

2. Point the `plainmark.styles` setting at it (workspace or user `settings.json`):

   ```jsonc
   "plainmark.styles": ["./.vscode/plainmark.css"]
   ```

3. Edits to the CSS file apply **live on save** — no reload, cursor stays put. (Changing the `plainmark.styles` *setting itself* reloads the editor view.)

A ready-made starting point lives at [`docs/examples/starter-theme.css`](examples/starter-theme.css) — copy it into your workspace and edit.

Accepted path forms: workspace-relative (`./.vscode/plainmark.css`), absolute, or `file:` URIs. Remote `https://` stylesheets are declined by design, and remote `@font-face url(...)` does not load.

## Built-in themes

Plainmark ships three fixed-palette themes alongside the adaptive default. Run **Plainmark: Select Theme** from the command palette, or set `plainmark.theme`:

| Theme | Setting value | Appearance |
| --- | --- | --- |
| Default | `default` | Adapts to the active VS Code color theme |
| GitHub Light | `github-light` | GitHub's light palette (Primer Light default), regardless of the VS Code color theme |
| GitHub Dark | `github-dark` | GitHub's dark palette (Primer Dark default), regardless of the VS Code color theme |
| Claudify | `claudify` | Anthropic-inspired warm cream page with a terracotta accent and serif headings, regardless of the VS Code color theme |

The picker writes `plainmark.theme` to your **user settings**, so one pick applies across all folders; set it in a workspace's `.vscode/settings.json` to override per-workspace. A theme is a bundle of `--plainmark-*` values injected between the built-in defaults and your `plainmark.styles` files — your CSS still overrides the theme, variable by variable.

Two consequences of the fixed palette while a GitHub theme is active:

- `workbench.colorCustomizations` no longer reaches the themed variables — their `--vscode-*` chains are replaced by fixed values. Use `plainmark.styles` to adjust them.
- The theme pins the syntax tokens under the `body.vscode-*` classes so the palette holds in any VS Code color mode. To override a syntax token on top of a GitHub theme, scope your override to the body classes too (see "Light, dark, and high contrast") — a plain `:root` declaration loses to the theme's mode-scoped token block.

## How overrides cascade

Lowest to highest precedence:

1. **Plainmark's built-in defaults** (the values in the reference below).
2. **The built-in theme** selected by `plainmark.theme` (`default` injects nothing).
3. **`plainmark.styles` from user-scope** settings.
4. **`plainmark.styles` from workspace-scope** settings.

Within your CSS, normal cascade rules apply — declare variables in `:root` for both modes, or scope them to a mode (see next section).

Many defaults chain to VS Code's own `--vscode-*` theme colors (you can see the chains in the reference tables). Those pick up your color theme — and your `workbench.colorCustomizations` — automatically. Overriding e.g. `"workbench.colorCustomizations": { "textLink.foreground": "#c9510c" }` recolors links in Plainmark *and* the rest of VS Code; overriding `--plainmark-link-color` in a `plainmark.styles` file recolors Plainmark only.

## Light, dark, and high contrast

VS Code puts a class on the webview `<body>` for the active theme kind. Scope mode-specific values to it:

```css
:root {
  --plainmark-table-row-alt-background: color-mix(in srgb, var(--vscode-foreground) 4%, transparent);
}
body.vscode-dark {
  --plainmark-table-row-alt-background: color-mix(in srgb, var(--vscode-foreground) 6%, transparent);
}
```

Available classes: `vscode-light`, `vscode-dark`, `vscode-high-contrast`, `vscode-high-contrast-light`. There is no `prefers-color-scheme` in VS Code webviews — use the body classes.

## What is stable API

**Only `--plainmark-*` variable names are stable.** Once published, a variable keeps working in every later release. CSS class names (`.plainmark-*`), `data-*` attributes, and the DOM structure are internal — selectors targeting them may break in any update without notice. Build themes on variables.

## Workspace trust

On VS Code Desktop, workspace-scope `plainmark.styles` entries only apply in a **trusted** workspace (CSS is injected content). In Restricted Mode the workspace entries are ignored and user-scope entries still apply; granting trust applies the workspace styles immediately.

## Useful single knobs

| Override | Effect |
| --- | --- |
| `--plainmark-editor-background` / `--plainmark-editor-foreground` | Re-skin the Plainmark page without touching the rest of VS Code |
| `--plainmark-font-text` / `--plainmark-font-size` | Body typeface and base size (default 16px) |
| `--plainmark-muted-color` | Every dimmed surface at once: link/list markers, checked tasks, footnote definitions, code language labels |
| `--plainmark-code-background` / `--plainmark-code-color` | Inline code *and* fenced code blocks together |
| `--plainmark-popover-background` / `--plainmark-popover-border-color` | Footnote popover + mermaid preview + autocomplete popup panels |
| `--plainmark-container-max-width` | Prose column width (default `1100px`; `none` for full-pane) |

Per-construct variables always win over these when both are set.

## Variable reference

Names follow one rule: `--plainmark-<construct>[-<sub-construct>]-<property>[-<state>]` — so `--plainmark-table-header-weight` is the table header's font weight. Common suffixes: `-color` (text/foreground), `-background`, `-border-color`, `-size`, `-weight`, `-padding`/`-padding-x`/`-padding-y`, `-margin`. Defaults shown are the shipped values; `var(--vscode-…)` chains follow your VS Code theme. Tokens marked *separate dark default ships* switch automatically with the theme kind.

<!-- DRIFT-GUARD: the tables below are verified against ROOT_DEFAULTS_CSS by src/theme/theming_guide.test.ts — update both together. -->

### Document-wide primitives

| Variable | Default |
| --- | --- |
| `--plainmark-editor-background` | `var(--vscode-editor-background)` |
| `--plainmark-editor-foreground` | `var(--vscode-editor-foreground)` |
| `--plainmark-editor-scrollbar-thumb-color` | `var(--vscode-scrollbarSlider-background, rgba(121, 121, 121, 0.4))` — the editor scrollbar thumb; the track is transparent so `--plainmark-editor-background` shows through |
| `--plainmark-font-text` | `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"` |
| `--plainmark-font-code` | `var(--vscode-editor-font-family)` |
| `--plainmark-code-background` | `var(--vscode-textCodeBlock-background, var(--vscode-textPreformat-background, transparent))` |
| `--plainmark-code-color` | `var(--vscode-foreground, inherit)` |
| `--plainmark-selection-background` | `color-mix(in srgb, var(--vscode-editor-selectionBackground, rgb(0, 102, 204)) 40%, transparent)` — the wash actually painted; keep it translucent (it paints above the text) |
| `--plainmark-cursor-color` | `var(--vscode-editorCursor-foreground, currentColor)` |

### Cross-cutting primitives

| Variable | Default |
| --- | --- |
| `--plainmark-muted-color` | `var(--vscode-descriptionForeground, currentColor)` |
| `--plainmark-popover-background` | `var(--vscode-editorHoverWidget-background, var(--vscode-editor-background))` |
| `--plainmark-popover-border-color` | `var(--vscode-editorHoverWidget-border, currentColor)` |

### Images

| Variable | Default |
| --- | --- |
| `--plainmark-image-max-width` | `100%` |
| `--plainmark-image-max-height` | `none` |

### Math

| Variable | Default |
| --- | --- |
| `--plainmark-math-color` | `inherit` |
| `--plainmark-math-size` | `1.21em` |
| `--plainmark-math-padding` | `0.25em 0` |
| `--plainmark-math-align` | `center` |
| `--plainmark-math-pending-opacity` | `0.5` |
| `--plainmark-math-preview-size` | `1.3em` |

### Tables

| Variable | Default |
| --- | --- |
| `--plainmark-table-margin` | `0.5em 0` |
| `--plainmark-table-width` | `100%` |
| `--plainmark-table-layout` | `auto` |
| `--plainmark-table-border-color` | `var(--vscode-widget-border, currentColor)` |
| `--plainmark-table-cell-padding` | `6px 13px` |
| `--plainmark-table-cell-min-width` | `2em` |
| `--plainmark-table-cell-word-break` | `normal` |
| `--plainmark-table-cell-overflow-wrap` | `break-word` |
| `--plainmark-table-header-weight` | `600` |
| `--plainmark-table-row-alt-background` | `color-mix(in srgb, var(--vscode-foreground) 4%, transparent)` |

### Inline text styles (bold, italic, strikethrough, inline code)

| Variable | Default |
| --- | --- |
| `--plainmark-strong-color` | `inherit` |
| `--plainmark-strong-weight` | `600` |
| `--plainmark-em-color` | `inherit` |
| `--plainmark-em-style` | `italic` |
| `--plainmark-strikethrough-color` | `inherit` |
| `--plainmark-strikethrough-decoration` | `line-through` |
| `--plainmark-inline-code-color` | `var(--plainmark-code-color, var(--vscode-textPreformat-foreground, inherit))` |
| `--plainmark-inline-code-background` | `var(--plainmark-code-background, var(--vscode-textPreformat-background, var(--vscode-textCodeBlock-background, transparent)))` |
| `--plainmark-inline-code-border-color` | `var(--vscode-textPreformat-border, transparent)` |
| `--plainmark-inline-code-padding` | `0.2em 0.4em` |
| `--plainmark-inline-code-border-radius` | `6px` |
| `--plainmark-inline-code-font-family` | `var(--plainmark-font-code, monospace)` |
| `--plainmark-inline-code-font-size` | `85%` |

### Headings

| Variable | Default |
| --- | --- |
| `--plainmark-heading-color` | `inherit` |
| `--plainmark-heading-font-family` | `inherit` |
| `--plainmark-heading-line-height` | `1.5` |
| `--plainmark-heading-padding-top` | `0.4em` |
| `--plainmark-heading-padding-bottom` | `0.3em` |
| `--plainmark-heading-border-color` | `var(--vscode-textSeparator-foreground, color-mix(in srgb, var(--vscode-foreground) 35%, transparent))` |
| `--plainmark-heading-border-width` | `1px` |
| `--plainmark-h1-size` | `2em` |
| `--plainmark-h1-weight` | `600` |
| `--plainmark-h2-size` | `1.5em` |
| `--plainmark-h2-weight` | `600` |
| `--plainmark-h3-size` | `1.25em` |
| `--plainmark-h3-weight` | `600` |
| `--plainmark-h4-size` | `1em` |
| `--plainmark-h4-weight` | `600` |
| `--plainmark-h5-size` | `0.875em` |
| `--plainmark-h5-weight` | `600` |
| `--plainmark-h6-size` | `0.85em` |
| `--plainmark-h6-weight` | `600` |

### Links

| Variable | Default |
| --- | --- |
| `--plainmark-link-color` | `var(--vscode-textLink-foreground, currentColor)` |
| `--plainmark-link-color-hover` | `var(--vscode-textLink-activeForeground, var(--vscode-textLink-foreground, currentColor))` |
| `--plainmark-link-decoration` | `underline` |
| `--plainmark-link-decoration-hover` | `underline` |
| `--plainmark-link-marker-color` | `var(--plainmark-muted-color, var(--vscode-descriptionForeground, currentColor))` |
| `--plainmark-link-cursor` | `text` |

### Lists & task lists

| Variable | Default |
| --- | --- |
| `--plainmark-list-marker-color` | `var(--plainmark-muted-color, var(--vscode-descriptionForeground, currentColor))` |
| `--plainmark-list-bullet-size` | `0.3em` |
| `--plainmark-list-bullet-2-size` | `0.3em` |
| `--plainmark-list-bullet-3-size` | `0.26em` |
| `--plainmark-list-item-spacing` | `0.25em` |

> **Retired variables:** `--plainmark-list-bullet`, `--plainmark-list-bullet-2`, and `--plainmark-list-bullet-3` (character glyph overrides) no longer have any effect. Bullet markers are now drawn as font-independent shapes so they render identically on every platform; use the `-size` variables above and `--plainmark-list-marker-color` to tune them.
| `--plainmark-task-checkbox-size` | `0.85em` |
| `--plainmark-task-checkbox-background` | `var(--vscode-checkbox-background, transparent)` |
| `--plainmark-task-checkbox-border-color` | `var(--vscode-checkbox-border, currentColor)` |
| `--plainmark-task-checkbox-mark-color` | `var(--vscode-checkbox-foreground, currentColor)` |
| `--plainmark-task-checked-color` | `var(--plainmark-muted-color, var(--vscode-descriptionForeground, inherit))` |
| `--plainmark-task-checked-decoration` | `line-through` |

### Blockquotes

| Variable | Default |
| --- | --- |
| `--plainmark-blockquote-color` | `color-mix(in srgb, var(--vscode-foreground, currentColor) 70%, transparent)` |
| `--plainmark-blockquote-background` | `color-mix(in srgb, var(--vscode-foreground) 5%, transparent)` |
| `--plainmark-blockquote-border-color` | `color-mix(in srgb, var(--vscode-foreground) 30%, transparent)` |
| `--plainmark-blockquote-border-width` | `4px` |
| `--plainmark-blockquote-padding-y` | `0.25em` |
| `--plainmark-blockquote-indent-per-depth` | `1em` |
| `--plainmark-blockquote-text-gap` | `0.5em` |
| `--plainmark-blockquote-style` | `normal` |

### Callouts

| Variable | Default |
| --- | --- |
| `--plainmark-callout-padding-x` | `1em` |
| `--plainmark-callout-padding-y` | `0.5em` |
| `--plainmark-callout-margin-x` | `0px` |
| `--plainmark-callout-border-width` | `4px` |
| `--plainmark-callout-title-weight` | `500` |
| `--plainmark-callout-title-size` | `1em` |
| `--plainmark-callout-title-padding-bottom` | `0.25em` |
| `--plainmark-callout-note-color` | `var(--vscode-charts-blue, #4dafff)` |
| `--plainmark-callout-tip-color` | `var(--vscode-charts-green, #89d185)` |
| `--plainmark-callout-important-color` | `var(--vscode-charts-purple, #b180d7)` |
| `--plainmark-callout-warning-color` | `var(--vscode-charts-yellow, #cca700)` |
| `--plainmark-callout-caution-color` | `var(--vscode-charts-red, #f48771)` |
| `--plainmark-callout-unknown-color` | `var(--plainmark-muted-color, var(--vscode-descriptionForeground, currentColor))` |
| `--plainmark-callout-note-background` | `color-mix(in srgb, var(--plainmark-callout-note-color) 10%, transparent)` |
| `--plainmark-callout-note-border-color` | `var(--plainmark-callout-note-color)` |
| `--plainmark-callout-note-title-color` | `var(--plainmark-callout-note-color)` |
| `--plainmark-callout-tip-background` | `color-mix(in srgb, var(--plainmark-callout-tip-color) 10%, transparent)` |
| `--plainmark-callout-tip-border-color` | `var(--plainmark-callout-tip-color)` |
| `--plainmark-callout-tip-title-color` | `var(--plainmark-callout-tip-color)` |
| `--plainmark-callout-important-background` | `color-mix(in srgb, var(--plainmark-callout-important-color) 10%, transparent)` |
| `--plainmark-callout-important-border-color` | `var(--plainmark-callout-important-color)` |
| `--plainmark-callout-important-title-color` | `var(--plainmark-callout-important-color)` |
| `--plainmark-callout-warning-background` | `color-mix(in srgb, var(--plainmark-callout-warning-color) 10%, transparent)` |
| `--plainmark-callout-warning-border-color` | `var(--plainmark-callout-warning-color)` |
| `--plainmark-callout-warning-title-color` | `var(--plainmark-callout-warning-color)` |
| `--plainmark-callout-caution-background` | `color-mix(in srgb, var(--plainmark-callout-caution-color) 10%, transparent)` |
| `--plainmark-callout-caution-border-color` | `var(--plainmark-callout-caution-color)` |
| `--plainmark-callout-caution-title-color` | `var(--plainmark-callout-caution-color)` |
| `--plainmark-callout-unknown-background` | `color-mix(in srgb, var(--plainmark-callout-unknown-color) 10%, transparent)` |
| `--plainmark-callout-unknown-border-color` | `var(--plainmark-callout-unknown-color)` |
| `--plainmark-callout-unknown-title-color` | `var(--plainmark-callout-unknown-color)` |

### Footnotes

| Variable | Default |
| --- | --- |
| `--plainmark-footnote-size` | `0.75em` |
| `--plainmark-footnote-marker-color` | `var(--vscode-textLink-foreground, currentColor)` |
| `--plainmark-footnote-marker-broken-color` | `var(--vscode-errorForeground, currentColor)` |
| `--plainmark-footnote-definition-background` | `transparent` |
| `--plainmark-footnote-definition-padding` | `0.5em 1em` |
| `--plainmark-footnote-definition-color` | `var(--plainmark-muted-color, var(--vscode-descriptionForeground, inherit))` |
| `--plainmark-footnote-label-opacity` | `0.6` |
| `--plainmark-footnote-popover-background` | `var(--plainmark-popover-background, var(--vscode-editorHoverWidget-background, var(--vscode-editor-background)))` |
| `--plainmark-footnote-popover-border` | `var(--plainmark-popover-border-color, var(--vscode-editorHoverWidget-border, currentColor))` |

### Horizontal rules

| Variable | Default |
| --- | --- |
| `--plainmark-hr-color` | `var(--vscode-textSeparator-foreground, var(--vscode-contrastBorder, currentColor))` |
| `--plainmark-hr-width` | `1px` |
| `--plainmark-hr-padding-y` | `0.4em` |

### Fenced code blocks

| Variable | Default |
| --- | --- |
| `--plainmark-fenced-code-padding-x` | `1em` |
| `--plainmark-fenced-code-padding-y` | `0.5em` |
| `--plainmark-fenced-code-margin-x` | `0px` |
| `--plainmark-fenced-code-border-radius` | `6px` |
| `--plainmark-fenced-code-line-height` | `1.45` |
| `--plainmark-fenced-code-size` | `1em` |
| `--plainmark-fenced-code-language-label-color` | `var(--plainmark-muted-color, var(--vscode-descriptionForeground, currentColor))` |
| `--plainmark-fenced-code-language-label-size` | `0.75em` |

### Frontmatter

| Variable | Default |
| --- | --- |
| `--plainmark-frontmatter-background` | `var(--plainmark-code-background, var(--vscode-textCodeBlock-background, var(--vscode-textPreformat-background, transparent)))` |
| `--plainmark-frontmatter-color` | `var(--plainmark-code-color, var(--vscode-foreground, inherit))` |
| `--plainmark-frontmatter-padding-x` | `var(--plainmark-fenced-code-padding-x, 1em)` |
| `--plainmark-frontmatter-padding-y` | `var(--plainmark-fenced-code-padding-y, 0.5em)` |
| `--plainmark-frontmatter-margin-x` | `var(--plainmark-fenced-code-margin-x, 0px)` |
| `--plainmark-frontmatter-line-height` | `var(--plainmark-fenced-code-line-height, 1.5)` |
| `--plainmark-frontmatter-size` | `var(--plainmark-fenced-code-size, 0.9em)` |
| `--plainmark-frontmatter-language-label-color` | `var(--plainmark-fenced-code-language-label-color, var(--vscode-descriptionForeground, currentColor))` |
| `--plainmark-frontmatter-language-label-size` | `var(--plainmark-fenced-code-language-label-size, 0.75em)` |

### HTML blocks & inline raw HTML

| Variable | Default |
| --- | --- |
| `--plainmark-html-background` | `var(--plainmark-code-background, var(--vscode-textCodeBlock-background, var(--vscode-textPreformat-background, transparent)))` |
| `--plainmark-html-color` | `var(--plainmark-code-color, var(--vscode-foreground, inherit))` |
| `--plainmark-html-padding-x` | `var(--plainmark-fenced-code-padding-x, 1em)` |
| `--plainmark-html-padding-y` | `var(--plainmark-fenced-code-padding-y, 0.5em)` |
| `--plainmark-html-margin-x` | `var(--plainmark-fenced-code-margin-x, 0px)` |
| `--plainmark-html-line-height` | `var(--plainmark-fenced-code-line-height, 1.5)` |
| `--plainmark-html-size` | `var(--plainmark-fenced-code-size, 0.9em)` |
| `--plainmark-html-inline-color` | `var(--plainmark-html-color, var(--plainmark-code-color, inherit))` |
| `--plainmark-html-inline-font-family` | `var(--plainmark-font-code, monospace)` |
| `--plainmark-html-inline-size` | `var(--plainmark-html-size, 0.9em)` |

### Layout container

| Variable | Default |
| --- | --- |
| `--plainmark-container-max-width` | `1100px` |
| `--plainmark-container-padding-inline` | `24px` |

### Body typography

| Variable | Default |
| --- | --- |
| `--plainmark-font-size` | `16px` |
| `--plainmark-body-line-height` | `1.5` |
| `--plainmark-paragraph-gap` | `0.75em` |

### Mermaid diagrams (widget chrome only — diagram interiors are themed by Mermaid from the VS Code theme)

| Variable | Default |
| --- | --- |
| `--plainmark-mermaid-padding` | `0.5em 0` |
| `--plainmark-mermaid-background` | `transparent` |
| `--plainmark-mermaid-align` | `center` |
| `--plainmark-mermaid-pending-opacity` | `0.5` |
| `--plainmark-mermaid-error-color` | `var(--vscode-errorForeground, #f14c4c)` |
| `--plainmark-mermaid-node-background` | `var(--vscode-editorWidget-background)` — resolved at render time and baked into the diagram SVG; changes apply on the next re-render |
| `--plainmark-mermaid-node-border-color` | `var(--vscode-widget-border)` — resolved at render time and baked into the diagram SVG |
| `--plainmark-mermaid-preview-background` | `var(--plainmark-popover-background, var(--vscode-editorHoverWidget-background, var(--vscode-editor-background)))` |
| `--plainmark-mermaid-preview-border` | `var(--plainmark-popover-border-color, var(--vscode-editorHoverWidget-border, currentColor))` |

### Autocomplete popup (LaTeX command, callout type, and table completion list)

| Variable | Default |
| --- | --- |
| `--plainmark-autocomplete-background` | `var(--plainmark-popover-background, var(--vscode-editorHoverWidget-background, var(--vscode-editor-background)))` |
| `--plainmark-autocomplete-border-color` | `var(--plainmark-popover-border-color, var(--vscode-editorHoverWidget-border, currentColor))` |
| `--plainmark-autocomplete-selected-background` | `var(--vscode-editorSuggestWidget-selectedBackground, rgba(0, 102, 204, 0.5))` |
| `--plainmark-autocomplete-selected-foreground` | `var(--vscode-editorSuggestWidget-selectedForeground, inherit)` |
| `--plainmark-autocomplete-scrollbar-thumb-color` | `var(--vscode-scrollbarSlider-background, rgba(121, 121, 121, 0.4))` |

### Syntax highlighting palette (fenced code, frontmatter, HTML blocks; dark values ship automatically)

| Variable | Default |
| --- | --- |
| `--plainmark-syntax-keyword-color` | `#0000ff` — *separate dark default ships* |
| `--plainmark-syntax-comment-color` | `#008000` — *separate dark default ships* |
| `--plainmark-syntax-string-color` | `#a31515` — *separate dark default ships* |
| `--plainmark-syntax-number-color` | `#098658` — *separate dark default ships* |
| `--plainmark-syntax-function-color` | `#795e26` — *separate dark default ships* |
| `--plainmark-syntax-variable-color` | `#001080` — *separate dark default ships* |
| `--plainmark-syntax-type-color` | `#267f99` — *separate dark default ships* |
| `--plainmark-syntax-property-color` | `#001080` — *separate dark default ships* |
| `--plainmark-syntax-tag-color` | `#800000` — *separate dark default ships* |
| `--plainmark-syntax-meta-color` | `#000000` — *separate dark default ships* |
| `--plainmark-syntax-punctuation-color` | `#000000` — *separate dark default ships* |
| `--plainmark-syntax-invalid-color` | `#cd3131` — *separate dark default ships* |

