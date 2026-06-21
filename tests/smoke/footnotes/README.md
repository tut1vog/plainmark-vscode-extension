# Footnote decorations + popover + insert command — smoke fixtures

12 markdown files for manual F5 verification of footnote decorations. Open each in the Extension Development Host and verify the rendering / interaction against the table below.

**Invariants** (must hold for every file):
- Source bytes never mutated by Plainmark unless you explicitly invoke `Cmd+Shift+6` / `Ctrl+Shift+6`. Save → `git diff` shows zero changes.
- One `Cmd+Z` after the insert command reverts BOTH the ref + the definition stub in one step.
- Defined refs render as `<sup>` with the literal label. Undefined refs render as `?` in error-tint color.

## Passive-render cases

| # | File | What to verify |
|---|---|---|
| 1 | `01-basic-ref-and-def.md` | `[^1]` → `1` sup; `[^foo]` → `foo` sup. Definition lines visually distinct (dim/styled). With caret elsewhere, raw bytes hidden. |
| 2 | `02-broken-reference.md` | `[^missing]` → `?` sup in error-tint color. Hover popover shows "No definition found for ^missing". |
| 3 | `03-multi-ref-same-def.md` | Both `[^1]` glyphs render. Click either → popover shows the same definition body. |
| 4 | `04-linkref-precedence.md` | **Critical parser test.** Line 2 `[^fn]: ...` renders as a footnote definition (dimmed `[^fn]:` prefix), NOT as a link-reference definition — confirms `before: 'LinkReference'` precedence. Line 1 `[link]: ...` and the in-paragraph `[link][link]` both render as raw text — reference-link decoration is deferred (inline-link decoration only handles inline `[text](url)` and autolinks). The `[^fn]` ref still renders as `fn` sup. |
| 5 | `05-multi-paragraph-pandoc.md` | **Known limitation.** First paragraph of the definition gets the footnote-definition decoration. Second paragraph (indented 4 spaces) does NOT — it falls through to whatever Lezer parses (likely indented code block per the research). Confirm NO crash, NO parser hang. |
| 6 | `06-ref-in-heading.md` | `# Heading with a footnote¹ inline` — H1 styling + footnote sup both render. |
| 7 | `07-ref-in-blockquote.md` | Blockquote multi-bar chrome at depths 1 and 2; footnote refs render inside the quote. |
| 8 | `08-ref-in-list.md` | Footnote sups render inside bullet, ordered, and task list items. List decorations unchanged. |
| 9 | `09-ref-near-link.md` | Plain link + footnote both render. `[labeled[^2]](url)` — observe behavior and record for follow-up (this is unusual nesting; either render is acceptable as long as nothing crashes). Third paragraph: when a footnote definition appears after a non-empty paragraph on the same line, behavior depends on Lezer's leaf-block detection. |
| 10 | `10-preservation-roundtrip.md` | All four labels render. `` `[^1]` `` inside an inline code span renders as raw text (no footnote). Fenced code block content renders as code (no footnote). After opening + saving with no edits, `git diff` shows zero byte changes. |

## Interaction cases

Use any of the passive files above as a starting point unless noted.

### Reveal-on-caret cycle (use `01-basic-ref-and-def.md`)
- [ ] Click into the line containing `[^1]`. Widget disappears, raw `[^1]` reappears, caret editable.
- [ ] Arrow off the line. Widget reappears.
- [ ] Edit `[^1]` → `[^xyz]` in revealed state. After moving caret off the line, the ref renders as `?` broken (no `[^xyz]` definition exists).

### Hover popover (use `01-basic-ref-and-def.md`)
- [ ] Hover on the rendered `1` sup for ~300ms. Tooltip appears with the definition body text.
- [ ] Move mouse off the ref but INTO the popover. Popover stays.
- [ ] Move mouse fully off. Popover disappears after ~150ms.

### Click popover (use `01-basic-ref-and-def.md`)
- [ ] Click on a sup. Persistent popover opens with "Jump to definition" + "×" buttons.
- [ ] Mouseout — popover stays (click-pinned is not downgraded to hover).
- [ ] Hover a DIFFERENT sup while pinned. Hover should NOT replace the pinned popover.
- [ ] Click "Jump to definition". Caret jumps to definition start, popover closes, view scrolls if needed.
- [ ] Reopen by clicking, then press Esc. Closes.
- [ ] Reopen, click elsewhere in the editor (not on a ref, not in the popover). Closes; caret placement still works.

