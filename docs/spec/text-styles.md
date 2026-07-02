---
prefix: EMPH
title: Text emphasis styles
kind: construct
---

# Text emphasis styles — Specification

Normative behavior for the inline TEXT EMPHASIS family: strong / bold (`**`/`__`),
emphasis / italic (`*`/`_`), bold-italic (the nested `StrongEmphasis`+`Emphasis`
combination), and strikethrough (`~~`). These are the lezer `StrongEmphasis`,
`Emphasis`, and `Strikethrough` nodes. Each is emitted by the shared
`text_style_handler` factory: a content `Decoration.mark` plus
two marker-hiding marks, with no block widget and no source rewrite.

Inline code (`` `code` ``) is the fourth handler produced by the same factory but
is specified separately in `inline-code.md` (prefix `CODE`); this file does not
re-state inline-code-specific behavior. The selection-reveal predicate
(`should_reveal_for_selection`) and the marker-hide CSS class
(`plainmark-inline-marker-hidden`) are shared with inline code and links; clauses
here describe how the emphasis family uses them rather than re-specifying them.
There is no highlight (`==`) handler — the lezer GFM grammar emits no such node and
no Plainmark handler exists for it.

Example notation: `|` = caret, `→` = action/result, `\n` = newline (see README §2).

## R · Rendering

- **EMPH-R-1** — Each emphasis-family node MUST be handled by the shared `text_style_handler` factory keyed on its lezer node name and marker child name: `StrongEmphasis` with `EmphasisMark` children → `plainmark-strong`; `Emphasis` with `EmphasisMark` children → `plainmark-em`; `Strikethrough` with `StrikethroughMark` children → `plainmark-strikethrough`. The content between the first and last marker child MUST receive a `Decoration.mark` with that class.
  _Example:_ in `x **bold** y`, the `bold` (offsets 4–8) carries `class="plainmark-strong"`.

- **EMPH-R-2** `[smoke]` — Strong content MUST render with `font-weight: var(--plainmark-strong-weight, 600)` and `color: var(--plainmark-strong-color, inherit)`.
  _Example:_ `**bold**` → "bold" renders semibold (weight 600), inheriting body color.

- **EMPH-R-3** `[smoke]` — Emphasis content MUST render with `font-style: var(--plainmark-em-style, italic)` and `color: var(--plainmark-em-color, inherit)`.
  _Example:_ `*it*` → "it" renders italic, inheriting body color.

- **EMPH-R-4** `[smoke]` — Strikethrough content MUST render with `text-decoration: var(--plainmark-strikethrough-decoration, line-through)` and `color: var(--plainmark-strikethrough-color, inherit)`. (`--plainmark-strikethrough-color` is shipped from day 1 as one of the explicit holes Obsidian users complain about.)
  _Example:_ `~~gone~~` → "gone" renders struck through, inheriting body color.

- **EMPH-R-5** — When a node is not revealed, both marker runs (opening and closing) MUST be hidden by a `Decoration.mark` with class `plainmark-inline-marker-hidden`, one over each marker range `[first.from, first.to)` and `[last.from, last.to)`.
  _Example:_ `x **bold** y` off-caret → marks hide `[2,4)` and `[8,10)`, rendering `x bold y`.

- **EMPH-R-6** — Only the content between the markers MUST carry the style class; the marker runs themselves MUST NOT carry the content style.
  _Example:_ `**ab**` → only "ab" carries `plainmark-strong`; the hidden `**` runs are unstyled.

- **EMPH-R-7** `[smoke]` — Marker hiding MUST use `display: inline-block; width: 0; overflow: hidden; vertical-align: top; white-space: nowrap` (the shared `plainmark-inline-marker-hidden` class), never a `Decoration.replace`, so the marker text stays in layout as a zero-width inline-block — `drawSelection` keeps a valid 0-width rect, `coordsAt` returns valid coords (no moveVertically scanY skip), and the rect keeps valid height (no `font-size:0` caret regression). `vertical-align: top` avoids the CSS 2.1 §10.8.1 overflow-baseline line-box inflation; `white-space: nowrap` prevents the `lineWrapping` overflow-wrap cascade from breaking the multi-char marker across lines.
  _Example:_ `**bold**` hidden vs revealed → the line does not change height; selecting across it paints one contiguous rectangle.

