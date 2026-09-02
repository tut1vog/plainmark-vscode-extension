---
prefix: NAV
title: Caret & Navigation
kind: cross-cutting
---

# Caret & Navigation

Cross-cutting caret rendering, caret/selection mechanical invariants, and
navigation behavior that spans constructs rather than belonging to any single
one. Plainmark's live-preview model hides marker bytes and collapses whole
constructs into replaced widgets; this file owns the GENERAL machinery that
keeps the caret visible, keeps it out of hidden ranges, and keeps the
selection's numeric fields well-formed under arbitrary keystroke streams.

The caret is kept out of collapsed/hidden source by two atomicity mechanisms,
both owned here:

- **Explicit atomic ranges** (`EditorView.atomicRanges`) — a range the caret
  must treat as a single stop, so arrow keys skip over it instead of stepping
  through its hidden interior characters one at a time. Registered only by the
  list marker layer.
- **Block-replace widgets** (`Decoration.replace({ block: true })`) — a
  collapsed block construct that does not reveal to raw source (the table) is
  caret-atomic by its block-replace semantics; CM6 will not place the caret
  inside a block widget, so no explicit atomic range is needed.

The blockquote and callout `>` prefixes are NOT atomic: per-line reveal
shows the active line's `>` as ordinary editable text and the caret navigates
it like any character (`BQ-R-2` / `BQ-I-11`). The retired caret-anchor-widget
mechanism is covered in the §R note.

Construct-specific caret behavior already owned by construct files is NOT
restated here; this file is referenced via `[inherits:NAV-…]` or in prose:
table cell traversal (`TBL-I-1` and the other `TBL-*` clauses), image caret
reveal (`IMG-I-4`), and the math / mermaid caret-reveal traps live in their own
specs. Those
constructs that collapse via caret-reveal (image, inline/block math, mermaid)
do NOT register atomic ranges — the caret enters their source range to reveal
it, which is construct-owned behavior, not the general atomic mechanism.

Section codes: `R` caret rendering · `N` navigation across widgets and reveal
boundaries · `M` mechanical caret/selection invariants · `S` caret-position
synchronization.

Notation in examples: `|` = caret, `→` = action/result, `\n` = literal newline.

## R — Caret rendering

Render-only treatment of collapsed/hidden source: it MUST NOT mutate bytes.
Section code `R`.

> _NAV-R-1, NAV-R-2, NAV-R-3 (the caret-anchor-widget clauses) were retired by the per-line-reveal rework. Per-line reveal (`BQ-R-2` / `BQ-I-11`) shows the active line's hidden prefix as real glyphs, so the caret measures against real text and no synthetic caret-anchor widget is emitted; its sole consumer was deleted. IDs not reused._

- **NAV-R-4** `[inherits:INV-SP-1]` — Marker-hiding and block-collapse decorations are render-only; introducing, moving, or removing them MUST NOT modify document bytes.
  _Example:_ moving the caret onto and off a blockquote line swaps the `>` between hidden and revealed but the `> ` bytes are unchanged.

## N — Navigation across widgets and reveal boundaries

Arrow / Home / End / vertical movement across atomic ranges and replaced
widgets. Section code `N`.

- **NAV-N-1** — A collapsed construct's hidden source range MUST be navigationally atomic — either registered as an `EditorView.atomicRanges` range (the list marker prefix) or collapsed behind a `block: true` replace widget (the table) — so horizontal arrow navigation crosses it in a single step, landing the caret immediately before or after the range rather than at any interior offset.
  _Example:_ ArrowRight approaching a collapsed table → the caret jumps from just before the table to just after it, never onto a hidden `|` or `-`. (Table specialization: `TBL-I-1` for mouse activation, `TBL-I-22`–`TBL-I-25` for keyboard entry from adjacent lines.)
