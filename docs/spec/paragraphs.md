---
prefix: PARA
title: Paragraphs and Line Breaks
kind: construct
---

# Paragraphs and Line Breaks — Specification

Normative behavior for paragraphs and line breaks. A paragraph is the **baseline
construct**: it is the absence of any other construct; source semantics are plain
CommonMark with **no** input remapping (Enter inserts one `\n`). Rendering adds
one thing on top: the **hard-newline paragraph gap** (PARA-R-7) — a render-only
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

- **PARA-R-7** — Every gap-eligible line after the first document line MUST carry paragraph-gap padding-top (`--plainmark-paragraph-gap`, default `0.75em`) — padding, never margin (CM6 height-map rule). Prose lines, blank lines (inside a list or out), and setext-heading lines (unstyled in Plainmark) are gap-eligible; frontmatter lines never are. PARA-R-8–PARA-R-11 classify list lines, quote interiors, and block constructs; PARA-R-12 pins eligibility stability under editing.
  _Example:_ `a\n\nb` → the gap sits above the blank line and above `b`; a doc-top frontmatter block renders gap-free.

- **PARA-R-8** — List-line eligibility MUST be seam-local. In-list lines on which no `ListItem` starts — item continuations (lazy `- a\nb`, indented `- a\n  b`, a loose item's later paragraphs) and blank lines between items — are gap-eligible, so a hard `\n` after a bullet reads as a paragraph break and a blank run between items renders as the same run would outside the list. A line a `ListItem` starts on is gap-eligible UNLESS a `ListItem` also starts on the line directly above (the tight seam, owned by the adjacent-sibling item spacing) — first-of-list and interior markers alike, independent of the marker's role in the parse. Extends PARA-E-5's recorded divergence: GitHub renders a marker directly under a continuation line tight; here it carries the gap.
  _Example:_ `para\n- x\n- y` → gap above `- x`; `- y` gets only the tight item spacing. `- a\n\n- b` → gap on the blank line and on `- b`.

- **PARA-R-9** — Interior blockquote and callout lines MUST share this rhythm as specified by BQ-R-13 (quote interiors gapped; quoted construct-start lines excluded) and CALL-R-11 (callout bodies gapped except the first body line). In-quote lists follow PARA-R-8, probed past the lexical `>`/whitespace prefix. Extends PARA-E-5's recorded divergence into quotes: `> a\n> b` renders joined on GitHub but gapped here.
  _Example:_ `> a\n> b` → gap above `b`, rendered as quote-tinted space with the nesting bar unbroken.

- **PARA-R-10** — The START line of every block construct MUST be gap-eligible — the opening fence of fenced code, the first line of indented code, of HTML/comment/processing-instruction blocks, of tables and block math, ATX heading lines, horizontal rules, and the first line of the outermost blockquote or callout — so every block separates from the content above it with the same rhythm prose uses. Interior lines of those constructs (code body and closing fence, table rows past the first, HTML/math interiors) MUST NOT take the gap.
  _Example:_ `` para\n```js\ncode\n``` `` → gap on the fence header only; two stacked fenced blocks separate by one gap.

- **PARA-R-11** — A construct-start gap MUST render as CLEAR space, never a tinted band. Each construct composes the gap with its own chrome per its spacing clauses: tinted or breathing-room chrome bottom-anchors past it or stacks it (CBLK-R-5, HTML-R-4, BQ-R-13, CALL-R-11, HR-R-6), headings replace their padding-top with exactly the base-size gap (HEAD-R-9), and block widgets carry it as `plainmark-block-gap-above` padding-top when not at the doc top (TBL-R-10, MATH-R-7, IMG-R-11).
  _Example:_ `para\n> a` → clear gap above the quote box, then the quote's own tinted padding. `# a\n## b` → `## b` carries exactly one base-size gap.

- **PARA-R-12** — Gap eligibility MUST be invariant under edits to other lines: a line's gap may change only when that line or the line directly above it is edited. Marker-typing transitions (`para\n-` setext state, `para\n* ` paragraph state, `para\n* x` list state) keep the gap; converting a paragraph line into a fence, HR, heading, or quote first line keeps it (the construct start is itself eligible); deepening an interior quote line with another `>` keeps it; typing or deleting between two list items — splitting the spanning list or merging blocks into it via lazy continuation — changes no line's eligibility. The permitted moves are the semantic ones: completing a bullet on a line hands its gap to item spacing in that keystroke, and a marker line moves only when the line above becomes or ceases to be a marker line (a tight seam forming or dissolving).
  _Example:_ `- abc\n\n- def` → typing `x` on the blank line, or deleting it back out, changes no line's gap.

## I · Interaction

- **PARA-I-1** — Enter in a paragraph MUST insert a single `\n` (CM6 default newline). It MUST NOT insert `\n\n` or inject any blank line — the Typora-style `\n\n` remap was reverted.
  _Example:_ `foo|bar` → Enter → `foo\n|bar` (one newline, no blank line).

- **PARA-I-2** — Typing printable characters in a paragraph MUST insert plain text at the caret with no marker insertion, redirect, or chrome (no construct keymap claims the keystroke).
  _Example:_ `ab|cd`, type `X` → `abX|cd`.

- **PARA-I-3** — A hard line break MUST follow CommonMark verbatim with no special Plainmark keymap or rendering: two trailing spaces before a newline, or a backslash before a newline, produce a hard break; Plainmark adds nothing.
  _Example:_ `foo  \nbar` (two trailing spaces) and `foo\\\nbar` are hard breaks, handled by the parser, not by a Plainmark Enter override.

- **PARA-I-4** — No paragraph-specific keystroke behavior ships; paragraph editing falls through to the CM6 default keymap and history. The two seam-conversion commands (PARA-I-5, PARA-I-6) are explicit palette commands, never keystroke or paste behavior.
  _Example:_ no `paragraph-toggle` or `insert-paragraph-break` command is bound; Backspace/Enter use CM6 defaults on a plain line.

- **PARA-I-5** — The **Plainmark: Add blank lines between paragraphs** command MUST insert one blank line at every single-`\n` seam interior to a document-level paragraph (each source line becomes its own CommonMark paragraph for conforming renderers), at every seam where two document-level convertible blocks — paragraph, ATX heading, bullet/ordered list — sit directly adjacent (every such adjacency has a heading or list boundary, both block-start contexts, so the parse is unchanged; the blank is the conventional surround), and at every QUOTE-EXIT seam — a document-level blockquote or callout whose node ends directly above a non-blank line. The exit line already parses outside the quote (BQ-E-1), so the blank is the conventional surround, and without it a conforming renderer absorbs that line into the quote; the intra-paragraph guards do not transfer there — trailing whitespace on the quote's last line is not hard-break continuation (the line below is a separate block), and behind the blank a conforming renderer parses the exit line in a fresh block context, exactly the house parse, so no re-parse trap exists. Interior carve-out lines (BQ-E-12) sit inside the quote node and are never exit seams. All insertions MUST land in one transaction (a single undo step), and every inserted byte is a lone `\n` at a line start — no other byte changes. It MUST leave untouched: hard-break seams interior to a paragraph (a line ending in two spaces or a backslash — PARA-I-3), intra-paragraph seams whose next line would re-parse as a different block behind a blank line (leading 4+ spaces or tab, ordered-list markers, `<`-led HTML, `|`-led table rows), list interiors and lazy continuations, paragraphs inside any container (list item, blockquote, callout), quote ENTRY seams (`para\n> q` — a quote interrupts a paragraph identically with or without the blank; conversion there stays deferred), and setext headings on either side of a seam. When nothing qualifies — including when the parse is incomplete — it MUST dispatch nothing. (Registration and routing are owned by SHELL-C-15.)
  _Example:_ `a\nb\nc` → command → `a\n\nb\n\nc`; `# h\npara` → `# h\n\npara`; `para\n- x` → `para\n\n- x`; `a  \nb` keeps its hard-break seam; `> q\nreply` → `> q\n\nreply` (the quote-exit seam gains its conventional blank, so `reply` stays outside the quote for conforming renderers) while `> a\n> b` and `para\n> q` are untouched.

- **PARA-I-6** — The **Plainmark: Compact paragraphs** command MUST, in one transaction (a single undo step): (1) join the lines of every multi-line document-level paragraph — each interior newline and its surrounding spaces/tabs collapse to one space, or to nothing when the characters on both sides are CJK (Han, Hiragana, Katakana, CJK punctuation) — skipping hard-break seams; and (2) delete every blank-line run lying between two document-level convertible blocks — paragraph, ATX heading, bullet/ordered list — except the semantically-guarded pairings: a paragraph directly after a list would lazily continue its last item (never removed); a list behind a paragraph keeps its blank unless its first line can interrupt a paragraph (a non-empty bullet, or a non-empty ordered item numbered 1 — behind an ATX heading no interrupt rule applies); a setext-underline-lookalike paragraph (a bare `=`/`-` run) keeps its blank behind another paragraph. List interiors are never touched (loose stays loose), and setext headings are never convertible (removing the blank above one absorbs the preceding paragraph into its content). Container interiors, other constructs, and doc-edge blank runs stay untouched; when nothing qualifies it MUST dispatch nothing. The dialect ambiguity resolves toward adoption: a single-`\n` seam inside one CommonMark paragraph reads as a wrap to join, so a rerun on already-compacted content joins those seams too — deliberate, and one undo step restores. (Registration and routing are owned by SHELL-C-15.)
  _Example:_ `# t\n\nintro\n\n- a\n- b\n\n## s` → command → `# t\nintro\n- a\n- b\n## s`; `- a\n\npara` keeps its blank (lazy continuation); `第一段\n第二段` → `第一段第二段` (no inserted space).

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

- **PARA-E-3** — A marker-less line below a blockquote does not lazily continue into it: quote laziness is disabled (cross-ref `blockquotes.md` BQ-E-1), so the line parses as a plain paragraph outside the quote and carries the normal paragraph gap (PARA-R-7).
  _Example:_ `> a\nb` → `a` quoted; `b` a plain gapped paragraph below the quote box.

- **PARA-E-4** `[smoke]` — A very long paragraph line MUST soft-wrap within the centered prose column without horizontal scroll, breaking at the column max-width (`--plainmark-container-max-width`) folded into `.cm-content`.
  _Example:_ a paragraph longer than the viewport wraps inside the centered column; no horizontal scrollbar appears.

- **PARA-E-5** — A single `\n` between two non-blank prose lines MUST render as a visual paragraph break (the PARA-R-7 gap above the second line) while remaining one CommonMark paragraph in source; the gap is render-only and MUST NOT add, remove, or move any byte. This deliberately diverges from rendered-Markdown output (which would join the lines).
  _Example:_ `line one\nline two` stays two source lines / one CommonMark paragraph; the editor shows `line two` below a paragraph gap.
