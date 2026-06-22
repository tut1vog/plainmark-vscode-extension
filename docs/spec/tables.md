---
prefix: TBL
title: Tables
kind: construct
---

# Tables — Specification

Normative behavior for GFM pipe-table rendering, cell editing, structural
operations, and byte guarantees. The table is the richest construct in Plainmark
and the **only** one permitted to re-serialize source bytes — the documented
carve-out to the source-preservation invariant (`INV-SP-2`). Every other widget
and decoration is render-only.

Architecture is **Camp A Model A2**: the widget
owns the whole table block; each cell edit recomputes the entire table's markdown
from an in-memory model and dispatches a single CM6 transaction replacing
`[table.from, table.to]`. Cells are two-state — at rest an inline-emitted HTML
`<td>` (`emit_table_cell`); on focus a nested `EditorView` subview over the
cell's logical source. Source extraction is `extract_table_full` /
`extract_table_info`; the serializer is `serialize_table`; structural ops are
pure model transforms; the cell keymap is `make_cell_keymap`; the context menu is
a custom floating menu; entry surfaces are the `|`-autocomplete (EB) + the
insert-table command (ED); cross-cell undo is handled by a rebase plugin.

Example notation: `|` = caret, `→` = action/result, `\n` = newline (see README §2).
In before/after table source, pipe characters are literal table pipes; caret is
called out in prose to avoid ambiguity with `|`.

## R · Rendering

- **TBL-R-1** — Each top-level `Table` node MUST receive exactly one `Decoration.replace({block: true})` carrying a `TableWidget`, spanning `[info.from, info.to]`, built by `build_table_decorations` from the syntax tree. Only `Table` nodes whose parent is `Document` are widgeted; nested tables are skipped (TBL-R-12).
  _Example:_ a doc with two separate tables → two block-replace decorations, one per table.

- **TBL-R-2** `[smoke]` — The widget DOM MUST be an outer `<div class="plainmark-table-block">` (carrying `data-table-from`) wrapping a single `<table>` with a `<thead>` (row 0) and `<tbody>` (rows 1+); row 0 cells are `<th>`, body rows are `<td>`. Each cell carries `data-row-index` / `data-col-index`.
  _Example:_ a 3-row table → `<thead>` with one `<tr>` of `<th>`, `<tbody>` with two `<tr>` of `<td>`.

- **TBL-R-3** `[smoke]` — At rest, each cell's content MUST be inline-emitted HTML produced by `emit_table_cell` (EMIT1): `StrongEmphasis`→`<strong>`, `Emphasis`→`<em>`, `Strikethrough`→`<del>`, `InlineCode`→`<code class="plainmark-inline-code">` (the class is required — a bare `<code>` falls through to VS Code's webview default stylesheet instead of the Plainmark theme chain), `Link`→`<a>` (href from `[text](url)`), `Image`→`<img>` (URL resolved via `image_base`), and inline escape sequences unescaped. An empty cell MUST get a zero-width-space text node so it renders at one line-height.
  _Example:_ `**bold**` in a cell → `<strong>bold</strong>`; empty cell → `<td>` containing `​`.

- **TBL-R-4** — Inline math (`InlineMath`/`BlockMath`) inside a cell MUST render from `math_cache_field` (EMIT1): a cache hit emits the cached HTML into a `<span class="plainmark-math-inline">` / `<div class="plainmark-math-block">`; a cache miss emits an empty `plainmark-math-pending` placeholder element (a `<span>` for inline, `<div>` for block; no source text). The existing `math_typeset_plugin` populates the cache as a side effect; `table_widgets_field` rebuilds on `set_typeset_effect`.
  _Example:_ `$x^2$` in a cell before typeset → an empty pending placeholder; after typeset → cached `<mjx-container>` HTML.

- **TBL-R-5** `[smoke]` — Inline `<br>` / `<br/>` / `<br />` HTML in a cell MUST render as a `<br>` DOM element (BR1); the cell displays multiple visual lines in one `<td>`. Raw inline HTML other than `<br>` MUST render as literal escaped text, not parsed elements (EMIT1 out-of-scope).
  _Example:_ `line1<br>line2` → two visual lines; `<sub>x</sub>` → the literal text `<sub>x</sub>`.

- **TBL-R-6** — Per-column alignment MUST be applied at render time as inline `style="text-align: …"` on each cell whose column has a non-null alignment; the source markers live only in the delimiter row. Alignment is parsed from the delimiter row by `parse_alignment_marker` (`:--`=left, `--:`=right, `:-:`=center, `--`=none).
  _Example:_ delimiter `| :--- | ---: |` → column 0 cells `text-align:left`, column 1 cells `text-align:right`.

- **TBL-R-7** — `info.to` MUST be clamped to the last pipe-row's end (`last_row_to`), NOT lezer's `Table.to`: rows whose `extract_cell_ranges_in_row` yields zero cells (a non-pipe line GFM absorbed into the `Table` node) MUST be skipped, so the block-replace ends at the last real row and absorbed bytes stay caret-targetable doc lines.
  _Example:_ `| a |\n| - |\nx` where GFM absorbs `x` → decoration ends after `| - |`; `x` renders as a normal paragraph line below.

- **TBL-R-8** — Column count MUST be the header row's cell count (`header_col_count`, MC1). At extraction, body cells with `col_index >= header_col_count` MUST be dropped from the rendered DOM and the model.
  _Example:_ 3-column header with a 5-cell body row → that row renders 3 `<td>`, the 2 extra cells are not emitted.

- **TBL-R-9** `[smoke]` — Missing body cells (a row shorter than the header) MUST render as zero-length placeholder `<td>` carrying `dataset.placeholder = 'underfill'` until the cell gains a real source range on first edit (T10.9 render-time underflow padding). `cell_from === cell_to` marks a placeholder; the flag is removed once the range is non-empty.
  _Example:_ 3-column header with a 2-cell body row → that row renders 3 `<td>`, the third carrying `data-placeholder="underfill"`.

