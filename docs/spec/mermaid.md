---
prefix: MMD
title: Mermaid diagrams
kind: construct
---

# Mermaid diagrams

Normative behavior for Mermaid diagram rendering: a fenced code block whose info
string is `mermaid` (```` ```mermaid ````) renders as a live diagram instead of a
syntax-highlighted code block.

The construct is a StateField block widget (same family as image / math /
table), built as a near-clone of the block-math widget. The
```` ```mermaid ```` fence cedes from the generic code-block chrome to the
mermaid widget: the code-block decoration layer skips a `FencedCode` whose `CodeInfo`
lower-cases to `mermaid` unless the caret is inside it (see `code-blocks.md`
CBLK-E-3). Off-caret, the whole fence-to-fence range is replaced by a block
widget showing the rendered SVG; with the caret inside, the widget is dropped so
the raw fence/source is editable, and an in-flow block-preview widget renders
below the source (Typora-style stacked source-above / render-below). Rendering is
**asynchronous**: the ~1.5 MiB Mermaid IIFE bundle is
lazy-injected via a nonce'd `<script>` on the first diagram encountered, and
`mermaid.render()` resolves into a per-document cache (`mermaid_cache_field`),
which rebuilds the decoration with the resolved SVG. Diagram colors are baked
into the SVG from VS Code theme tokens at render time, so a theme switch clears
the cache and re-renders. No mermaid widget rewrites document source bytes.

Example notation: `|` = caret, `→` = action/result, `\n` = newline (see README §2).

## R · Rendering

- **MMD-R-1** — The mermaid extension (`mermaid_extension` = `mermaid_cache_field` + `mermaid_theme_field` + `mermaid_widgets_field` + `mermaid_render_plugin` + `mermaid_theme`) MUST be registered in the production editor (`editor_extensions_core`), so it runs in both the live webview and the Tier B harness.
  _Example:_ opening a document containing ```` ```mermaid\ngraph TD\nA-->B\n``` ```` renders a diagram widget, not the raw fence source.

- **MMD-R-2** — A `FencedCode` block whose `CodeInfo` (trimmed, lowercased) equals `mermaid` and whose range does NOT overlap the main selection MUST be replaced by a `Decoration.replace({ block: true, widget: MermaidWidget })` over the whole `[node.from, node.to)` range. The diagram source is the `CodeText` child sliced verbatim (empty string if absent).
  _Example:_ ```` ```mermaid\ngraph TD\nA-->B\n``` ```` (caret outside) → one block replace widget over the fence-to-fence range; `widget.src` is `graph TD\nA-->B`.

- **MMD-R-3** `[smoke]` `[unknown]` — When the cache has no entry for the block's `(theme, src)` key, the widget MUST render a pending placeholder: a `div.plainmark-mermaid-block.plainmark-mermaid-pending` with `min-height: 1.5em` and opacity `--plainmark-mermaid-pending-opacity` (default `0.5`), and the `mermaid_render_plugin` MUST schedule a render for it.
  _Example:_ first paint of a never-rendered diagram shows a dimmed empty block, then swaps to the SVG once the render resolves.

- **MMD-R-4** `[smoke]` `[unknown]` — On a successful render (cache result `{ ok: true, svg }`) the widget MUST be a `div.plainmark-mermaid-block` whose `innerHTML` is the rendered SVG markup.
  _Example:_ `graph TD; A-->B;` resolved → `<div class="plainmark-mermaid-block"><svg…>…</svg></div>`.

- **MMD-R-5** `[smoke]` `[unknown]` — On a failed render (cache result `{ ok: false, message }`) the widget MUST be a `div.plainmark-mermaid-block.plainmark-mermaid-error` whose `textContent` is `Mermaid: <message>`, styled with `--plainmark-mermaid-error-color` (default `--vscode-errorForeground`, `#f14c4c`) in monospace; it MUST NOT throw or render Mermaid's default "bomb" error SVG (`suppressErrorRendering: true`).
  _Example:_ ```` ```mermaid\nnot a diagram\n``` ```` → `Mermaid: <parse-error message>` in a left-aligned red monospace box.

- **MMD-R-6** `[smoke]` — Diagram rendering MUST be asynchronous: `mermaid_render_plugin` (a `ViewPlugin`) collects pending blocks on doc/selection/viewport change or a `set_mermaid_result`/`set_mermaid_theme` effect, loads the bundle, calls `mermaid.render('plainmark-mermaid-<n>', src)`, and on settle dispatches `set_mermaid_result` to land the `MermaidResult` in `mermaid_cache_field`, which rebuilds the decoration; after the SVG lands `view.requestMeasure()` MUST run so CM6 reconciles the height map.
  _Example:_ the widget DOM appears synchronously as a placeholder; the SVG is written after the render promise resolves and the layout re-measures.

- **MMD-R-7** — Concurrent renders for the same `(theme, src)` key MUST be deduped via the plugin's `in_flight` `Set`; each `mermaid.render` call MUST use a unique DOM id (`plainmark-mermaid-<n>` / `plainmark-mermaid-preview-<n>`) so Mermaid's internal id namespace does not collide.
  _Example:_ two visible diagrams with the same source schedule one in-flight render; two distinct sources mint render ids `plainmark-mermaid-0`, `plainmark-mermaid-1`.

- **MMD-R-8** `[smoke]` — The block widget MUST be styled `margin: 0`, `padding: var(--plainmark-mermaid-padding, 0.5em 0)`, `text-align: var(--plainmark-mermaid-align, center)`, `background: var(--plainmark-mermaid-background, transparent)`, `overflow-x: auto`; its `svg` child MUST be `max-width: 100%; height: auto` so an oversized diagram fits the prose column and scrolls rather than clipping. The `--plainmark-mermaid-*` family is chrome-only (diagram interior colors are baked into the SVG, MMD-E-9).
  _Example:_ a wide flowchart shrinks to the content width, centered; a still-wider diagram scrolls horizontally inside the block.

## I · Interaction

- **MMD-I-1** — When the canonical reveal predicate (`should_reveal_for_selection`, MRS-R-2…R-5: any selection range touching the block range reveals, EXCEPT a non-empty selection strictly covering it on both sides; pointer-down evaluates the frozen pre-press selection) holds for the block range, the diagram replace widget MUST NOT be emitted, revealing the raw ```` ```mermaid ```` fence and source for editing; the ceded fence picks up ordinary code-block chrome (CBLK-E-3). Unified via DEF-7 (2026-06-12): select-all keeps the diagram rendered; a drag entering the block does not flash raw source mid-drag.
  _Example:_ clicking the diagram places the caret inside → raw ```` ```mermaid\ngraph TD\nA-->B\n``` ```` shown and editable; Ctrl+A keeps the diagram rendered.

- **MMD-I-2** `[smoke]` — While the block is revealed (MMD-I-1) with the **main selection a bare caret** (empty), in place of the replace widget the field MUST emit an in-flow `Decoration.widget({ block: true, side: 1, widget: MermaidBlockPreviewWidget })` anchored at `block.to`, rendering a live diagram below the editable source. It MUST self-render on a 300 ms debounce and MUST be suppressed when the selection over the block is non-empty.
  _Example:_ caret inside ```` ```mermaid\ngraph TD\nA-->B\n``` ```` → editable source with a re-rendering diagram pinned below; a partial drag-selection into the block shows raw source with no preview.

- **MMD-I-3** `[smoke]` — On a parse error while editing, the live preview MUST keep the last good render dimmed (`plainmark-mermaid-block-preview-stale`, opacity `--plainmark-mermaid-pending-opacity`) and append `Mermaid error: <message>` (`plainmark-mermaid-block-preview-error`); if there is no last-good render it shows only the error. A generation counter MUST discard a resolved render whose request has been superseded.
  _Example:_ editing a valid diagram into a broken one → the previous diagram stays dimmed with `Mermaid error: …` beneath it; fixing the syntax swaps in the new diagram.

- **MMD-I-4** — Decorations MUST be rebuilt whenever the document changes, the selection changes, or a `set_mermaid_result` / `set_mermaid_theme` effect lands; otherwise the prior decoration set is reused.
  _Example:_ moving the caret off a mermaid block re-promotes it to a diagram widget on the next transaction.

- **MMD-I-5** `[accepted]` — The widget MUST override `ignoreEvent()` to return `false` (CM6's default `true` swallows clicks), so a click on the rendered diagram places the caret inside the block and triggers the MMD-I-1 source reveal. There is no other mermaid-specific keymap, command, click callback, zoom/pan, or export affordance; in-diagram `click` directives MUST NOT execute (`securityLevel: 'strict'`).
  _Example:_ clicking the diagram reveals its source; a `click` interaction directive inside the diagram runs no script.

## SP · Source preservation

- **MMD-SP-1** `[inherits:INV-SP-1]` — Mermaid rendering MUST be decoration-only: a block `Decoration.replace` (off-caret) plus an in-flow `Decoration.widget` preview (bare caret), with no document edit. No mermaid widget re-serializes, normalizes, canonicalizes the info string, or rewrites any source byte (only the table widget may rewrite source). The fence and diagram source are preserved verbatim and re-exposed unchanged on reveal.
  _Example:_ ```` ```Mermaid\n  graph TD \n``` ```` (mixed-case info, interior indentation) opened and closed without edits saves byte-identical; revealing it shows exactly those bytes.

- **MMD-SP-2** — The diagram source handed to `mermaid.render()` is the `CodeText` slice, read-only; it feeds only the renderer and the `(theme, src)` cache key and MUST NOT be written back to the document.
  _Example:_ the ```` ``` ```` fences and info string never disappear from the document; only the rendered *view* omits them.

- **MMD-SP-3** — Bytes outside the mermaid block's range MUST be preserved verbatim across rendering and reveal.
  _Example:_ in `intro\n\n```mermaid\ngraph TD\n```\n\noutro`, promoting/revealing the diagram leaves `intro` and `outro` byte-identical.

## E · Edge cases

- **MMD-E-1** — The info-string match MUST be case-insensitive (`.trim().toLowerCase() === 'mermaid'`): `mermaid`, `Mermaid`, and `MERMAID` all select the mermaid widget.
  _Example:_ ```` ```Mermaid\ngraph TD\n``` ```` → detected as a mermaid block.

- **MMD-E-2** — Leading/trailing whitespace around the info string MUST be tolerated (trimmed before matching).
  _Example:_ ```` ``` mermaid  ```` → info resolves to `mermaid` → mermaid block.

- **MMD-E-3** `[accepted]` — A fence whose trimmed/lowered info string is not exactly `mermaid` (e.g. ```` ```mermaid foo ````) MUST NOT be treated as a mermaid block; there is no per-fence mermaid attribute syntax. It falls back to ordinary code-block chrome.
  _Example:_ ```` ```mermaid foo\ngraph TD\n``` ```` → no diagram widget; rendered as a plain code block.

