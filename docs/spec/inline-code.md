---
prefix: CODE
title: Inline code
kind: construct
---

# Inline code — Specification

Normative behavior for the backtick-delimited inline-code span (`` `code` ``), the
`InlineCode` lezer node. Covers the inline span only; fenced code blocks are a
separate construct (`code-blocks.md`). Inline code is one of the four typography
text styles emitted by the shared text-style handler factory
(alongside strong, emphasis, strikethrough): a content `Decoration.mark` plus two
fence-hiding marks, with no block widget and no source rewrite.

Example notation: `|` = caret, `→` = action/result, `\n` = newline (see README §2).

## R · Rendering

- **CODE-R-1** — A backtick-delimited inline-code span MUST be handled by the shared `InlineCode` text-style handler, keyed on the lezer `InlineCode` node with `CodeMark` fence children. The content between the opening and closing `CodeMark` MUST receive a `Decoration.mark` with class `plainmark-inline-code`.
  _Example:_ in `` x `c` y ``, the `c` (offsets 3–4) carries `class="plainmark-inline-code"`.

- **CODE-R-2** `[smoke]` — The `plainmark-inline-code` content MUST render with monospace font (`--plainmark-inline-code-font-family`, default `var(--plainmark-font-code, monospace)`), reduced size (`--plainmark-inline-code-font-size`, default `85%`), a subtle background (`--plainmark-inline-code-background`, chaining `--plainmark-code-background` → `--vscode-textPreformat-background` → `--vscode-textCodeBlock-background` → transparent), padding (`--plainmark-inline-code-padding`, default `0.2em 0.4em`), and a `6px` border-radius (`--plainmark-inline-code-border-radius`).
  _Example:_ `` `x = 1` `` → renders "x = 1" as a rounded, shaded monospace chip slightly smaller than body text.

- **CODE-R-3** `[smoke]` — Inline-code color MUST resolve from `--plainmark-inline-code-color` (chaining `--plainmark-code-color` → `--vscode-textPreformat-foreground` → inherit) and the border from `--plainmark-inline-code-border-color` (default `--vscode-textPreformat-border`, transparent outside high-contrast themes).
  _Example:_ under a normal theme `` `c` `` shows no visible border; under High Contrast a 1px border appears.

- **CODE-R-4** — When the span is not revealed, both `CodeMark` fences (opening and closing) MUST be hidden by a `Decoration.mark` with class `plainmark-inline-marker-hidden`, one over each fence range.
  _Example:_ `` x `c` y `` off-caret → marks hide offsets `[2,3)` and `[4,5)`, rendering `x c y`.

- **CODE-R-5** `[smoke]` — Fence hiding MUST be a zero-width `inline-block` (`width:0; overflow:hidden; vertical-align:top; white-space:nowrap`), never a `Decoration.replace`, so `drawSelection`/`coordsAtPos` keep valid rects and the line height stays constant across hide/reveal.
  _Example:_ `` `c` `` hidden vs revealed → the line does not change height; selecting across the chip paints one contiguous rectangle.

- **CODE-R-6** — Only the content between the fences MUST carry `plainmark-inline-code`; the fence marks themselves MUST NOT carry the content style.
  _Example:_ `` `ab` `` → only "ab" is styled; the hidden `` ` `` bytes are unstyled.

- **CODE-R-7** — The handler MUST require both a first and last child named `CodeMark`, distinct, with `first.to < last.from`; a node failing this MUST produce no decorations.
  _Example:_ a degenerate `InlineCode` node lacking two `CodeMark` children → no content mark, no fence hiding.

- **CODE-R-8** — Inline-code content MUST render verbatim: inner emphasis/strong/strikethrough markers inside the fences MUST NOT be re-interpreted (the lezer parser treats `InlineCode` as opaque, so no emphasis-family node is emitted inside it).
  _Example:_ `` `**x**` `` off-caret → fences `[0,1)` and `[6,7)` hidden, the literal `**x**` (offsets 1–6) styled as code, not bold "x".

## I · Interaction

- **CODE-I-1** — When a selection range overlaps the inline-code span, the span MUST be revealed: both `` ` `` fence marks are un-hidden (the two `plainmark-inline-marker-hidden` marks are not emitted) while the content keeps its `plainmark-inline-code` style. Reveal is computed per node by `should_reveal_for_selection(state, node.from, node.to, pointer_down)`.
  _Example:_ `` `code|` `` (caret inside the span) → renders `` `code` `` with both backticks visible; the content stays styled as code.

