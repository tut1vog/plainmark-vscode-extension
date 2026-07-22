---
prefix: MATH
title: Math
kind: construct
---

# Math — Specification

Normative behavior for inline math (`$...$`) and display/block math (`$$...$$`),
typeset by MathJax v4 with CHTML output. A vendored Lezer markdown extension
parses the delimiters into `InlineMath` and `BlockMath`
syntax-tree nodes (NOT `DisplayMath`), each with two `…Mark` children at the
dollar runs. Rendering is a StateField block/inline widget (one of image /
math / table), distinct from the ViewPlugin scaffold. The widget replaces
the LaTeX source with typeset output when the caret is off the construct, and
reveals the raw source when the caret overlaps it (node-level reveal). Typesetting is **asynchronous** (`tex2chtmlPromise`), so a freshly
seen formula first renders a stable-height **pending** placeholder, then swaps to
the typeset HTML once a `set_typeset_effect` lands the result in a per-document
cache (`math_cache_field`). Two live-preview surfaces exist while editing: an
in-flow block-preview widget below a caret-occupied `$$…$$` block and
a tooltip popover for a caret-occupied `$…$` span. No math
widget rewrites document source bytes.

Example notation: `|` = caret, `→` = action/result, `\n` = newline (see README §2).

## R · Rendering

- **MATH-R-1** — The math widget extension (`math_extension` = `math_cache_field` + `math_widgets_field` + `math_typeset_plugin` + `math_theme`), the inline tooltip preview (`math_preview_extension`), and the grammar (`math_grammar_extension` in the `markdown({extensions})` config) MUST all be registered in the production editor (`editor_extensions_core`), so they run in both the live webview and the Tier B harness.
  _Example:_ opening a document with `$$\nx = y\n$$` renders typeset math, not the raw `$$…$$` source.

