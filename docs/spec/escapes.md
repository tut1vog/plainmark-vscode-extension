---
prefix: ESC
title: Backslash escapes
kind: construct
---

# Backslash escapes — Specification

Normative behavior for CommonMark backslash escapes (`\$`, `\*`, `\#`, …), the
lezer `Escape` node: a backslash followed by one ASCII punctuation character
from the escapable set `` !"#$%&'()*+,-./:;<=>?@[\]^_`{|}~ ``. The backslash
suppresses the following character's markdown meaning; in live preview the
backslash is hidden and the escaped character renders as a literal glyph.
Reveal follows the predicate path (`should_reveal_for_selection`) defined in
`marker-reveal-and-selection.md`; the `MRS-R-*` clauses are not restated here.

Example notation: `|` = caret, `→` = action/result, `\n` = newline (see README §2).

## R · Rendering

- **ESC-R-1** `[smoke]` — When an `Escape` node is not revealed, its backslash byte MUST be hidden by a `Decoration.mark` with class `plainmark-inline-marker-hidden` over `[node.from, node.from+1)`; the escaped character byte MUST stay visible as plain text with no added style.
  _Example:_ `cost is \$50` off-caret → renders `cost is $50`.

- **ESC-R-2** — Backslash hiding MUST apply to every character in the CommonMark escapable set: the handler keys on the lezer `Escape` node (which only exists for those characters), not on any per-character list.
  _Example:_ `\*literal\*` → renders `*literal*` (no emphasis); `\# not a heading` → renders `# not a heading`.

- **ESC-R-3** `[smoke]` — Backslash hiding MUST be the shared zero-width inline-block mark, never a `Decoration.replace`, so caret geometry and line height stay constant across hide/reveal (same rationale as CODE-R-5).
  _Example:_ hiding then revealing `\$` does not change the line's height.

- **ESC-R-4** — A backslash before a non-escapable character produces no `Escape` node and MUST receive no decoration; both bytes render literally.
  _Example:_ `C:\Users\name` → renders verbatim, both backslashes visible.

## I · Interaction

- **ESC-I-1** — When a selection range satisfies the MRS predicate path for the `Escape` node (caret inside or touching either boundary, or an overlapping non-strict-cover selection), the backslash MUST be revealed (the hide mark is not emitted).
  _Example:_ `pay \|$5` (caret between `\` and `$`) → renders `\$5` with the backslash visible and editable.

- **ESC-I-2** — Reveal MUST be node-scoped: a caret on the same line but outside the node's closed range MUST leave the backslash hidden.
  _Example:_ `|pay \$5 now` (caret at line start) → still renders `pay $5 now`.

- **ESC-I-3** — Multiple escapes on one line MUST hide and reveal independently of each other.
  _Example:_ `\$5 and \$10` with the caret inside the first escape → renders `\$5 and $10`.

## SP · Source preservation

- **ESC-SP-1** `[inherits:INV-SP-1]` — Escape rendering MUST be decoration-only; the backslash byte and the escaped character byte are preserved verbatim, and bytes outside the node are never touched.
  _Example:_ a document of escaped punctuation opened and closed without edits saves byte-identical.

## E · Edge cases

- **ESC-E-1** — An escaped backslash (`\\`) is itself one `Escape` node: the first backslash MUST be hidden and the second MUST stay visible.
  _Example:_ `a \\ b` → renders `a \ b`.

- **ESC-E-2** — Escapes inside an inline-code span or a fenced code block MUST NOT be processed (code is verbatim; the parser emits no `Escape` node there), so the backslash stays visible.
  _Example:_ `` `\$` `` → renders `\$` inside the code chip.

- **ESC-E-3** — A backslash before a newline is a `HardBreak` node, not an `Escape`; this handler MUST NOT decorate it (hard breaks follow PARA-I-3 verbatim).
  _Example:_ `foo\` at end of line → hard break per CommonMark; the backslash is untouched by this handler.

- **ESC-E-4** — An escape nested inside another inline construct's content (emphasis, strong, heading, blockquote, list item) MUST still hide/reveal, independent of the parent's own marker handling.
  _Example:_ `**price \$5**` off-caret → renders bold `price $5`.

- **ESC-E-5** — An escaped dollar MUST NOT trigger inline math (cross-ref MATH-E-3: the `Escape` parser consumes `\$` before the math rule sees it) and, once the backslash is hidden, MUST render as a literal `$` glyph.
  _Example:_ `\$50/MWh vs \$80/MWh` → renders `$50/MWh vs $80/MWh`, no math widget, no visible backslashes.