- **TBL-R-10** `[smoke]` — The table MUST render full-width by default: wrapper `.plainmark-table-block` is `display:block; overflow-x:auto; width:100%; max-width:100%`; the inner `<table>` is `width: var(--plainmark-table-width, 100%); table-layout: var(--plainmark-table-layout, auto)`; cells get `word-break: var(--plainmark-table-cell-word-break, break-word)`, `min-width: var(--plainmark-table-cell-min-width, 2em)`, `vertical-align: top`; cell `<img>` is capped `max-width:100%; height:auto`. The nine `--plainmark-table-*` CSS variables are the documented theme-override surface: `--plainmark-table-margin`, `--plainmark-table-width`, `--plainmark-table-layout`, `--plainmark-table-border-color`, `--plainmark-table-cell-padding`, `--plainmark-table-cell-min-width`, `--plainmark-table-cell-word-break`, `--plainmark-table-header-weight`, `--plainmark-table-row-alt-background`.
  _Example:_ a cell with a long unbreakable URL wraps mid-token rather than widening the table past the editor; setting `--plainmark-table-layout: fixed` switches to uniform column distribution.

- **TBL-R-11** — `TableWidget.eq` MUST return equal only when `table.from`, `row_count`, `col_count`, the alignment signature, the math-cache fingerprint (cache keys present inside the table range), AND the trimmed-cell content signature all match; otherwise CM6 rebuilds via `toDOM`/`updateDOM`. A dimension change (`row_count`/`col_count` differ) MUST force a full `toDOM` (updateDOM returns false).
  _Example:_ a swap that changes cell content but not dimensions → eq false → `updateDOM` reconciles in place; an insert-row → dimensions differ → `toDOM` full rebuild.

- **TBL-R-12** — A `Table` whose first line matches a list-item (`/^\s*[-*+]\s/`, `/^\s*\d+[.)]\s/`) or blockquote (`/^>/`) prefix MUST be skipped (IL1): `build_table_decorations` emits no widget and the table renders as plain markdown source.
  _Example:_ `> | a | b |\n> | - | - |` → no widget; the source renders as a blockquote containing literal pipe text.

- **TBL-R-13** — Any extraction or render failure MUST fall back to plain-source rendering for that one table and MUST NOT throw to CM6 (FAIL1): `extract_table_info` is wrapped in try/catch in `find_tables` / `build_table_decorations`; a failing table is logged via `console.warn('[widget]', …)` with structural metadata only and its `Decoration.replace` is omitted. `toDOM`, `updateDOM`, and the cell emitter are each independently try/catch-guarded.
  _Example:_ a cell whose emit throws → that cell's `console.warn` fires, the widget still renders; a malformed table whose extraction throws → that table renders as plain pipe-text, the editor stays alive.

- **TBL-R-14** `[smoke]` — `coordsAt` MUST resolve a position inside the block-replace to the matching cell's bounding rect, so the caret draws inside the cell rather than CM6's flatten-to-widget-corner default; a position not inside any cell range returns null.
  _Example:_ caret logically positioned within cell (1,0)'s range → the cursor is drawn over that `<td>`.
- **TBL-R-15** — `table_widgets_field` MUST rebuild its decoration set whenever the syntax tree advances across a transaction (`syntaxTree(tr.startState) !== syntaxTree(tr.state)`), not only on `docChanged`/cache effects. CM6 parses lazily — the initial tree covers only `Work.InitViewport` (~3000) chars and the remainder arrives later via the `parseWorker`'s effect-only (no-`docChanged`) transactions — so without this trigger a `Table` beyond the initial parse window would not widgetize until an edit forced a rebuild. The sibling block-widget StateFields `math_widgets_field`, `mermaid_widgets_field`, and `image_widgets_field` MUST apply the same tree-advance trigger. (Block-widget analog of the inline `MRS-R-7` ViewPlugin rebuild triggers; a ViewPlugin cannot provide block/replace decorations, so the StateField must self-trigger on parse progress.)
  _Example:_ a table 17 000 chars into a long document renders as a widget once background parsing reaches it, with no edit and no scroll.

## I · Interaction

- **TBL-I-1** `[smoke]` — Mousedown on a `<td>` MUST activate that cell: the rendered HTML is swapped — in a `requestAnimationFrame` boundary (AC3) — for a nested `EditorView` subview whose doc is the cell's logical source (`parse_cell_text` of the trimmed slice). Mousedown on the already-active cell MUST be a no-op. The main editor gets `data-plainmark-cell-active` while a cell is active (double-caret defense). On every activation (click, nav, undo landing, structural re-focus per TBL-I-32) the widget MUST pin the main-view selection inside the cell — a selection-only transaction at the cell's source start, clamped to doc length — so the first in-cell keystroke's history `startSelection` is table-local and undo (or a real-host focus drop) restores a caret into the table, never document offset 0. The seed adds no undo step (`[inherits:INV-UNDO-1]`) and writes no source bytes (TBL-SP-11); the `data-plainmark-cell-active` rule hides the main cursor, so there is no visible double caret.
  _Example:_ click cell (1,0) showing `**hi**` → it becomes an editable subview showing `**hi**` with markers revealed near the caret, and the main caret sits inside the cell's source range.

- **TBL-I-2** `[smoke]` — Click activation MUST place the subview caret at the character nearest the mouse via `posAtCoords({precise:false})`; an out-of-bounds click leaves the default end-of-cell caret. Tab/arrow activation (no click position) MUST default the caret to end-of-cell.
  _Example:_ click near the start of a wide cell's short text → caret lands at the start; Tab into a cell → caret at end.

- **TBL-I-3** `[smoke]` — The cell subview's extensions MUST include the same inline marker-reveal pipeline as the main editor (AC2), supplied via the `cell_subview_extensions` facet, so `**`/`*`/`` ` `` etc. hide and reveal at the caret identically inside and outside the cell.
  _Example:_ caret next to `**` inside a cell → the `**` markers show; caret away → they hide.

- **TBL-I-4** `[smoke]` — A cell subview MUST tear down on blur: a `focusout` handler deferred via `setTimeout(_, 0)` (to let focus settle within the subview) destroys the subview when `document.activeElement` is outside it, re-renders the cell via the inline emitter, and clears `data-plainmark-cell-active`. A structural op that changes dimensions tears the subview down by widget rebuild (TBL-R-11).
  _Example:_ click a cell, then click outside the table → the subview is destroyed and the cell shows rendered HTML again.

