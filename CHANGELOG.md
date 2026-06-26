# Changelog

All notable changes to the Plainmark extension are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/), and the project adheres
to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
