---
prefix: CTX
title: Context Menu
kind: cross-cutting
---

# Context Menu

Normative behavior for the editor-wide right-click menu: a Plainmark-rendered
DOM menu (not the webview's native default) offering clipboard actions, inline
formatting, paragraph transforms, and block inserts. The table cell menu shares
the same menu shell; its item set and actions are specified in `tables.md`.

Example notation: `|` = caret, `→` = action/result, `\n` = newline (see README §2).

## R — menu shell & structure

- **CTX-R-1** — A right-click in the editor's text area MUST open the Plainmark context menu (`.plainmark-context-menu`) and suppress the webview's native menu; the menu styles through VS Code menu theme tokens (`--vscode-menu-*`) with no `--plainmark-*` layer.
  _Example:_ right-click on a paragraph → `.plainmark-context-menu` appears at the pointer; no native Cut/Copy/Paste menu.
- **CTX-R-2** — The menu MUST present, in order: Cut, Copy, Paste, separator, Format ▸ (Bold, Italic, Strikethrough, Inline Code), Paragraph ▸ (Heading 1–6, separator, Bulleted List, Numbered List, Task List, Blockquote), Insert ▸ (Table, Code Block, Math Block, Horizontal Rule, Footnote), separator, Select All.
- **CTX-R-3** — A submenu MUST open on hover or click of its parent item, positioned beside it and flipped/clamped to stay inside the viewport; hovering a sibling item closes it; at most one menu tree is visible — opening any Plainmark menu dismisses a previously open one.
- **CTX-R-4** — The menu MUST dismiss on Escape, on mousedown outside the menu tree, on scroll, and after an enabled item runs.
- **CTX-R-5** — A disabled item MUST render greyed with `aria-disabled="true"` and MUST NOT run when activated.
- **CTX-R-6** — Items with a bound key combo MUST show a platform-aware shortcut hint (Ctrl on Windows/Linux, Cmd on macOS) and carry canonical `aria-keyshortcuts`.
  _Example:_ Paste shows `Ctrl+V` on Windows and `Cmd+V` on macOS; `aria-keyshortcuts="Control+v"` either way.

## I — actions

- **CTX-I-1** — A right-click inside the selection MUST keep it; a right-click outside MUST move the caret to the click point before menu state (enablement) is computed.
- **CTX-I-2** `[smoke]` — Cut and Copy MUST write the selection's source bytes to the system clipboard; Cut MUST delete the selection only after a successful clipboard write; both are disabled with an empty selection.
- **CTX-I-3** `[smoke]` — Paste MUST insert the system clipboard text at the selection via a host round-trip (`vscode.env.clipboard`), normalizing CRLF to LF; an empty clipboard is a no-op.
- **CTX-I-4** — Select All MUST select the whole document.
- **CTX-I-5** — Format items MUST toggle their inline style: a selection anywhere inside a matching construct (content, markers included, or partial) unwraps by deleting the construct's actual marker bytes; otherwise the canonical marker (`**`, `*`, `~~`, `` ` ``) wraps the selection, which then covers the content between the markers. Detection is by construct type, so Italic inside `**bold**` wraps rather than corrupting the bold markers. Format items are disabled with an empty selection.
  _Example:_ `he|llo wor|ld` → Bold → `he**llo wor**ld`; `a **b|ol|d** z` → Bold → `a bold z`; `a _x_ z` (content selected) → Italic → `a x z`.
- **CTX-I-6** — Format wrap bounds MUST shrink past leading/trailing spaces, tabs, and newlines so markers never land against whitespace; the skipped bytes are untouched; an all-whitespace selection is a no-op.
  _Example:_ `hello| world |z` → Bold → `hello **world** z`.
- **CTX-I-7** — Paragraph items MUST act on every non-blank line the selection touches (the caret's line for an empty selection): the target prefix is set, swapping any existing heading/list/task marker while preserving a leading quote run and indentation; when every such line already carries the target, the prefix is removed (plain paragraph); mixed selections unify onto the target. Blockquote targets the quote run itself: removal strips the whole run, application quotes only unquoted lines.
  _Example:_ `> - item` → Heading 1 → `> # item`; `- one\n- two` (both selected) → Bulleted List → `one\ntwo`.
- **CTX-I-8** — A caret on an empty or whitespace-only paragraph MUST take a clean prefix with the caret placed after it, ready to type.
  _Example:_ `a\n|\nb` → Bulleted List → `a\n- |\nb`.
- **CTX-I-9** — Numbered List MUST number touched lines sequentially from 1, skipping blank lines without resetting.
  _Example:_ `one\ntwo\n\nthree` (all selected) → Numbered List → `1. one\n2. two\n\n3. three`.
- **CTX-I-10** — Insert items MUST insert their block on its own line(s) at the caret — a mid-line caret pushes the block to a fresh line, a mid-line split gets a trailing newline — and place the caret for immediate typing: Code Block and Math Block between the delimiters, Horizontal Rule on the line below the rule. Table and Footnote reuse their existing insert commands.
  _Example:_ `hello|` → Code Block → ```` hello\n```\n|\n``` ````.

## SP — source preservation

- **CTX-SP-1** `[inherits:INV-SP-1]` — Every menu action is one CM6 user-edit transaction; bytes outside the acted-on range are preserved.
- **CTX-SP-2** `[inherits:INV-UNDO-1]` — One menu action = one undo step; a single undo reverts the whole action.

## E — edge cases

- **CTX-E-1** — A right-click inside a table cell MUST open the table menu, never the editor menu; the two never show together.
- **CTX-E-2** — Blank lines inside a mixed multi-line selection are skipped by Paragraph items (separator blanks are not decorated).
  _Example:_ `one\n\ntwo` (all selected) → Blockquote → `> one\n\n> two`.
- **CTX-E-3** `[accepted]` — A right-click in the editor margin outside the text column shows the webview's default menu (the trigger is scoped to the text area).
- **CTX-E-4** `[accepted]` — Format and Paragraph items apply literally inside fenced code blocks; there is no construct guard.
- **CTX-E-5** `[accepted]` — Menus have no arrow-key navigation; keyboard interaction is Escape-to-dismiss only.