- **TBL-I-5** `[smoke]` — `Tab` MUST move to the next cell; at the last column it wraps to column 0 of the next row; at the last cell of the last row it MUST auto-create a new row and move to its first cell. `Shift+Tab` MUST move to the previous cell; at column 0 it moves to the last column of the previous row; at the first cell of the first row it MUST tear down the subview (exit before the table, TBL-I-20).
  _Example:_ Tab in the last cell of a 2×2 table → a third row is appended, caret in its first cell.

- **TBL-I-6** `[smoke]` — `Enter` MUST move to the same column of the next row; at the last row it MUST exit below the table (TBL-I-21) and MUST NOT auto-create a row. `Enter` MUST NOT insert a newline into the cell (N4 navigation semantics). `Shift+Enter` MUST insert a `\n` into the cell text (serialized later as `<br>`, N4). `Mod-Enter` (Ctrl/Cmd+Enter) is a separate, configurable structural binding that inserts a row below the active row (TBL-I-8 / TBL-I-29), not a navigation or soft-break key.
  _Example:_ Enter in a last-row cell → the subview tears down and the caret lands on the line below the table; Shift+Enter → a soft line break appears inside the cell.

- **TBL-I-7** `[smoke]` — Arrow navigation MUST cross cell boundaries only at the cell edge, else fall through to CM6's within-cell caret motion. `ArrowLeft` at subview offset 0 (and `col>0`) → previous cell. `ArrowRight` at end-of-doc offset → next cell, wrapping to the next row's first cell at the last column. `ArrowUp`/`ArrowDown` move to the cell directly above/below; moving above row 0 or below the last row tears down the subview (exit the table, TBL-I-20 / TBL-I-21). The vertical-edge test is **logical-line**, not visual-line (`is_first_logical_line` / `is_last_logical_line`): in a word-wrapped single-logical-line cell, `ArrowUp`/`ArrowDown` from a middle visual row crosses the cell boundary rather than moving within the wrap — an accepted edge case.
  _Example:_ ArrowLeft at the start of cell (1,1) → caret moves into cell (1,0); ArrowUp from a header cell → subview tears down; ArrowUp from the second wrapped visual row of a body cell → moves to the cell above (logical-line semantics).

- **TBL-I-8** `[smoke]` — The cell keymap's structural-op bindings MUST be built from the resolved `plainmark.tableKeybindings` map (TBL-I-28, defaults TBL-I-29): each action with a non-null key dispatches its `table_ops` mutator for the active cell as one serializer transaction (TBL-SP-2). The mutators self-guard (TBL-I-11), so an out-of-range op is a silent no-op — insert-row-above does nothing in the header (Alt+Shift+ArrowUp on row 0 is a silent no-op, `row < 1` guard), swap-row-up does nothing in the header/body-row-1, swap-row-down nothing in the header/last row, the column swaps nothing at the first/last column, delete-row nothing in the header. Default bindings: `insert_row_above`/`insert_column_left`/`insert_column_right` = `Alt-Shift-Arrow{Up,Left,Right}`, `insert_row_below` = `Mod-Enter`, swap = `Alt-Arrow{Up,Down,Left,Right}`, `delete_row` = `Mod-Shift-Backspace`; `delete_column`, `delete_table`, and align are unbound until assigned. `delete_table`, when bound, removes the whole table block via `dispatch_table_remove` (TBL-I-33) rather than dispatching a `table_ops` model mutator. Bare Tab/Enter/arrow navigation and `Mod-z`/`Mod-Shift-z`/`Mod-y` history (TBL-I-9) are NOT configurable (reserved, TBL-I-30).
  _Example:_ Mod-Enter (Ctrl/Cmd+Enter) in row 1 → a blank row is inserted below; Alt+ArrowLeft in column 0 → nothing happens.

- **TBL-I-9** `[smoke]` — Inside the cell subview, `Mod-z` / `Mod-Shift-z` / `Mod-y` MUST route to `undo`/`redo` on the MAIN view (the canonical history), never the subview's local history; the subview keeps an empty history by tagging every non-sync transaction `Transaction.addToHistory.of(false)`.
  _Example:_ type in a cell, press Ctrl+Z → the main-view history reverts the keystroke; the cell content updates.

- **TBL-I-10** `[smoke]` — The cell keymap MUST NOT bind `Escape` (no action; CM6 has no default). Destructive and alignment ops MAY carry a keyboard binding via `plainmark.tableKeybindings` (TBL-I-8): `delete_row` is bound by default (`Mod-Shift-Backspace`, TBL-I-29), while `delete_column` and the four align ops are unbound by default but user-assignable. Cell exit stays available via Tab/Shift+Tab/arrow boundaries or clicking outside.
  _Example:_ pressing Escape in a cell → nothing happens; there is no key combo that deletes the active row.

- **TBL-I-11** — Each structural op (`insert_row_above`/`insert_row_below`, `delete_row`, `insert_column_left`/`insert_column_right`, `delete_column`, `swap_row_up`/`swap_row_down`, `swap_column_left`/`swap_column_right`, `set_column_alignment`) MUST be a pure immutable transform: it clones the model and returns a new one, OR returns the same reference unchanged when the op is a guarded no-op. `delete_row` MUST protect the header (`row===0`) and refuse to drop an out-of-range row; `insert_row_above` MUST pin the header (`row < 1`); `swap_row_up` MUST refuse the header/body-row-1 (`row <= 1`) and `swap_row_down` the header/last row; `delete_column` MUST refuse the last column; out-of-range or no-op swaps MUST return the input reference.
  _Example:_ `delete_row(model, 0)` → returns the same model object; `insert_column_right(model, 1)` → a new model with a blank column and a `null` alignment slot inserted.

- **TBL-I-12** `[smoke]` — Right-click on a `<td>` MUST open a custom floating menu (`<div class="plainmark-table-context-menu">` on `document.body`, `position:fixed`, clamped to the viewport) listing the `compute_menu_items` entries; clicking an enabled item (a `click` listener, no preventDefault) dispatches its op through the serializer and dismisses the menu. The menu MUST dismiss on outside-mousedown, `Escape`, or `scroll`. VS Code `--vscode-menu-*` / `--vscode-disabledForeground` theming applies.
  _Example:_ right-click a body cell → the menu appears; click "Insert row above" → a row is inserted and the menu closes.