### Insertion command (use `11-empty-doc-for-insert.md`)
- [ ] Press `Cmd+Shift+6` (mac) / `Ctrl+Shift+6` (win/linux). Doc becomes `[^1]\n\n[^1]: ` with caret at the end of the stub.
- [ ] Type definition body text. Caret position correct.
- [ ] Press shortcut again. New ref `[^2]` at caret position; new definition `\n\n[^2]: ` appended after the existing definition.
- [ ] Open Command Palette → "Plainmark: Insert footnote". Identical behavior.

### Insertion label-reuse (use `12-insert-label-reuse.md`)
- [ ] Place caret in the first paragraph at end of `2.` then press the shortcut. New ref should be `[^2]` (smallest unused numeric, picking up the gap).
- [ ] Press shortcut again. New ref should be `[^4]` (smallest unused after `1`, `2`, `3`).

### Undo atomicity (use `11-empty-doc-for-insert.md` or any other)
- [ ] After insert shortcut, press `Cmd+Z` once. Both ref and definition stub revert in a single undo. NOT two undos.
- [ ] Type a character inside a revealed `[^1]`. `Cmd+Z` reverts that one character only (CM6's normal grouping).

### Source preservation (any file)
- [ ] Open `04-linkref-precedence.md` (or any case file). Don't edit. Save (`Cmd+S`). Run `git diff tests/smoke/footnotes/` — should show zero changes.
- [ ] Repeat for `10-preservation-roundtrip.md`.

### Hot reload / multi-pane (use `01-basic-ref-and-def.md`)
- [ ] Open the file in two side-by-side Plainmark editors. Insert a footnote in one. Other syncs and renders the new ref/def.
- [ ] Close + reopen. Render identical, no hydration lag.

## DevTools spot-checks

Open DevTools on the EDH webview (Help → Toggle Developer Tools), inspect a rendered sup, and confirm:

- Tag is `<sup>` with `class="plainmark-footnote-ref"` (or `... broken`).
- `role="doc-noteref"`, `id="fnref:<label>"`, `data-plainmark-footnote-ref="<label>"`.
- Computed style: `vertical-align: super`, `line-height: 0`, `font-size: 0.75em`.

Inspect a definition line and confirm:

- `class="cm-line plainmark-footnote-definition"` with `role="doc-endnote"`.
- The `[^N]:` byte range inside has class `plainmark-footnote-label` (mark span).
- Computed `padding: 0.5em 1em` on the line.

## VS Code Web (`vscode.dev`) sanity

- [ ] Drag-drop or open `01-basic-ref-and-def.md` in vscode.dev with Plainmark loaded. Refs render. Hover popover works. Insert command works. No `fs` / `path` / `child_process` boot errors in the webview DevTools console.

## What's intentionally NOT covered

- Popover body inline-styling. Definition body renders as **plain text** in the popover for v1 (e.g. `*italic*` in the definition shows as raw `*italic*` in the popover). Future enhancement, not a regression.
- Pandoc inline `^[footnote text]` syntax. Parser does NOT recognize it. Bytes preserved as plain text. Deferred per `docs/spec/footnotes.md`.
- Sequential auto-renumber on insert. Plainmark preserves the user's literal labels. Insert command only picks the smallest unused numeric label. Deferred per `docs/spec/footnotes.md`.
- Back-link from definition to reference (the `↩` glyph some renderers emit). Deferred per `docs/spec/footnotes.md`.
- Generated bottom-section "Footnotes" rendering. Incompatible with INV-SP-1 source preservation in live preview. May land in a future reading-mode.

## Padded-adjacency caveat

Definition lines have `padding: 0.5em 1em` (`--plainmark-footnote-definition-padding`). A definition immediately followed by an HR or heading will compound paddings (the `plainmark-collapse-adjacent` spacing model — THEME-S-2 / THEME-S-3). Cosmetic; not a bug. The project-wide fix is deferred until the full construct set lands.
