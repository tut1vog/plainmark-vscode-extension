---
prefix: PARA
title: Paragraphs and Line Breaks
kind: construct
---

# Paragraphs and Line Breaks — Specification

Normative behavior for paragraphs and line breaks. A paragraph is the **baseline
construct**: it is the absence of any other construct, so there is no
dedicated paragraph handler. Paragraph semantics are plain CommonMark with **no**
special remapping. The Typora-style paragraph model (Enter → `\n\n`, blank-line
gap rendering) once attempted was fully reverted; the clauses below
describe the current post-revert behavior.

Example notation: `|` = caret, `→` = action/result, `\n` = newline (see README §2).

## R · Rendering

- **PARA-R-1** — A paragraph MUST render as its inline content with no marker chrome, no line decoration class, and no widget: a paragraph is the absence of any other construct, so no decoration is emitted for it.
  _Example:_ `hello world` renders as `hello world` with no added wrapper, marker, or background.

- **PARA-R-2** — Paragraph text MUST soft-wrap at the prose-column width via `EditorView.lineWrapping`; a long logical line MUST NOT introduce horizontal scrolling and MUST NOT alter source bytes.
  _Example:_ a single-line paragraph wider than the column wraps onto multiple visual rows; the source remains one line.

- **PARA-R-3** — A blank line MUST act as a paragraph separator: consecutive non-blank lines render as one paragraph, and a blank line between them renders two distinct paragraphs (plain CommonMark).
  _Example:_ `a\nb` → one paragraph (`a b` after wrap); `a\n\nb` → two paragraphs.

- **PARA-R-4** `[smoke]` — Vertical spacing between a paragraph and an adjacent block construct MUST flow from the unified spacing surface: `.cm-line` carries no vertical margin (CM6 height-map rule), and adjacent opt-in constructs collapse doubled padding via `plainmark-collapse-adjacent`.
  _Example:_ a paragraph directly above a blockquote shows a single inter-block gap, not a doubled one.

- **PARA-R-5** `[smoke]` — Paragraph body typography MUST derive from the CSS-variable surface: font size `--plainmark-font-size` (16px), line height `--plainmark-body-line-height` (1.5), and the prose sans-serif `--plainmark-font-text` stack.
  _Example:_ a wrapped two-row paragraph shows ~1.5× line height between its rows at the 16px body size.

- **PARA-R-6** — A plain paragraph line MUST flush to x=0 (the CM6 baseTheme `.cm-line` inset is zeroed); only construct themes re-apply their own inset.
  _Example:_ `text` starts at the left edge of the prose column with no leading indent.

## I · Interaction

- **PARA-I-1** — Enter in a paragraph MUST insert a single `\n` (CM6 default newline). It MUST NOT insert `\n\n` or inject any blank line — the Typora-style `\n\n` remap was reverted.
  _Example:_ `foo|bar` → Enter → `foo\n|bar` (one newline, no blank line).

- **PARA-I-2** — Typing printable characters in a paragraph MUST insert plain text at the caret with no marker insertion, redirect, or chrome (no construct keymap claims the keystroke).
  _Example:_ `ab|cd`, type `X` → `abX|cd`.

- **PARA-I-3** — A hard line break MUST follow CommonMark verbatim with no special Plainmark keymap or rendering: two trailing spaces before a newline, or a backslash before a newline, produce a hard break; Plainmark adds nothing.
  _Example:_ `foo  \nbar` (two trailing spaces) and `foo\\\nbar` are hard breaks, handled by the parser, not by a Plainmark Enter override.

- **PARA-I-4** — No paragraph-specific command, shortcut, or autocomplete source ships; paragraph editing falls through to the CM6 default keymap and history.
  _Example:_ no `paragraph-toggle` or `insert-paragraph-break` command is bound; Backspace/Enter use CM6 defaults on a plain line.

## SP · Source preservation

- **PARA-SP-1** `[inherits:INV-SP-1]` — Paragraph editing is render-only: every byte outside the edited paragraph's source range MUST be byte-identical before and after the edit. Paragraphs perform **no** source remapping at all (no widget, no re-serialization).
  _Example:_ in `intro\n\nmiddle\n\noutro`, editing `middle` leaves `intro`, both blank lines, and `outro` byte-for-byte unchanged.

- **PARA-SP-2** — Enter MUST insert exactly one `\n` byte at the caret and MUST NOT inject any additional blank-line bytes; the reverted Typora model's `\n\n` injection MUST NOT recur.
  _Example:_ `foo|` → Enter → exactly `foo\n|` added one byte; no second `\n` appears.

- **PARA-SP-3** `[inherits:INV-SP-3]` — Soft wrapping is a pure rendering concern: wrapping a long line MUST NOT add, remove, or normalize any bytes; EOL, BOM, and final-newline behavior follow VS Code's `TextDocument`.
  _Example:_ a 400-char single-line paragraph that wraps onto four visual rows saves back as one source line, byte-identical.

## E · Edge cases

- **PARA-E-1** — Trailing whitespace on a paragraph line MUST be preserved verbatim (it is meaningful: two trailing spaces are a CommonMark hard break).
  _Example:_ `foo··` (two trailing spaces) keeps both spaces in source; they are not trimmed on edit or save.

- **PARA-E-2** — Multiple consecutive blank lines between paragraphs MUST be preserved verbatim; Plainmark MUST NOT collapse them to a single blank line.
  _Example:_ `a\n\n\n\nb` keeps all three blank lines in source; only the first blank line is semantically the separator, but the extra blanks survive round-trip.

- **PARA-E-3** — A paragraph lazily continuing into a blockquote follows the blockquote's lazy-continuation rules: the continuation line receives depth-1 chrome (cross-ref `blockquotes.md` BQ-E-1).
  _Example:_ `> a\nb` → both `a` and `b` render inside one depth-1 blockquote (line 2 via the ancestor walk).

- **PARA-E-4** `[smoke]` — A very long paragraph line MUST soft-wrap within the centered prose column without horizontal scroll, breaking at the column max-width (`--plainmark-container-max-width`) folded into `.cm-content`.
  _Example:_ a paragraph longer than the viewport wraps inside the centered column; no horizontal scrollbar appears.

- **PARA-E-5** — A single `\n` between two non-blank lines MUST NOT render as a paragraph break or inject a visual gap (the reverted soft-break-with-gap rendering MUST NOT recur); both lines remain one paragraph per CommonMark.
  _Example:_ `line one\nline two` renders as one wrapped paragraph (`line one line two`), with no blank-line gap between the two source lines.
