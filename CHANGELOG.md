# Changelog

All notable changes to the Plainmark extension are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/), and the project adheres
to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- **Paragraph spacing now applies inside quotes and callouts** — a new line inside a blockquote (`> `) or callout body gets the same paragraph gap as regular text, tinted with the quote's background and with the quote bar running through it unbroken, instead of the previous much tighter spacing. The first line of a quote and the line directly under a callout's title keep their compact spacing, and lists or code blocks inside quotes keep their own spacing.

### Fixed

- **Text directly below a list now reads as a paragraph** — a line typed under the last list item without a blank line used to hug the bullet with wrapped-line spacing; it now gets the normal paragraph gap above it. Applies to bullet, numbered, and task lists, to nested lists, and to indented continuation lines inside an item.
- **Enter no longer shifts a short line under a list** — pressing Enter at the end of a line directly below a list that was no longer than the list marker (for example a three-character word under a numbered item) inserted the new line *above* it, visibly pushing the line and the caret down; the newline now goes exactly at the caret.
- **Enter leaves an empty list item in a single press** — pressing Enter on an empty item used to first insert a blank line above it and required a second press to exit the list; it now removes the marker immediately, leaving the caret on a plain line. On an empty nested item, each press un-indents one level.

## [1.5.0] - 2026-07-20

### Added

- **Reference-style links now render** — `[text][ref]` and `[text][]` display like regular links, resolved through their `[ref]: url` definition line, which is dimmed to read as metadata. Plain `[text]` shortcuts and unresolved references stay as typed.
- **Tab nests list items inside quotes** — Tab on a list item inside a blockquote indents it one level deeper, Shift-Tab un-indents, instead of breaking the quote.

### Changed

- **`file:` links open inside the editor** — Cmd/Ctrl+clicking a `file:` link opens it as an editor tab instead of launching the operating system's default application.

### Fixed

- **Lists inside quotes render like lists outside them** — bullets, numbers, and checkboxes no longer overlap the quote's left border, and nested items step right instead of sitting flush with their parents.

### Security

- **Link opening is restricted to safe address types** — Cmd/Ctrl+click now opens only web (`http`/`https`), email (`mailto`), and VS Code addresses; any other scheme, such as `javascript:` or `data:`, does nothing.

## [1.4.0] - 2026-07-19

### Added

- **Paragraphs are now visibly separated** — every line started by pressing Enter gets a wider gap above it, like paragraphs on a rendered page, while lines that merely wrap keep their normal tight spacing; lists, quotes, headings, code, and tables keep their existing spacing.

## [1.3.0] - 2026-07-18

### Changed

- **Custom bullet characters are no longer configurable** — because bullets are now shapes instead of text, the settings that replaced a bullet with a character of your choice (`--plainmark-list-bullet`, `--plainmark-list-bullet-2`, `--plainmark-list-bullet-3`) no longer do anything. If you had set them, bullets will revert to the default appearance; the matching `-size` settings adjust how large each level is drawn.

### Fixed

- **List bullets look the same on every platform** — nested bullets were drawn with symbol characters that each operating system rendered from a different font, so they came out shrunken and uneven at deeper indent levels. Bullets are now drawn as shapes rather than text and render identically everywhere.

## [1.2.5] - 2026-07-17

### Fixed

- **Table text wraps at word boundaries** — long text in a table cell now wraps between words, the way GitHub renders tables, instead of breaking mid-word at arbitrary characters.

## [1.2.4] - 2026-07-13

### Fixed

- **Typing `#` no longer restyles the line before you finish the heading** — a bare `#`-run (`#`, `##`, …) with nothing after it stays plain text; the line becomes a heading once you type the space after the markers.

## [1.2.3] - 2026-07-02

### Security

