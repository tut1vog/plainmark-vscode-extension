---
prefix: BQ
title: Blockquotes
kind: construct
---

# Blockquotes — Specification

Normative behavior for blockquote rendering, interaction, and byte guarantees.
Covers plain blockquotes only; GFM alerts (`> [!TYPE]`) are specified in
`callouts.md` and referenced here where the two share the `Blockquote` node.

Example notation: `|` = caret, `→` = action/result, `\n` = newline (see README §2).

## R · Rendering

- **BQ-R-1** — Each blockquote line MUST receive a `Decoration.line` with class `plainmark-blockquote` and a `data-blockquote-depth="<n>"` attribute.
  _Example:_ `> quoted` → the line element carries `class="plainmark-blockquote" data-blockquote-depth="1"`.

- **BQ-R-2** — The `>` marker and its single trailing space MUST be revealed (shown as ordinary editable text) on the line the caret is on, and hidden on every other line of the blockquote. Reveal granularity is **per-line** (Obsidian Live Preview model), not whole-construct: a caret on one line of a multi-line quote reveals only that line's marker.
  _Example:_ `> a\n> b\n> c` with the caret on line 2 → line 2 shows `> b`; lines 1 and 3 render as `a` / `c` with markers hidden.

- **BQ-R-3** — When hidden (the caret is off the line), a `>` marker with no trailing space MUST hide only the `>` byte.
  _Example:_ `>hi` (no space), caret elsewhere → renders as `hi` with only the single `>` byte hidden.

- **BQ-R-4** — Nesting depth MUST be computed per line (count of `QuoteMark` tokens, with an ancestor-walk fallback for lazy-continuation lines). Each depth level adds one visual bar and one indent step, capped at depth 6.
  _Example:_ `> > deep` → depth 2; `> a\n> > b\n> c` → per-line depths 1, 2, 1.

