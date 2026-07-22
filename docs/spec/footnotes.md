---
prefix: FN
title: Footnotes
kind: construct
---

Footnotes are parsed by a custom `@lezer/markdown` extension (`Footnote`) that
adds two nodes — `FootnoteReference` (inline `[^id]`) and `FootnoteDefinition`
(block `[^id]: text`) — plus structural children `FootnoteMark` and
`FootnoteLabel`. The reference renders as a superscript widget showing the
literal label; the definition renders in place (line decoration + dimmed
`[^id]:` prefix). A two-tier hover/click popover surfaces the definition body. An
`insert_footnote` command inserts a reference + definition stub. There is no
autocomplete and no rendered back-reference (`↩`) affordance.

## R — Rendering

- **FN-R-1** — A reference MUST be parsed by the inline parser only when the bytes start with `[^` followed by one or more characters that are not whitespace or `[`/`]` and then `]` (regex `/^\[\^[^\s[\]]+\]/`); the label is the run between `[^` and `]`.
  _Example:_ `see[^note]` → `note` is the reference label.

- **FN-R-2** `[smoke]` — A reference whose caret-reveal is inactive MUST render via `Decoration.replace` as a `<sup class="plainmark-footnote-ref">` element whose text content is the **literal label** (not a sequential number); the source `[^id]` bytes are hidden.
  _Example:_ `text[^foo]` → superscript reads `foo`; `text[^1]` → superscript reads `1`.

- **FN-R-3** — The displayed label MUST be the source label verbatim with no auto-renumbering; references are never reordered or renumbered by document position.
  _Example:_ `[^b] [^a]` → superscripts read `b` then `a`, not `1` then `2`.

- **FN-R-4** `[smoke]` — A reference whose label has no matching `FootnoteDefinition` MUST render as `<sup class="plainmark-footnote-ref broken">` with text content `?`, `aria-label="Undefined footnote <label>"`, while a defined reference omits the `broken` class and the `aria-label`.
  _Example:_ `[^ghost]` with no definition → superscript reads `?`, styled broken.

- **FN-R-5** — The reference widget MUST set `id="fnref:<label>"`, `role="doc-noteref"`, and the `data-plainmark-footnote-ref="<label>"` attribute the popover handlers key on.
  _Example:_ `[^a]` → `<sup id="fnref:a" role="doc-noteref" data-plainmark-footnote-ref="a">`.

- **FN-R-6** — A definition MUST be parsed by the block parser only when a line matches `/^\[\^([^\s[\]]+)\]:/`; the parser MUST register `before: 'LinkReference'` so `[^id]: text` is not consumed as a `LinkReference`.
  _Example:_ `[^a]: First note.` → one `FootnoteDefinition` node, not a `LinkReference`.

- **FN-R-7** `[smoke]` — Every line of a `FootnoteDefinition` MUST receive `Decoration.line` with classes `plainmark-footnote-definition plainmark-collapse-adjacent` and `role="doc-endnote"`; the definition body text stays visible in place (no widget replace, no hoist-to-bottom).
  _Example:_ `[^a]: First note.` → the line renders dimmed in place reading `[^a]: First note.`.

- **FN-R-8** `[smoke]` — The `[^id]:` label prefix of a definition (the `FootnoteLabel` child) MUST receive `Decoration.mark` class `plainmark-footnote-label`, which dims it via `--plainmark-footnote-label-opacity` (default `0.6`); the prefix is dimmed, NOT hidden.
  _Example:_ `[^a]: note` → `[^a]:` shown at reduced opacity, `note` at full opacity.

- **FN-R-9** `[accepted]` — A rendered definition MAY carry a back-reference (`↩`) affordance to jump to the referencing site; this is consciously deferred and NOT implemented. No back-reference is rendered; the definition shows only the dimmed `[^id]:` prefix and body. Jump-from-definition is instead reachable via the click-popover "Jump to definition" button (FN-I-6).
  _Example:_ `[^a]: note` → renders `[^a]: note` with no trailing `↩` glyph.

