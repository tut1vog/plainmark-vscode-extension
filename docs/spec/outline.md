---
prefix: OUT
title: Outline Navigation
kind: cross-cutting
---

# Outline Navigation

A sidebar TreeView that lists the active document's markdown headings and lets
the user jump to one, plus a follow-cursor highlight that tracks the editor
caret. VS Code's native Outline pane cannot serve a `CustomTextEditorProvider`
webview — the workbench gates Outline on a Monaco code/diff editor, which a
webview is not. This file owns
the equivalent built on a custom TreeView and the existing host↔webview bus.

This file owns the outline surface, not the machinery it reuses:

- **Caret reporting** — the `cursor_changed` `(line, character)` broadcast that
  drives follow-cursor is owned by `caret-and-navigation.md` §S (`NAV-S-*`);
  this file consumes it, it does not restate the reporting contract.
- **Source preservation** — outline navigation never mutates bytes; the general
  guarantee is `invariants.md` `INV-SP-1`, referenced via `[inherits:INV-SP-1]`.
- **Shell wiring** — `editor-shell.md` notes that the outline's view
  contribution, command, and `scroll_to_heading` routing live here.

Section codes: `R` tree rendering & view placement · `D` data source, active-document
tracking & refresh · `I` interaction (navigate & follow-cursor) · `SP` source preservation.

Notation in examples: `|` = caret, `→` = action/result, `\n` = literal newline.

## R — Tree rendering & view placement

What the outline view is and what it shows. Section code `R`.

- **OUT-R-1** `[smoke]` — A TreeView with id `tut1vog.plainmark.outline` and title "Plainmark Outline" MUST be contributed to the Explorer view container.
  _Example:_ with a `.md` open in Plainmark, an "Plainmark Outline" section appears in the Explorer sidebar below the file tree.
- **OUT-R-2** `[smoke]` — The view MUST be visible only while a Plainmark custom editor is the active editor, gated on the `tut1vog.plainmark.editorIsActive` context key; it MUST NOT show when the active editor is a text editor or a non-Plainmark tab.
  _Example:_ toggling a file from Plainmark to the text editor hides the outline view; toggling back shows it.
- **OUT-R-3** — Tree items MUST be the document's markdown headings nested by level: a heading is a child of the nearest preceding heading of lower level, and a sibling of the nearest preceding heading of equal level.
  _Example:_ `# A\n## B\n## C\n### D` → `A` { `B`, `C` { `D` } }.
- **OUT-R-4** — Each item's label MUST be the heading's text with the leading `#` markers and their trailing space removed; an item is collapsible iff it has child headings.
  _Example:_ `### My Heading` → label `My Heading`, not `### My Heading`.
- **OUT-R-5** `[smoke]` — When no Plainmark document is active, or the active document has no headings, the view MUST show no items rather than retaining items from a previously active document.
  _Example:_ switching to a heading-free document clears the tree; closing all Plainmark editors empties it.

## D — Data source, active-document tracking & refresh

Where headings come from and when the tree recomputes. Section code `D`.

- **OUT-D-1** `[smoke]` — Headings MUST be sourced by executing the `vscode.executeDocumentSymbolProvider` command against the document URI (the built-in markdown symbol provider), so extraction works while the file is open in the custom editor and requires no active text editor.
  _Example:_ the provider calls `executeDocumentSymbolProvider(document.uri)` and maps the returned `DocumentSymbol[]` to tree items; no `window.activeTextEditor` is read.
- **OUT-D-2** `[smoke]` — The active Plainmark document MUST be tracked via `window.tabGroups` tab-change events, recognizing a `TabInputCustom` whose `viewType` equals `tut1vog.plainmark`; `window.onDidChangeActiveTextEditor` MUST NOT be relied on, as it does not fire for custom editors.
  _Example:_ switching between two Plainmark tabs repoints the outline at the newly active tab's URI via `onDidChangeTabs`.
- **OUT-D-3** `[smoke]` — The tree MUST refresh when the active Plainmark document changes and when that document's text changes (`workspace.onDidChangeTextDocument`); text-change refreshes MUST be debounced so a burst of keystrokes does not re-query symbols on every change.
  _Example:_ typing a new `## ` heading updates the outline once the debounce settles, not on each character.
- **OUT-D-4** `[smoke]` — Refresh MUST be gated on view visibility (`treeView.visible`): while the outline view is collapsed or hidden, document changes MUST NOT trigger a symbol re-query.
  _Example:_ editing the document with the outline view collapsed performs no symbol queries; expanding the view refreshes once.

## I — Interaction (navigate & follow-cursor)

How the user moves between the tree and the editor. Section code `I`.

- **OUT-I-1** `[smoke]` — Activating a tree item MUST navigate the webview to that heading: the host posts a `scroll_to_heading` message carrying the heading's document offset (`document.offsetAt(symbol.range.start)`) to the active document's webview panel.
  _Example:_ clicking the `My Heading` item posts `{ type: 'scroll_to_heading', offset }` to that document's panel.
- **OUT-I-2** — On a `scroll_to_heading` message, the webview MUST clamp the offset to `[0, doc.length]`, set the caret there, scroll that position to the top of the viewport via `EditorView.scrollIntoView(pos, { y: 'start' })`, and focus the editor.
  _Example:_ a `scroll_to_heading` for an offset past EOF clamps to `doc.length`; the heading line is scrolled to the viewport top and the editor is focused.
- **OUT-I-3** `[smoke]` — As the editor caret moves, the tree MUST reveal and select the heading whose source encloses the caret, driven by the `cursor_changed` report (`NAV-S-1`).
  _Example:_ moving the caret into the body under `## C` selects and reveals the `C` item in the outline.
- **OUT-I-4** — The heading enclosing the caret MUST be resolved as the last heading whose start line is `<=` the caret line; when the caret precedes the first heading, no item is selected.
  _Example:_ caret on line 0 of `intro\n# A\n…` (before `# A`) → no selection; caret on the `# A` line or any line below it until the next heading → `A` selected.

## SP — Source preservation

- **OUT-SP-1** `[inherits:INV-SP-1]` — Outline rendering and navigation MUST be read-only: building the tree, revealing items, and scrolling to a heading MUST NOT modify document bytes.
  _Example:_ clicking outline items and moving the caret to drive follow-cursor leaves the document text and dirty state unchanged.
