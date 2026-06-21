> [!NOTE]
> body line

Place caret at offset 0 (line 1 col 0, before the rendered callout chrome). Press Enter once. The document should grow by a single `\n` at the top and the caret should land on the new empty line 1 above the callout — the user can immediately type new content there.

Repeat for other top-of-doc constructs (open `01-five-canonical-types.md`, `02-bare-callout.md`, `03-custom-title.md`, etc.) — the same Enter-at-offset-0 behavior applies regardless of construct type. The project-wide affordance is construct-agnostic; it replaces the earlier callout-only ArrowUp affordance (now superseded).