- **EMPH-R-8** `[accepted]` — On reveal the marker mark is simply not emitted, so the markers become plain inline text at natural width and adjacent characters shift right (the horizontal layout shift of the pre-width:0-hide "Issue 3" returns). This is the documented tradeoff of the `width:0`/`overflow:hidden` hide; the alternatives (Track A / Track B) were F5-rejected.
  _Example:_ caret enters `**bold**` → `**` markers reappear at full width, pushing "bold" and following text rightward.

- **EMPH-R-9** — A node whose markers are not well-formed MUST produce no decorations: the handler requires a distinct `firstChild` and `lastChild`, both named the expected mark, with `first.to < last.from`; any failure returns an empty decoration list.
  _Example:_ a degenerate `StrongEmphasis` node lacking two `EmphasisMark` children → no content mark, no marker hiding.

- **EMPH-R-10** — Decorations are only emitted for nodes inside the plugin's visible ranges; the `ViewPlugin` iterates the syntax tree over `view.visibleRanges` only.
  _Example:_ a `**bold**` far below the viewport is not decorated until scrolled into view.

## I · Interaction

- **EMPH-I-1** — When a selection range overlaps the node, the node MUST be revealed: both marker-hide marks are not emitted while the content keeps its style class. Reveal is computed per node by `should_reveal_for_selection(state, node.from, node.to, pointer_down)`. (Shared predicate — see `inline-code.md` CODE-I-1 and the marker-reveal cross-cutting spec.)
  _Example:_ `**bo|ld**` (caret inside) → renders `**bold**` with both `**` visible; "bold" stays styled.

- **EMPH-I-2** — A bare caret MUST reveal when it is inside or exactly on either node boundary (`node_from <= caret <= node_to`); a caret on the same line but outside the node MUST leave the markers hidden (reveal is node-scoped, not line-scoped).
  _Example:_ `x **bold** y` with the caret at line start (offset 0) → still renders `x bold y` with `**` hidden.

- **EMPH-I-3** — For a non-empty selection, reveal fires unless the selection strictly extends past the node on **both** sides (`r.from < node_from && r.to > node_to`) — the covering / triple-click case leaves the rendered form intact. A selection that touches, partially overlaps, sits strictly inside, or is boundary-equal MUST reveal.
  _Example:_ select doc-start through end-of-line over `x **bold** y` → `**bold**` stays hidden; select `**bold**` exactly (boundary-equal) → revealed.

- **EMPH-I-4** — Moving the selection off the node MUST re-emit the two marker-hide marks on the next decoration rebuild (the `selectionSet` update).
  _Example:_ caret moves from inside `**bold**` to another line → the markers collapse back, rendering "bold".

- **EMPH-I-5** `[smoke]` `[unknown]` — Reveal also depends on the `pointer_down` latch threaded from `pointer_down_field`: while a mouse button is held, all reveal is suppressed regardless of selection emptiness, so an in-progress drag MUST keep markers hidden until mouseup. (Headless tests pass `pointer_down` explicitly; the live mouse-sequence wiring and the document-level mouseup rebuild are smoke-verified. The `InlineDecorationsPlugin.update` guard rebuilds when the latch flips even though doc/viewport/selection are unchanged.)
  _Example:_ press-drag across `**bold**` → `**` stay hidden mid-drag and reveal on release.