- **TBL-I-13** — `compute_menu_items` MUST return **18 entries** — 15 `item`s plus 3 `separator`s at array indices 4, 8, and 13 — in the canonical order: Insert row above/below, Insert column left/right, [sep], Delete row, Delete column, Delete table, [sep], Swap row up/down, Swap column left/right, [sep], Align column left/center/right/none. The menu is a flat list (no submenu); alignment lives inline as the last group, not a nested surface.
  _Example:_ `compute_menu_items({row:1,col:1,row_count:3,col_count:3})` → length 17 with separators at 4/7/12.

- **TBL-I-14** — Menu items MUST be disabled per the GFM/structural rules: `Insert row above` when `row===0` (header); `Delete row` when `row===0` (header); `Delete column` when `col_count <= 1`; `Swap row up` when `row <= 1`; `Swap row down` when `row===0 || row >= row_count-1`; `Swap column left` when `col===0`; `Swap column right` when `col >= col_count-1`. `Delete table` is never disabled (TBL-I-33). A disabled item gets the `disabled` class and binds no action.
  _Example:_ right-click a header cell → "Insert row above", "Delete row", "Swap row up", and "Swap row down" are disabled.

- **TBL-I-15** — Typing GFM table source directly (`| a | b |\n| --- | --- |\n…`) MUST render via lezer-markdown + the widget with zero table-specific code (EA).
  _Example:_ paste a markdown table at document level → it renders as a widget (PA).

- **TBL-I-16** — Autocomplete on `|` (EB): `table_completions` MUST offer "Insert table (3×3)" ONLY when the current line is exactly `|` and the caret is immediately after that pipe (`before === '|'`). Accepting MUST replace the whole line with `make_starter_table_markdown()` (a 4-line empty 3-column starter: header, delimiter, two body rows), prepend a leading `\n` when `from === 0` (so an at-offset-0 table has a caret-targetable source line above for ArrowUp / click-above), append a trailing `\n` when the next byte is not already `\n` (TA2), and place the caret two columns into the first header cell (`table_from + 2`, where `table_from` is shifted by 1 past any prepended leading `\n`). The completion uses `filter: false`.
  _Example:_ type `|` on an empty line → accept → the line becomes the 4-line starter, caret in the first header cell; at offset 0 the insert also gains a leading `\n` and the caret shifts accordingly.

- **TBL-I-17** `[smoke]` — The command-palette entry surface `tutivog.plainmark.insertTable` ("Plainmark: Insert table", ED) MUST be registered with NO default keybinding (`package.json` `contributes.commands`); invoking it has the host post an `insert_table` message to the active webview, and `insert_table_at_caret` inserts the same 3×3 starter at the caret — prefixing `\n` when not at line start (always at offset 0), appending `\n` when the next byte is not `\n` (TA2), caret in the first header cell. Activation inside a table cell is refused (logged, no-op).
  _Example:_ run "Plainmark: Insert table" from the command palette mid-line → a starter table is inserted on its own line below the caret, caret in the first header cell.

- **TBL-I-18** `[smoke]` — Cross-cell undo/redo MUST be rebased by the `table_undo_rebase` ViewPlugin: on a transaction with userEvent `undo`/`redo`, it classifies via per-cell trimmed-text diff (`find_differing_cell`) — rebase the active subview in place (sync transaction tagged `table_sync_annotation` + `addToHistory.of(false)`), switch+rebase to a different cell (`request_cell_focus`), reactivate when no subview is active, or no-op when the table is gone. A **dimension-changing** undo/redo (reverting an insert/delete row/col) is now reachable while a cell is active, because structural ops re-focus the destination cell (TBL-I-32); the row/col-count change rebuilds the widget (`updateDOM` bails → `toDOM` destroys the active subview), so the plugin MUST reactivate the landing cell via `request_cell_focus` rather than an in-place rebase, which the rebuild would discard. The in-place rebase MUST pin an explicit clamped `selection` (`min(prev head, new length)`) and re-call `sub.focus()`: a whole-doc replace otherwise drifts the caret to an assoc-dependent doc edge, and a multi-line→single-line cell shrink (undoing a `<br>` soft break, N4) can drop the subview's `.cm-focused` class, which hides drawSelection's caret (`.cm-cursor` is `display:none` without it; invisible only in real hosts since headless Chromium reports `document.hasFocus()===true`). The `cell_edit_listener` MUST skip transactions carrying `table_sync_annotation` to break the ping-pong. The same plugin rebases host syncs that land while a cell is active (SYNC-H-8).
  _Example:_ edit cell A then cell B, Ctrl+Z twice → focus follows the undo back to A; no duplicate dispatch loop. Shift+Enter to add a `<br>`, then Ctrl+Z → the caret stays visible in the cell.

- **TBL-I-19** `[accepted]` — Paste support is limited to the free paths: markdown-source paste at document level (PA), plain-text paste into a cell (PB), and multi-line plain-text paste into a cell (PC, `\n` preserved → `<br>` on serialize). HTML-`<table>`, TSV/CSV, and multi-cell distribute paste (PD–PG) MUST NOT be handled and fall back to plain-text insertion.
  _Example:_ copying an Excel range and pasting into a cell inserts the clipboard's plain-text form (tabs/newlines literal), not a distributed multi-cell fill.

- **TBL-I-20** — Exiting above the table — ArrowUp from a row-0 cell, or Shift+Tab / ArrowLeft-at-cell-start from cell (0,0) — MUST tear down the subview synchronously and place the main-view caret at `table_from - 1` (the end of the line above). When the table starts at offset 0 (no line above exists), the exit MUST instead inject one `\n` byte at offset 0 and place the caret at offset 0, so the caret lands on a real source line above the block widget (TBL-SP-12).
  _Example:_ table at offset 0, caret in a header cell → ArrowUp → the doc gains a leading `\n`; the caret sits on the new empty first line.

- **TBL-I-21** — Exiting below the table — ArrowDown from a last-row cell, ArrowRight at the end of the last cell, or `Enter` from any last-row cell (TBL-I-6) — MUST tear down the subview and place the main-view caret at the start of the line strictly after the table's clamped extent, never at `info.to` itself (mid-line inside the block-replace's visual extent, where CM6's widget-corner fallback draws a table-height caret). When no such line exists (the table ends the document), the exit MUST inject one trailing `\n` byte at end-of-document and place the caret after it (TBL-SP-12).
  _Example:_ table is the last content of the doc, caret in a last-row cell → ArrowDown → the doc gains a trailing `\n`; the caret sits on the new empty last line.