- **CODE-I-2** — A caret or selection that is on the same line but does **not** overlap the span MUST leave both fences hidden (reveal is node-scoped, not line-scoped).
  _Example:_ `` x `c` y `` with the caret at line start (before `x`) → still renders `` x c y `` with the `` ` `` fences hidden.

- **CODE-I-3** — A non-empty selection that strictly extends past the span on **both** sides MUST NOT reveal it (the "covering"/triple-click case leaves the rendered chip intact); a selection touching or partially overlapping on only one side MUST reveal. A bare caret reveals when it is inside or exactly on either fence boundary.
  _Example:_ select from line start through end-of-line over `` x `c` y `` → `` `c` `` stays hidden; select `` `c` `` exactly (boundary-equal) → revealed.

- **CODE-I-4** — Moving the selection off the span MUST re-emit the two marker-hide marks and restore the hidden rendering on the next decoration rebuild (selection-set update).
  _Example:_ caret moves from inside `` `code` `` to another line → the span collapses back to "code".

- **CODE-I-5** `[smoke]` — Reveal also depends on the `pointer_down` latch (`pointer_down_field`) threaded into `should_reveal_for_selection`: while a mouse button is held all reveal is suppressed, so an in-progress pointer drag MUST keep the fences hidden until the mouse is released. (The headless tests pass `pointer_down` explicitly; the live mouse-sequence wiring is smoke-verified.)
  _Example:_ press-drag selecting across `` `code` `` → fences stay hidden mid-drag and reveal on mouseup.

- **CODE-I-6** `[accepted]` — No inline-code-specific keybinding ships (no `` ` ``-wrap toggle, no autoclose handled here); inline code uses the editor's default key handling.
  _Example:_ pressing a hypothetical Mod-E on a selection does nothing inline-code-specific.

## SP · Source preservation

- **CODE-SP-1** `[inherits:INV-SP-1]` — Inline-code rendering MUST be decoration-only (`Decoration.mark` for both content and fence-hiding); the backtick fences and the content bytes are preserved verbatim, and bytes outside the span are never touched.
  _Example:_ `` `code` `` opened and closed without edits saves byte-identical.

- **CODE-SP-2** — Fence hiding MUST be a view-layer mark only; the `` ` `` bytes MUST remain in the document and reappear when the span is revealed.
  _Example:_ `` `code` `` rendered (fences hidden) then caret-revealed → the source is still `` `code` `` byte-for-byte.

## E · Edge cases

- **CODE-E-1** — A multi-backtick fence MUST be supported: the opening and closing `CodeMark` children define the fence ranges (N backticks each), and both whole ranges MUST be hidden — the handler hides `[first.from, first.to)` and `[last.from, last.to)`, not a fixed single byte.
  _Example:_ ` ``a`b`` ` → both `` `` `` fences hidden, the literal `` a`b `` shown as code.

- **CODE-E-2** `[unknown]` — An empty inline-code span (two adjacent fences with no content) MUST produce a zero-length content mark and still hide both fences; with no content between them the chip renders empty.
  _Example:_ ` `` ` (two backticks, no content) → both fences hidden, an empty code span renders.

- **CODE-E-3** `[unknown]` — An unmatched backtick run MUST NOT render as inline code: the parser emits an `InlineCode` node only when an opening fence has a matching closing fence of equal length, so a lone or mismatched run receives no inline-code decoration.
  _Example:_ a single stray `` ` `` in a paragraph renders as a literal backtick, not a code chip.

- **CODE-E-4** `[unknown]` — Inline code inside another construct (e.g. a blockquote or list item) MUST still be styled by this handler, since the handler fires on any `InlineCode` node reached during viewport iteration regardless of ancestor.
  _Example:_ `` > use `npm i` `` → blockquote chrome plus a rendered inline-code chip around `npm i`.

- **CODE-E-5** `[unknown]` — On the initial mount with the default `{anchor: 0}` selection, an inline-code span on line 1 that does not contain offset 0 MUST render hidden (reveal is node-scoped, so the first-line raw-render class of structural widgets does not apply here).
  _Example:_ document `` `c` `` opened cold with caret at offset 0 (inside the span at 0–3) → revealed; `` x `c` `` opened cold → hidden, since offset 0 is outside the span.
