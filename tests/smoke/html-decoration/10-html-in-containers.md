# Inline HTML inside other constructs

Inside a heading: ## Heading with <sub>note</sub> in title

Inside a list:

- bullet with <kbd>Enter</kbd> shortcut
- bullet with `code` and <mark>highlight</mark>
- bullet with <abbr title="ECMAScript">ES</abbr> abbreviation

Inside a task list:

- [ ] task with <kbd>Tab</kbd> shortcut
- [x] done with <sup>1</sup> superscript

Inside a blockquote:

> blockquote with <kbd>Shift+Enter</kbd> hint
> second line with <sub>subscript</sub>

Inside a callout:

> [!NOTE]
> note body with <kbd>Cmd+P</kbd> shortcut

Inside a table cell:

| col one | col two |
| --- | --- |
| has <kbd>X</kbd> tag | plain |
| <mark>highlight</mark> in cell | text |

Verify each context preserves its outer construct chrome AND adds `.plainmark-html-inline` marks around each tag. No `.plainmark-html-block` on any of these lines.
