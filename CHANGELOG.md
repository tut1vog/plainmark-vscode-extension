# Changelog

All notable changes to the Plainmark extension are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/), and the project adheres
to [Semantic Versioning](https://semver.org/).

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