- **Updated the bundled diagram sanitizer** — the DOMPurify library that Mermaid uses to sanitize diagram SVG before it reaches the editor is upgraded from 3.4.5 to 3.4.11, picking up upstream fixes for several published sanitizer-bypass advisories. Opening Markdown files with Mermaid diagrams from untrusted sources is safer as a result; diagram rendering is otherwise unchanged.

## [1.2.2] - 2026-07-02

### Fixed

- **Math source stays exactly as typed while you edit a `$$` block** — pressing Enter inside a display-math block (for example after a `\\` line break) temporarily breaks it into plain text, and that raw view used to re-render the source as Markdown, hiding escape characters so `\\` displayed as a single `\` — as if the document had lost a backslash. The text between `$$` markers now always shows byte-for-byte while the block is broken apart, so the source never looks mangled.

## [1.2.1] - 2026-06-27

### Fixed

- **Selecting already-visible markers keeps your exact selection** — when a construct's Markdown markers are already revealed (for example you've clicked into bold, italic, a link, or inline code), selecting text no longer expands to swallow the surrounding markers (`**`, `*`, `_`, `~~`, backticks, brackets). The markers still fold into the selection when they were hidden as the selection began, so click-and-drag over rendered text continues to copy the full Markdown source.

## [1.2.0] - 2026-06-27

### Added

- **Find in the editor** — press `Ctrl/Cmd+F` to open a search bar and find text anywhere in the document, with next/previous (`F3` / `Ctrl/Cmd+G`), highlight-all, and replace. Search runs over the whole file, so it matches text on lines scrolled out of view too.

### Fixed

- **Caret restored when you switch back to a Plainmark tab** — moving to another tab and back now keeps your cursor where you left it, blinking and ready to type, instead of leaving the editor with no visible caret until you click into it.

## [1.1.1] - 2026-06-27

### Fixed

- **Double-click selects only the word** — double-clicking emphasized text (bold, italic — including underscore `_italic_` — and strikethrough), inline code, a link label, or an autolink now selects just the word and leaves the surrounding formatting markers (`**`, `*`, `_`, `~~`, backticks, brackets) out of the selection. Dragging across the text still pulls the markers in, so a drag-select continues to copy the full Markdown source.

## [1.1.0] - 2026-06-24

### Added

- **Click a rendered equation to select its LaTeX** — single-clicking a
  rendered inline (`$…$`) or block (`$$…$$`) equation now reveals its source
  with the inner LaTeX already selected (the `$`/`$$` delimiters excluded), so
  copying a formula takes one click instead of click-and-drag.

### Changed

- **Tab indentation in code blocks** — inside a fenced code block, Tab now
  inserts a four-space indent at the cursor (and indents each selected line),
  Shift-Tab removes four spaces, and Backspace deletes a single space, so a
  code block behaves like a code editor. Outside code blocks, Tab still
  indents the whole line by two spaces.

## [1.0.3] - 2026-06-23

### Changed

- **Marketplace listing metadata** — refined the extension's categories
  (`Visualization`, `Programming Languages`) and search keywords for better
  discoverability. No change to editor behavior.

## [1.0.2] - 2026-06-22

### Fixed

- **Backslash escapes in table cells** — an escape such as `\$`, `\*`, or `\#`
  in a table cell now renders as the literal character (`$`, `*`, `#`) instead
  of showing the backslash. Table cell content is treated as Markdown, matching
  the rest of the editor, and editing the table preserves the escape.

## [1.0.1] - 2026-06-22

### Added

- **Claudify theme** — a new built-in `plainmark.theme` option with an
  Anthropic-inspired palette: a warm cream page, slate ink, a disciplined
  terracotta accent on links, caret, footnote markers, and autocomplete
  selection, and serif headings over a system sans body. Like the GitHub
  themes, it applies a fixed appearance regardless of the active VS Code color
  theme. Pick it from **Plainmark: Select Theme** or set `plainmark.theme` to
  `claudify`.

## [1.0.0] - 2026-06-22

- Initial public release.
