---
prefix: HEAD
title: Headings
kind: construct
---

# Headings — Specification

Normative behavior for ATX heading rendering, interaction, and byte guarantees.
Covers ATX headings (`#`..`######`) only; setext headings are explicitly out of
scope (HEAD-E-4). Headings are one of the twelve ViewPlugin-scaffold
constructs: a per-line `Decoration.line` plus a marker-hiding `Decoration.mark`
emitted by the heading `NodeHandler`. No block widget, no source rewrite.

Example notation: `|` = caret, `→` = action/result, `\n` = newline (see README §2).

## R · Rendering

- **HEAD-R-1** — Each ATX heading line MUST receive a `Decoration.line` whose class is `plainmark-h<level> plainmark-collapse-adjacent`, where `<level>` is the heading level 1–6 derived from the run of leading `#` characters. Exception: a bare `#`-run with no trailing space receives no decoration (HEAD-E-1).
  _Example:_ `## Title` → the line element carries `class="plainmark-h2 plainmark-collapse-adjacent"`.

- **HEAD-R-2** — All six ATX levels MUST be recognized: `#`→`plainmark-h1` through `######`→`plainmark-h6`, keyed on the lezer `ATXHeading1`..`ATXHeading6` node names.
  _Example:_ `###### Deep` → `plainmark-h6`; `# Top` → `plainmark-h1`.

- **HEAD-R-3** — When the heading has visible text after the marker, the leading `#`-run together with its single trailing space MUST be hidden by a `plainmark-heading-marker` mark decoration spanning `[firstChild.from, marker-end]`; with no trailing space only the `#`-run itself is covered.
  _Example:_ `## Title` → mark hides offsets `[0,3)` (`## `), rendering `Title`.

- **HEAD-R-4** `[inherits:MRS-R-2]` — A non-empty heading's `#`-run MUST reveal when a selection touches the marker range `[firstChild.from, marker-end]` — a caret at the start of the heading text or anywhere in the collapsed `#`-run, or a selection whose near edge falls there — and MUST stay hidden for every other selection, including a caret one or more characters into the text and a caret off the line. Reveal reuses the emphasis-family predicate (`should_reveal_for_selection`) applied to the marker range, inheriting its pointer-down freeze (MRS-P-1/MRS-P-2).
  _Example:_ `# Title` with the caret at the start of `Title` → renders `# Title` (marker shown); with the caret at `Ti|tle` or off the line → renders `Title` (marker hidden).

- **HEAD-R-5** — The marker MUST be hidden with a `Decoration.mark` (zero `font-size`), never a `Decoration.replace`. A replace renders a `contenteditable=false` span flanked by `cm-widgetBuffer` images at the line start, which makes `posAtCoords` resolve the line-start x ambiguously and causes `drawSelection` to paint a spurious whole-line selection rectangle.
  _Example:_ `# Heading` → `#`, ` `, and the first text glyph all resolve to the same line-left x (`coordsAtPos(0).left === coordsAtPos(2).left`); a drag-select inside the heading paints exactly one selection rectangle.

- **HEAD-R-6** `[smoke]` — Heading font size MUST scale by level via `--plainmark-h<level>-size` (defaults: h1 `2em`, h2 `1.5em`, h3 `1.25em`, h4 `1em`, h5 `0.875em`, h6 `0.85em`) and weight via `--plainmark-h<level>-weight` (default `600` all levels).
  _Example:_ `# A` renders visibly larger than `###### B`; both render semibold.

- **HEAD-R-7** `[smoke]` — Heading color MUST resolve from `--plainmark-heading-color` (default `inherit`) and font family from `--plainmark-heading-font-family` (default `inherit`).
  _Example:_ `## Section` inherits the editor foreground color and body font unless the theme overrides those variables.

- **HEAD-R-8** `[smoke]` — Level-1 and level-2 headings MUST render a bottom border (`--plainmark-heading-border-width` solid `--plainmark-heading-border-color`); levels 3–6 MUST NOT.
  _Example:_ `# Top` and `## Sub` each show a horizontal rule beneath the text; `### Deep` shows none.

