---
prefix: LIST
title: Lists
kind: construct
---

# Lists — Specification

Normative behavior for CommonMark/GFM list rendering, interaction, and byte
guarantees. Covers unordered lists (`-`/`*`/`+`), ordered lists (`1.`/`1)`),
task/checkbox lists (`- [ ]` / `- [x]`), nesting depth, the bullet / number /
checkbox marker rendering, and the list-editing keymap. Rendering is the
`list_item_handler` + `task_handler` `NodeHandler`s; the
custom keymap is `list_empty_bullet_backspace` + `list_dangling_indent_backspace`;
Enter
continuation and generic indent/outdent come from `@codemirror/lang-markdown`'s
`markdownKeymap` (auto-wired at `Prec.high` by `markdown()`, since `addKeymap`
defaults to `true` and is not disabled) and `indentWithTab`. All are wired into
the editor's extension set.

Reveal model: **bullets and
task items never reveal** (Typora B2 — the raw marker is never shown when the
caret is on the line); **only ordered numbers reveal** per-line (B1), and that
reveal governs only indent display, since the number text is shown either way.

Example notation: `|` = caret, `→` = action/result, `\n` = newline (see README §2).

## R · Rendering

- **LIST-R-1** — Each `ListItem` MUST receive a `Decoration.line` (class `plainmark-list-item`) on its first line, carrying `style="--plainmark-list-depth: <n>"` and a `data-list-depth="<bucket>"` attribute, where `<n>` is the Lezer nesting depth and `<bucket>` is `min(n, 2)`.
  _Example:_ `- a` → line gets `class="plainmark-list-item"`, `style="--plainmark-list-depth: 0"`, `data-list-depth="0"`.

- **LIST-R-2** `[smoke]` — When the item is not revealed AND the marker is followed by at least one character on its own line (the space-gate, see LIST-E-6), an unordered marker MUST be replaced by a `Decoration.replace` carrying a `ListBulletWidget`; the replaced span MUST cover the source's leading whitespace, the `ListMark` (`-`/`*`/`+`), AND the single trailing space (`[line.from, markEnd(+space)]`), so the fixed-width widget box alone forms the marker column.
  _Example:_ `- a` → bullet widget spans `[0,2)` (`- `); nested `  - b` → widget spans `[lineStart, markEnd]` including the two leading spaces.

- **LIST-R-3** `[smoke]` `[accepted]` — The bullet marker MUST cycle by depth bucket — bucket 0 → filled disc, bucket 1 → hollow ring, bucket 2 (depth ≥ 2) → filled square — drawn as CSS box geometry on `.plainmark-list-bullet::before` (`width`/`height`/`border-radius`/`background-color`/`border`), never as a font character: character markers (`●`/`○`/`■`) resolve from different faces per host (Segoe UI vs Apple Symbols) and render at visibly different sizes. Marker sizes come from `--plainmark-list-bullet-size` / `-2-size` / `-3-size` (defaults `0.3em` / `0.3em` / `0.26em`); the `::before` box's `margin-right` pads the marker column out to one `--plainmark-list-indent` unit so LIST-E-4 alignment is preserved. The widget DOM is an empty `.plainmark-list-bullet` span kept `display: inline` (an inline-block sized widget span distorts CM6 caret geometry); the marker is pure CSS so a `plainmark.styles` override applies live. (Supersedes the character-glyph `content: var(--plainmark-list-bullet[-2|-3])` scheme with `0.6em`/`0.5em` scaling; those variables are retired.)
  _Example:_ `- a\n  - b\n    - c` → disc, ring, square boxes at the three depths, pixel-identical across Windows and macOS hosts.

- **LIST-R-4** — The bullet widget MUST be a stateless singleton (`eq()` always `true`): it carries no depth or glyph state, so depth-cycling rides the line's `data-list-depth` attribute and the CSS cascade, never a per-widget difference.
  _Example:_ a level-0 and a level-2 bullet share one widget instance; only their line's `data-list-depth` differs.

- **LIST-R-5** — An ordered marker (`1.` / `1)` …) MUST NOT be widget-replaced; when not revealed it is styled by a `plainmark-list-marker` `Decoration.mark` over `[mark.from, mark.to]`, and any leading whitespace before the mark is hidden by a `Decoration.replace({})`. The digits are the rendered form (no CSS counter, no glyph).
  _Example:_ `1. a` → `1.` styled and shown verbatim; `  1. b` → leading two spaces hidden, `1.` styled.