- **TBL-I-22** — Main-view entry from above: with an empty (caret) selection on the line directly above a widget-rendered table, ArrowDown (caret anywhere on the line) and ArrowRight (caret at the end of the line) MUST activate cell (0,0) instead of CM6's default caret motion, which would land the caret inside the block-replace's visual extent.
  _Example:_ `hello\n| a | b |\n| - | - |` with the caret on `hello` → ArrowDown → cell (0,0) opens as a subview.

- **TBL-I-23** — Main-view entry from below: with an empty selection on the line directly after a widget-rendered table's clamped extent, ArrowUp (caret anywhere on the line) and ArrowLeft (caret at the start of the line) MUST activate the LAST rendered cell. The adjacency check MUST use the clamped `info.to` (TBL-R-7), so an absorbed non-pipe line between the table and the caret's line is ordinary content the caret moves onto, not skipped over.
  _Example:_ caret at the start of `tail` directly below a table → ArrowUp → the bottom-right cell opens; with `$a=b$` absorbed between the table and the caret's line, ArrowUp lands on `$a=b$` instead.

- **TBL-I-24** — Backspace at the start of the line directly after a widget-rendered table MUST be treated as navigation — activate the last rendered cell — and MUST NOT delete the separating `\n`: CM6's default line-join would merge the line into the last pipe row, corrupting the table grammar so it no longer parses as a `Table`. Backspace anywhere else on that line MUST keep default deletion behavior.
  _Example:_ caret at the start of `tail` below a table → Backspace → the bottom-right cell activates and the document bytes are unchanged.

- **TBL-I-25** — Every main-view entry binding (TBL-I-22 / TBL-I-23 / TBL-I-24) MUST apply only when the target table is widget-rendered, checked against the live DOM (`.plainmark-table-block[data-table-from]`), and only for an empty selection. IL1-skipped tables (TBL-R-12 / TBL-E-1) and non-empty selections MUST fall through to CM6's default key handling.
  _Example:_ a table nested in a list renders no widget → ArrowDown from the line above moves the caret one line down; no cell activates.

- **TBL-I-26** — A press-and-drag that begins on a `<td>` MUST select text inside the cell in one gesture, without a prior activating click. Because the activating mousedown is `preventDefault`-ed and the subview is created a frame later (AC3 rAF, TBL-I-1), the browser never arms its native drag-select for this gesture, so `activate_cell` MUST drive it manually: when the main view's pointer is still held at subview mount (`pointer_down_field`), it anchors at the `posAtCoords` press position (TBL-I-2) and, on each `document` `mousemove`, extends the subview selection to the pointer position until release. Release MUST be observed on `document` `mouseup` OR a button-less (`buttons === 0`) `mousemove` (Electron #17635: a release outside the webview iframe never delivers `mouseup`). The drag listeners MUST be removed on release and on subview teardown. The selection-extension transactions carry no `changes` and so create no undo step (subview history stays empty, TBL-I-9).
  _Example:_ press on cell (1,0) showing `hello world` and drag right → the cell activates and `hello world` is selected in the subview, no second click needed.

- **TBL-I-27** `[smoke]` — Each context-menu item whose action has a non-null binding in the resolved `plainmark.tableKeybindings` map (TBL-I-28) MUST render a right-aligned shortcut hint; an unbound action MUST render none. The hint MUST be platform-aware text from `format_shortcut(combo, {mac})`: `Mod` → `Cmd` on macOS / `Ctrl` elsewhere, `Alt` → `Option` on macOS / `Alt` elsewhere, `Shift` spelled, arrows as glyphs (`↑`/`↓`/`←`/`→`), other keys spelled (e.g. `Backspace`), single letters upper-cased; macOS is detected from `navigator` at render time. The visible hint span MUST be `aria-hidden`, with the binding exposed via `aria-keyshortcuts` from `aria_keyshortcut(combo)` in canonical, platform-invariant names (`Mod`/`Ctrl` → `Control`, `Cmd`/`Meta` → `Meta`, raw key value).
  _Example:_ with defaults, "Insert row above" shows `Option+Shift+↑` (macOS) / `Alt+Shift+↑`; "Delete row" shows `Cmd+Shift+Backspace` / `Ctrl+Shift+Backspace` (aria `Control+Shift+Backspace`); "Delete column", "Delete table", and the align items show no hint until bound.

- **TBL-I-28** `[smoke]` — User-configurable table shortcuts MUST come from the `plainmark.tableKeybindings` setting (object, `scope: resource`), keyed by the 15 table action-IDs (`insert_row_above`, `insert_row_below`, `insert_column_left`, `insert_column_right`, `delete_row`, `delete_column`, `delete_table`, `swap_row_up`, `swap_row_down`, `swap_column_left`, `swap_column_right`, `align_left`, `align_center`, `align_right`, `align_none`), each a CodeMirror-syntax key string (`Mod`/`Alt`/`Ctrl`/`Shift` joined with `-`) or `""`. The host MUST merge user entries over the built-in defaults (TBL-I-29) per-action — an unspecified action keeps its default — resolve and validate them (TBL-I-30) via the vscode-free `resolve_table_keybindings`, and inject the fully-resolved map into the webview at boot as `window.__plainmark_table_keybindings`.

- **TBL-I-29** — `resolve_table_keybindings` built-in defaults MUST be: `insert_row_above`/`insert_column_left`/`insert_column_right` = `Alt-Shift-Arrow{Up,Left,Right}`; `insert_row_below` = `Mod-Enter` (`Mod` is Cmd on macOS, Ctrl elsewhere); `swap_row_up`/`swap_row_down`/`swap_column_left`/`swap_column_right` = `Alt-Arrow{Up,Down,Left,Right}`; `delete_row` = `Mod-Shift-Backspace` (Typora parity); `delete_column`, `delete_table`, and `align_left`/`align_center`/`align_right`/`align_none` = unbound (`null`), user-assignable. `resolve_table_keybindings(undefined)` MUST return exactly these.

