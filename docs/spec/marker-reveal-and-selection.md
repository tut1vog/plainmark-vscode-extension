---
prefix: MRS
title: Marker Reveal & Selection
kind: cross-cutting
---

# Marker Reveal & Selection

Cross-cutting behavior of the Obsidian-style live-preview model: inline markup
markers (emphasis `*`/`_`, strong `**`/`__`, strikethrough `~~`, inline code
`` ` ``, link / autolink brackets, and the backslash of escape sequences) are
HIDDEN when the caret is away and REVEALED when the caret enters the
construct's source range. This file also owns
the selection-driven editing behaviors (reveal, snap, wrap, line selection,
marker-aware backspace) that are not specific to any single construct.

Construct specs reference these `MRS-*` clauses instead of restating the
mechanism. Construct-specific reveal/snap details that already live in their own
files (e.g. `EMPH-R-5`–`EMPH-R-8`, `EMPH-I-1`–`EMPH-I-9`, `CODE-I-1`–`CODE-I-5`,
and the corresponding `LINK-*` / `AUTO-*` clauses) are NOT restated here.

Two reveal paths exist in the code and are both owned by this file. The
**predicate path** (`should_reveal_for_selection`) is
node-scoped, applies the non-strict-cover rule, and is gated by the pointer-down
freeze (while a button is held it evaluates the pre-press selection captured in
`frozen_reveal_selection_field`, not the live one); the emphasis family, inline
code, links, backslash escapes (`escapes.md`), fenced-code fence reveal
(`code-blocks.md` CBLK-I-1/CBLK-I-3), math widgets (`math.md`), and — unified via
DEF-7 (2026-06-12) — the image paragraph widget (IMG-I-1), mermaid block widget
(MMD-I-1), footnote reference reveal (FN-I-1), and the ordered-list per-line
reveal (LIST-I-3, evaluated against the item's own marker line range) call it
directly. The
**scaffold path** (`compute_reveal_ranges` + the intersection test in
`build_inline_decorations`) is line-expanded and feeds
a `revealed` boolean to `NodeHandler.handle`; it is the default for structural
handlers registered with the shared inline scaffold (T17.3.1). The two coexist
deliberately.

Notation in examples: `|` = caret, `→` = action/result, `\n` = literal newline.

## R — Reveal axis

How the inline layer decides which marker runs are hidden vs. shown. Section
code `R`.

- **MRS-R-1** — When no selection range satisfies the reveal predicate for a construct, that construct's leading and trailing marker runs MUST stay hidden (the marker-hiding decoration is emitted).
  _Example:_ `a **bold** b` with caret at `a| **bold** b` → `**` runs hidden, `bold` shown.
- **MRS-R-2** — An empty caret MUST reveal a construct when it lies inside or exactly on either boundary (`node_from <= caret <= node_to`); a caret outside that closed range MUST NOT reveal it. Reveal is node-scoped, not line-scoped.
  _Example:_ `a **bo|ld** b` → revealed; `|a **bold** b` (caret at line start) → hidden.
- **MRS-R-3** — A boundary-touching caret MUST count as inside, so a caret placed exactly at the first or last marker character reveals the construct.
  _Example:_ `a |**bold** b` (caret at the opening `*`) and `a **bold**| b` (caret after the closing `*`) → both reveal.
- **MRS-R-4** — For a non-empty selection, the construct MUST reveal unless the selection strictly extends past it on BOTH sides (`r.from < node_from && r.to > node_to`); a selection that touches, partially overlaps, sits strictly inside, or is boundary-equal MUST reveal.
  _Example:_ select an entire line containing `x **bold** y` → markers stay hidden (strict cover); select `**bold**` exactly → revealed.
- **MRS-R-5** — A multi-range (multi-cursor) selection MUST reveal a construct if ANY single range would individually reveal it, and MUST NOT reveal it if none do (`selection.ranges.some(...)`).
  _Example:_ carets at line start and inside `**bold**` → revealed; carets at line start and on another line → hidden.
- **MRS-R-6** — On the scaffold path, the per-node `revealed` boolean MUST be computed by intersecting the node against the line-expanded selection ranges (each selection range grown to whole lines), so a caret anywhere on the node's line reveals scaffold-handled constructs on that line.
  _Example:_ a footnote ref on line 1 with the caret at line-1 start → revealed via the line-expanded range.
- **MRS-R-7** — The decoration set MUST be rebuilt on any transaction where the document changed, the viewport changed, the selection changed, OR the pointer latch flipped; a transaction touching none of these MUST NOT trigger a rebuild.
  _Example:_ the document-level mouseup that only clears the pointer latch → still rebuilds (so markers reappear on release).
- **MRS-R-8** `[smoke]` — A revealed construct's marker characters MUST render as ordinary visible, editable text (the marker-hiding decoration is simply not emitted).
  _Example:_ caret inside `**bold**` → the `**` glyphs are visible and editable.
- **MRS-R-9** `[inherits:INV-SP-1]` — Hiding or revealing markers MUST NOT modify document bytes; reveal is a decoration-only transform.
  _Example:_ moving the caret away from `**bold**` → source bytes unchanged.

## P — Pointer suppression

Anti-flicker behavior while the mouse button is held. Section code `P`.

- **MRS-P-1** — While a pointer (mouse button) is down, reveal recomputation MUST be suppressed and the revealed set frozen at its pre-mousedown value until the pointer is released.
  _Example:_ mousedown then click-drag across `**bold**` → markers do not flicker mid-drag.
- **MRS-P-2** — Suppression MUST be a freeze, not a clear: markers already revealed stay revealed and markers already hidden stay hidden for the duration of the pointer press.
  _Example:_ revealed `**bold**` then mousedown elsewhere → `**bold**` stays revealed until mouseup.
- **MRS-P-3** — On `mouseup` the pointer state MUST clear so the next selection-changing transaction recomputes the revealed set normally.
  _Example:_ release mouse after dragging selection into a construct → that construct reveals on the next recompute.
- **MRS-P-4** `[smoke]` — Pointer-down and pointer-up DOM events MUST update pointer state without preventing the editor's default selection handling.
  _Example:_ mousedown to start a selection → CM6 still begins the drag-select.
- **MRS-P-5** — A reveal surface that enters the pointer-down state WITHOUT a captured pre-press selection MUST hard-suppress reveal — markers stay hidden until release — because there is no pre-mousedown value to freeze to. This is the table cell subview, created mid-press by the rAF-deferred activation, which seeds only the pointer latch; a cell whose whole content is the construct has no off-construct caret to freeze to either.
  _Example:_ click-to-activate a cell whose content is `**bold**` while the main pointer is still held → the cell's `**` stay hidden until mouseup, then reveal.
- **MRS-P-6** `[smoke]` `[accepted]` — A press whose release is never delivered to the editor's document — a `mouseup` outside the hosting webview iframe goes to the outer window — MUST NOT leave reveal frozen indefinitely. The next in-editor button-less `mousemove` (`buttons === 0`) MUST clear the latch and run the normal release path (including the snap), so markers recompute against the post-drag selection. The latch check makes the handler a no-op outside a press. The outside release itself is unobservable (pointer capture does not cross the iframe boundary either), so reveal recovers when the cursor heads back to the editor rather than at the instant of release; treating the cursor merely leaving the editor as a release is explicitly rejected because it reveals markers mid-drag.
  _Example:_ drag-select a construct, release the mouse outside the webview, then move back over the editor → the latch clears and reveal recomputes (the construct reveals if the selection now warrants it).

## S — Selection snap

On mouseup, snapping a selection that sits in a construct's content area outward
to the construct's node bounds, so that a copy yields the markdown source rather
than a fragment with hidden markers stripped. Computed by `compute_marker_snap`
and dispatched in the SAME transaction as the pointer-latch
clear. A double-click is excluded (MRS-S-10): only drag gestures snap. Section code `S`.

- **MRS-S-1** — Snap MUST apply to the emphasis family, inline code, inline links, and autolinks (`StrongEmphasis`, `Emphasis`, `Strikethrough`, `InlineCode`, `Link`, `Autolink`). For the symmetric constructs (emphasis family, inline code, autolink) the content area lies between the node's first and last child marks. For an inline `Link` the content area is the LABEL (between the first `[` and `]`) while the snap target is the full node `[node.from, node.to)` including `(url)`; the link node MUST be well-formed (≥4 `LinkMark`s, opening `[` at `node.from`, closing `)` at `node.to`) or it does not qualify.
  _Example:_ a non-empty selection inside `**bold**`, `<http://x>`, or the label of `[lbl](http://x)` qualifies; a degenerate node with missing marks does not.
- **MRS-S-2** — Rule C: a non-empty selection whose endpoints exactly cover the content area (`range.from == content_start && range.to == content_end`) MUST snap to the node's outer bounds `[node.from, node.to)`, unless the selection already equals those bounds (in which case it MUST NOT snap).
  _Example:_ drag-select exactly `bold` inside `**bold**` → snaps to cover `**bold**`.
- **MRS-S-3** — Rule A: a selection whose left edge is at content start and whose right edge extends past the closing marker MUST snap its left edge outward to `node.from`, keeping the right edge. Rule B is the mirror for the closing side.
  _Example:_ left edge at `**|bold**`'s content start, dragged right past the `**` → left snaps to include the opening `**`.
- **MRS-S-4** — A strict-inside selection (narrower than the content area on at least one side without sitting at the opposite boundary in a Rule-A/B configuration) MUST NOT snap; the user's narrower range is preserved.
  _Example:_ selecting `ld` inside `**bold**` → no snap (markers still reveal via MRS-R-4).
- **MRS-S-5** — Snap MUST preserve the user's drag direction: a left-to-right drag (`anchor <= head`) yields `anchor=from, head=to`; a right-to-left drag yields the mirror.
  _Example:_ right-to-left drag of `it` in `*it*` → snapped `anchor=node.to, head=node.from`.
- **MRS-S-6** — In a multi-range selection, snap MUST be computed per range independently, snapping only the qualifying ranges and leaving the rest, and MUST return no change (null) when no range qualifies.
  _Example:_ two cursors, one inside `**a**` and one in plain text → only the first snaps.
- **MRS-S-7** — Snap MUST preserve the selection's main-range index.
  _Example:_ multi-range selection with main index 1 → snapped selection keeps main index 1.
- **MRS-S-8** — Bare URLs (the GFM autolink form emitted as a top-level `URL` node with no surrounding marks) MUST be excluded from snap: they carry no syntax markers, so there is nothing to fold into the selection.
  _Example:_ selecting part of a bare `http://example.com` → no snap.
- **MRS-S-9** `[inherits:INV-SP-1]` — Snap is a selection-only transform and MUST dispatch no `changes`; document bytes are never modified.
  _Example:_ snapping from `bold` to `**bold**` moves the selection only; source unchanged.
- **MRS-S-10** `[smoke]` — A double-click (`event.detail === 2`) MUST NOT snap, even when its word selection exactly covers a construct's content area (the Rule-C geometry of MRS-S-2): the selection is left on the word, so a double-click selects the rendered text WITHOUT its surrounding markers. Drag gestures (`detail !== 2`) still snap via Rules A–C. The markers still reveal (MRS-R-4) because the selection lies inside the node — shown but unselected — so a double-click-then-copy yields the bare word, not the marked-up source.
  _Example:_ double-click `bold` inside `**bold**` → selection stays `bold`; the `**` reveal but are not selected, so a copy yields `bold`, not `**bold**`.

## L — Triple-click line selection

CM6's default triple-click selects the line PLUS its trailing newline
(`rangeForClick` does `to++`), landing the caret at the next line's start.
Plainmark overrides this via the public `EditorView.mouseSelectionStyle` facet
to match Obsidian and most prose editors. Section
code `L`.

- **MRS-L-1** `[smoke]` — A primary-button triple-click (`event.detail === 3`) MUST select the clicked line from `line.from` to `line.to`, EXCLUDING the trailing newline, so the selection head (caret) rests at the line's end rather than the start of the next line; single- and double-click gestures MUST keep CM6's default behavior (the override returns null for them).
  _Example:_ triple-click `first line` in `first line\nsecond line` → selection `[0, 10]`, head at 10 (line end), not 11 (next-line start).

## W — Selection wrap

Typing a wrap character over a non-empty selection wraps it instead of replacing
it (`wrap_selection_input`, an `EditorView.inputHandler`). Section code `W`.

The wrap delimiters are open→close pairs: the symmetric `*`, `` ` ``, `~`, `$`
(open == close) plus the brackets `[`→`]`, `(`→`)`, `{`→`}` (`_` and `<` are NOT
wrap delimiters). `` ` `` belongs to inline code and `$` to math; the brackets
are construct-agnostic (a `[ ]` wrap is not a link-aware command — LINK-I-11).
Only the open delimiter triggers a wrap.

- **MRS-W-1** — Typing a wrap open-delimiter (`*`, `` ` ``, `~`, `$`, `[`, `(`, `{`) over a single non-empty selection MUST insert the open delimiter at the selection's left edge and its matching close delimiter (itself for the symmetric chars, `]`/`)`/`}` for the brackets) at the right edge, instead of replacing the selection.
  _Example:_ select `bold`, type `*` → `*bold*`; select `text`, type `[` → `[text]`.
- **MRS-W-2** — After a wrap the selection MUST be repositioned to surround the original text, shifted right past the inserted leading marker, so a repeated press nests the markers.
  _Example:_ select `x`, type `*` → `*|x|*`; press `*` again → `**x**` (bold).
- **MRS-W-3** — Wrap MUST be applied as a single transaction (`userEvent: 'input.type'`) so one undo reverts the entire wrap.
  _Example:_ wrap then Ctrl+Z → both inserted markers removed in one step.
- **MRS-W-4** — Typing a wrap character over an empty selection MUST fall through to default insert (the handler returns false when every range is empty).
  _Example:_ caret with no selection, type `*` → literal `*` inserted.
- **MRS-W-5** — A typed character that is not a wrap open-delimiter MUST NOT trigger wrap (the handler returns false); the close delimiters `]`, `)`, `}` are NOT triggers.
  _Example:_ select `bold`, type `a` → default replace; type `]` → default replace, no wrapping.
- **MRS-W-6** — Wrap MUST preserve a backward selection by normalizing the resulting range.
  _Example:_ a right-to-left selection of `hello`, type `*` → `*hello*` with the inner text re-selected.
- **MRS-W-7** `[accepted]` — Wrap MUST insert a single instance of the typed character on each side; it MUST NOT auto-double `*`/`~` into the strong/strikethrough form. Reaching bold/strikethrough requires a second press (nesting via MRS-W-2).
  _Example:_ select `x`, type `*` → `*x*` (emphasis), not `**x**`.

## B — Marker-aware backspace

Preserving a block construct's marker on Backspace when the line has content. The
override (`marker_aware_backspace`, registered at `Prec.highest`) pre-empts
`@codemirror/lang-markdown`'s `deleteMarkupBackward`, which would otherwise delete
the whole `> ` / list marker together with a just-typed space, silently demoting
the construct (the T28.11 content-loss bug). Section code `B`.

> _Scope (T32.8): inside a `Blockquote` node (blockquotes AND callouts), Backspace is plain single-character deletion governed by `BQ-I-4` (`blockquote_plain_backspace`, also `Prec.highest`, ahead of this override) — the markup-demote never fires there. The `MRS-B-*` clauses below therefore now govern LISTS; their `>`/callout examples are retained as illustrations of the marker-aware mechanism but the live blockquote/callout outcome is BQ-I-4's plain per-character delete (which yields the same result for the extra-whitespace and lazy-continuation cases, and a plain space-then-`>` delete where the old clauses yielded to the demote)._

- **MRS-B-1** — When the caret sits at the end of a canonical block marker (`>`, `-`/`*`/`+`, or `n.`/`n)`, each followed by one space, possibly nested) AND there is EXTRA whitespace immediately after that marker before content, Backspace MUST delete exactly one character at the caret and MUST NOT delete the marker.
  _Example:_ `>  hello` with caret at column 2 → Backspace → `> hello` (caret at column 1), marker preserved.
- **MRS-B-2** — The override MUST fire for blockquote, unordered-list, ordered-list, callout-header, and nested block markers alike.
  _Example:_ `1.  hello` → `1. hello`; `> >  hello` → `> > hello`; `>  [!CAUTION]` → `> [!CAUTION]`.
- **MRS-B-3** — On an empty marker line (marker followed only by whitespace, no content after), the override MUST yield to default handling, preserving lang-markdown's "undo my marker" affordance.
  _Example:_ `> ` (empty) Backspace → handled by lang-markdown's demote, not by this override.
- **MRS-B-4** — On a canonical marker with a single trailing space and content following (no extra whitespace), the override MUST yield to default handling.
  _Example:_ `> hello` at column 2 → Backspace → default (lang-markdown demote affordance retained).
- **MRS-B-5** — The override MUST yield unless the single caret sits exactly at the marker's trailing-space end; a caret elsewhere on the line (and the `head == 0` case) MUST fall through.
  _Example:_ `>  hello` at column 1 or column 3 → default Backspace.
- **MRS-B-6** — The override MUST apply only to a single-range empty (caret) selection; a non-empty or multi-range selection MUST fall through to default.
  _Example:_ a range selection across the marker boundary → default range delete.
- **MRS-B-7** — A line whose text matches the marker pattern but is not actually inside a `Blockquote` or `ListItem` node (e.g. inside a fenced code block) MUST fall through to default, guarded by a syntax-tree ancestor check.
  _Example:_ `>  hello` inside a ``` fence → default Backspace (no marker semantics).
