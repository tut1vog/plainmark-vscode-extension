---
prefix: HTML
title: Raw HTML (inline HTML and HTML blocks)
kind: construct
---

# Raw HTML

Covers raw HTML embedded in markdown — both **inline raw HTML** (lezer
`HTMLTag` / `Comment` / `ProcessingInstruction`) and **HTML blocks** (lezer
`HTMLBlock` / `CommentBlock` / `ProcessingInstructionBlock`) — as handled by
the raw-HTML decoration handler.

Plainmark v1 is **decoration-only styled source**: raw HTML is NOT interpreted,
NOT sanitized, and NOT rendered as live DOM in the main view. The source bytes
stay visible verbatim; only typographic / background chrome and inner
syntax-coloring layer on top. Rendering-on-cursor-out with DOMPurify is
pre-costed but deferred (git history), not implemented.

---

## R — Rendering

- **HTML-R-1** — Each line spanned by an HTML block node (`HTMLBlock`, `CommentBlock`, or `ProcessingInstructionBlock`) MUST receive one `Decoration.line` with class `plainmark-html-block`. The handler iterates from `state.doc.lineAt(node.from).number` through `state.doc.lineAt(node.to).number` inclusive and emits one line decoration per line.
  _Example:_ `<div>\n  hi\n</div>` (one `HTMLBlock` spanning 3 lines) → 3 `.plainmark-html-block` line decorations.

- **HTML-R-2** — Each inline raw-HTML node (`HTMLTag`, `Comment`, `ProcessingInstruction`) MUST receive one `Decoration.mark` with class `plainmark-html-inline` covering the node's full range `[from, to]`.
  _Example:_ `Hello <sub>x</sub> world` → two marks: one over `<sub>`, one over `</sub>`; the text `x` between them renders as plain paragraph text.

- **HTML-R-3** — Raw HTML MUST NOT be interpreted as live DOM in the main view. The source bytes (`<`, tag name, attributes, `>`) render literally as styled text; no element is constructed from the user's HTML.
  _Example:_ `<b>bold</b>` shows the literal characters `<b>bold</b>`, not bold-weighted text.

- **HTML-R-4** — Block chrome (`.plainmark-html-block`) MUST apply a background tint, monospace font, dim foreground color, and inset padding. The background is a stacked `linear-gradient` painted via `background-image` (not `margin`), inset from the editor edge by `--plainmark-html-margin-x`, to avoid desyncing CM6's height map. A non-doc-top block carries the paragraph gap on its FIRST line (PARA-R-7, ADR-0010), rendered as clear space: the gapped first line bottom-anchors the tint past the gap (`calc(100% − gap)`, position bottom); the gap resolves in the block's own font context (`--plainmark-html-size`, default `0.9em`).
  _Example:_ a `<script>...</script>` block renders with the same code-surface tint family as a fenced code block; `para` directly above it shows one clear paragraph gap before the tint begins.

- **HTML-R-5** — Block chrome MUST NOT distinguish header / body / footer lines and MUST NOT emit a `data-language` label. Every line of every block variant (`<div>`, `<!-- -->`, `<? ?>`, `<!DOCTYPE>`, CDATA, `<script>`) gets the identical `.plainmark-html-block` class.
  _Example:_ `<!-- a\n b -->` → both lines carry `.plainmark-html-block`; no "html" corner label is rendered.

- **HTML-R-6** — Inline chrome (`.plainmark-html-inline`) MUST be typography-only: monospace font and a dim foreground color, with NO background tint, NO padding, and NO margin, so it does not break line height or fragment surrounding prose.
  _Example:_ `press <kbd>Esc</kbd>` keeps the paragraph line height; only `<kbd>` and `</kbd>` shift to monospace + dim color.