- **TBL-I-30** — Each user entry MUST be validated: the value MUST parse as `[Mod|Alt|Shift|Ctrl|Cmd|Meta]-…-<Key>` and carry at least one modifier; `""` unbinds the action; an unknown action-ID, a non-string value, an unparsable combo, or a modifier-less value MUST be ignored with a warning, leaving the action's default intact; a value normalizing to a reserved structural key (`Tab`, `Shift-Tab`, `Enter`, `Shift-Enter`, the bare arrows, `Mod-z`, `Mod-Shift-z`, `Mod-y`) MUST be rejected (default kept) with a warning; when two actions resolve to the same key, the earlier action in canonical (menu) order keeps it and the later MUST be unbound, with a warning. Warnings MUST be returned to the caller (logged via `console.warn`, no modal).
  _Example:_ `{"delete_column": "Mod-z"}` → `delete_column` stays unbound (reserved); `{"align_left": "Alt-Shift-ArrowUp"}` → `insert_row_above` keeps it, `align_left` unbound (duplicate).

- **TBL-I-31** `[smoke]` — A change to `plainmark.tableKeybindings` (or `plainmark.styles`) MUST reload the webview (re-set `webview.html`), re-injecting the resolved map (TBL-I-28); CM6 state rebuilds via the `ready` handshake and the document text MUST be unaffected.

