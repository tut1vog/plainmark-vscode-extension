---
prefix: CALL
title: Callouts
kind: construct
---

# Callouts — Specification

GitHub-style callouts (`> [!NOTE]`, `> [!WARNING]`, …) are a **specialization of
blockquotes** (prefix `BQ`, see `blockquotes.md`). A callout is a `Blockquote`
Lezer node whose first line, after stripping the `>` prefix(es), matches
`/^\[!([A-Za-z]+)\]([-+])?\s*(.*)$/`. Detection runs inside the existing
`Blockquote` node handler (no Lezer grammar extension); when it matches, callout
chrome replaces the plain multi-bar blockquote chrome for that node's range.

The underlying blockquote chrome — per-line `>` marker reveal/hide (BQ-R-2 /
BQ-R-3) and the single-keypress empty-line Enter/Backspace exit (BQ-I-2 /
BQ-I-4) — is **inherited** from the `BQ` clauses and not re-specified here. (The
marker-insert redirect, marker-only caret-anchor widgets, and the BQ-I-9
lazy-continuation trap filter were retired by the per-line-reveal rework — see `blockquotes.md`.) This
document specifies only the callout-specific layer: marker detection, the header
widget (icon + title), per-type styling, the type-autocomplete affordance, and
the static fold marker.

Example notation: `|` = caret, `→` = action/result, `\n` = newline (see README §2).

## R · Rendering

- **CALL-R-1** — A top-level `Blockquote` whose first line (after the strip of `/^(\s*>\s?)+/` and any further leading whitespace) matches `/^\[!([A-Za-z]+)\]([-+])?\s*(.*)$/` MUST be detected as a callout, yielding the raw type, the optional fold marker (`-`/`+`), and the trimmed trailing title. Detection runs only on the node's first line.
  _Example:_ `> [!NOTE] Heads up` → callout; raw type `NOTE`, fold `null`, title `Heads up`.

- **CALL-R-2** — The canonical type MUST be the lowercased raw type when it is one of the five known types (`note`, `tip`, `important`, `warning`, `caution`); any other keyword MUST resolve to `unknown`. There is **no alias table** — `hint`, `info`, `caution`-as-Obsidian-alias etc. all resolve to `unknown`.
  _Example:_ `> [!Note]`, `> [!NOTE]`, `> [!note]` → all canonical `note`; `> [!HINT]` → `unknown`.

- **CALL-R-3** `[smoke]` — When the caret is NOT on the header line, the marker range `[marker_from, marker_to]` MUST be replaced by a `CalloutTitleWidget` (`Decoration.replace`) rendering an icon span followed by a title-text span; the raw `[!TYPE]<fold> <title>` bytes MUST be hidden. When the caret IS on the header line the widget MUST be dropped and the raw header bytes shown (per-line reveal, CALL-I-1).
  _Example:_ `> [!WARNING] Be careful` caret on a body line or outside → widget: warning icon + "Be careful"; caret on the header line → raw `> [!WARNING] Be careful`.

- **CALL-R-4** `[smoke]` — The header line MUST receive `Decoration.line` with classes `plainmark-callout plainmark-callout-header`, attributes `data-callout-type="<canonicalType>"`, `data-callout-fold="<fold or ''>"`, `role="note"`, and `aria-label="<synthesized title>"`. Each body line MUST receive `Decoration.line` with classes `plainmark-callout plainmark-callout-body` and `data-callout-type`. The last line additionally MUST receive class `plainmark-callout-last` (for symmetric bottom padding).
  _Example:_ `> [!success]\n> done` → line 1 `plainmark-callout-header[data-callout-type="success?→unknown]`; line 2 `plainmark-callout-body plainmark-callout-last`.