- **BQ-R-5** `[smoke]` — Each nesting bar MUST be drawn by the corresponding `>` marker via an absolutely-positioned `::before` border-left (Obsidian's mechanism), coloured by `--plainmark-blockquote-border-color` at width `--plainmark-blockquote-border-width`. The bar's containing block MUST be the line element (`.plainmark-blockquote` is `position: relative`), not the inline marker, so the bar spans the line's FULL wrapped height (`top: 0; bottom: 0`) and stays continuous when a paragraph wraps across visual rows. The bar MUST NOT overshoot the line box: adjacent blockquote line boxes are flush (the collapse-adjacent rule zeroes inter-line padding), so the per-line bars meet exactly — a negative `top`/`bottom` overshoot would poke past the line background and double the (translucent) border colour into darker bands at every line boundary. Because each marker sits in normal inline flow at its natural width, the bar's static horizontal position lands it at its marker's left edge with no fixed-grid assumption. This matches Obsidian's `app.css` (`.cm-blockquote-border::before { position: absolute; top: 0; bottom: 0 }`).
  _Example:_ a depth-3 line draws three bars, each at its `>` marker's left edge; consecutive depth-3 lines show one unbroken, single-thickness set of bars aligned with the quote background; a single quote line whose text wraps to three visual rows shows one unbroken bar down all three rows.

> _BQ-R-6, BQ-R-7, BQ-R-8 (the marker-only-line caret-anchor-widget clauses) were retired by the per-line-reveal rework: per-line reveal shows the `>` as real glyphs on the active line, so the caret measures against real text and no synthetic caret-anchor is needed. IDs not reused._

- **BQ-R-9** `[smoke]` — When typing `>` converts the caret's line into a blockquote, the caret MUST render at the line's indented content column (immediately after the `>`), not at the pre-indent x. The depth-1 chrome adds `padding-left` in the same transaction that moves the caret; a re-measure is scheduled so `drawSelection` reads the post-padding geometry (smoke-only — the underlying Chromium layout-commit race does not reproduce headlessly).
  _Example:_ empty line, type `>` → caret sits just right of the rendered `>`, never to its left.

- **BQ-R-10** `[smoke]` — The quoted content MUST hug the innermost bar with a gap that stays CONSTANT at every nesting depth (Obsidian Live Preview parity). Because each `>` marker carries its own bar (BQ-R-5) and the markers sit in normal inline flow at natural width, each deeper level advances the visible content by exactly one natural marker width AND moves the innermost bar by the same amount — so the bar-to-content gap (one marker width) is constant at every depth, with no fixed-`em` grid that the natural glyph could drift away from.
  _Example:_ `> a` / `> > a` / `> > > a` → each "a" sits one constant gap right of its innermost bar; the gap does not shrink with depth.

- **BQ-R-12** `[smoke]` — A blockquote line's per-depth `padding-left` MUST be cancelled by an equal negative `text-indent` (net-to-zero hanging indent at every depth), so the line's content ORIGIN sits at the editor content-left. This keeps the CM6 `drawSelection` selection highlight aligned with the content: `drawSelection` derives one `leftSide` from the first visible `.cm-line`'s padding for the full-width "between" rectangle and open-ended span edges (SHELL-X-9), so a blockquote whose padding differs from that first line would otherwise draw its highlight offset by the difference. Horizontal-only (height-map-safe). The hanging-indent magnitude MUST be a PER-LINE value equal to the advance of that line's literal leading `>`/whitespace prefix — `gtCount × gt-advance + wsCount × space-advance`, where `gtCount`/`wsCount` are a lexical scan of the line's own leading run of `>` and whitespace characters — applied as a PER-LINE INLINE STYLE on the line decoration (`padding-left:<x>px;text-indent:-<x>px`), not via a CSS variable read through the theme cascade. The goal is that wrapped continuation rows hang under the line's FIRST VISIBLE GLYPH, matching Obsidian and the native preview: a continuation row hangs at `padding-left` while the first row's visible glyph begins after the marker(s) AND any intentional leading content spaces the user typed after `>` (these are content, not part of the marker — BQ-R-2 hides only the `>` and one trailing space), so the columns align only when `padding-left` equals the full advance to that glyph. The `gt-advance` (one `>` glyph) and `space-advance` (one space) are font-dependent values no fixed `em` can match, and Obsidian itself measures the glyph and writes the indent as an inline `element.style` for the same reason (it outranks the cascade, so it can't diverge between rendering hosts). They MUST be measured INDEPENDENTLY from CARET GEOMETRY — the `>` from any `QuoteMark`, the space from the first ` ` at/after that marker on its line — NOT as a combined `> ` width: a tight `>text` first marker (no trailing space) would otherwise yield a space-advance of zero and break the indent of every spaced line and every leading-content-space in the document. The per-line `gtCount`/`wsCount` are read from the line text. LIST-MARKER-LINE BRANCH: when the line's first content glyph after the quote prefix is a `ListMark`, the counts cover ONLY the lexical quote prefix (every `>` plus the one trailing space of the last marker) — the nesting spaces after it are hidden (LIST-R-2/LIST-R-11), so counting them would misplace the hang — and the inline pair becomes `padding-left:calc(<x>px + k * var(--plainmark-list-indent, 1em))` with the equal negative `text-indent`, where `k` is the `ListMark`'s `ListItem`-ancestor count (depth + 1): wrapped rows then hang at the item's text column, mirroring LIST-E-4's unquoted hang, while net-to-zero still pins the first-row origin (and thus the bar column). A list item's continuation line (no own `ListMark`) keeps the literal-run rule. The probe MUST keep re-measuring until the marker has actually rendered: on first paint the marker may have no box yet (a zero measurement), and if the document arrived in the editor's initial state no later doc/geometry change fires to re-trigger the measure — so without a bounded per-frame retry the line STICKS on the `em` pre-measure fallback, whose continuation rows visibly hang ~one space left of the first row, until the user happens to interact. The advance is measured by a probe ViewPlugin (retrying on first paint; re-measured on font/zoom change and when a marker first appears or scrolls in), pushed into a `StateField`, and read by the line-decoration builder. The theme's `em`-based per-depth `padding-left`/`text-indent` is the pre-measure fallback only (covers the first frame before the probe runs / hosts without the probe). The line's negative `text-indent` is inherited, and Chromium applies it inside inline / inline-flex children (spec-violating — `text-indent` should affect only a block container's first line; Firefox bug 1682380). It MUST therefore be reset to `0` on the line's DIRECT children (`.cm-line > *`, the same rule Obsidian's `app.css` ships), which preserves the block's own first-line hang and the bare body-text-node shift while stopping the indent from collapsing an inline widget's internal layout. A broad descendant reset (`*`) MUST NOT be used — it also strips the shift the webview applies to body-text spans and breaks the hang. A user override of `--plainmark-blockquote-indent-per-depth` / `--plainmark-blockquote-text-gap` does NOT override the inline indent — overriding the measured indent requires a higher-specificity rule.
  _Example:_ select across a plain paragraph and a `> quote` line → both selection highlights share the same left x; a `> > deep` line's highlight shares it too; a `> quote` line whose text wraps shows its continuation rows starting at the same column as a separate `> line`'s text; a `>   quote` line (extra leading content spaces) whose text wraps shows its continuation rows under the first visible glyph, not under the marker.

- **BQ-R-11** `[smoke]` — The `>` marker MUST be hidden by painting the glyph transparent (`color: transparent`), NOT by collapsing its width or `visibility:hidden`, so the glyph keeps its full natural inline box in BOTH the hidden (off-line) and revealed (active-line) states (Obsidian's mechanism). Consequences this guarantees: (1) **no reflow** — moving the caret onto or off a blockquote line changes only the marker's colour, never the layout, so neither the content nor any leading glyph shifts; (2) **caret stability** — the glyph fills its own box with no dead space, so `coordsAtPos` returns one x at the marker→content boundary regardless of arrival direction (no `assoc`-dependent split); (3) **drag-selectability** — the transparent glyph is still real text, so a selection over it yields the `>`-prefixed source. The marker MUST stay a `Decoration.mark` (the glyph remains in the DOM and inline flow), never a `Decoration.replace`. `color: transparent` (not `visibility:hidden`) is required because a `visibility:hidden` text run can return empty client rects, breaking `coordsAtPos`. This applies to blockquotes and callouts alike (both share the marker hide).
  _Example:_ caret on `>a` → the offset between the `>` and `a` paints at one x whether reached by ArrowRight or ArrowLeft; moving the caret onto or off any blockquote line (at any depth) shifts nothing.

- **BQ-R-13** — Quote interiors MUST share the prose paragraph rhythm (PARA-R-7, ADR-0007): every interior quote line at any depth — quoted prose, quoted blank lines (`>`), and quoted-list continuation lines — carries the paragraph gap, while the quote's FIRST line keeps only `--plainmark-blockquote-padding-y` as the block's outer breathing room. In-quote lists keep their own rules (marker lines tight, continuations gapped), and quoted non-prose constructs (fences, tables, headings) stay gap-free. The gap is padding inside the line box, so the quote background tints it and the per-marker bars (`top:0; bottom:0`, BQ-R-5) span it without a break.
  _Example:_ `> a\n> b` → `b` sits below a paragraph gap of quote-tinted space with the nesting bar continuous through it; `> - x\n> - y` keeps tight item spacing between the quoted bullets.

## I · Interaction

- **BQ-I-1** — Enter on a non-empty blockquote line MUST continue the quote: the next line is auto-prefixed with the current line's marker(s), preserving depth (provided by `markdownKeymap`; Plainmark's Enter override yields).
  _Example:_ `> first|` → Enter → `> first\n> |` (depth preserved for `> > x|` → `> > x\n> > |`).

- **BQ-I-2** — Enter on an empty `> ` line MUST remove ONE quote-marker level in place, inserting NO newline: the line keeps any remaining markers (or becomes plain at depth 1) and the caret stays on it. (Obsidian Live Preview: Enter on an empty quote line outdents one level.)
  _Example:_ `> first\n> |` → Enter → `> first\n|`; `> > foo\n> > |` → Enter → `> > foo\n> |`.

- **BQ-I-3** — The Enter outdent override MUST yield (return false) on a non-quote line and on a non-empty selection.
  _Example:_ `plain text|` → Enter → normal newline (override returns false); a selection spanning `> [foo]` → Enter → not handled by the exit override.

- **BQ-I-4** — Backspace inside a blockquote (and callouts, which are `Blockquote` nodes) MUST delete exactly ONE character at the caret — the trailing space, then the `>`, one per press — never the whole `> ` prefix and never the whole marker-only line. Per-line reveal makes the `>` ordinary editable text, so Backspace is plain character deletion (Obsidian): the markdown markup-demote (`deleteMarkupBackward`) and any empty-`> `-line outdent MUST NOT fire on a blockquote line. (Lists are unaffected — their marker-aware backspace stands.)
  _Example:_ `> hello`, caret after `> ` → Backspace → `>hello` → Backspace → `hello`; empty `> |` → Backspace → `>|` → Backspace → `|` (one char per press, the line is never removed in a single keystroke); `> > foo`, caret after `> > ` → Backspace → `> >foo`.

- **BQ-I-5** — The blockquote Backspace override MUST yield (return false) at column 0 (so the default line-join applies), on a non-empty selection (default range delete), and on any line not inside a `Blockquote` node.
  _Example:_ caret at the very start of `> foo` → Backspace → default join with the previous line; a selection across `> foo` → Backspace → default range delete.

> _BQ-I-6, BQ-I-7, BQ-I-8 (the marker-insert redirect and atomic-range marker-skip clauses) were retired by the per-line-reveal rework. With per-line reveal the active line's `>` is ordinary editable text — the caret navigates and edits it like any character (Obsidian behavior), so the insert-redirect and atomic skip are removed. IDs not reused._

> _BQ-I-9 (the lazy-continuation `\n`-prepend trap filter) was retired by the per-line-reveal rework. Native Obsidian Live Preview does NOT guard this path: typing on the empty line directly below a blockquote lazy-continues into the quote (CommonMark §5.1), and Plainmark now matches that. The explicit Enter empty-`> `-line outdent (BQ-I-2) removes one marker level in place with no inserted newline; Backspace is plain single-character deletion (BQ-I-4) — see those clauses. ID not reused._

- **BQ-I-10** `[accepted]` — No `Mod-Shift-B` blockquote-toggle shortcut ships in the MVP (deferred to a unified command surface).
  _Example:_ pressing Mod-Shift-B on a selection does nothing (no toggle command is bound).

- **BQ-I-11** — Moving the caret onto a blockquote line MUST reveal that line's `>` marker (BQ-R-2) on the next decoration recompute, and moving it off MUST re-hide it; only the caret's line is affected.
  _Example:_ `> a\n> b`, caret on line 1 → `> a` shown / `b` hidden; ArrowDown to line 2 → `a` hidden / `> b` shown.

- **BQ-I-12** `[smoke]` — While a pointer button is held, blockquote marker reveal MUST freeze to the PRE-PRESS selection (captured before the click moves the caret), neither hiding an already-shown `>` nor revealing a hidden one; the live selection takes over only on release. So a press on a line whose `>` is revealed keeps it shown, and a press/drag over a hidden `>` leaves it hidden until release, when the final selection reveals the covered lines (Obsidian: the `>` is hidden until the mouse is released). Because the hidden marker reserves its width (BQ-R-11), its slot is drag-selectable, so a selection covering it yields the `> `-prefixed source — no selection-snap is needed.
  _Example:_ caret on `> a` (`>` shown), press the mouse on that line → `>` stays shown; caret elsewhere (`> b`'s `>` hidden), drag across `> b\n> c` → both stay hidden during the drag and reveal as selected on release, a copy yielding the `> `-prefixed lines.

## SP · Source preservation

- **BQ-SP-1** — Marker continuation/outdent (Enter) and marker outdent (Backspace) MUST each be a single user-initiated edit at the caret; no bytes elsewhere change.
  _Example:_ Enter-continuation on `> a|\n> b` inserts exactly `\n> ` at the caret; the `> b` line is untouched.

- **BQ-SP-2** `[smoke]` — Each structural keymap edit MUST be a single transaction, so one Ctrl+Z reverts it.
  _Example:_ `> |` → Enter (outdent) → `|`; one Ctrl+Z restores `> |` exactly.

- **BQ-SP-3** `[inherits:INV-SP-1]` — Bytes outside the blockquote's source range are preserved verbatim through any blockquote edit.
  _Example:_ editing `> quote` in `intro\n\n> quote\n\noutro` leaves `intro` and `outro` byte-identical.

## E · Edge cases

- **BQ-E-1** — Lazy continuation `> a\nb` MUST apply depth-1 chrome to both lines (line 2 via the ancestor walk).
  _Example:_ `> a\nb` → both `a` and `b` render inside one depth-1 blockquote.

- **BQ-E-2** — Empty single-level `> ` MUST render depth-1 chrome on the empty line.
  _Example:_ a lone `> ` shows a depth-1 bar on an otherwise empty line.

- **BQ-E-3** — Empty nested `> > ` MUST render depth-2 chrome with both markers hidden (regression: must not collapse to depth 1).
  _Example:_ `> > ` → two bars + 2-step indent, both `>` markers hidden.

- **BQ-E-4** — Blank line inside (`> a\n>\n> b`) MUST parse as one blockquote: three depth-1 lines, middle line empty.
  _Example:_ `> a\n>\n> b` → one continuous quote with an empty middle line, not two quotes.

- **BQ-E-5** — Two blockquotes separated by a blank line MUST render as two independent chromes.
  _Example:_ `> a\n\n> b` → two separate quote blocks.

> _BQ-E-6 (trap-separator ~0px collapse) and BQ-E-7 (marker-only-line height parity) were retired by the per-line-reveal rework. The trap-separator visual collapse is removed — it was an Obsidian community-CSS snippet, not native behavior, so the separator gap returns as in stock Obsidian Live Preview. BQ-E-7's height-step concern was an artifact of the deleted caret-anchor widgets. IDs not reused._

- **BQ-E-8** — Tight nesting (`>>foo`, `>>> a`) MUST parse and render identically to its spaced equivalent.
  _Example:_ `>>foo` renders like `> > foo` (depth 2); `>>> a` like `> > > a` (depth 3).

- **BQ-E-9** `[smoke]` — A list or code fence inside a blockquote MUST compose: blockquote chrome wraps the inner construct's rendering. For lists the composed geometry contract is LIST-R-11 (depth-driven marker step, quote bar and hanging indent intact) plus BQ-R-12's list-marker-line branch; Tab nesting inside the quote is LIST-I-14. Display math (`$$…$$`) is the known exception — it does NOT render inside a blockquote (cross-ref `math.md` MATH-E-13); inline math (`$…$`) does.
  _Example:_ `> - item` → blockquote chrome with a rendered bullet inside, the bullet at the quote text column; `> $$\na\n> $$` → no typeset block (MATH-E-13); `> $x$` → inline math renders.

- **BQ-E-10** — On a `> [!TYPE]` line the callout decoration MUST take over the header chrome and suppress `data-blockquote-depth`; plain blockquotes MUST still receive multi-bar chrome (cross-ref `callouts.md`).
  _Example:_ `> [!NOTE]` → callout header (no `data-blockquote-depth`); `> plain` → normal depth-1 bar chrome.

- **BQ-E-11** — An empty `> ` line (marker-only) with the caret elsewhere MUST render its depth chrome with the `>` hidden; with the caret on it, the `>` MUST reveal as editable text. No caret-anchor widget is emitted (retired by the per-line-reveal rework).
  _Example:_ `> a\n> \n> b`, caret on line 1 → middle line shows depth-1 chrome, empty; caret on the middle line → it shows `> `.