- **TBL-I-32** `[smoke]` — After a **content-changing** structural op (insert/delete row/col, swap row/col), the widget MUST re-activate the destination cell — via `request_cell_focus` from both the keyboard bindings (TBL-I-8) and the context-menu `run_action` — so the caret follows the content into the new/moved cell (TBL-I-1 then seeds the main selection there). The destination is the pure `structural_op_target` map, clamped to post-op dimensions: insert-row-above → `(r, c)`, insert-row-below → `(r+1, c)`, insert-column-left → `(r, c)`, insert-column-right → `(r, c+1)`, delete-row → `(min(r, rows-1), c)`, delete-column → `(r, min(c, cols-1))`, swap-row-up → `(r-1, c)`, swap-row-down → `(r+1, c)`, swap-column-left → `(r, c-1)`, swap-column-right → `(r, c+1)`. Re-focus MUST be skipped for a no-op op (`changed === false`) and for the four `align_*` actions (no content or position change — the surviving subview already shows correct content, and re-focusing would needlessly reset the in-cell caret). This re-activation (a swap's re-focus in particular) also refreshes the surviving subview's content, which would otherwise be stale. This reverses the prior "structural ops are commit points; the user re-focuses" design, adopting the Typora/Obsidian behavior the README positions Plainmark against.
  _Example:_ active in cell (1,0), Alt+ArrowDown (swap row down) → cell (2,0) becomes active showing the swapped-in content; "Align column center" from the menu → the active cell and its caret are unchanged.

- **TBL-I-33** `[smoke]` — A `delete_table` action MUST remove the entire table block. It is exposed as a context-menu item ("Delete table", never disabled, TBL-I-14) and a user-assignable keybinding (unbound by default, TBL-I-29); it is NOT a `table_ops` model mutator. `dispatch_table_remove` MUST emit exactly one change-bearing transaction that cuts `[info.from, info.to]` plus one immediately-trailing `\n` if present (the TA2 single-adjacent-newline rule in reverse, so no blank line is stranded where the table was), carrying `Transaction.userEvent.of('input')` (host-forwarding sync path, TBL-SP-2 parity), and land the main selection at `info.from` clamped to the shortened document — the table's former first `|`. The delete-range and caret offset are the pure `table_removal_range`. No surviving cell is re-focused (`structural_op_target('delete_table')` = `null`, TBL-I-32); the keymap path MUST tear down the active subview before removal (cell→main exit parity).
  _Example:_ right-click any cell → "Delete table" → the table source and its one trailing newline are gone, the rendered block leaves the DOM, and the caret sits where the table began.

- **TBL-I-34** `[smoke]` — Bare `Backspace` at the start of the first cell (0,0) of an **all-empty** table (every cell whitespace-only per `model_is_empty` over the built model) MUST remove the whole table via `dispatch_table_remove` (TBL-I-33) — the Typora empty-table-delete. This is a fixed cell-keymap binding, NOT user-configurable (the explicit, assignable path is `delete_table`, TBL-I-33). It MUST fall through to the normal in-cell delete (the binding returns `false`, no removal) when the caret is past the cell start, the active cell is not (0,0), or any cell holds non-whitespace content — so the implicit path can never destroy a table that holds data.
  _Example:_ insert a table, clear every cell, then Backspace from the first cell → the table is gone; the same Backspace in a table with any content just deletes within the cell.

## SP · Source preservation

- **TBL-SP-1** — The table widget is the SINGLE construct permitted to re-serialize source, the documented exception to `INV-SP-1`/`INV-SP-2`. On every cell edit (per keystroke, T1 — no debounce), the widget MUST recompute the whole table from its in-memory model and dispatch exactly ONE CM6 transaction `{from: table.from, to: table.to, insert: serialized}` (or `serialized + '\n'` per TA2) carrying `Transaction.userEvent.of('input')` and explicitly NOT `syncAnnotation` (AC4). Bytes outside `[table.from, table.to]` (apart from the one TA2 byte, TBL-SP-7) MUST be preserved verbatim (`INV-SP-1`).
  _Example:_ in `para A\n\n| a | b |\n| - | - |\n\npara B`, editing cell `b` rewrites only the table block (plus possibly one TA2 `\n`); `para A`, the blank lines, and `para B` are byte-identical.

- **TBL-SP-2** — Structural ops (`dispatch_table_edit`, `dispatch_op`) and Tab auto-row-create MUST each produce one whole-table replace transaction through the same serializer + TA2 path, identical in shape to a cell edit — including pinning the main selection at `table_from` (TBL-SP-8 parity), so a caret sitting before or inside the table is not stranded at offset 0 or drifted past the table by CM6's change-mapping. That pin is the safety net for when re-focus (TBL-I-32) finds no target; a successful re-focus then seeds the selection into the destination cell (TBL-I-1), overwriting it. No op writes outside the table range except the one TA2 byte.
  _Example:_ "Insert row above" → one transaction replacing the table source with the new row added; the main caret lands in the table, not at document start.

- **TBL-SP-3** — **(P3) Column-uniform alignment-aware padding.** The serializer MUST pad every cell with ASCII spaces to its column's widest cell, measured by source-BYTE length (`TextEncoder`), floored at 3 so the delimiter is valid. Padding side follows alignment: trailing for left/unaligned, leading for right, split (extra on the right for an odd gap) for center. The delimiter row MUST match each column's width; leading and trailing `| ` / ` |` are always present on every row.
  _Example:_ a column whose widest cell is `Header 2 long` pads `wide_b` to that width — leading for a right-aligned column, trailing for left/unaligned — and the delimiter row matches the same width.

- **TBL-SP-4** — **(E1) Cell content is verbatim markdown source; escape only unescaped pipes.** The cell model IS markdown inline source — the same content the at-rest emitter (TBL-R-3) and the cell subview (TBL-I-3) interpret as markdown — so backslash escapes (`\$`, `\*`, `\\`) are meaningful and MUST survive a serialize round-trip. On serialize, `escape_cell_text` MUST escape every *unescaped* `|` (one preceded by an even-length run of backslashes) to `\|`, leave an already-escaped `\|` untouched, then rewrite `\n` to `<br>` (TBL-SP-5). It MUST NOT escape backslashes: a backslash is part of the markdown escape (`\$`, `\*`, `\\`), so doubling it would re-render the escape as a literal `\` plus the escaped character. The escape-aware pipe rule still prevents a cell split: a literal backslash before a raw pipe is an even run, so the pipe is escaped (`…\\` + `|` → `…\\\|`) and re-reads as a backslash plus a literal pipe, never an escaped backslash plus a live delimiter. On parse, `parse_cell_text` MUST decode only `<br>`→`\n` (TBL-SP-5) and leave `\|`, `\\`, and every other escape verbatim for the markdown layer to interpret.
  _Example:_ a cell whose model is `a|b` serializes as `a\|b`; a cell already holding `a\|b` (escaped pipe) serializes unchanged; `\$38-\$45` serializes verbatim and re-renders as `$38-$45`, not as a literal `\$38-\$45`.

- **TBL-SP-5** — **(N4) `\n` ↔ `<br>` round-trip.** `escape_cell_text` MUST rewrite each cell `\n` to `<br>`; `parse_cell_text` MUST turn `<br>` / `<br/>` / `<br />` back into `\n`. Combined with N4 navigation (TBL-I-6), a cell with source `line1<br>line2` opens as two logical lines and re-serializes to `<br>` with no drift. `[accepted]` Literal `<br>` text typed into a cell cannot survive a round-trip — it is indistinguishable from a soft break and re-parses to a `\n`; this is inherent to the N4 scheme and is an accepted limitation.
  _Example:_ Shift+Enter inserts a `\n` in the subview → next serialize writes `<br>` into the source.

- **TBL-SP-6** — **(MC1) Header column count wins** — a deliberate, sanctioned data-loss compromise on first edit of a mismatched file. The serializer's `col_count` MUST be the header (row 0) length; for each row it iterates exactly `col_count` cells, padding short rows with empty cells and DROPPING cells past `col_count`. Excess body cells are also dropped at extraction (TBL-R-8), so the first edit of a longer-than-header row permanently loses those bytes.
  _Example:_ a 3-col-header file with a 5-cell body row → first cell edit serializes that row to 3 cells; the two extra cells are gone.

- **TBL-SP-7** `[smoke]` — **(TA2) One trailing newline outside the table range** — the single place the dispatch writes a byte OUTSIDE `[table.from, table.to]`, widening the carve-out by exactly one byte (`INV-SP-2`). TA2 lives at the dispatch sites, NOT inside the pure `serialize_table`, so the serializer's unit test does not pin it; no tier-a test covers the trigger. The dispatch MUST become `insert = serialized + '\n'` when the byte immediately after the table is not `'\n'` (including the end-of-doc case where `table.to >= doc.length`, since the sliced next byte is then `''`). It MUST NOT fire when a `\n` already directly follows the table. TA2's role is to guarantee a caret-targetable source line directly after the table — in practice the end-of-doc case, since the clamp (TBL-R-7) always ends at a row boundary. It does NOT prevent GFM from absorbing a following pipe-bearing line as a table row; that absorption is accepted behavior (TBL-E-7).
  _Example:_ `| a |\n| - |` at end of doc → first cell edit appends one `\n` after the table; `| a |\n| - |\n\npara` → no TA2 byte added (a `\n` already directly follows).

- **TBL-SP-8** `[inherits:INV-UNDO-1]` — One cell keystroke MUST equal one CM6 transaction MUST equal one Ctrl+Z (atomic undo by construction under A2). The transaction pins the main selection at `table_from` so the post-undo caret does not drift past the table; the keystroke's history `startSelection`, in turn, is whatever the activation seed (TBL-I-1) left inside the cell, so undo restores a table-local caret rather than document offset 0. The activation seed is selection-only and adds no undo step, preserving the one-keystroke-one-Ctrl+Z guarantee. Cross-cell undo is handled by the rebase plugin (TBL-I-18).
  _Example:_ typing `x` into a cell of a ragged table repads the whole table in one transaction; one Ctrl+Z removes `x` and the repad together, leaving the caret inside the table.

- **TBL-SP-9** — **(AC6) Round-trip stability / idempotency.** A table already in canonical P3/E1/N4/TA2/MC1 form MUST serialize to byte-identical output (focus + no-op + blur leaves bytes unchanged). The first edit of a non-canonical table normalizes it; every subsequent edit is then stable.
  _Example:_ open a canonically-padded table, focus and blur a cell without typing → bytes unchanged on save.

- **TBL-SP-10** `[inherits:INV-SP-3]` — Encoding, line endings, BOM, and final-newline behavior MUST follow VS Code's `TextDocument`; the serializer joins rows with `'\n'` internally but the file-I/O normalization is the host's, not the widget's.
  _Example:_ a CRLF file's table edits round-trip through the host's EOL handling, not a serializer-imposed LF.

- **TBL-SP-11** `[inherits:INV-SP-2]` — All table RENDERING (the block widget, inline-emitted cell HTML, alignment styles, placeholder `<td>`) MUST be decoration-only and MUST NOT mutate source. Only the edit/op/serialize path (TBL-SP-1/2) and the cell-exit injection (TBL-SP-12) write bytes; reads (`render_cell_contents`, `coordsAt`, `find_tables`) never dispatch.
  _Example:_ scrolling, opening, and hovering a table emits zero `WorkspaceEdit`s (`INV-SP-4`).

- **TBL-SP-12** — **Navigation-driven newline injection** — the ONLY navigation (non-editing) action permitted to write bytes. The two cell-exit paths (TBL-I-20 / TBL-I-21) MAY each write at most one `\n` byte directly adjacent to the table: leading at offset 0 (exit above a table at document start) or trailing at end-of-document (exit below a table at document end), dispatched as a single userEvent-`input` transaction. An exit that has a real line to land on MUST write zero bytes. This is a sanctioned extension of the `INV-SP-2` allowlist.
  _Example:_ ArrowUp out of an at-offset-0 table writes exactly one byte (`\n` at offset 0); the same exit on a table with a line above writes none.

## E · Edge cases

- **TBL-E-1** — A table nested in a list item or blockquote MUST be skipped (IL1; cross-ref TBL-R-12): no widget, plain-source render. This is the at-render guard `is_in_list_or_blockquote` on the table's first line.
  _Example:_ `- | a | b |\n  | - | - |` → renders as list source, not a table widget.

- **TBL-E-2** — Mismatched columns are governed at TWO distinct layers: **at-rest DOM** pads missing cells as `underfill` placeholders (TBL-R-9, T10.9) and drops excess cells (TBL-R-8); **on-edit serialize** normalizes the SOURCE to the header column count (TBL-SP-6, MC1/AC5). AC5 governs serialize output, not the at-rest DOM; the two layers MUST stay distinct (placeholders are not yet written to source).
  _Example:_ a 2-cell body row under a 3-col header shows 3 `<td>` (one underfill) at rest; the next cell edit writes a 3-cell padded row to source.

- **TBL-E-3** — Rows MAY omit leading/trailing pipes (GFM-legal): `extract_cell_ranges_in_row` derives cells from inter-`TableDelimiter` spans and includes a leading span before the first delimiter and a trailing span after the last when present. Such a table MUST still extract and, on edit, re-serialize to the canonical leading+trailing-pipe form (P3).
  _Example:_ `a | b\n- | -` extracts two columns; first edit rewrites it to `| a | b |\n| - | - |`.

- **TBL-E-4** — A header-only table (one row + delimiter, `row_count === 1`) MUST render as a `<thead>`-only widget; `build_model_from_extraction` MUST guarantee at least one row in the model. Single-column and single-row tables MUST serialize validly (column width floored at 3).
  _Example:_ `| h |\n| - |` → a one-cell `<thead>`; editing it stays a valid one-column table.

- **TBL-E-5** — An all-empty or empty-leading column MUST keep a valid width: each column floors at 3 source bytes for the delimiter, and the rendered cell floors at `--plainmark-table-cell-min-width` (2em). Typing a new widest value in a column MUST repad every other cell in that column on the next keystroke (P3 repad-on-widest).
  _Example:_ widening cell (1,0) from `x` to `xxxxxxxx` → the header and other body cells in column 0 gain padding so all match.

- **TBL-E-6** `[smoke]` — A multi-line cell (`<br>` soft breaks) MUST display as multiple visual lines in one `<td>` and round-trip its `\n`↔`<br>` (TBL-SP-5, BR1); cell height grows accordingly.
  _Example:_ `a<br>b<br>c` → three stacked lines inside one `<td>`.

- **TBL-E-7** `[accepted]` — A pipe-bearing line directly following a table (no blank line between) MUST be treated as a table row — GFM continuation semantics, parsed by lezer as a `TableRow`: it renders as a row, is included in `[info.from, info.to]`, and the first edit re-serializes it through P3/E1/N4/MC1 like any other row, including MC1's dropping of cells past the header column count (TBL-SP-6). Plainmark MUST NOT attempt to protect such lines from absorption; the user's separator is a blank line. The `last_row_to` clamp (TBL-R-7) excludes only non-pipe absorbed lines. Adjacent tables separated by a blank line MUST be parsed and widgeted independently. (Supersedes the prior wording that promised non-absorption; owner-ratified.)
  _Example:_ `| a |\n| - |\nfoo | bar` → `foo | bar` renders as a body row of the one-column table; the first cell edit rewrites that row as `| foo |` (the ` bar` cell is dropped per MC1). A blank line before `foo | bar` keeps it a paragraph.

- **TBL-E-8** `[smoke]` — An image-bearing paragraph adjacent to a table MUST not perturb table extraction (probe-c regression). A cell-internal image MUST render `<img>` with `image_base`-resolved src and the `max-width:100%` cap.
  _Example:_ a table directly above `![x](y.png)` → both render; `![a](pic.png)` inside a cell → a capped inline image.

- **TBL-E-9** — Math inside cells MUST share the single `math_cache_field` with the standalone math widget (EMIT1, TBL-R-4); the math widget's overlapping `Decoration.replace` inside the block range is benign (clipped by the block replacement) while its cache-population side effect drives cell re-render via the `set_typeset_effect` rebuild and the `eq` math fingerprint.
  _Example:_ the same `$x^2$` appearing both in a paragraph and a cell typesets once and both read the one cache entry.

- **TBL-E-10** — Raw inline HTML other than `<br>` MUST render as literal text in a cell (EMIT1 out-of-scope; cross-ref TBL-R-5), never as parsed elements; backslash escape sequences in plain text are unescaped by `unescape_text` (it drops the backslash before any escaped character; it does not decode HTML entities).
  _Example:_ `<span style="x">y</span>` in a cell → the literal characters, shown verbatim.

- **TBL-E-11** — A malformed table (extraction throws) MUST degrade to plain-source rendering for that table alone (FAIL1; cross-ref TBL-R-13) without affecting other tables or crashing CM6.
  _Example:_ a table the extractor cannot structure → it shows as raw pipe-text; a valid table elsewhere in the doc still renders as a widget.

- **TBL-E-12** — An EDIT-path failure (a throw inside `handle_cell_edit`'s or `dispatch_table_edit`'s serialize/dispatch try/catch) MUST NOT write any bytes — the document stays byte-identical — and MUST surface the failure: `console.error` plus a `plainmark-table-edit-error` DOM event, relayed to the host as a `table_edit_error` message that shows a VS Code error notification (SHELL-M-8). Only RENDER-path failures degrade silently (TBL-R-13); a swallowed edit failure would be a silently dropped keystroke on the one surface permitted to rewrite source.
  _Example:_ `serialize_table` throws during a cell keystroke → the document is unchanged and VS Code shows "Plainmark: a table edit could not be applied and was discarded (…)".