- **HTML-R-7** `[smoke]` — Inner HTML tokens surfaced by the `@codemirror/lang-html` `parseMixed` overlay (`TagName`, `AttributeName`, `AttributeValue`, brackets, comments) MUST receive their syntax color via CSS rules scoped under `.plainmark-html-block` / `.plainmark-html-inline`. Scoped token classes are `tag`, `property`, `string`, `comment`, `meta`, `punctuation`, each mapped to `var(--plainmark-syntax-<class>-color)`.
  _Example:_ inside a block, `<a href="x">` → `a` colors as `--plainmark-syntax-tag-color`, `href` as `--plainmark-syntax-property-color`, `"x"` as `--plainmark-syntax-string-color`.

- **HTML-R-8** `[smoke]` — The lang-html overlay is mounted only on `HTMLBlock`, `HTMLTag`, and `CommentBlock` (the three node names `@codemirror/lang-markdown` passes to `parseMixed`). `ProcessingInstructionBlock`, inline `Comment`, and inline `ProcessingInstruction` MUST render with chrome but NO inner syntax coloring (no overlay descends into them).
  _Example:_ inline `<!-- note -->` renders monospace + dim under `.plainmark-html-inline` but its inner text is not separately comment-colored.

- **HTML-R-9** — Block chrome dimensions MUST resolve from the `--plainmark-html-*` variable family, each chaining to the matching `--plainmark-fenced-code-*` / `--plainmark-code-*` fallback: `--plainmark-html-padding-x`, `--plainmark-html-margin-x`, `--plainmark-html-line-height`, `--plainmark-html-size`, `--plainmark-html-background`, `--plainmark-html-color`.
  _Example:_ overriding `--plainmark-fenced-code-background` recolors HTML block chrome too, since `--plainmark-html-background` falls through to it.

- **HTML-R-10** — Inline chrome MUST resolve color / font / size from `--plainmark-html-inline-color`, `--plainmark-html-inline-font-family`, `--plainmark-html-inline-size`, each chaining through `--plainmark-html-*` then `--plainmark-code-*` fallbacks.
  _Example:_ `--plainmark-html-inline-color` unset → inline tags inherit `--plainmark-html-color` → `--plainmark-code-color`.

- **HTML-R-11** `[smoke]` — Block chrome MUST NOT emit a `border-radius` rule (the multi-line clip-path constraint shared with codeblock / frontmatter chrome). The implementation emits no `border-radius`. The block-tint inset is driven by `--plainmark-html-margin-x`, whose default chains to `--plainmark-fenced-code-margin-x` (implementation fallback `0px`), so by default the block tint paints flush to the content-left edge unless the fenced-code margin is themed.
  _Example:_ with `--plainmark-fenced-code-margin-x` unset, a `<div>` block paints its tint to the content-left edge (no inset, no rounded corners).

## I — Interaction

- **HTML-I-1** — Raw HTML markers MUST be always visible regardless of caret position. There is no per-line hide, no node-level hide, no widget collapse, and no cursor-out reveal/replace behavior in v1.
  _Example:_ `|<div>` with caret before the tag and `<div>|` with caret after both show the full `<div>` bytes identically.

- **HTML-I-2** — Editing inside raw HTML MUST behave as ordinary text editing: typing, deletion, and caret motion operate directly on the source bytes with no construct-specific keymap, autocomplete, or structural command.
  _Example:_ `<di|v>` → type `v` → `<div|v>`; the byte is inserted literally with no auto-completion of the tag.

- **HTML-I-3** — Plainmark MUST NOT pair-match inline open/close tags; an open tag and its close tag are two independent atomic `HTMLTag` nodes with no linkage. Editing one does not affect the other.
  _Example:_ deleting `</sub>` from `<sub>x</sub>` leaves `<sub>x` unchanged in source and still marked as one inline node `<sub>` plus stray text.

## SP — Source preservation