- **LIST-R-6** `[smoke]` — When not revealed, a task item's `TaskMarker` (`[ ]` / `[x]` / `[X]`, exactly 3 bytes) MUST be replaced by a `Decoration.replace` carrying a `TaskCheckboxWidget` (`<input type="checkbox">`), and the leading `ListMark`-plus-space MUST be hidden by a zero-`font-size` `plainmark-list-marker-hidden` `Decoration.mark`.
  _Example:_ `- [ ] todo` → `- ` hidden via mark over `[0,2)`, checkbox over `[2,5)`, then "todo".

- **LIST-R-7** — The leading `- ` of a task item MUST be hidden with a `Decoration.mark` (`font-size:0`), NEVER a line-leading `Decoration.replace`, because a `contenteditable=false` zero-width widget at line start flickers `drawSelection`'s wrapped-line rectangle under line wrapping (the heading drag-selection flicker defect). The ordered leading-whitespace hide MAY stay a `Decoration.replace({})` because ordered items still reveal and dodge the flicker.
  _Example:_ `- [x] a` → `[0,2)` is a `plainmark-list-marker-hidden` mark, not a replace widget.

- **LIST-R-8** `[smoke]` — A checked task item (`[x]` / `[X]`) MUST additionally receive a `plainmark-task-checked` `Decoration.line` (default `line-through` + muted color) and render a `checked` checkbox; `[ ]` MUST render unchecked with no task-checked line.
  _Example:_ `- [x] done` → checked checkbox + struck-through "done"; `- [ ] todo` → unchecked, no strikethrough.

- **LIST-R-9** — Nesting depth MUST be computed from the Lezer tree (`list_depth` = count of enclosing `ListItem` ancestors), NOT from the source's leading-whitespace count; the source whitespace is hidden so a 2-space, 4-space, or tab indent renders the same column.
  _Example:_ `- a\n   - b` (3-space) and `- a\n  - b` (2-space) → both render the child at depth 1, identical indent.

- **LIST-R-10** — Detection MUST be syntax-tree driven: `list_item_handler` fires on `ListItem` and `task_handler` on `Task`; a line the parser does not classify as a list item MUST receive no list decoration. A `ListItem` whose first child is not a `ListMark` MUST receive only the line decoration.
  _Example:_ `a - b` → plain text, no bullet.

## I · Interaction

- **LIST-I-1** `[smoke]` — An unordered (bullet) item MUST NOT reveal its raw marker when the caret is on the line: the `ListBulletWidget` replace is emitted regardless of caret position (B2 / Typora). Changing `-`↔`*` is therefore a source-mode edit, not a preview edit.
  _Example:_ click into `- a` → still renders the bullet glyph (the `- ` is not re-exposed).

- **LIST-I-2** `[smoke]` — A task item MUST NOT reveal its raw `- [ ]` / `- [x]` when the caret is on the line: the checkbox widget and the hidden `- ` mark are emitted regardless of caret position (B2).
  _Example:_ click into `- [ ] todo` → still renders the checkbox (the `- [ ]` is not re-exposed).

- **LIST-I-3** — An ordered item MUST reveal per-line via the canonical predicate evaluated against the item's OWN marker line range (`should_reveal_for_selection(state, own_line.from, own_line.to)`, DEF-7 2026-06-12): a selection touching that line reveals it — dropping the line to depth 0 with the marker styled (not whitespace-hidden) — EXCEPT a non-empty selection strictly covering the line on both sides (select-all keeps numbers rendered), with pointer-down evaluating the frozen pre-press selection; off-line it takes its computed depth with leading whitespace hidden. The reveal is scoped to the own first line so a nested-child edit cannot collapse an ancestor's depth.
  _Example:_ caret into `1. a` → line at depth 0, `1.` styled; caret into a nested `1. b` → only that line reveals, the parent keeps its depth.

- **LIST-I-4** `[smoke]` — The replaced bullet span (leading whitespace + `ListMark` + trailing space) MUST be registered with `EditorView.atomicRanges` so the caret crosses the marker column as one unit. The atomic set MUST be built `RangeSet.of(ranges, true)` (sorted) to tolerate two adjacent bullet ranges sharing a `from` (fuzz seed `0xa11ced10e`).
  _Example:_ caret right after a bullet line start → one ArrowLeft jumps past the whole `- ` column to line start, never landing between `-` and the space.

