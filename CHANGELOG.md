# Changelog

All notable changes to the Plainmark extension are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/), and the project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Security

- **A diagram can no longer restyle the editor** — a Mermaid `%%{init}%%` directive could carry CSS that applied to the whole editor, hiding text or drawing fake controls; that setting is now locked.

### Fixed

- **The word count no longer recounts the whole document several times per keystroke** — the status-bar count now updates once, shortly after a burst of edits.
- **Paste from the context menu no longer gets stuck when clipboard access is denied** — on the web, a refused clipboard read left the paste waiting forever; it now does nothing and the next paste works.
- **A failed image paste no longer blocks every later image paste** — when saving one image never got an answer, later pastes silently did nothing; a reply is now waited for at most fifteen seconds. Pasting an image over selected text also replaces the selection, as pasting text does.
- **Formulas and diagrams no longer stay dimmed forever when their renderer fails to load** — a persistently failing download was retried on every edit while the math kept its faded placeholder look; after three failed attempts the raw source is now shown with the error.
- **Undoing a table inserted directly above another table no longer jumps into the other table** — the undo activated and rewrote a cell in the table below as if it were the removed one.
- **An outside edit to the cell you are editing no longer pulls focus back into the table** — a find-and-replace from a split text editor that touched the active cell moved the keyboard focus into the Plainmark cell.
- **Typing above a table no longer redraws every cell on each keystroke** — the table rebuilt all of its cells whenever text above it changed, which lagged on long tables.
- **Clicking a rendered equation inside a quote no longer selects the quote markers** — the selection started at the `> ` before the formula and ran past the one before the closing `$$`; it now covers exactly the formula.
- **Ctrl+Backspace and Ctrl+Arrow next to a space beside Chinese or Japanese text now stop at the word boundary** — with a space at the edge of the run, Ctrl+Backspace deleted only the space and Ctrl+Right jumped to the start of the run instead of between its words.
- **A code block inside a quote no longer collapses the quote marker on its fence lines** — the hidden fence swallowed the `> ` in front of it, so the quote bar's marker box shrank on those two rows while the caret was elsewhere.
- **Enter on a fence-like line inside an open code block no longer inserts a stray closing fence** — pressing Enter after typing ` ~~~ ` or `$$` as code inside an unclosed ``` block appended a second closer into the code; only the block's own opening line auto-closes now.
- **Tab and Shift-Tab with a selection that reaches outside a code block leave the surrounding text alone** — lines above or below the block were indented by four spaces along with the code, and whether it happened depended on the direction you dragged; only the code lines move now.
- **Enter on an empty quote line inside a list item keeps you in the item** — the quote marker was removed together with the list indent, dropping the caret out of the list; the indent now stays, and Backspace on such a quote line deletes one character like it does in any other quote.
- **Equations with `\label` no longer show a "multiply defined" error when you click into them** — MathJax remembered the label from the first render and rejected the live preview of the same equation; labels are now reset before each render.
- **Links to another file with a heading anchor now open the file** — clicking `[API](docs/api.md#auth)` tried to open a file literally named `api.md#auth`; the anchor is now dropped and the file opens.
- **Pasted images saved under a folder name with spaces now render** — the inserted path was not escaped, so a save location such as `assets/${documentBaseName}` with a space in the document name produced a link Markdown could not read; the path is now percent-encoded.
- **A quote nested inside a list inside another quote now draws one clean bar** — the inner quote was styled twice, giving its lines mismatched indents and a first-line tint mid-block, and a nested callout there wrongly got callout chrome.
- **A stray `$$` line no longer strips formatting from everything below it** — an unclosed `$$` paired itself with the next real math block, so headings, bold text, lists, and links between the two rendered as raw source; the rest of the document now renders and only the real block typesets.
- **A table whose header line ends in stray spaces no longer grows an empty extra column** — trailing whitespace after the last `|` was read as a cell, so the table rendered one column too wide and the first edit wrote that empty column into the file.
- **An outside edit that changes both text above a table and the cell you are editing is no longer undone by your next keystroke** — a find-and-replace, formatter, or git checkout that rewrote both at once left the active cell showing its old text, and typing then wrote that old text back over the change.
- **Backspace after an emoji on a list's continuation line now removes the whole emoji** — it removed half of the character, leaving a broken glyph in the file; accented letters written as a base letter plus accent are also deleted as one.
- **A lone `---` on the first line no longer blanks the rest of the document** — an opening frontmatter fence with no closing fence made every heading, list, table, and formula below it render as plain text until the closer was typed; the rest of the document now renders normally and the `---` shows as a horizontal rule.
- **`$$` in the middle of a line no longer turns the text after it into math** — `a $$x$$ b $y$` typeset `$x`, swallowed ` b ` as a formula, and broke `$y$`; the `$$` now stays literal text and `$y$` renders. An escaped `\$` inside a formula and a `$` inside a code span within a formula no longer end it early.

## [1.11.9] - 2026-08-30

### Fixed

- **Pasted SVG images now keep their `.svg` extension** — an SVG on the clipboard was saved under a `.png` name; it now lands as an `.svg` file and renders like any other pasted image.

## [1.11.8] - 2026-08-29

### Added

- **Bold math with `\boldsymbol` now renders** — an equation using `\boldsymbol{...}` showed an error instead of typesetting, and the command now appears in the math autocomplete list too.

## [1.11.7] - 2026-08-26

### Fixed

- **Quotes and callouts nested inside a list now line up with the list's content** — previously they sat at the editor margin instead of following the list's indent, with their accent bar and shading out of place.
- **A tab-indented code block inside a list no longer shows its code shifted one tab stop to the right** — the code now sits flush with the rest of the block.

## [1.11.6] - 2026-08-26

### Fixed

- **Neighboring table columns no longer jitter when you click into a cell** — activating a cell (or arriving via Tab or the arrow keys) could nudge every column's width by a few pixels and re-wrap the row next to it; columns now hold steady while a cell is active and only resize once you move on.

## [1.11.5] - 2026-08-24

### Fixed

- **Code blocks inside a list now align with the list content** — a fenced block nested in a list item no longer sits in the margin with the list's indent showing as blank space inside it.
- **Mermaid diagrams inside a list now render in full** — a diagram nested in a list item previously showed only its first line and rendered as empty; it now renders completely.
- **Hidden blockquote markers stay hidden inside syntax-highlighted code** — a quote's `>` marker at the start of a fenced-code line could repaint itself visible when that line was syntax-highlighted; it now stays invisible.
- **A code block opening right at the start of a blockquote keeps its shaded background** — the fence line immediately after the quote marker no longer looks like it sits outside the code block.

## [1.11.4] - 2026-08-22

### Security

- **Updated the diagram renderer and its HTML sanitizer** — mermaid and DOMPurify move to their latest releases, closing a sanitizer bypass that could let a crafted diagram run script, along with several ways a malicious diagram could pollute shared state, inject styling outside itself, or hang rendering.

## [1.11.3] - 2026-08-22

### Fixed

- **Numbered list items no longer shift sideways when the caret enters or leaves the line** — a nested numbered item now keeps the same indent whether or not the cursor is on it, matching bullets and checklist items.

## [1.11.2] - 2026-08-11

### Changed

- **Arrow-key navigation through tables is much faster** — entering a table and moving row to row activates the cell immediately instead of several frames later, and the cost no longer grows with document size.
- **Table shortcut conflicts now resolve in your favor** — a duplicated assignment keeps the affected action's default binding instead of unbinding it, and assigning a combo that another action holds by default moves the combo to your choice (the other action is unbound, with a warning).
- **Inserted tables keep their distance from the text below** — pasting or inserting a table directly above a line of text adds a blank separator, so that line stays a paragraph instead of being absorbed as a table row.

### Fixed

- **Smoother typing and caret movement on busy documents** — inline styling now makes one pass per keystroke instead of ten.
- **An outside edit near a table can no longer be silently reverted** — a change arriving from another editor pane or from disk right after an undo used to be overwritten by the next keystroke inside a cell.
- **Cut can no longer delete text that never reached the clipboard** — if the document changes in the instant before the clipboard write completes, the deletion is skipped.
- **A failed image paste no longer blocks all later ones** — an invalid image-save-location setting now shows a warning each attempt instead of silently wedging image pasting until the window reloads.
- **Pasting a table with uneven rows keeps all your data** — a copied table whose rows have differing cell counts pastes as plain text instead of silently dropping the extra cells.
- **Tables with partially filled rows redraw reliably** — moving content between short rows could leave the table displaying cells in their old positions.
- **Tab inside a code block can no longer break the block** — indenting or outdenting a selection that touches the opening or closing fence line leaves the fence lines in place.
- **Insert → Horizontal Rule under a paragraph now draws a rule** — it previously turned the paragraph into a heading with no visible rule at all.
- **The Paragraph menu leaves code alone** — applying a list or heading style to lines inside a code block or an indented code region no longer rewrites them.
- **Mermaid diagrams no longer stick to the wrong color theme** — an unlucky sequence of theme switches while a diagram was being edited could cache the old palette for the rest of the session.
- **Clicking rendered math in a table cell reveals it immediately** — the source now appears the moment you release the mouse instead of after the next keystroke.
- **The outline always matches the active tab** — switching documents quickly could leave the previous file's headings in the outline panel.
- **Backspace on an empty task item exits in one press** — an empty `- [ ]` line left by Enter sheds its whole marker, matching plain bullets, instead of turning into stray spaces.

## [1.11.1] - 2026-08-11

### Fixed

- **Tables no longer collapse into empty rows after an earlier edit shifts them down the document** — a table below an edit could render as blank collapsed rows until you clicked into it; it now stays correctly rendered as the document changes around it.

## [1.11.0] - 2026-08-06

### Changed

- **Indented code blocks no longer render as code** — a line indented 4+ spaces or a tab (with no triple backticks) used to display as a code block; it now displays as plain text, exactly as typed. Other Markdown tools such as GitHub still treat that text as code, so a document using this style may look different here than it does elsewhere — use fenced (triple-backtick) code blocks to keep the same look everywhere.

## [1.10.0] - 2026-08-06

### Added

- **New command: "Prettify document"** — normalizes the blank lines between top-level blocks like headings, lists, tables, and code blocks to match Plainmark's spacing conventions, without ever touching text inside a paragraph. Spacing between any two block types can be customized with the new `plainmark.prettify.seams` setting.

### Changed

- **"Add blank lines between paragraphs" is now "Convert to CommonMark"** — same command, existing keybindings still work; the new name better reflects what it does.

### Fixed

- **Convert to CommonMark now keeps paragraph breaks inside quotes and callouts intact** — lines like `> a` followed by `> b` used to merge into a single paragraph once blank lines were added; each now stays its own paragraph, matching what Plainmark already displays.

## [1.9.2] - 2026-08-04

### Fixed

- **Pasting multiple lines into a blockquote or callout no longer drops the lines after the first out of the quote** — every pasted line now stays nested inside the quote at the caret's depth, instead of only the first one.

## [1.9.1] - 2026-08-01

### Changed

- **Editing large documents is noticeably faster** — typing in files with big tables, math expressions, diagrams, or footnotes no longer re-renders the whole document on every keystroke, so large files stay responsive as you edit.

### Added

- **A one-time suggestion for very large documents** — opening a file above roughly 2 MB now shows a one-time notification suggesting the built-in text editor as a smoother alternative; the file still opens fully rendered either way.

## [1.9.0] - 2026-07-31

### Added

- **New commands: "Add blank lines between paragraphs" and "Compact paragraphs"** — switch a file between Plainmark's single-newline paragraph style and the blank-line-separated style most other Markdown tools use, so you can prep a file for sharing elsewhere or bring one in without reformatting by hand. Both work across paragraph, heading, and list boundaries; "Add blank lines" also adds the blank needed when text follows a blockquote or callout.

### Fixed

- **Typing directly below a blockquote or callout no longer gets silently pulled into it** — a single newline after quoted text now exits the quote right away, the same as it does everywhere else in the editor.

## [1.8.5] - 2026-07-27

### Fixed

- **Clicking in the wide margin beyond the text column no longer strands the caret inside a collapsed link** — a click in the blank area to the right of the centered content column now places the caret at the end of the line instead of inside a collapsed link, which used to make it unexpectedly expand.

## [1.8.4] - 2026-07-27

### Fixed

- **Clicking past the end of a line that ends in a collapsed link now lands the caret at the line's end** — the blank space to the right of a shortened link used to swallow the click and leave the caret stuck earlier in the line, inside the link.
- **Selecting text on a line that ends in a collapsed link no longer highlights blank space past the text** — the highlight used to stretch into the empty space beyond the last visible character instead of stopping right at it.

## [1.8.3] - 2026-07-27

### Added

- **New command: "Plainmark: Normalize list indentation"** — moves top-level list items indented one to three spaces back to the left margin, where they can no longer silently turn into nested items as you edit the lines above them.

### Fixed

- **Enter in a list spaced out with blank lines no longer inserts an extra blank line** — pressing Enter at the end of an item now starts the next item on the very next line; a blank line you type yourself still spaces the list out.
- **Enter inside an item's wrapped text no longer renumbers the list or doubles the line break** — splitting a numbered item's continuation line used to shift the numbers of every item below and insert two line breaks instead of one.
- **Backspace just after a task checkbox no longer deletes the whole marker** — with the caret right after `- [ ]` and a stray extra space, one Backspace used to remove the bullet and checkbox together; it now removes just the space.

## [1.8.2] - 2026-07-25

### Added

- **Pressing ↑ or ↓ with text selected now moves the caret right away** — previously the first press only collapsed the selection to its edge, and you had to press again to actually move up or down; now one press does both.

## [1.8.1] - 2026-07-25

### Fixed

- **Typing between two bullet points no longer shifts the layout** — editing a blank or text line between two list items used to make surrounding lines suddenly jump; nothing moves now.

## [1.8.0] - 2026-07-25

### Added

- **Pasting a spreadsheet or web table now becomes a Markdown table** — copy cells from Excel, Google Sheets, or a table on a web page and paste into the editor, and it lands as a formatted Markdown table instead of raw tab-separated text. Turn it off with the new `plainmark.paste.convertTables` setting if you'd rather paste as plain text.

## [1.7.3] - 2026-07-24

### Fixed

- **Ctrl+Backspace now deletes Chinese and Japanese one word at a time** — deleting by word used to remove a whole stretch of text written without spaces in one keystroke, and now stops at each word boundary inside it (Alt+Backspace / Alt+Delete on macOS).
- **The gap below an image no longer grows while you edit** — clicking on or editing around an image used to add a strip of blank space beneath it each time, gradually pushing the content below further down; the spacing now stays put.

## [1.7.2] - 2026-07-23

### Fixed

- **Chinese and Japanese text now counts correctly in the word count** — a line written without spaces used to count as a single word, and now counts one word per character, with punctuation left out of the total.
- **Ctrl+Arrow now steps through Chinese and Japanese one word at a time** — moving or selecting by word used to leap over a whole stretch of text written without spaces, and now stops at each word boundary inside it (Alt+Arrow on macOS).

## [1.7.1] - 2026-07-23

### Added

- **Word count in the status bar** — while a Plainmark tab is active, the status bar shows a live word count that updates as you type; it hides when you switch to a non-Plainmark tab.

## [1.7.0] - 2026-07-23

### Added

- **Right-click menu in the editor** — cut, copy, and paste plus Format, Paragraph, and Insert menus: toggle bold, italic, strikethrough, or inline code on a selection; turn lines into headings, lists, task lists, or quotes; and insert tables, code blocks, math blocks, horizontal rules, and footnotes. Formatting is toggle-aware — applying a style that's already there removes it — and markers are placed to skip surrounding spaces so the result always renders.

### Fixed

- **Bold in a table cell no longer changes weight when you click in** — bold, italic, strikethrough, and link text in table cells now looks identical at rest and while editing; bold previously rendered slightly heavier at rest and visibly thinned the moment the caret entered the cell.
- **Links in table cells show the text cursor** — hovering a link in a cell previously showed the hand cursor even though clicking edits the cell rather than opening the link.

### Security

- **Updated the bundled diagram sanitizer** — the DOMPurify library that Mermaid uses to sanitize diagram SVG before it reaches the editor is upgraded to 3.4.12, picking up an upstream fix for a sanitizer-bypass advisory in its handling of allowed custom elements. Opening Markdown files with Mermaid diagrams from untrusted sources is safer as a result; diagram rendering is otherwise unchanged.

## [1.6.3] - 2026-07-22

### Added

- **Math blocks render inside quotes** — `$$…$$` display math nested in a blockquote or callout now typesets inside the quote's bar and tint, like Typora and Obsidian, at any nesting depth and for the single-line, multi-line, and lazy-continuation forms; the `>` prefixes are stripped from the formula instead of typesetting as stray "greater than" operators. Math inside list items stays as source.

### Fixed

- **Editing near quoted math no longer corrupts the file** — with display math in a blockquote, a single Backspace on the line below could silently delete the entire formula, and some edit gestures wrote the formula's on-screen unicode rendering back into the Markdown source; the decoration shape that mis-mapped those edits is gone.
- **Display math no longer doubles its surrounding whitespace** — MathJax's own default vertical margins stacked on top of the editor's intended spacing around every `$$…$$` block; the block now spaces with just its own padding.
- **A display block can no longer get stuck oversized** — a formula measured before the math fonts finished loading could lock an inflated box height in for the whole session, leaving a large blank band under the math.

## [1.6.2] - 2026-07-21

### Added

- **Images render beside text** — an image on a line directly above or below text now renders, instead of staying raw `![...](...)` markup; previously it displayed only when alone in its own paragraph. Images inside bullet, numbered, and task lists render too, unless the image shares a line with the list marker. Images in quotes and callouts stay as source.
- **Images stay visible while you edit the path** — clicking into an image line still reveals its source for editing, but now shows a live preview directly below it instead of hiding the picture.

### Fixed

- **The gap above a heading is no longer oversized** — 1.6.0 scaled each heading's top gap with its own font size, running to roughly three times the normal paragraph gap; it now matches the standard gap at every level. (1.6.1 announced this fix but did not contain it.)
- **Images take the normal paragraph gap above them** — a rendered image sat flush against the line above instead of using the same block spacing as code blocks, tables, and math.

## [1.6.1] - 2026-07-21

### Fixed

- **The gap above a heading is no longer oversized** — 1.6.0 gave every heading a gap that scaled with its own font size, so the space above a large heading ran to roughly three times the normal paragraph gap. The gap above a heading now matches the standard paragraph gap at every level; only the heading's own padding still grows with its size.

## [1.6.0] - 2026-07-21

### Added

- **Language suggestions when typing a code fence** — typing a language after ` ``` ` or `~~~` now pops an autocomplete list of every language the editor can highlight, filtered as you type, including shorthands like `py`, `wasm`, and `assembly`, plus `mermaid` for diagrams. A bare ` ``` ` stays quiet so Enter still drops you straight into the block; press Ctrl+Space there to browse the full list.
- **Common code-fence language shorthands now highlight** — tags like ` ```asm `/` ```assembly `, ` ```wasm `, ` ```py `, ` ```rs `, ` ```golang `, ` ```docker `, ` ```matlab `, ` ```vb `, ` ```jsonc `, and some forty in total now get syntax colors from the grammars the extension already bundles, instead of rendering as plain monospace; the label in the block's corner still shows exactly what you typed. (Intel-syntax assembly is colored by a GNU-assembler grammar, so its coloring is approximate.)

### Changed

- **Blocks now separate from the text above them with normal paragraph spacing** — code blocks, quotes, callouts, tables, math blocks, HTML blocks, headings, and horizontal rules used to sit nearly flush against the paragraph above them, and two stacked code blocks merged into one surface. Every block now opens with the standard paragraph gap, drawn as clear space above it: the code background, quote bar, and callout accent all start below the gap rather than bleeding into it, and larger headings get proportionally more room. Consecutive quote and callout lines still merge into one block, quotes keep their internal spacing rules, and a block at the very top of the document stays flush. Typing ` ``` `, `#`, `***`, or `>` on an existing line no longer makes the layout jump, since the gap survives the conversion.

### Fixed

- **Chinese punctuation typed after inline math now keeps the caret in place** — with a Chinese IME, typing a full-width mark like `：` on a line where rendered inline math sits earlier used to insert the character correctly but throw the caret to the end of the line; the caret now lands right after the inserted character, so typing continues where you meant it to.
- **Links and images to paths containing spaces now open** — Markdown's two spellings for a spaced path, `[text](<my file.pdf>)` and `[text](my%20file.pdf)`, rendered as links but Cmd/Ctrl+click failed to find the file, and an image written with angle brackets did not display; both spellings now resolve to the actual file. A path with raw unencoded spaces is not a valid Markdown link and stays plain text, as on GitHub.

## [1.5.1] - 2026-07-20

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

- **Click a rendered equation to select its LaTeX** — single-clicking a rendered inline (`$…$`) or block (`$$…$$`) equation now reveals its source with the inner LaTeX already selected (the `$`/`$$` delimiters excluded), so copying a formula takes one click instead of click-and-drag.

### Changed

- **Tab indentation in code blocks** — inside a fenced code block, Tab now inserts a four-space indent at the cursor (and indents each selected line), Shift-Tab removes four spaces, and Backspace deletes a single space, so a code block behaves like a code editor. Outside code blocks, Tab still indents the whole line by two spaces.

## [1.0.3] - 2026-06-23

### Changed

- **Marketplace listing metadata** — refined the extension's categories (`Visualization`, `Programming Languages`) and search keywords for better discoverability. No change to editor behavior.

## [1.0.2] - 2026-06-22

### Fixed

- **Backslash escapes in table cells** — an escape such as `\$`, `\*`, or `\#` in a table cell now renders as the literal character (`$`, `*`, `#`) instead of showing the backslash. Table cell content is treated as Markdown, matching the rest of the editor, and editing the table preserves the escape.

## [1.0.1] - 2026-06-22

### Added

- **Claudify theme** — a new built-in `plainmark.theme` option with an Anthropic-inspired palette: a warm cream page, slate ink, a disciplined terracotta accent on links, caret, footnote markers, and autocomplete selection, and serif headings over a system sans body. Like the GitHub themes, it applies a fixed appearance regardless of the active VS Code color theme. Pick it from **Plainmark: Select Theme** or set `plainmark.theme` to `claudify`.

## [1.0.0] - 2026-06-22

- Initial public release.