- **CALL-R-5** `[smoke]` — The per-type accent (the left accent bar drawn as a `background-image` linear-gradient at the `--plainmark-callout-margin-x` offset, plus a `color-mix` background tint, plus the header text/icon color) MUST be keyed off `data-callout-type`. The accent chains to a `--vscode-charts-*` color with a literal fallback: note→blue, tip→green, important→purple, warning→yellow, caution→red, unknown→`--vscode-descriptionForeground`.
  _Example:_ `> [!warning]` → orange/yellow accent bar + 10%-tint background + yellow title color.

- **CALL-R-6** `[smoke]` — The icon MUST be the inline Octicon SVG (`fill="currentColor"`, 16×16) registered for the canonical type, falling back to the `unknown` icon when the canonical type is `unknown`.
  _Example:_ `> [!tip]` → light-bulb SVG; `> [!HINT]` → unknown (`?`-style) SVG.

- **CALL-R-7** — When the marker line carries no title (empty or whitespace-only trailing text), the header MUST synthesize one: the canonical title (`Note`/`Tip`/`Important`/`Warning`/`Caution`) for a known type, or the raw type with first letter capitalized for an `unknown` type.
  _Example:_ `> [!note]` → "Note"; `> [!HINT]` → "Hint"; `> [!FOO]` → "Foo".

- **CALL-R-8** `[smoke]` — When a fold marker (`-`/`+`) is present, the widget MUST append a static `plainmark-callout-fold-marker` glyph (`▸` for `-`, `▾` for `+`) with `aria-hidden="true"` and `title="Collapsibility coming in a later release"`. The glyph MUST have no click handler and MUST NOT collapse the body.
  _Example:_ `> [!TIP]- Hidden` → header shows tip icon + "Hidden" + a `▸` glyph; the body still renders fully.

- **CALL-R-9** — Body lines MUST render as ordinary blockquote content under the callout's line chrome; only the first line carries the header widget. A marker-only body line (`> ` with no content) follows the inherited per-line reveal (BQ-R-2 / BQ-E-11): its `>` hides when the caret is elsewhere and reveals when the caret is on it. No caret-anchor widget is emitted (retired by the per-line-reveal rework).
  _Example:_ `> [!NOTE]\n> **bold**\n> ` → header on line 1; line 2 bold; line 3 empty shows depth chrome, and `> ` when the caret is on it.

- **CALL-R-10** `[smoke]` — Callout content MUST hug the accent bar by the same gap a depth-1 blockquote uses, so callout and blockquote text share the same content x. The hanging-indent magnitude MUST be the per-line value of BQ-R-12 — `gtCount × gt-advance + wsCount × space-advance` from a lexical scan of that line's leading `>`/whitespace run — applied as a PER-LINE INLINE STYLE (`padding-left:<w>px;text-indent:-<w>px`) on EACH header and body line decoration. The equal negative `text-indent` nets the content ORIGIN to the editor content-left for selection alignment (same net-to-zero hanging indent as BQ-R-12, inheriting SHELL-X-9); the visible inset comes from the hidden `>` marker slot / title-widget offset, and the accent bar (CALL-R-5) overlaps it rather than displacing the content. Because each line's `padding-left` equals the advance to that line's first visible glyph, a wrapped body line's continuation rows hang under its first row's visible text even when the body line carries intentional leading content spaces. The theme's `--plainmark-callout-margin-x + --plainmark-callout-text-gap` `padding-left`/`text-indent` is the pre-measure first-frame fallback only (covers the frame before the probe runs); the inline measured indent outranks it. The negative `text-indent` is inherited, and Chromium applies it inside the inline-flex title, collapsing its icon/label gap (BQ-R-12; Firefox bug 1682380). It MUST be reset to `0` on the line's DIRECT children (`.cm-line > *`), NOT via a broad descendant reset (which would also strip the body text's first-line shift and break wrapped-row alignment).
  _Example:_ `> [!NOTE]\n> abc` above `> dfd` (plain blockquote) → "abc" and "dfd" left-align on the same x, and a selection across both shares the same left edge; a `> ` body line long enough to wrap shows its continuation rows starting at the same column as the first row's text.