- **HEAD-R-9** `[smoke]` — Heading vertical spacing MUST come from `padding-top`/`padding-bottom` (`--plainmark-heading-padding-top` 0.4em, `--plainmark-heading-padding-bottom` 0.3em) and `line-height` (`--plainmark-heading-line-height` 1.5), applied as padding (never margin) so CM6's `.cm-line` height map stays in sync with `coordsAtPos`/`moveVertically`. A gap-eligible heading REPLACES its own padding-top with exactly the base-size paragraph gap (PARA-R-7; ADR-0012, dropping ADR-0010/0011's breathing stack): each level divides the gap by its default size scale to cancel the heading's em context ((0,5,0) over the tripled gap rule), so every heading sits one prose gap above the preceding block — the uniform block rhythm, matching rendered markdown's level-constant heading margin-top. `--plainmark-heading-padding-top` governs only non-gapped headings (doc line 1, quoted headings — BQ-R-13). The divisors hard-code the default `--plainmark-h<n>-size` scales; a themed heading size diverges from the gap — accepted (ADR-0011/0012, same class as ADR-0010's table/math shorthand hard-coding).
  _Example:_ `text\n# Heading\ntext` → exactly one base-size gap above the heading (plus the h1's tall line-height inside the text box), padding below; the caret on the line below still resolves to the correct vertical position.

- **HEAD-R-10** — A heading line carries the `plainmark-collapse-adjacent` class so that when it directly precedes another collapse-adjacent line its `padding-bottom` collapses to `0`, preventing doubled inter-line padding.
  _Example:_ `# A\n## B` (two adjacent headings) → the gap between them is one padding step, not two.

## I · Interaction

- **HEAD-I-1** — Moving the caret onto a heading line past the start of the text MUST leave the marker hidden; placing the caret at the start of the heading text (or within the collapsed `#`-run) MUST reveal the marker so it can be edited, and moving the caret back out of that range MUST hide it again.
  _Example:_ `Title` with the caret moved to `Ti|tle` still renders `Title`; moving it to the very start renders `# Title` with the `#` editable.

- **HEAD-I-2** — Decoration recomputation MUST track document changes, viewport changes, and selection changes via the shared ViewPlugin scaffold, so heading classes and marker hiding stay correct after edits and scrolling.
  _Example:_ typing `#` ahead of `# Title` to make `## Title` → the line reclasses from `plainmark-h1` to `plainmark-h2` on the next update.

- **HEAD-I-3** `[smoke]` — A click on a heading line MUST place the caret on that line; the click is resolved against the collapsed layout, so it lands relative to the rendered text with the `#`-run at the line's left edge. A click deeper in the text leaves the marker hidden (HEAD-I-1); a click at the start reveals it — see HEAD-E-7 for the resulting left-edge landing ambiguity.
  _Example:_ clicking just left of `Title` in `# Title` places the caret at the start of the heading text.

- **HEAD-I-4** `[accepted]` — No heading-specific Enter, Backspace, or level-toggle keybinding ships; heading lines use the editor's default key handling.
  _Example:_ Enter at the end of `# Title|` inserts a plain newline (no auto-heading continuation); there is no `Mod-1`..`Mod-6` level command.

## SP · Source preservation

- **HEAD-SP-1** `[inherits:INV-SP-1]` — Heading rendering MUST be decoration-only; the `#`-run, the marker space, the heading text, and any trailing closing `#`-run are preserved verbatim, and bytes outside the heading line are never touched.
  _Example:_ `##   Spaced title   ##` opened and closed without edits saves byte-identical.

## E · Edge cases

- **HEAD-E-1** — An empty heading with a trailing space (`#`-run + space, no text) MUST still receive its `plainmark-h<level>` line class but MUST NOT hide the marker, so the user can see the level they typed. A bare `#`-run with nothing after it MUST receive no heading decoration — it renders as plain paragraph text (Typora parity) even though CommonMark parses it as an empty ATX heading.
  _Example:_ `# ` → renders as a `plainmark-h1` line with the `# ` visible; bare `#` → renders as plain paragraph text, no heading class.

- **HEAD-E-2** — A trailing closing `#`-run MUST remain visible; only the opening `#`-run and its space are covered by the marker mark (the hide range ends at the opening marker, not the line end).
  _Example:_ `## Heading ##` → renders `Heading ##` (opening `## ` hidden, closing ` ##` shown).

- **HEAD-E-3** — A `#`-run with no following space and immediate non-`#` text (`#Title`) MUST NOT be treated as a heading (lezer does not parse it as `ATXHeading`), so it receives no heading class and no marker hiding.
  _Example:_ `#Title` → renders as paragraph text with the literal `#Title` shown.

- **HEAD-E-4** `[unknown]` `[smoke]` — Setext headings (a text line underlined by `===` or `---`) MUST NOT receive ATX heading decoration or styling; the handler registers only `ATXHeading1`..`ATXHeading6` node names. Whether such input should style at all is deferred — see DECISION-POINTS.
  _Example:_ `Title\n=====` → both lines render as plain paragraph text under the current handler.

- **HEAD-E-5** `[unknown]` — Seven or more leading `#` characters MUST NOT be treated as a heading (CommonMark caps ATX at level 6; lezer emits no `ATXHeading` node), so no heading class is applied.
  _Example:_ `####### Seven` → renders as paragraph text, no heading class.

- **HEAD-E-6** — A heading nested inside another block (e.g. inside a blockquote) MUST be handled by whichever node the parser assigns; the heading handler only fires on a top-level `ATXHeadingN` node, so a `>`-prefixed `# x` is governed by the blockquote handler and does not additionally receive heading-marker hiding from this handler.
  _Example:_ `> # quoted heading` → blockquote chrome applies; the ATX-marker-hide path of the heading handler does not run on the quote-embedded line.

- **HEAD-E-7** `[accepted]` `[smoke]` — Two consequences of revealing a zero-width line-start marker (HEAD-R-4) are accepted and NOT corrected. (1) Because every offset from the line start through the marker end resolves to the same line-left x (HEAD-R-5), a click at the heading's left edge while the marker is hidden MAY land the caret on either side of the `#`-run — `posAtCoords` resolves the ambiguous x — and the reveal then renders the caret on whichever side it landed. (2) Because reveal is scoped to the marker range, moving the caret between the start of the heading text and a position deeper in it toggles the marker, shifting the rendered text horizontally. Both are inherent to hiding a line-start marker.
  _Example:_ clicking the far-left edge of a hidden `## Title` may place the caret before or after `## `; arrowing right off the text start re-hides `## ` and shifts `Title` left.