- **FN-R-10** `[smoke]` — The reference superscript MUST be styled `font-size: var(--plainmark-footnote-size, 0.75em)`, `vertical-align: super`, `line-height: 0`, `cursor: pointer`, colored by `--plainmark-footnote-marker-color` (broken refs by `--plainmark-footnote-marker-broken-color`).
  _Example:_ `[^a]` → small raised superscript using the marker color variable.

## I — Interaction

- **FN-I-1** `[smoke]` — While the canonical reveal predicate (`should_reveal_for_selection`, MRS-R-2…R-5: any selection range touching the reference node reveals, EXCEPT a non-empty selection strictly covering it on both sides; pointer-down evaluates the frozen pre-press selection) holds for a reference node's byte span, the replace decoration MUST be dropped so the raw `[^id]` source shows; reveal is node-level, not line-level. Under the unified reveal model: select-all no longer un-renders every reference.
  _Example:_ `text[^|a]` → the `[^a]` source is shown verbatim; other refs on the same line stay superscripted; Ctrl+A keeps all refs superscripted.

- **FN-I-2** `[smoke]` — Hovering a reference superscript MUST, after a 300ms delay, open a popover (CM6 `Tooltip`, `above: true`) anchored to the reference span, unless a click-pinned popover is already open for it.
  _Example:_ hover superscript `a`, wait 300ms → popover appears above the reference.

- **FN-I-3** `[smoke]` — The hover popover MUST stay open when the pointer moves from the reference into the popover element, and MUST close 150ms after the pointer leaves the reference without entering the popover, OR 150ms after the pointer leaves the popover itself; re-entering the popover within that window cancels the close.
  _Example:_ hover `a` then move onto the popover → it stays; move away to blank text (from either the ref or the popover) → it closes after 150ms.

- **FN-I-4** `[smoke]` — Left-clicking (button 0) a reference superscript MUST open a click-mode popover and MUST `preventDefault` so the caret is not placed; a click popover MUST NOT be downgraded to hover mode by a later hover.
  _Example:_ click superscript `a` → persistent popover opens; subsequent hover does not replace it.

- **FN-I-5** `[smoke]` — A popover for a resolved reference MUST show the definition body (the bytes after `[^id]:` and one optional space) in a `.plainmark-footnote-popover-body`; an unresolved reference MUST show `No definition found for ^<label>` with the `broken` class.
  _Example:_ hover `[^a]` (defined `First note.`) → body reads `First note.`; hover `[^ghost]` → body reads `No definition found for ^ghost`.

- **FN-I-6** `[smoke]` — The click-mode popover MUST include a `×` close button, and a "Jump to definition" button when the definition exists; pressing Jump MUST move the caret to the definition's `from`, scroll it into view, close the popover, and refocus the editor.
  _Example:_ click `[^a]`, press Jump to definition → caret lands at the start of `a`'s definition line.

- **FN-I-7** `[smoke]` — An open popover MUST close on Escape, on a mousedown outside both the popover and any reference, and on any document change (the state field resets when `tr.docChanged`).
  _Example:_ open popover, click blank editor body → popover closes.

- **FN-I-8** — The `insert_footnote` command MUST pick the smallest unused positive-integer label (scanning existing reference and definition labels) and insert `[^N]` at the caret plus a definition stub `\n\n[^N]: ` at the position after the last existing definition (or end-of-document), in a single transaction.
  _Example:_ document already uses `1` → command inserts `[^2]` at the caret and `\n\n[^2]: ` after the last definition.

- **FN-I-9** — After `insert_footnote`, the caret MUST land at the end of the inserted definition stub (just past `[^N]: `) so the user can type the body immediately.
  _Example:_ run the command → caret sits after `[^2]: ` ready for the note text.