- **CALL-R-11** — Callout bodies MUST share the prose paragraph rhythm (PARA-R-7, ADR-0007): body lines carry the paragraph gap; the header line does not (its spacing stays CALL-R-4's chrome — `--plainmark-callout-padding-y` on top, `--plainmark-callout-title-padding-bottom` below — so the title→first-body seam is that title padding plus the first body line's gap). The gap is padding inside the line box, so the accent gradient (CALL-R-5) spans it unbroken.
  _Example:_ `> [!note] t\n> body\n> more` → the gap sits above `body` and above `more`; none above the header line.

## I · Interaction

- **CALL-I-1** `[smoke]` — Reveal MUST be **per-line**: the `CalloutTitleWidget` replace MUST be dropped (raw `[!TYPE]<fold> <title>` bytes shown for editing) whenever the caret is anywhere on the header line — including offset 0 — and restored when the caret leaves the header line. A top-of-doc callout with the caret at offset 0 on mount shows raw header source (accepted).
  _Example:_ `> [!NOTE] Hi|` → raw shown; `|> [!NOTE] Hi` (caret at offset 0, still on the header line) → raw shown; caret on a body line or outside → widget rendered.

- **CALL-I-2** — Moving the caret off the header line MUST restore the widget on the next decoration recompute (keyed on selection/doc/viewport change).
  _Example:_ reveal `> [!NOTE] Hi|`, then click into the body → header widget re-rendered.