- **LIST-I-5** `[smoke]` — Clicking the rendered checkbox MUST toggle the task state via a source edit: `[ ]`→`x`, `[x]`/`[X]`→` ` (the single middle byte). The click MUST `preventDefault`/`stopPropagation` and the mousedown MUST `preventDefault` so focus/selection is not disturbed.
  _Example:_ click the checkbox of `- [ ] todo` → source becomes `- [x] todo`.

- **LIST-I-6** — `toggle_task_marker` MUST verify the resolved node is a 3-byte `TaskMarker` whose middle byte is `' '` / `'x'` / `'X'`; otherwise it MUST return false and dispatch nothing.
  _Example:_ `toggle_task_marker` at a non-marker offset → returns false, no transaction.

- **LIST-I-7** — Enter on a non-empty list item MUST continue the list (insert the next marker on a new line) and Enter on an empty item MUST exit it, via `markdownKeymap`'s `insertNewlineContinueMarkup`; an ordered marker MUST be incremented and the `.`/`)` delimiter preserved. No list-specific Enter handler ships — list continuation is delegated.
  _Example:_ `- a|` + Enter → `- a\n- |`; `1. a|` + Enter → `1. a\n2. |`; `- |` (empty) + Enter → exits the list.

- **LIST-I-8** `[smoke]` — Backspace on an EMPTY bullet line MUST remove the marker and everything after it on the line but KEEP the leading indentation, leaving an indent-only line with the caret at its end (Typora two-stage exit, stage one; stage two is LIST-I-13), via `list_empty_bullet_backspace`. "Empty bullet" means the line matches `^[ \t]*[-*+][ \t]*$` AND the syntax tree resolves the marker inside a `ListItem`.
  _Example:_ `- |` + Backspace → `|`; `- a\n  - |` (nested) + Backspace → `- a\n  |` (indent kept, caret at its end); `- a\n- |` + Backspace → `- a\n|`.

- **LIST-I-9** — `list_empty_bullet_backspace` MUST decline (return false) on: a non-empty selection, a non-empty bullet line, a plain blank line, an empty ORDERED item (`1. `), and a lone `-` the parser treats as a setext-heading underline.
  _Example:_ `1. |` + Backspace → returns false (default delete); `text\n-|` (setext underline) + Backspace → returns false.

- **LIST-I-10** — The empty-bullet Backspace MUST be bound at `Prec.highest` so it beats `markdownKeymap`'s `deleteMarkupBackward` (which outdents a nested item instead of removing it). On a non-empty item where it declines, `deleteMarkupBackward` provides the markdown-aware outdent/marker-delete fallback.
  _Example:_ `  - |` + Backspace → marker removed (not merely outdented to `- `).

- **LIST-I-11** `[accepted]` — Tab/Shift-Tab indent is the generic `indentWithTab` command, NOT a list-grammar-aware indent: there is no list-specific Tab handler. Indenting/outdenting a sub-list relies on `indentWithTab` plus the editor's indent unit, set to two spaces (`indentUnit` = `'  '`) — kept at two so a Tab-indented prose line stays below the 4-space indented-code-block threshold. Fenced code blocks override this with a dedicated 4-space Tab/Shift-Tab (CBLK-I-13).
  _Example:_ `- a|` + Tab → generic editor indent at the caret line.

- **LIST-I-12** `[accepted]` — No list-toggle command (e.g. `Mod-Shift-L` to wrap a selection in `- `) and no keyboard checkbox toggle ship; the checkbox is mouse-only and other list operations use the editor's default key handling.
  _Example:_ pressing any modifier combo on a paragraph does nothing to make it a list.

- **LIST-I-13** `[smoke]` — Backspace on an indent-only line (matches `^[ \t]+$`) whose PREVIOUS line resolves inside a `ListItem` MUST remove the entire line including its preceding newline, landing the caret at the end of the previous line (Typora two-stage exit, stage two; stage one is LIST-I-8), via `list_dangling_indent_backspace`. It MUST decline on: a non-empty selection, a truly empty line (no whitespace), the document's first line, and an indent-only line whose previous line is not inside a list item — those keep the editor's default Backspace.
  _Example:_ `- a\n  |` + Backspace → `- a|`; `hello\n  |` + Backspace → default delete (previous line is a paragraph).

## SP · Source preservation