- **FN-I-10** — Insertion MUST be reachable as the `tutivog.plainmark.insertFootnote` command (declared in `package.json` `contributes.commands`), bound to `Ctrl+Shift+6` / `Cmd+Shift+6`; the host posts an `insert_footnote` message the webview dispatches to `insert_footnote(view)`. Footnotes intentionally provide NO `[^…` autocomplete affordance (the insert command is the editor affordance).
  _Example:_ press `Cmd+Shift+6` → a new footnote reference + stub is inserted; typing `[^` shows no label completions.

## SP — Source-preservation

- **FN-SP-1** `[inherits:INV-SP-1]` — All footnote rendering (reference superscript replacement, definition line decoration, label dimming) MUST be decoration-only and MUST NOT modify document bytes; the parser is read-only and the widgets emit DOM without dispatching changes.
  _Example:_ render a document of `[^a]`/`[^a]:` lines then re-read the buffer → bytes are byte-for-byte unchanged.

- **FN-SP-2** — The `insert_footnote` command is a legitimate user-initiated edit, not a decoration; it MUST change source only by inserting the `[^N]` reference and the `\n\n[^N]: ` stub, both via one CM6 transaction annotated `userEvent: 'input'`.
  _Example:_ run the command once → exactly the two inserted runs differ from the prior buffer; one Ctrl+Z reverts both.

- **FN-SP-3** — The "Jump to definition" action MUST move the caret and scroll only; it MUST NOT change document bytes.
  _Example:_ press Jump → selection moves to the definition; buffer is unchanged.

- **FN-SP-4** — Caret-reveal MUST NOT change bytes: toggling a reference between superscript and raw `[^id]` is a decoration recompute keyed on `update.selectionSet`/`docChanged`/`viewportChanged`/the pointer-freeze flip (MRS-R-7).
  _Example:_ move the caret into and back out of `[^a]` → buffer is unchanged throughout.

## E — Edge cases

- **FN-E-1** — Only the first `FootnoteDefinition` whose label matches a reference MUST resolve it; definition lookup (`find_definition_range`) returns the first matching node in tree order and stops.
  _Example:_ `[^a]: one\n[^a]: two` referenced by `[^a]` → popover body reads `one`.

- **FN-E-2** — Stacked definition lines with no blank line between them MUST each emit their own `FootnoteDefinition`; the block parser uses `endLeaf` (not `nextLine: true`) so `finish()` fires per leaf.
  _Example:_ `[^a]: one\n[^b]: two` → two separate definitions, both resolvable.

- **FN-E-3** — A multi-line (lazily continued) definition body MUST be covered by the line decoration across all its lines, and the popover body MUST include the continuation text (slice from after `[^id]:` to the node end).
  _Example:_ `[^a]: line one\n  line two` → both lines render as the definition; popover shows both.

- **FN-E-4** — A label containing whitespace or `[`/`]` MUST NOT match either parser and MUST be left as plain text.
  _Example:_ `[^foo bar]` → shown verbatim, not a footnote.

- **FN-E-5** `[smoke]` — A reference inside an inline code span or fenced code block MUST NOT render as a footnote; the inline parser registers `before: 'Link'` but `InlineCode`/code blocks take precedence in the Lezer ordering so the reference is not emitted there.
  _Example:_ `` `[^a]` `` → renders as literal code text, no superscript.

- **FN-E-6** — A definition resolves a reference regardless of source order (definition before or after the reference), because resolution is a render-time tree lookup, not a single-pass parse dependency.
  _Example:_ `[^a]: note` on line 1 and `text[^a]` on line 9 → reference `a` resolves to that definition.

- **FN-E-7** — `insert_footnote` MUST count only strictly-numeric positive labels when choosing the next label; string labels like `[^foo]` MUST be ignored by the smallest-unused-integer scan.
  _Example:_ document uses `[^foo]` and `[^1]` → next inserted label is `2`.

- **FN-E-8** `[unknown]` — A footnote reference inside a callout, blockquote, or table cell composes (the node handler runs regardless of nesting); the reveal interaction with the surrounding construct's own reveal model is not verified and may surface as a bug.
  _Example:_ `> see[^a]` inside a blockquote → the superscript renders; reveal-on-caret behavior within the quote is unverified.