- **MMD-E-4** — A non-mermaid or info-less fenced block MUST NOT emit a mermaid widget.
  _Example:_ ```` ```js\nconst x = 1;\n``` ```` and ```` ```\nplain\n``` ```` → zero mermaid widgets.

- **MMD-E-5** — Two `MermaidWidget`s MUST compare equal (`eq`) iff their `src`, `theme`, and `result` all match (null↔null placeholders equal; ok↔ok by svg; error↔error by message), letting CodeMirror reuse the DOM and avoid re-render.
  _Example:_ same `(src, theme)` and same resolved svg → `eq()` true → no re-render; a theme change or a new svg → `eq()` false → rebuild.

- **MMD-E-6** — Each diagram source MUST be cached separately per theme: a result stored under one theme's key MUST NOT satisfy a widget rendered under another theme (`mermaid_cache_key(theme, src) = theme + ':' + src`).
  _Example:_ a `light:graph TD` cache entry leaves a `dark`-theme widget for the same source still pending until its own render lands.

- **MMD-E-7** — Multiple mermaid blocks in one document MUST each emit their own widget.
  _Example:_ two ```` ```mermaid ```` blocks → two diagram widgets.

- **MMD-E-8** — The Mermaid bundle MUST be lazy-loaded via a nonce'd `<script>` injected on first diagram encounter (`load_mermaid`, guarded by a module-level promise) reading `window.__plainmark_mermaid = { url, nonce }` (set by the host's `getHtml` from the bundle's `asWebviewUri`); a diagram-free document MUST never fetch the bundle. The bundle, an esbuild IIFE entry, imports `mermaid`, runs an initial `mermaid.initialize()`, and exposes `window.PlainmarkMermaid`. Mermaid's own runtime `import()` diagram-parser chunks are inlined by the IIFE build (they would fail under `vscode-webview://`).
  _Example:_ opening a markdown file with no mermaid fence loads no Mermaid bundle; opening one with a diagram injects the script once per webview.