- **LIST-SP-1** `[inherits:INV-SP-1]` — All list RENDERING (bullet widget, ordered-number mark, leading-whitespace hide, task checkbox widget, hidden `- ` mark, depth line decoration) MUST be decoration-only and MUST NOT modify any source byte; `Decoration.replace` and `Decoration.mark` are render-only. Only the table widget rewrites source.
  _Example:_ open `- a\n1. b\n- [ ] c` and never edit → bytes byte-for-byte unchanged on save.

- **LIST-SP-2** — The checkbox toggle, empty-bullet Backspace, and Enter continuation are legitimate user-initiated edits, not render-time mutations; each MUST change only the bytes its action implies (toggle: one middle byte; Backspace: the empty line; Enter: the inserted marker line) and leave all other bytes intact.
  _Example:_ toggling `- [ ] a` in `intro\n- [ ] a\nend` changes only the one byte at the `[ ]` middle; `intro` and `end` untouched.

- **LIST-SP-3** — Each list edit MUST be a single CM6 transaction carrying a `userEvent` annotation (`input.toggle` for the checkbox, `delete` for the empty-bullet Backspace) so it is independently undoable in one Ctrl+Z (atomic-undo).
  _Example:_ checkbox toggle `[ ]`→`[x]` → one Ctrl+Z reverts to `[ ]`.

- **LIST-SP-4** `[accepted]` — Ordered-list siblings MUST NOT be auto-renumbered after an edit/insert/delete; the source digits are the rendered form (no CSS counter). Displayed numbers MAY drift out of sequence until the user fixes them. (Accepted deferral.)
  _Example:_ `1. a\n2. b`, delete line 1 → remaining `2. b` keeps `2.` (not renormalized to `1.`).

## E · Edge cases

- **LIST-E-1** — A `-`/`*`/`+` marker MUST be treated as a task item only when its `ListMark` is followed by an exactly-3-byte `TaskMarker` whose middle byte is `' '`/`'x'`/`'X'`; any other bracketed content MUST render as an ordinary bullet.
  _Example:_ `- [todo] x` → normal bullet (no checkbox); `- [ x] y` (4-byte interior) → normal bullet.

- **LIST-E-2** — An ordered item delimited by `)` (`1)`) MUST be handled identically to `.` (`1.`): styled `plainmark-list-marker`, never widget-replaced.
  _Example:_ `1) first` → `1)` styled, shown verbatim.

- **LIST-E-3** — Depth bucketing MUST cap at 2: nesting depth 3 and deeper all map to `data-list-depth="2"` (one shared glyph) while `--plainmark-list-depth` keeps the uncapped true depth that drives the indent `calc()`.
  _Example:_ `- a\n  - b\n    - c\n      - d` → buckets `0,1,2,2`; depths `0,1,2,3`.

- **LIST-E-4** `[smoke]` — Wrapped continuation lines and deeper nesting MUST align to the parent's text column via hanging-indent CSS (`.plainmark-list-item` `padding-left: calc((depth+1) * indent)` + negative `text-indent`, the bullet widget sized to exactly one `--plainmark-list-indent` unit). Indentation MUST use horizontal padding only (never vertical margin — height-map desync). Consecutive sibling items MUST get `padding-top: var(--plainmark-list-item-spacing, 0.25em)` via `.plainmark-list-item + .plainmark-list-item`.
  _Example:_ a long bullet that wraps → the second visual line starts at the text column, the glyph hanging to its left; `- a\n- b` shows an even inter-item gap, none above the first.

- **LIST-E-5** `[unknown]` — Caret/atomic-range and reveal behavior under a multi-line selection spanning several list items (mixed bullet / ordered / task) is not smoke-verified: ordered reveal fires per intersecting own-line while bullets/tasks stay widgeted, and list composition inside another container (e.g. `> - item`, cross-ref BQ-E-9) renders under both handlers but the interaction of the list B2 no-reveal model with the surrounding construct's reveal model is unverified.
  _Example:_ select from `1. a` into `- b` → the ordered line is expected to reveal, the bullet line stays a widget; `> - item` → blockquote chrome plus a bullet glyph — both unconfirmed under F5.

- **LIST-E-6** `[smoke]` — A lone bullet marker with nothing after it on its own line (`-`/`*`/`+` at end of line — the parser's empty-list-item form) MUST receive no list decorations at all: the character renders as plain text, and the bullet glyph appears only once the trailing space is typed (Typora space-gate). Without this gate the never-reveal model (LIST-I-1) instantly swallows the just-typed character.
  _Example:_ type `-` → renders `-` (plain text, caret after it); type a space → `- ` → renders the bullet glyph.
