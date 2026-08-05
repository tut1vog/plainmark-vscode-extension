# Plainmark

**A free, WYSIWYG Markdown editor for VS Code Desktop and vscode.dev.** Obsidian-style live preview — formatting renders inline as you type — without leaving your editor, and without a paywall.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

<!-- Add after first Marketplace publish:
[![Version](https://img.shields.io/visual-studio-marketplace/v/tutivog.plainmark)](https://marketplace.visualstudio.com/items?itemName=tutivog.plainmark)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/tutivog.plainmark)](https://marketplace.visualstudio.com/items?itemName=tutivog.plainmark)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/tutivog.plainmark)](https://marketplace.visualstudio.com/items?itemName=tutivog.plainmark)
-->

![Plainmark live preview demo](https://raw.githubusercontent.com/tut1vog/plainmark-vscode-extension/main/media/demo.gif)

## Works everywhere VS Code does

| Platform | Supported |
| --- | --- |
| VS Code Desktop | ✅ |
| vscode.dev / github.dev (browser) | ✅ |

Plainmark runs as a custom editor in both the desktop app and the browser — open the same `.md` file and get the same live-preview experience in either place.

## Features

- **Live preview** — headings, emphasis, links, lists, blockquotes, and code render inline; the raw Markdown markers reveal only on the line your caret is on.
- **Right-click menu** — cut/copy/paste plus Format, Paragraph, and Insert: toggle bold/italic/strikethrough/inline code on a selection, turn lines into headings, lists, or quotes, and insert tables, code blocks, math blocks, horizontal rules, and footnotes.
- **Tables** — visual editing with insert / delete / move row and column, whole-table delete, per-column alignment, and configurable keyboard shortcuts.
- **Math** — LaTeX rendered with MathJax, inline and block.
- **Diagrams** — Mermaid flowcharts, sequence diagrams, and more.
- **Callouts** — Obsidian-style `> [!NOTE]` admonitions.
- **Footnotes, autolinks, images, frontmatter, HTML** — full Markdown coverage.
- **Paste images** — paste a screenshot from the clipboard and Plainmark saves it into your workspace and inserts the image link.
- **Paste tables** — paste a range copied from Excel, Google Sheets, or a table rendered on a web page and it becomes a Markdown table, bold/links included; tab-separated plain text converts too.
- **Paste into quotes** — paste multi-line text inside a blockquote or callout and every line gets the `>` markers it needs, at the right nesting depth, so the whole paste stays quoted.
- **Outline view** — jump around the document from the Explorer sidebar.
- **Word count** — the status bar shows a live word count while a Plainmark tab is active.
- **CJK-aware** — the word count, `Ctrl/Alt+Arrow` word jumps, and `Ctrl/Alt+Backspace` word deletion all understand unspaced Chinese and Japanese text.
- **Find** — press `Ctrl/Cmd+F` to search the whole document — next/previous, highlight all, and replace — including text scrolled out of view.
- **Theming** — built-in light/dark themes plus your own CSS.

![Tables, math, and callouts in Plainmark](https://raw.githubusercontent.com/tut1vog/plainmark-vscode-extension/main/media/features.png)

## Your files stay yours

Plainmark's number-one job is to never corrupt your documents. Every edit is provably byte-preserving outside the exact range you change — verified end-to-end (open → edit → save → re-read from disk) and fuzz-tested over hundreds of generated documents, on both the desktop and web builds. It edits your Markdown in place; it never rewrites the parts you didn't touch.

## Getting started

1. Install Plainmark from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=tutivog.plainmark) — or drag the `.vsix` into VS Code and run **Developer: Reload Window**.
2. Open any `.md` or `.markdown` file and click **Open in Plainmark** in the editor title bar — or press `Ctrl/Cmd+Shift+M`.
3. Edit as you would in any WYSIWYG editor. The same shortcut toggles back to the plain-text editor at any time.

## Commands

Available from the Command Palette (`Ctrl/Cmd+Shift+P`):

| Command | Default keybinding |
| --- | --- |
| Plainmark: Open in Plainmark | `Ctrl/Cmd+Shift+M` |
| Plainmark: Open in Text Editor | `Ctrl/Cmd+Shift+M` (toggles back) |
| Plainmark: Insert table | — |
| Plainmark: Insert footnote | `Ctrl/Cmd+Shift+6` |
| Plainmark: Normalize list indentation | — |
| Plainmark: Add blank lines between paragraphs | — |
| Plainmark: Compact paragraphs (join wrapped lines, remove blank lines) | — |
| Plainmark: Prettify document (normalize blank lines between blocks) | — |
| Plainmark: Select Theme | — |

The two paragraph commands convert a document between blank-line-separated markdown (the conventional style most tools emit) and Plainmark's compact one-line-per-paragraph style. **Compact paragraphs** joins hard-wrapped lines (without inserting spaces between CJK characters) and removes the blank lines between paragraphs, headings, and lists; **Add blank lines between paragraphs** does the reverse, producing conventional spacing for sharing outside Plainmark. Both apply as a single undoable edit and skip anything a rewrite could change the meaning of — hard line breaks, code blocks, tables, and quote and list interiors.

**Prettify document** takes the middle road between those two. It leaves every line break inside a paragraph exactly as you wrote it and only normalizes the blank lines *between* blocks: one blank above each heading and never one below it, one after a list, quote, table, or HTML block, and none anywhere else — collapsing doubled blank runs along the way. Where dropping a blank would change how the file parses (a table or indented code below a paragraph, a `---` that would turn the line above it into a heading), the blank stays. It applies to the whole document as a single undoable edit.

In the compact style a single line break also ends a quote or callout: a line without the `>` marker starts a new paragraph below the quote, where conventional markdown would need a blank line and would otherwise fold that line into the quote. Lines that do carry the `>` marker continue the quote as usual, and list items still absorb their unmarked continuation lines. **Add blank lines between paragraphs** restores that conventional blank after each quote and callout, so the paragraph below stays outside the quote wherever the file is rendered.

In-table editing shortcuts (insert/move/delete rows and columns, alignment) are configurable via `plainmark.tableKeybindings`.

## Settings

| Setting | Description |
| --- | --- |
| `plainmark.theme` | `default` (follows your VS Code theme), `github-light`, `github-dark`, or `claudify` (Anthropic-inspired warm cream palette). |
| `plainmark.styles` | Your own CSS files to style the preview. See the [theming guide](./docs/theming-guide.md). |
| `plainmark.tableKeybindings` | Customize the in-table structural-editing shortcuts. |
| `plainmark.imagePasteLocation` | Folder for pasted images (default `.`, next to the document); supports `${documentWorkspaceFolder}` and `${documentBaseName}`. |
| `plainmark.paste.convertTables` | Convert a copied spreadsheet range, web table, or tab-separated text into a Markdown table on paste (default on); turn off to always paste literally. |

## Known limitations

- **Paste images** requires a saved document and a writable file system; it is unavailable in untitled documents and on read-only workspaces (including some vscode.dev folders).
- **Custom CSS** (`plainmark.styles`) accepts local paths and `file:` URIs only — `http(s)://` stylesheets and remote `@font-face` `url()` are declined.
- **Very large documents** (above ~2 MB) can make typing sluggish — the whole document stays live-rendered. Plainmark shows a one-time suggestion to reopen such files with the built-in text editor (right-click the editor tab → "Reopen Editor With…").

## License

[MIT](./LICENSE)