- **EMPH-I-6** — Typing `*`, `~`, or `$` over a non-empty selection MUST wrap the selection with that character on both sides (one transaction) and keep the wrapped text selected, so a repeated press nests the markers; an empty selection MUST fall through to a plain insert. (Handled by `wrap_selection_input`, an `EditorView.inputHandler`; the full wrap delimiter set — including the `[ ] ( ) { }` bracket pairs — is defined by MRS-W-1. `` ` `` belongs to inline code; `$` to math. There is no dedicated emphasis keybinding such as Mod-B.)
  _Example:_ select `x` → press `*` → `*x*` (still selected) → press `*` → `**x**` (bold).

- **EMPH-I-7** — On mouseup, a non-empty selection inside the content area of an emphasis-family node MUST snap to the node's outer bounds so the syntax markers join the selection (combined with EMPH-I-3 the snapped boundary reveals). Three explicit rules in `compute_marker_snap`: Rule C — content-area exact cover (`range.from == content_start && range.to == content_end`) snaps to `[node.from, node.to)` unless already equal; Rule A — left edge at content start and right past the closing marker snaps the left edge to `node.from`; Rule B — symmetric for the closing marker. Strict-inside selections (narrower than the content) deliberately do NOT snap, and a construct already revealed when the drag began does NOT snap either — its exact selection is kept (MRS-S-12). A double-click never folds markers in (MRS-S-10, MRS-S-11); only drag gestures do.
  _Example:_ drag-select exactly `bold` inside `**bold**` → selection snaps to cover `**bold**` so a copy yields the markdown source.

- **EMPH-I-8** — Marker snap MUST preserve the user's drag direction: a left-to-right drag (`anchor <= head`) snaps to `anchor=from, head=to`; a right-to-left drag mirrors. Snap MUST be skipped for empty ranges and for ranges where no rule matches (the original range is kept).
  _Example:_ right-to-left drag of `it` in `*it*` → snaps to `anchor=node.to, head=node.from`, so shift+ArrowLeft keeps extending leftward.

- **EMPH-I-9** — Marker snap (EMPH-I-7) covers the emphasis family and inline code; the same mechanism also extends to inline links and autolinks (MRS-S-1, where for a link the content area is the label and the snap target is the whole `[label](url)` node). Only bare URLs, which carry no markers, are excluded.
  _Example:_ drag-select the label of `[label](url)` → snaps to cover `[label](url)`.

## SP · Source preservation

- **EMPH-SP-1** `[inherits:INV-SP-1]` — Emphasis rendering MUST be decoration-only (`Decoration.mark` for both content and marker-hiding); the `**`/`*`/`~~` markers and the content bytes are preserved verbatim, and bytes outside the node are never touched.
  _Example:_ `**bold**` opened and closed without edits saves byte-identical.

- **EMPH-SP-2** — Marker hiding MUST be a view-layer mark only; the marker bytes MUST remain in the document and reappear when the node is revealed.
  _Example:_ `~~gone~~` rendered (markers hidden) then caret-revealed → the source is still `~~gone~~` byte-for-byte.

- **EMPH-SP-3** `[inherits:INV-SP-1]` — Selection wrapping (EMPH-I-6) MUST insert only the typed delimiter at the selection's two edges in a single transaction and MUST NOT rewrite any other bytes; it is a user edit inside the construct, not a render-time rewrite.
  _Example:_ wrapping `x` to `*x*` inserts exactly one `*` at each edge; surrounding bytes are untouched.

- **EMPH-SP-4** `[inherits:INV-SP-1]` — Marker snap (EMPH-I-7) MUST change only the selection, never the document; it dispatches no `changes`.
  _Example:_ snapping a drag from `bold` to `**bold**` moves the selection only; the bytes are unchanged.

## E · Edge cases

- **EMPH-E-1** — Nested constructs MUST each emit their own decorations: bold-italic renders as an outer `StrongEmphasis` content mark spanning the inner markers plus an inner `Emphasis` content mark, with all four marker runs hidden when not revealed (the tree is iterated and every matching node dispatched independently).
  _Example:_ `**a *b* c**` off-line → hide `[0,2)`, strong-mark `[2,9)`, hide `[4,5)`, em-mark `[5,6)`, hide `[6,7)`, hide `[9,11)`.

- **EMPH-E-2** — Emphasis markers inside an inline-code span MUST NOT be re-interpreted: the lezer parser treats `InlineCode` as opaque, so no emphasis-family node is emitted inside it and only the inline-code decoration applies.
  _Example:_ `` `**x**` `` → fences hidden, the literal `**x**` styled as code, not as bold "x".

- **EMPH-E-3** `[unknown]` — Both `*`/`_` (emphasis) and `**`/`__` (strong) delimiter forms MUST be handled identically, since the handler keys on the lezer node name (`Emphasis` / `StrongEmphasis`) and its `EmphasisMark` children, not the literal delimiter character.
  _Example:_ `__bold__` and `**bold**` both render as `plainmark-strong` with their two `EmphasisMark` runs hidden.

- **EMPH-E-4** `[unknown]` — An emphasis-family construct inside another block construct (blockquote, list item, callout) MUST still be styled, since the handler fires on any matching node reached during viewport iteration regardless of ancestor.
  _Example:_ `> this is **important**` → blockquote chrome plus a rendered bold "important".

- **EMPH-E-5** `[unknown]` — An unmatched or malformed delimiter run MUST NOT render as emphasis: the parser emits an emphasis-family node only when delimiters pair per CommonMark/GFM, so a lone `*` or `~` receives no decoration (and EMPH-R-9 guards any node that lacks two well-formed marker children).
  _Example:_ a stray `*` in a paragraph renders as a literal asterisk, not the start of italics.

- **EMPH-E-6** `[unknown]` — On the initial mount with the default `{anchor: 0}` selection, an emphasis node on line 1 that does not contain offset 0 MUST render hidden (reveal is node-scoped).
  _Example:_ document `x **bold**` opened cold with caret at offset 0 → hidden, since offset 0 is outside the node; document `**bold**` opened cold → revealed, since offset 0 is the node's `from`.

- **EMPH-E-7** — Multi-cursor selections MUST reveal a node if **any** single range would individually trigger reveal, and MUST NOT reveal if no range does (the predicate is `selection.ranges.some(...)`).
  _Example:_ carets at offset 0 and inside `**bold**` → the node reveals; carets at offset 0 and on another line → it stays hidden.

- **EMPH-E-8** `[smoke]` `[unknown]` — Strikethrough is a GFM construct: the `Strikethrough` node (and its `StrikethroughMark` children) is only produced when the markdown parser is configured with the GFM extension, which Plainmark enables. Without GFM, `~~text~~` would not be decorated.
  _Example:_ `~~gone~~` renders struck-through under Plainmark's GFM-enabled parser.

- **EMPH-E-9** — A `*`/`**` delimiter run adjacent to a CJK character or CJK punctuation MUST pair per the markdown-cjk-friendly flanking amendment: CJK adjacency lifts CommonMark's punctuation flanking restriction, since CJK text has no inter-word spaces. Implemented as a patched parser dependency, never as a decoration-layer workaround, so the syntax tree and the rendered form stay in agreement.
  _Example:_ `我构建的是一套**主控器（director）**的架构` → "主控器（director）" renders bold; under vanilla CommonMark the closing `**` (preceded by `）`, followed by `的`) cannot close.

- **EMPH-E-10** `[accepted]` — The CJK flanking amendment (EMPH-E-9) diverges from renderers that have not adopted it — GitHub, VS Code's built-in preview — where the same source renders as literal `**`. Accepted because the amendment is a strict superset of CommonMark: no document loses emphasis; only CJK-adjacent cases gain it.
  _Example:_ `前**粗体（x）**后` → bold in Plainmark and Obsidian's reading view; literal `**粗体（x）**后` on github.com.

- **EMPH-E-11** — Strikethrough (`~~`) MUST receive the same CJK flanking treatment as the emphasis delimiters (its GFM parser carries a separate copy of the flanking logic; the parser patch covers both).
  _Example:_ `前~~删除（x）~~后` → "删除（x）" renders struck through.

- **EMPH-E-12** — The underscore forms (`_`/`__`) MUST keep CommonMark's intraword prohibition unchanged: CJK characters still count as word characters for the underscore-specific open/close rules, matching the markdown-cjk-friendly spec's scope (`*`-family only).
  _Example:_ `前__粗体（x）__后` → renders as literal text (no bold), identical to CommonMark/GitHub.