- **MRS-B-8** — Repeated presses MUST reduce extra whitespace one character per keystroke until the canonical single-space marker remains, then yield.
  _Example:_ `>   hello` → Backspace → `>  hello` → Backspace → `> hello` → Backspace yields to default.
- **MRS-B-9** `[inherits:INV-SP-1]` — The override MUST delete exactly one byte at the caret column in a single transaction; no bytes elsewhere change.
  _Example:_ `>  hello` → Backspace removes one space only; the `>` and `hello` bytes are untouched.
- **MRS-B-10** — On a LAZY-CONTINUATION line — a line inside a `Blockquote`/`ListItem` node that carries NO literal marker of its own — Backspace MUST delete exactly one character when content (not just indentation) precedes the caret, pre-empting `deleteMarkupBackward`. Without this, lang-markdown reads the parent construct's marker columns from the syntax context and deletes `[line.from + inner.from, caret)`, which on such a line is the user's own content (typing one character then one Backspace eats an extra byte). A line that physically starts with a canonical marker, or has only indentation before the caret, MUST yield (the marker path and lang-markdown's legitimate dedent affordance handle those).
  _Example:_ `> [!NOTE]` then a line `` `x `` lazily joins the quote; type `#` → `` `#x ``, Backspace → `` `x `` (only the `#` is removed, the backtick is kept).