- **NAV-N-2** — The hidden marker prefix of a list item MUST be registered as an `EditorView.atomicRanges` range so ArrowLeft / ArrowRight treats the whole prefix as one stop instead of stepping through each hidden marker byte. Blockquote and callout `>` prefixes are NOT atomic under per-line reveal (the active line's `>` is ordinary editable text — see the header note).
  _Example:_ `1.  hello` with the list marker hidden → ArrowLeft from `h` lands before the rendered content as one step, not between `1` and `.`.
- **NAV-N-3** `[smoke]` — Vertical navigation (ArrowDown / ArrowUp) over a block-level replaced widget MUST land the caret on the line below / above the widget, never inside the widget's collapsed source.
  _Example:_ ArrowDown from the line above a `$$…$$` math block → caret lands on the line below the block.
- **NAV-N-4** — Atomic-range registration MUST track the live decoration set: a range that is no longer collapsed (e.g. its construct revealed because the caret entered it) MUST NOT remain atomic, and a newly collapsed construct MUST become atomic on the same recompute.
  _Example:_ revealing a table for editing removes its atomic range; collapsing it again restores it.
- **NAV-N-5** `[accepted]` — Caret-reveal constructs (image, inline / block math, mermaid) MUST NOT register atomic ranges; the caret deliberately enters their source range to reveal and edit it. Skipping is provided by the per-construct caret-reveal handler, not by this file's atomic mechanism.
  _Example:_ ArrowRight into `![alt](url)` reveals the source so it becomes editable, rather than jumping over it. (Image specialization: `IMG-I-4`.)
- **NAV-N-6** `[smoke]` — Word-wise horizontal motion and selection (Ctrl+Arrow / Ctrl+Shift+Arrow; Alt on macOS) MUST stop at `Intl.Segmenter` word boundaries inside an unspaced run of Han / Hiragana / Katakana instead of skipping the whole run as one group. The refined stop is the seam between the outermost two word segments of the skipped span; whitespace the group walk absorbed at either edge of the span MUST NOT be taken as the boundary (`a| 世界中国` → Ctrl+Right → `a 世界|中国`, not `a |世界中国`). The refinement MUST apply only when the skipped span lies on a single line and contains such a character; motion over any other text MUST be identical to the CM6 default.
  _Example:_ `|你好世界` → Ctrl+ArrowRight → `你好|世界`, not `你好世界|`.
- **NAV-N-7** `[smoke]` — Word-wise deletion (Ctrl+Backspace / Ctrl+Delete; Alt on macOS) MUST delete only up to the nearest `Intl.Segmenter` word boundary inside an unspaced run of Han / Hiragana / Katakana instead of deleting the whole run as one group. As for NAV-N-6, an absorbed edge space is not the boundary: `世界中国 |` → Ctrl+Backspace → `世界|` (the last word and its space go together), never just the space. The refinement MUST apply only when the deleted span lies on a single line and contains such a character; deletion over any other text MUST be identical to the CM6 default, including its single-space and atomic-range rules.
  _Example:_ `你好世界|` → Ctrl+Backspace → `你好|`, not `|`.
- **NAV-N-8** — ArrowDown / ArrowUp on a non-empty selection MUST, in one keystroke, collapse the selection to its end / start edge and move the caret one visual line down / up from that edge; when no line exists in that direction the caret lands on the edge's visual line end / start instead. This replaces the CM6 default of collapsing without moving. It applies to the plain vertical arrows only: horizontal arrows and every other selection-collapsing motion keep the CM6 collapse-in-place default, and Shift+Arrow selection extension is unchanged.
  _Example:_ a selection inside line 2 of a three-line document → ArrowDown → an empty caret on line 3, in a single press.
- **NAV-N-9** `[smoke]` — A plain primary-button click (single click, no modifiers) whose point falls RIGHT of a line's last visible glyph — anywhere in the blank space, including past the content column's right edge — when every byte between the visible end and the line end belongs to hidden-marker runs (a collapsed link's `](url)` tail, trailing emphasis marks), MUST land the caret at the line end on release rather than at the last visible position. The hidden span (`width:0` `overflow:hidden`) is unreachable by hit-testing, so the browser resolves such clicks to the visible text end and would strand the caret mid-line — inside the construct — violating the plain-text convention that clicking past a line's end reaches its end; a press outside the content column never reaches the editor's own handlers at all, so there the browser's native placement moves the caret to the visible end itself, or ignores the press entirely. The press-time hit position and geometry decide (markers still render per the pre-press selection); a press arms when it resolves to the visible end or the line end. The remap is dispatched with the release when the press left a single empty caret at the visible end or left the pre-press selection untouched, and it takes precedence over the release-time marker snap — an armed press is a caret-placement gesture, never a drag. A click at or left of the last glyph's right edge, a modified or multi-click, and a drag MUST keep the default mapping — clicking ON the text still lands inside the link text for editing. The construct then reveals per the normal boundary-caret rule (MRS-R-3), caret after its closing marker.
  _Example:_ `[text](url)` collapsed to `text` → click in the blank area right of `text` → `[text](url)|` (revealed); click the right half of the final `t` → `[text|](url)` (revealed).

## M — Mechanical caret/selection invariants

The numeric oracles the atomic-range machinery exists to protect, pinned by the
caret-invariant fuzz and the monkey fuzz.
These MUST hold after any keystroke regardless of which decorations or widgets
are in play. Section code `M`.

- **NAV-M-1** — After any keystroke, `selection.main.head` MUST satisfy `0 <= head <= doc.length`.
  _Example:_ a random walk of arrow / Home / End / PageUp / PageDown keys on a generated document → head never escapes `[0, doc.length]` (caret-invariants oracle O1).
- **NAV-M-2** — After any keystroke, `selection.main.anchor` MUST satisfy `0 <= anchor <= doc.length`.
  _Example:_ the same random walk → anchor never escapes the document bounds (oracle O2).
- **NAV-M-3** — For the main range, `from <= to` MUST always hold.
  _Example:_ any selection produced by navigation or editing keeps `from <= to` (oracle O3).
- **NAV-M-4** — The main range MUST stay within document bounds: `0 <= from` and `to <= doc.length`.
  _Example:_ a selection extended past EOF clamps to `doc.length`, never beyond (oracle O4).
- **NAV-M-5** — The caret MUST NOT come to rest strictly inside any atomic range; for every atomic range `[from, to)`, `head > from && head < to` MUST be false.
  _Example:_ arrow-walking up to and over a collapsed table → head is at `from` or `to`, never an interior offset (oracle O5).
- **NAV-M-6** — These mechanical oracles MUST continue to hold when navigation is interleaved with document-mutating keystrokes (typing, Enter, Backspace, Delete) that trigger widget and decoration rebuilds, not only under caret-only movement.
  _Example:_ the caret-invariant fuzz re-asserts O1–O5 after every action with edits interleaved; the monkey fuzz mixes the same interleaving across many seeds and re-asserts live-tree/full-parse integrity after every key.

## S — Caret-position synchronization

Broadcasting the main-view caret to the host so a Plainmark → text-editor toggle
seeds VS Code's text editor at the same place.
Section code `S`.

- **NAV-S-1** — The main-view caret MUST be reported to the host as zero-based `(line, character)` derived from `selection.main.head`, where `line` is `doc.lineAt(head).number - 1` and `character` is `head - line.from`.
  _Example:_ caret at offset 6 in `hello\nworld` → `{ line: 1, character: 0 }`.
- **NAV-S-2** — A `cursor_changed` message MUST be posted only when a transaction sets the selection OR changes the document; a transaction touching neither MUST NOT post.
  _Example:_ an effect-only no-op transaction → no `cursor_changed` post.
- **NAV-S-3** — Consecutive identical `(line, character)` positions MUST be deduplicated; a second update resolving to the same position MUST NOT post a second message.
  _Example:_ two selection events both resolving to `(0, 2)` → exactly one `cursor_changed` post.
- **NAV-S-4** — A document change that shifts the caret MUST report the NEW post-change position (computed against the updated state).
  _Example:_ inserting `X` at offset 0 of `hello` with the caret at offset 5 → reports `{ line: 0, character: 6 }`.
- **NAV-S-5** `[accepted]` — Table cell subviews are intentionally not wired into cursor sync; while the caret sits inside a table widget the reported position points at the widget's source range, a coarse but deliberate fallback (table-cell cursor precision is deferred).
  _Example:_ caret inside a table cell → the host receives the table's main-view source position, not the in-cell column.