- **HTML-SP-1** `[inherits:INV-SP-1]` — Rendering raw HTML MUST be decoration-only. The handler emits only `Decoration.line` and `Decoration.mark`; it performs no `Decoration.replace`, no widget, no DOMPurify, no info-string canonicalization, and no source-byte mutation. User-typed HTML stays byte-identical.
  _Example:_ `<div   class='x'>` (irregular whitespace, single quotes) round-trips byte-for-byte; chrome layers on top without normalizing it.

- **HTML-SP-2** `[inherits:INV-SP-1]` — The `@codemirror/lang-html` `parseMixed` overlay MUST only sub-parse for coloring; it MUST NOT rewrite, re-serialize, or re-parse markdown inside HTML blocks (the SilverBullet `htmlBlockParser` re-parse pattern is deliberately not adopted).
  _Example:_ a type-6 HTML block containing `[link](x)` keeps the literal `[link](x)` bytes — they are not turned into a markdown link inside the block.

## E — Edge cases

- **HTML-E-1** — An inline node with zero width (`node.from === node.to`) MUST produce no decoration. The inline handler returns an empty array for empty ranges (a `Decoration.mark` over an empty range is illegal in CM6).
  _Example:_ a degenerate empty `HTMLTag` range → no `.plainmark-html-inline` mark emitted.

- **HTML-E-2** — `<!DOCTYPE html>` and `<![CDATA[...]]>` block forms MUST receive the same `.plainmark-html-block` chrome as any other block; their inline one-line forms MUST receive the same `.plainmark-html-inline` chrome as any other inline tag. No special-case styling exists.
  _Example:_ `<!DOCTYPE html>` on its own line → `.plainmark-html-block`; `before <!DOCTYPE x> after` inline → `.plainmark-html-inline` over the `<!DOCTYPE x>` span.

- **HTML-E-3** `[accepted]` — Inline `ProcessingInstruction` (`<?php ... ?>` mid-paragraph) and `ProcessingInstructionBlock` MUST render with chrome but no inner highlighting; these get no `parseMixed` overlay. Accepted as immaterial — processing instructions are vanishingly rare in user markdown.
  _Example:_ `text <?php echo 1; ?> text` → `.plainmark-html-inline` monospace over the PI span, no token coloring inside.

- **HTML-E-4** `[accepted]` — Inline raw HTML inside a table cell MUST be treated as opaque text by the table widget; in the static cell-render path the cell emitter wraps non-`<br>` `HTMLTag` / `Comment` / `ProcessingInstruction` bytes in `<span class="plainmark-html-inline">` with an inner `<span class="plainmark-syntax-tag">` to match the main-view DOM shape. The bytes still render as literal text; no per-tag interpretation. Cross-construct with the table source-modification carve-out.
  _Example:_ a cell `<kbd>x</kbd>` renders as styled literal text, not a rendered keyboard key.

- **HTML-E-5** `[accepted]` — Live rendering of raw HTML (cursor-out widget replace with DOMPurify sanitization) is deferred to a future ratification. v1 deliberately shows styled source instead. `<iframe>` policy, sanitizer config, and inline-tag rendering are all moot until that lands.
  _Example:_ `<svg>...</svg>` shows its literal source bytes with block chrome; it does not draw the SVG.

- **HTML-E-6** `[smoke]` — Opaque block-chrome backgrounds coexist with CM6's `drawSelection` layer (default inline `z-index: -2`) only because a project-wide override elevates the selection layer to `z-index: 0 !important` and uses a translucent selection background. Without that override, click-drag selection over an HTML block would be hidden behind the chrome tint.
  _Example:_ click-dragging across a `<div>` block shows the selection highlight on top of the block tint, not behind it.

- **HTML-E-7** `[smoke]` — `@codemirror/lang-markdown` mounts lang-html with `matchClosingTags: false`, so an unbalanced inline tag (open with no close, or stray close) MUST NOT surface error chrome inside the embedded HTML.
  _Example:_ a paragraph `line<br>more` with a void `<br>` and no `</br>` renders cleanly with `.plainmark-html-inline` over `<br>` and no error styling.