- **CALL-I-3** — A `> [` autocomplete affordance MUST be wired (`callout_completions`, registered in the single `autocompletion({ override: [...] })` call in the editor's extension wiring). It MUST trigger when the text before the caret matches `/^(?:\s*>\s?)+\[$/` (caret immediately after the `[` on a blockquote line, any nesting depth, with or without the space after `>`), offering the five known types.
  _Example:_ `> [|` → completion list of NOTE / TIP / IMPORTANT / WARNING / CAUTION; `> > [|` (depth 2) also triggers.

- **CALL-I-4** — Each completion option MUST be labeled `!<TYPE>]`, detailed with the canonical title, and apply `!<TYPE>] ` (with a trailing space, caret-ready for a custom title). `from` MUST equal the caret position (insert after the existing `[`, not replace it). Fuzzy filtering MUST stay enabled (no `filter: false`).
  _Example:_ at `> [|`, choosing "Warning" inserts `!WARNING] ` → `> [!WARNING] |`.

- **CALL-I-5** — The completion MUST NOT trigger outside a blockquote line, before the `[`, or once any character follows the `[`.
  _Example:_ `[|` (no `>`) → no completions; `> [foo|` → no completions; `> |[` (caret before `[`) → no completions.

> _CALL-I-6 (the typing-before-`>` demotion compromise) was retired by the per-line-reveal rework together with the BQ-I-6 marker-insert redirect. With per-line reveal the header line's `> [!TYPE]` is ordinary editable text — the caret edits it like any character (Obsidian behavior) — so the offset-0 demotion compromise no longer applies. ID not reused._

- **CALL-I-7** `[accepted]` — Exit/continuation MUST be inherited from the blockquote keymap (BQ-I-1 / BQ-I-2 / BQ-I-4); no callout-specific exit keymap ships. The empty-`> `-line single-keypress exit fires on callout body lines too. No `Mod-Shift-B`-style callout-wrap shortcut and no interactive type-change menu ship in the MVP (deferred).
  _Example:_ `> [!NOTE]\n> |` → Enter (on empty body line) → `> [!NOTE]\n\n|` (single keypress exit).

## SP · Source-preservation

- **CALL-SP-1** `[inherits:INV-SP-1]` — All callout rendering (header widget, icon, fold glyph, per-type line/marker decorations, accent chrome) MUST be decoration-only and MUST NOT modify document bytes. The fold `-`/`+` byte is preserved verbatim and is never mutated by a fold toggle (no toggle exists).
  _Example:_ render `> [!NOTE]- Hi\n> body` then re-read the buffer → bytes byte-for-byte unchanged.

- **CALL-SP-2** — Accepting a `> [` completion (CALL-I-3 / CALL-I-4) is a legitimate user-initiated edit, not a render-time mutation; it inserts `!<TYPE>] ` at the caret via a normal CM6 transaction subject to undo. This MUST NOT be conflated with the decoration-only render path of CALL-SP-1.
  _Example:_ choosing "Note" at `> [|` inserts `!NOTE] ` → one undoable edit; one Ctrl+Z reverts it.

## E · Edge cases

- **CALL-E-1** — The callout MUST span from the `Blockquote` node's first line through its last line; body chrome applies to every line of the node, including blank interior `>` lines.
  _Example:_ `> [!NOTE]\n> a\n>\n> b` → header on line 1; body chrome on lines 2–4 (including the empty middle `>` line).

- **CALL-E-2** — A `[!TYPE]` marker on a non-first line of the blockquote MUST NOT be detected; the node renders as a plain blockquote.
  _Example:_ `> body\n> [!NOTE]\n> more` → plain blockquote, no callout chrome.

- **CALL-E-3** — A bare callout (`> [!NOTE]` with no body line) MUST render as a callout (header chrome only), and a plain or non-callout blockquote line MUST NOT.
  _Example:_ `> [!NOTE]` alone → callout header band; `> just a quote` and `> [foo] bar` → plain blockquotes.

- **CALL-E-4** — Whitespace variants MUST be tolerated: `>  [!NOTE]` (extra space), `>[!NOTE]` (no space after `>`), and trailing-only whitespace after the marker (treated as no title via the title trim).
  _Example:_ `>[!NOTE]` → canonical `note`; `> [!NOTE]   ` → title synthesized to "Note".

- **CALL-E-5** `[accepted]` — Obsidian pipe-metadata syntax (`[!NOTE|meta]`) MUST NOT be parsed; the `|` breaks the `[A-Za-z]+` type match, so `detect_callout` returns null and the line renders as a plain blockquote. Pipe-metadata is deferred; the forward-compatible expansion path keeps source bytes intact.
  _Example:_ `> [!NOTE|meta]` → plain blockquote, not an unknown-type callout.

- **CALL-E-6** `[accepted]` — A nested callout inside another blockquote/callout MUST NOT receive its own callout chrome: the inner `Blockquote` handler short-circuits (parent is `Blockquote`), and the outer detector strips all `>` prefixes so only the outer node is a callout. Matches GitHub "callouts cannot be nested"; Obsidian-style nesting is deferred.
  _Example:_ `> > [!NOTE]\n> > body` → one outer callout (detector strips both `>`); `> [!NOTE]\n> > [!WARNING]` → outer note callout, inner line is plain quoted text.

- **CALL-E-7** `[smoke]` — Callout chrome MUST suppress the plain-blockquote multi-bar chrome for the node's range: no `data-blockquote-depth` attribute and no stacked depth bars are emitted on callout lines (cross-ref BQ-E-10). The `>` markers follow the inherited per-line reveal (BQ-R-2): hidden off the caret's line, shown on it.
  _Example:_ `> [!NOTE]` → header line has `data-callout-type` but no `data-blockquote-depth`; `> plain` → normal depth-1 bar chrome.

- **CALL-E-8** `[unknown]` — A callout composes inside a list or other container, and inline constructs (footnotes, links, emphasis) compose inside callout body lines, but the interaction of the callout reveal model with a surrounding/contained construct's own reveal model is not verified and may surface as a bug.
  _Example:_ `- > [!NOTE]\n  > body` (callout in a list) → callout chrome renders; composition with list chrome is unverified.