- **MMD-E-9** `[smoke]` `[accepted]` — Diagram colors MUST derive from VS Code theme tokens, not from `--plainmark-*` variables: `mermaid.initialize` runs with `theme: 'base'` and a `themeVariables` set seeded from `getComputedStyle` of `--vscode-editor-background` / `--vscode-editor-foreground` / etc. Because Mermaid bakes resolved colors into the SVG, a CSS override cannot recolor a rendered diagram — the `--plainmark-mermaid-*` surface is chrome-only.
  _Example:_ overriding a `--plainmark-mermaid-*` variable retints the widget container, never the diagram's nodes/edges.

- **MMD-E-10** `[smoke]` `[unknown]` — A light↔dark theme switch MUST re-render every diagram: each `mermaid_render_plugin` instance owns a `MutationObserver` on `document.body`'s `class` attribute; on change it dispatches `set_mermaid_theme`, which updates `mermaid_theme_field`, rebuilds widgets under the new theme key, re-`initialize`s Mermaid with freshly resolved `themeVariables`, and re-renders. The observer is per-`ViewPlugin` instance (main view and any table-cell subview each own one) and disconnects in `destroy()`.
  _Example:_ switching VS Code from Dark+ to Light+ re-renders all visible diagrams with light-theme colors.

- **MMD-E-11** `[accepted]` — Mermaid `mermaid.parse()` pre-validation is NOT used; the render path is `mermaid.render()` + `.catch` only, and `suppressErrorRendering: true` makes invalid input reject with a message instead of rendering the bomb SVG. The `mermaid.parse(src, { suppressErrors: true })` pre-gate is a non-pursued optimization with no user-visible difference — accepted design, not a correctness gap.
  _Example:_ an invalid diagram off-caret → `mermaid.render` rejects → `Mermaid: <message>` error widget (MMD-R-5), without a separate parse pre-check.
