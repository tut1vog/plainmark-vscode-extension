---
prefix: PARA
title: Paragraphs and Line Breaks
kind: construct
---

# Paragraphs and Line Breaks — Specification

Normative behavior for paragraphs and line breaks. A paragraph is the **baseline
construct**: it is the absence of any other construct; source semantics are plain
CommonMark with **no** input remapping (Enter inserts one `\n`). Rendering adds
one thing on top: the **hard-newline paragraph gap** (PARA-R-7, adopted
2026-07-19 by user election, reversing the 2026-05-20 revert) — a render-only
vertical gap above eligible lines so a hard `\n` reads as a paragraph break,
while soft-wrapped rows keep body line-height. The reverted Typora-style
`\n\n` input remap stays reverted.

Example notation: `|` = caret, `→` = action/result, `\n` = newline (see README §2).

## R · Rendering

- **PARA-R-1** — A paragraph MUST render as its inline content with no marker chrome and no widget; the only line decoration a paragraph line carries is the paragraph-gap spacing class (PARA-R-7).
  _Example:_ `hello world` renders as `hello world` with no added wrapper, marker, or background.

- **PARA-R-2** — Paragraph text MUST soft-wrap at the prose-column width via `EditorView.lineWrapping`; a long logical line MUST NOT introduce horizontal scrolling and MUST NOT alter source bytes.
  _Example:_ a single-line paragraph wider than the column wraps onto multiple visual rows; the source remains one line.

- **PARA-R-3** — A blank line MUST act as a paragraph separator in source semantics (plain CommonMark: consecutive non-blank lines are one paragraph, a blank line splits two); visually, blank lines render as normal-height caret-placeable rows that also carry the PARA-R-7 gap.
  _Example:_ `a\nb` → one CommonMark paragraph across two source lines; `a\n\nb` → two paragraphs with a visible blank row between them.

- **PARA-R-4** `[smoke]` — Vertical spacing between a paragraph and an adjacent block construct MUST flow from the unified spacing surface: `.cm-line` carries no vertical margin (CM6 height-map rule), and adjacent opt-in constructs collapse doubled padding via `plainmark-collapse-adjacent`.
  _Example:_ a paragraph directly above a blockquote shows a single inter-block gap, not a doubled one.

- **PARA-R-5** `[smoke]` — Paragraph body typography MUST derive from the CSS-variable surface: font size `--plainmark-font-size` (16px), line height `--plainmark-body-line-height` (1.5), and the prose sans-serif `--plainmark-font-text` stack.
  _Example:_ a wrapped two-row paragraph shows ~1.5× line height between its rows at the 16px body size.

- **PARA-R-6** — A plain paragraph line MUST flush to x=0 (the CM6 baseTheme `.cm-line` inset is zeroed); only construct themes re-apply their own inset.
  _Example:_ `text` starts at the left edge of the prose column with no leading indent.

- **PARA-R-7** — Every gap-eligible line after the first document line MUST carry paragraph-gap padding-top (`--plainmark-paragraph-gap`, default `0.75em`) — padding, never margin (CM6 height-map rule). Gap-eligible: prose lines, blank lines, setext-heading lines (unstyled in Plainmark), the first line of a top-level list, item continuation lines — lines inside a list on which no `ListItem` starts, continuing an item begun on an earlier line (lazy `- a\nb`, indented `- a\n  b`, and a loose item's later paragraphs) — so a hard `\n` after a bullet reads as a paragraph break, not a soft wrap (amended 2026-07-20, ADR-0006), and interior blockquote/callout lines — quoted prose, quoted blank lines, and callout body lines at any depth, with in-quote lists following the same list rules via a probe that skips the lexical `>`/whitespace prefix (amended 2026-07-20, ADR-0007; extends PARA-E-5's recorded divergence into quotes: `> a\n> b` renders joined on GitHub but gapped here). Not eligible: lines of code blocks, frontmatter, block math, HTML blocks, tables, ATX headings, horizontal rules (all also when nested inside a quote — the ancestor walk hits the inner construct first), the FIRST line of the outermost enclosing blockquote or callout (block separation stays `--plainmark-blockquote-padding-y` / the callout header padding — gap padding sits inside the line box, so it would render as a tinted band above the quote's first paragraph; cross-ref BQ-R-13 / CALL-R-11), interior list marker lines (a `ListItem` starts on the line: second item onward, nested-list marker lines), and blank lines between loose-list items (no `ListItem` ancestor — loose-list geometry unchanged). Eligibility MUST be invariant across bullet-marker typing transitions — `para\n-` (setext state), `para\n* ` (paragraph state), and `para\n* x` (list state) all keep the gap, so no marker keystroke moves the layout vertically; converting a continuation line to a bullet is a single hand-off, because `-` before existing text is still continuation prose and the space keystroke completes a real item in the same instant the gap yields to item spacing. Deepening an interior quote line with another `>` keeps the gap (the outermost quote still began earlier); converting a paragraph into a quote's first line is likewise a single hand-off to the quote's block padding.
  _Example:_ `para\n- x\n- y` → the gap sits above `- x` (first list line); `- y` gets only the tight list-item spacing. `- x\n- y\nplain` → the lazy continuation `plain` carries the gap, reading as a paragraph below the list. `> a\n> b` → the gap sits above `b`, rendered as quote-tinted space with the nesting bar unbroken; `a` (first quote line) keeps only the quote's block padding.

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

- **PARA-E-5** — A single `\n` between two non-blank prose lines MUST render as a visual paragraph break (the PARA-R-7 gap above the second line) while remaining one CommonMark paragraph in source; the gap is render-only and MUST NOT add, remove, or move any byte. This deliberately diverges from rendered-Markdown output (which would join the lines) — adopted 2026-07-19 by user election, reversing this clause's previous prohibition.
  _Example:_ `line one\nline two` stays two source lines / one CommonMark paragraph; the editor shows `line two` below a paragraph gap.