- **MATH-R-2** — An off-caret `InlineMath` node MUST be replaced by an inline (non-block) `Decoration.replace` widget over its `[from, to)` range. An off-caret `BlockMath` node MUST be replaced by a `Decoration.replace` widget over its **whole-line span** (`block_math_widget_range`: the node's `[from, to)` extended to its first line's start and last line's end), with the decoration shape chosen by the node's line margins — the bytes outside `[from, to)` on those lines:
  - whitespace-only margins (MATH-E-5 leading indent / trailing spaces) → `block: true`;
  - quote-markup margins (`>` runs + whitespace before the node, whitespace after) → `block: false` — an inline replace is legal mid-line and across line breaks, the widget div reads as a block, and the quote line's chrome stays on the `.cm-line` (MATH-E-13);
  - any other non-whitespace margin (list `- ` prefix) → no widget; a partial-line `block: true` replace is undefined behavior in CM6 and mis-maps DOM-side edits around the widget into document edits (INV-SP-1).
  _Example:_ `value: $x = y$` (caret outside) → one inline replace widget over `$x = y$`; `$$\na = b\n$$` (caret outside) → one `block: true` replace over the whole block; `  $$x$$   ` → one `block: true` replace over the entire line including the indent and trailing spaces; `> $$x$$` → one `block: false` replace over the entire line; `- $$x$$` → no widget.

- **MATH-R-3** `[smoke]` — The block widget DOM MUST be a `div.plainmark-math-block` and the inline widget a `span.plainmark-math-inline`; when typeset HTML is available it is injected as the element's `innerHTML` (the CHTML `mjx-*` markup).
  _Example:_ `$x^2$` typeset → `<span class="plainmark-math-inline"><mjx-container>…</mjx-container></span>`.

- **MATH-R-4** `[smoke]` — Typesetting MUST be **asynchronous**: a node whose source has no cache entry first renders with `html = null` as a pending placeholder carrying the extra class `plainmark-math-pending` (dimmed via `--plainmark-math-pending-opacity`, default `0.5`); the block placeholder also sets `min-height: 1.5em` to hold layout. Only the pending placeholder sets a `min-height` (the cached measured height when warm, `1.5em` cold); the resolved widget MUST take its natural height — a `min-height` there makes `remember_block_height` measure its own floor, so a transient over-measurement (e.g. a typeset measured before the math fonts load) would lock in an oversized box for the session. A `ViewPlugin` calls `window.MathJax.tex2chtmlPromise(src, {display})`, and on resolution dispatches `set_typeset_effect` to store the HTML in `math_cache_field`, which rebuilds the decoration with the resolved widget. When the bundle is not yet loaded, the plugin MUST instead trigger the lazy bundle load (MATH-R-5) and re-schedule once it resolves; the pending placeholder covers the load window — never the error style while a load is possible or in flight.
  _Example:_ first paint of `$\frac{a}{b}$` shows a dimmed placeholder, then swaps to the typeset fraction once the promise resolves.

- **MATH-R-5** `[smoke]` — Typeset output MUST use MathJax v4 CHTML rendering (display/inline chosen by the `{display}` flag), driven by the MathJax bundle (`@mathjax/src@4.1.2`, TeX-base + AMS + newcommand, newcm font with all dynamic ranges preloaded), **lazy-loaded on first math encounter**: the host inlines a `window.__plainmark_mathjax = { url, nonce }` bootstrap and the MathJax loader injects the 1.9 MB script the first time a document has pending math — math-free documents never load it; a failed load clears the one-shot promise so the next schedule retries. After each typeset, `ensure_chtml_stylesheet()` MUST append MathJax's CHTML layout `<style>` to `document.head` once, or structured math collapses to concatenated glyphs (e.g. `\frac{a}{b}` → "ab").
  _Example:_ `$$\frac{a}{b}$$` renders a properly stacked fraction, not "ab".

- **MATH-R-6** `[smoke]` — A formula already present in `math_cache_field` (matched on the display-aware key `block:<src>` / `inline:<src>`) MUST render the resolved widget immediately with no pending state; block and inline forms of the same source keep separate cache entries (MathJax emits different HTML for `display:true` vs `display:false`).
  _Example:_ two `$x$` spans share one `inline:x` cache entry; a `$$x$$` block and a `$x$` span do not share HTML.

- **MATH-R-7** `[smoke]` — The block widget MUST be styled `text-align: var(--plainmark-math-align, center)`, `font-size: var(--plainmark-math-size, 1.21em)`, `color: var(--plainmark-math-color, inherit)`, `padding: var(--plainmark-math-padding, 0.25em 0)`, `margin: 0`; the inline widget inherits color from the same `--plainmark-math-color`. The widget padding is the single vertical-spacing authority: both the block widget and the in-flow preview (MATH-I-6) MUST zero the inner `mjx-container[display="true"]`'s margin, or MathJax's CHTML default (`margin: .7em 0`) stacks on the widget padding and roughly doubles the whitespace around every display block; MathJax's internal `.3em 2px` container padding stays (it keeps glyphs off the scroll-box edge, MATH-R-9). A non-doc-top block widget additionally carries class `plainmark-block-gap-above` and stacks the paragraph gap on its padding-top (PARA-R-7; the `0.25em` literal mirrors the shorthand's default top component, and the gap resolves in the widget's `--plainmark-math-size` em context); the flag participates in `eq()` so edits crossing the doc-top boundary redraw. The revealed SOURCE carries the gap on its opening `$$` line only.
  _Example:_ `$$E=mc^2$$` renders centered at ~1.21em; a theme may left-align it via `--plainmark-math-align`; below a paragraph, the widget separates by the paragraph gap.

- **MATH-R-8** `[smoke]` — Invalid LaTeX MUST NOT crash the widget. A thrown `tex2chtmlPromise` rejection is cached as an error result and the replace widget renders the raw `$…$` / `$$…$$` source with the `plainmark-math-error` class and the rejection message in `title`; the cached rejection MUST NOT retry on selection-only updates. When MathJax instead returns an in-band `mjx-merror` node, the replace widget renders that error markup as-is. When no bundle is loaded AND no bootstrap exists to load one, the widget renders raw source with the error class rather than an invisible pending span.
  _Example:_ `$\frac$` (malformed) typeset off-caret → raw `$\frac$` with error styling and the message on hover (on throw), or MathJax's inline `mjx-merror` glyph (on in-band error), never a thrown exception.

- **MATH-R-9** `[smoke]` — The block widget (`.plainmark-math-block`) and the in-flow block preview (`.plainmark-math-block-preview`) MUST set `overflow-x: auto` so a formula wider than the editor content scrolls horizontally within the widget rather than overflowing the preview and clipping out of view. Mirrors the mermaid block (`.plainmark-mermaid-block`). Because VS Code's webview injects scrollbar styles that leave the overflow bar transparent at rest, both containers MUST also restyle `::-webkit-scrollbar` (`height: 10px`) and `::-webkit-scrollbar-thumb` (`--vscode-scrollbarSlider-background`, with `--vscode-scrollbarSlider-hoverBackground` on hover) so the scrollbar is visible whenever the formula overflows, not only while actively scrolling.
  _Example:_ `$$\int_0^\infty …\,dx$$` with a very long integrand → the typeset block gains a visible horizontal scrollbar instead of disappearing past the right edge.

## I · Interaction

- **MATH-I-1** — Reveal is **node-level**: an `InlineMath` node MUST reveal its raw source through the emphasis-family predicate `should_reveal_for_selection` — an empty caret inside/touching the range reveals, and a non-empty selection reveals UNLESS it strictly covers the whole `$…$` on both sides (a select-all keeps the rendered widget, matching `**bold**` / inline code / strikethrough). At reveal the inline replace decoration is simply skipped, exposing the `$…$` bytes for editing. Block math keeps the plain main-range overlap test (MATH-I-2), not this predicate.
  _Example:_ `value: $x|$` (caret between the dollars) → raw `$x$` shown and editable; moving the caret to `value:| $x$` re-renders the widget; a select-all over the whole line keeps `$x$` rendered.

- **MATH-I-2** — A `BlockMath` node whose **reveal span** (`block_math_reveal_range`: the node's start to its last line's end) overlaps the selection MUST NOT render its replace widget; the raw `$$…$$` source (all lines) is exposed for editing. The line-start margin *before* the node — the `> ` quote prefix, leading indent — MUST NOT reveal: the webview parks the caret at offset 0 on document open, and a doc-start `> $$…$$` would otherwise open permanently revealed. The span's end extends to the line end so a caret in the closing line's trailing bytes still reveals.
  _Example:_ `$$\na = |b\n$$` → all three source lines shown and editable; `> |$$x = y$$` (caret at the line start, the open state) → stays rendered; `> $|$x = y$$` → source revealed.

- **MATH-I-3** — Decorations MUST be rebuilt whenever the document changes, the selection changes, or a `set_typeset_effect` lands; otherwise the prior decoration set is reused.
  _Example:_ moving the caret off an inline math span re-promotes it to a widget on the next transaction.

- **MATH-I-4** `[smoke]` `[unknown]` — The replace widget overrides `ignoreEvent()` to return `false` (CM6's default `true` swallows clicks), so a mouse press on the rendered math reaches the editor and triggers the MATH-I-1/I-2 source reveal rather than being ignored. A plain primary click additionally selects the equation's inner content (MATH-I-15); a modified or secondary click falls through to ordinary caret placement. Confirming the live click-to-edit behavior requires a smoke check.
  _Example:_ clicking the rendered `$x^2$` reveals `$x^2$` and selects `x^2` (MATH-I-15); Cmd-clicking it places a caret without selecting.

- **MATH-I-10** `[smoke]` — A press on a block widget's horizontal scrollbar (MATH-R-9) MUST NOT place the caret or reveal the raw source: `MathWidget.ignoreEvent` MUST return `true` for a `MouseEvent` whose target is the `.plainmark-math-block` container and whose `offsetY` exceeds the container's `clientHeight` (i.e. lands on the scrollbar strip below the content box), so dragging the scrollbar of a wide formula scrolls without flipping the widget to its source. Presses on the math content itself still return `false` and reveal per MATH-I-4.
  _Example:_ grabbing the scrollbar under a wide `$$…$$` and dragging → the equation scrolls horizontally and stays typeset; clicking the equation glyphs still reveals the raw `$$…$$`.

- **MATH-I-5** — Pressing Enter at the end of an unclosed opening `$$` line MUST auto-close the math block (shared with the fenced-code auto-close); see CBLK-I-6.
  _Example:_ `$$|` → Enter → `$$\n|\n$$`.

- **MATH-I-6** `[smoke]` — Whenever the selection overlaps a `BlockMath` widget span (an empty caret inside it OR a non-empty selection covering any part of it, up to and including a select-all), in place of the replace widget the field MUST emit a `block: true` in-flow preview widget (`div.plainmark-math-block-preview`, `side: 1`) anchored at the block's end; it live-typesets the current LaTeX — quote-stripped for a quote-nested block (MATH-E-13) — with a 120 ms debounce. The preview tracks the same overlap test that reveals the raw source (MATH-I-2), so the preview stays visible while the user selects the equation body or the `$$` delimiters.
  _Example:_ caret inside `$$x=y$$` → an in-flow typeset preview renders below the editable source; selecting the equation (or a `$$`) keeps that preview; moving the caret off the block re-renders the replace widget.

- **MATH-I-7** `[smoke]` — The inline tooltip popover (`div.plainmark-math-preview`) MUST appear exactly when the `InlineMath` source is revealed per MATH-I-1 (the same `should_reveal_for_selection` predicate): an empty caret inside, or a non-empty selection overlapping without strictly covering, shows the popover with the live-typeset inline LaTeX (120 ms debounce); it MUST disappear when the selection leaves the span, MUST NOT appear on a strict-covering select-all (the math stays rendered, so no preview), and MUST NOT appear for block math. Gating it on MATH-I-1 keeps the popover in lockstep with the inline widget — the preview shows only while the raw `$…$` is revealed. The popover MUST anchor below the span's last (closing-`$`) screen line (via a `getCoords` returning the span-end's vertical rect at the span-start's horizontal position) and MUST NOT flip above it (`strictSide: true`), so a long `$…$` that wraps across screen lines never renders on top of the revealed source or the caret, regardless of which wrapped line the caret sits on.
  _Example:_ caret inside `$x^2|$` → a small bordered popover shows the typeset x²; selecting `x^2` or a `$` keeps it; a select-all over the line shows no popover and keeps `$x^2$` rendered; arrowing out of the span dismisses it; in a long wrapped `$…$`, the popover sits below the whole equation even when the caret is on its first wrapped line.

- **MATH-I-8** `[smoke]` — Both live previews MUST surface invalid LaTeX as an error message rather than silently failing: a `mjx-merror` result renders `TeX error: <message>` (`plainmark-math-block-preview-error` / `plainmark-math-preview-error`, colored `--vscode-errorForeground`). The block preview additionally MUST keep the last good render dimmed (`plainmark-math-block-preview-stale`) above the error while the user fixes the formula.
  _Example:_ editing `$$x=y$$` into `$$x=\frac$$` → the block preview shows the prior good render dimmed with `TeX error: …` beneath it.

- **MATH-I-9** `[smoke]` — Math reveal MUST freeze to the pre-press selection while a pointer button is held (reading `frozen_reveal_selection_field`, the same gate as `BQ-I-12`): a press neither reveals an off-caret widget nor re-renders an already-revealed source, and the live selection takes over only on release. This prevents the height-changing `block: true` widget from toggling mid-drag, where each render/reveal flip re-maps the pointer onto shifted layout and flickers. Keyboard selection (no freeze) reveals immediately per MATH-I-1/I-2. The `math_widgets_field` MUST rebuild when the frozen selection flips, since the press/release transaction carries effects only (no doc or selection change).
  _Example:_ caret parked on the line below `$$f(a)=b$$`, then drag-selecting upward over the block → the typeset widget stays put through the drag and reveals the raw `$$f(a)=b$$` only on mouse release.

- **MATH-I-11** — A LaTeX-command autocomplete (`latex_completions`, registered in the single `autocompletion({ override: [...] })` call) MUST offer the bundled commands ONLY when the caret resolves inside a parsed `InlineMath` or `BlockMath` node AND a `\`-token (`/\\[a-zA-Z]*/`) immediately precedes the caret. It MUST NOT trigger outside math, inside a code span or fenced code block, or when no backslash precedes the caret. Because `\` is a non-word character, auto-typing reaches the source only once at least one letter follows the backslash; a bare `\` offers the full list only on explicit invocation.
  _Example:_ `$\al|$` → completion list; `\alpha|` in prose → no list; `` `\frac|` `` (code span) → no list; `$x|$` → no list.

- **MATH-I-12** — Accepting a completion MUST set the result `from` to the backslash offset so the typed `\`-token is replaced (never appended). A symbol command MUST insert its name verbatim; a command taking arguments MUST apply a CM6 `snippet()` whose template carries empty `${}` argument fields followed by a terminal `${}` tab-stop. The offered set is the bundle-scoped dataset (MathJax base + ams + newcommand); `\boldsymbol` MUST be excluded — its package is unbundled and renders `mjx-merror`.
  _Example:_ `$\var|$` → pick `\varepsilon` → `$\varepsilon|$`; `$\fra|$` → pick `\frac` → `$\frac{|}{}$` with the caret in the first field and a final Tab landing after the closing brace.

- **MATH-I-13** — Options MUST be ranked by a `boost` equal to the number of times each command already appears within the document's math ranges (`InlineMath`/`BlockMath` slices, recomputed per invocation); commands with equal count MUST fall back to the curated dataset order. Each symbol option MUST show its representative Unicode glyph in the completion `detail`.
  _Example:_ a document already using `\alpha` twice and `\beta` once ranks `\alpha` above `\beta` above the unused `\gamma`; the `\varepsilon` row shows `ε` as its detail.

- **MATH-I-14** `[smoke]` — In the live webview, typing `\` plus a command prefix inside math MUST surface the ranked completion popup; accepting MUST insert the command (or snippet, with Tab/Shift-Tab moving between fields) without disturbing surrounding bytes, and the glyph detail MUST render. While the popup is open inside a math node, both Enter and Tab MUST accept the selected option; this Tab-to-accept binding is math-scoped (callout/table popups remain Enter-only) and yields to Tab's other roles when no popup is open (snippet-field navigation, indentation). Confirming the live popup, snippet-field navigation, and ranking requires a manual smoke.
  _Example:_ in `$$…$$`, type `\sum` → popup with `\sum` near the top → Enter or Tab inserts `\sum`; type `\frac` → Enter or Tab → snippet fields navigable by Tab.

- **MATH-I-15** `[smoke]` — A plain primary-button single click (`button === 0`, `detail === 1`, no Shift/Cmd/Ctrl/Alt) on a *rendered* (off-caret) math widget MUST select the equation's inner LaTeX content, EXCLUDING the `$`/`$$` delimiters: inline `$…$` selects `[from + 1, to - 1)`; block `$$…$$` selects the content between the fences with the immediately adjacent newlines stripped (the same slice MathJax typesets — `find_inline_math_source` / `find_block_math_source`). The resulting selection overlaps the node without strictly covering it, so the source reveals (MATH-I-1 / MATH-I-2) with the content already selected, ready to copy. A click whose position resolves to a math node whose source is ALREADY revealed MUST fall through to ordinary caret placement, so a click inside revealed source places a caret for editing instead of re-selecting. Modified clicks, double/triple clicks, and keyboard navigation into a node MUST NOT trigger the selection. A press on a block widget's horizontal scrollbar (MATH-I-10) MUST NOT select. The selection is dispatched through the `EditorView.mouseSelectionStyle` facet and changes no document bytes.
  _Example:_ clicking the rendered `$x^2$` selects `x^2` (not `$x^2$`) and reveals the source; clicking the rendered `$$\na = b\n$$` selects `a = b`; clicking again inside the now-revealed `$x^2$` places a normal caret; Shift-clicking extends a selection instead.

## SP · Source preservation

- **MATH-SP-1** `[inherits:INV-SP-1]` — Math rendering MUST be decoration-only: inline/block `Decoration.replace` and the preview `Decoration.widget`, with no document edit. No math widget re-serializes, normalizes, or rewrites any source byte (only the table widget may rewrite source). The `$…$` / `$$…$$` delimiters and the LaTeX between them are preserved verbatim and re-exposed unchanged on reveal.
  _Example:_ `$$\n  x = y \n$$` opened and closed without edits saves byte-identical; revealing it shows exactly those bytes including the indent and trailing space.

- **MATH-SP-2** `[inherits:INV-SP-1]` — The LaTeX source slices used for typesetting MUST be read-only: `find_inline_math_source` strips one `$` from each end, `find_block_math_source` strips the `$$` markers, and `find_block_math_source_stripped` additionally removes quote markup (MATH-E-13), but none writes back; the stripped value feeds only MathJax and the cache key.
  _Example:_ the `$$` markers of `$$a=b$$` never disappear from the document; the `> ` prefixes of a quoted block never disappear either — only the typeset *view* omits them.

- **MATH-SP-3** `[inherits:INV-SP-1]` — Both live-preview surfaces MUST be view-only DOM (a `Decoration.widget` / a CM6 tooltip) appended alongside the editable source; editing inside the construct updates the preview only, never the document beyond the user's own keystroke.
  _Example:_ typing inside `$$…$$` re-typesets the in-flow preview without inserting or removing any byte other than the typed character.

- **MATH-SP-4** `[inherits:INV-SP-1]` — Accepting a `latex_completions` option (MATH-I-11 / MATH-I-12) is a legitimate user-initiated edit — a normal CM6 transaction subject to undo — NOT a render-time mutation, and MUST NOT be conflated with the decoration-only render path (MATH-SP-1). The source itself MUST be read-only: the frequency tally reads `InlineMath`/`BlockMath` slices without writing any byte.
  _Example:_ picking `\frac` inserts `\frac{}{}` at the caret via one undoable transaction; the tally that ranked it changed no document bytes.

## E · Edge cases

- **MATH-E-1** — Inline math MUST require at least one non-newline character between the dollars (`/^\$(?<math>[^\n]+?)\$/`) and MUST NOT cross a line break; an unmatched single `$` or a `$`…`$` pair spanning a newline MUST NOT parse as `InlineMath`.
  _Example:_ `cost is $10` → no inline math; `$x\ny$` (dollars on separate lines) → no inline math.

- **MATH-E-2** — A bare `$$` (empty inline) MUST NOT parse as `InlineMath`; the `[^\n]+?` requirement rejects it.
  _Example:_ `empty $$ here` → no inline math node; raw text shown.

- **MATH-E-3** `[accepted]` — Inline math matches **permissively** (Typora-style): any two unescaped `$` on one line delimit math regardless of surrounding text, so an interior-space-bearing currency pair typesets as math. This is an accepted disambiguation, not a defect: literal dollars are escaped with `\$`, which lezer-markdown's built-in `Escape` parser consumes before the math rule sees it, so `\$5` is safe; the backslash itself is hidden in live preview and the dollar renders as a literal — see `escapes.md` ESC-R-1 / ESC-E-5.
  _Example:_ `$5.00 + $3.00` → parses `$5.00 + $` as one `InlineMath` span; `\$5.00 and \$10` → no math (both dollars escaped).

- **MATH-E-4** — A line beginning `$$` MUST be handled by the block parser as `BlockMath`, never as inline math; both the single-line form `$$…$$` and the multi-line `$$` … `$$` form are recognized.
  _Example:_ `$$x$$` → one `BlockMath` (offsets 0–5) with two `BlockMathMark` children; `$$\nx\n$$` → one multi-line `BlockMath`.

- **MATH-E-5** — A single-line `$$…$$` block MUST require content between the markers; `$$$$` (no interior chars) MUST NOT single-line-tokenize and defers to the leaf parser (which finds no close and yields a paragraph). Trailing whitespace and leading indent around a single-line block MUST be tolerated, and the close MUST NOT consume the following line.
  _Example:_ `$$$$\nstuff` → no `BlockMath`; `  $$x$$   \n` → one `BlockMath`; `$$a$$\n$b$\n` → block on line 1, inline math still parses on line 2.

- **MATH-E-6** — An opening `$$` with no later `$$` close MUST NOT form a `BlockMath` node and MUST NOT suppress parsing of the lines below it. The multi-line opener defers to a leaf parser whose `finish` returns false, so it falls back to a paragraph and the following lines parse as ordinary markdown (headings, lists, etc.) rather than being swallowed to end-of-document. The source stays visible/editable and no typeset block widget is shown.
  _Example:_ `$$\na = b` (no closer) → no `BlockMath` node; `$$\n# Heading\n- item` → the heading and list parse normally rather than being absorbed by the opener.

- **MATH-E-7** — Math delimiters MUST NOT be recognized inside code spans or code blocks; the grammar yields to lezer's code constructs, so `$…$` and `$$…$$` there stay literal text.
  _Example:_ `` `$x$` `` and a fenced block containing `$$\na=b\n$$` → no math nodes; the dollars render verbatim.

- **MATH-E-8** `[accepted]` — LaTeX content is not parsed as markdown and is passed verbatim to MathJax; markdown-significant characters inside math have no markdown meaning.
  _Example:_ `$a * b$` → typeset a·b, not markdown emphasis.

- **MATH-E-9** `[accepted]` — The TeX surface is limited to the bundled packages (TeX-base + AMS + newcommand); `autoload` and `\require` are omitted, so packages outside that set are unavailable. Macros are rendered with the newcm font and all dynamic glyph ranges preloaded (no runtime CDN fetch, no `□` boxes).
  _Example:_ an AMS construct like `\begin{align}` works; a command requiring an unbundled package does not auto-load.

- **MATH-E-10** — Two block-math blocks placed back-to-back with no blank line between them MUST each parse as a separate `BlockMath` node: the first block's closing `$$` line MUST NOT absorb the following line, and the second block's opening `$$` line MUST re-enter the block parser. This holds for the multi-line `$$` … `$$` form, the single-line `$$…$$` form, and any mix of the two.
  _Example:_ `$$\na\n$$\n$$\nb\n$$` (no blank line between the two multi-line blocks) → two `BlockMath` nodes, not one over-reaching node.

- **MATH-E-11** — A `$$` block opener MUST interrupt an open paragraph or other leaf block: when a line beginning `$$` immediately follows a non-blank line (a paragraph or list line) with no blank line between them, the block parser MUST end the open leaf and parse the `$$` line as `BlockMath` rather than absorbing it as lazy paragraph continuation. The interrupt MUST fire only for two dollar signs; a line beginning with a single `$` followed by a non-`$` (inline math continuation) MUST NOT end the leaf. The interrupt MUST NOT fire when the open leaf is itself a `$$` block (the `$$` line is that block's close, claimed by the leaf parser, not a fresh opener). This mirrors how a fenced code block or ATX heading interrupts a paragraph.
  _Example:_ `text\n$$\na\n$$` → one `BlockMath` (the `$$` ends the `text` paragraph); `text\n$x$ more` → no `BlockMath`, the line stays paragraph text with one `InlineMath`.

- **MATH-E-12** `[accepted]` — A `$$…$$` block whose closing `$$` is preceded by a blank line MUST NOT form a `BlockMath` node: the leaf parser ends at the blank line, so such a block falls back to paragraphs. Blank-line-spanning display math is unsupported (the `@internal`-input alternative was rejected). The common instance is the empty `$$\n\n$$` produced by the Enter auto-close (MATH-I-5); it renders nothing, and the empty-block Backspace (CBLK-I-8) recognizes the opener/blank/closer shape textually rather than via the node.
  _Example:_ `$$\na\n\nb\n$$` → no `BlockMath` (blank line before the close); `$$\n\n$$` → no node, but Backspace on the blank middle line still deletes the whole block.

- **MATH-E-13** `[smoke]` — Display math (`$$…$$`) nested inside a blockquote or callout body MUST render as a typeset block *inside* the quote chrome, via the `block: false` whole-line replace of MATH-R-2: the quote line's bar/tint stay on the `.cm-line` while the widget div replaces the line content, at any nesting depth, for the single-line, fully-`> `-prefixed multi-line, and lazy-continuation forms. The LaTeX handed to MathJax MUST be quote-stripped (`find_block_math_source_stripped`): interior-line `>` markers are removed via the node's own injected `QuoteMark` children (each plus its one following space, mirroring the parser's `skipContextMarkup` consumption), and the closing line's prefix via a textual `\n[ \t>]*` match — that line's `QuoteMark` never enters the tree. Without stripping, the literal `>` bytes typeset as relational operators. Because the line's `>` markers sit inside the replaced range, the per-marker quote bars (BQ-R-2) cannot draw on the widget line; the line's own `::before` MUST carry the bars instead — one bar per depth, selected via `.plainmark-blockquote[data-blockquote-depth]:has(> .plainmark-math-block)`, stepped by `--plainmark-quote-bar-step` (the measured `> ` advance the line decoration publishes) so each bar lands at the same x as neighboring lines' per-marker bars, with `--plainmark-blockquote-indent-per-depth` as the pre-measure fallback — and the marker-width probe MUST NOT measure these replaced markers (BQ-R-12). Display math nested in a **list item** has no legal shape (hiding the `- ` marker under the widget is wrong) and stays unrendered: raw source, no widget. Inline math (`$…$`) inside a blockquote is unaffected: it parses as a single-line `InlineMath` whose source extraction (MATH-SP-2) carries no quote marker, and it renders normally (cross-ref `blockquotes.md` BQ-E-9).
  _Example:_ `> $$a = b$$`, `> $$\n> a = b\n> $$`, `> > $$\n> > a = b\n> > $$`, and a `> [!NOTE]` body block → typeset math inside the quote chrome, TeX source `a = b` with no `>`; `- $$a = b$$` → raw source, no widget.

- **MATH-E-14** — When a `$$` opener and a later `$$` close pair up textually but no `BlockMath` node forms (the MATH-E-12 dissolve — e.g. the transient state right after Enter inserts a blank caret line inside a block), the raw source between the fences MUST display byte-accurate: inline decorations (escape/marker hiding, inline styling) are suppressed inside the closed fence pair so math source is never mangled by markdown rendering (`\\` must not display as `\`). Fence detection mirrors the grammar's top-level predicates and skips `$$` lines inside code constructs (MATH-E-7). An unpaired opener produces no suppression region, so lines below it keep normal markdown rendering (MATH-E-6). Regions coinciding with a formed `BlockMath` are no-ops (its content is not inline-parsed).
  _Example:_ `$$\n\begin{align}\n  &a = b\\\n\n\end{align}\n$$` (blank line from mid-edit Enter) → the trailing `\\` stays fully visible and no emphasis/escape hiding applies between the fences; `$$\nno close` → prose below still renders normally.
