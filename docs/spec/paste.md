---
prefix: PASTE
title: Paste
kind: cross-cutting
---

# Paste

Cross-cutting paste behavior: the order in which the paste handlers inspect a
clipboard payload, the two paste surfaces, and the rich-text conversion that
turns the clipboard's HTML flavor into Markdown. Construct-owned paste behavior
stays in its own file and is referenced here: image blobs (`IMG-I-6`), table
conversion (`TBL-I-35`..`TBL-I-37`), quote re-prefixing (`BQ-I-13`), and the
context-menu Paste (`CTX-I-3`).

A system clipboard carries several flavors at once. Text selected and copied
from a rendered page — a chat answer, a web article, a Word document — ships a
`text/html` flavor holding the formatting and a `text/plain` flavor holding the
browser's flattened rendering, which never contained the Markdown markers. The
rich-text conversion picks the HTML flavor whenever it carries formatting the
plain flavor has already lost, and stays out of the way otherwise.

---

## C — Paste chain and surfaces

- **PASTE-C-1** — A document-level (main-view) paste MUST consult its handlers in this fixed order, each handler consuming the event only when its payload qualifies and otherwise passing it on: image blobs (`IMG-I-6`), then the lone-table conversion (`TBL-I-35`, `TBL-I-36`), then the rich-text conversion (`PASTE-H-1`), then the quote re-prefix of plain multi-line text (`BQ-I-13`), then the editor's default plain-text insertion. A paste into an active table cell subview MUST NOT reach any converting handler (`TBL-I-19`).
  _Example:_ a payload holding one `<table>` and nothing else converts as a table; `<p>intro</p>` plus that table converts through the rich-text handler; `<div>` and `<span>` markup only inserts the plain flavor.

- **PASTE-C-2** — The context-menu Paste (`CTX-I-3`) is a host round-trip that carries only the plain flavor, so it MUST NOT convert rich text under any setting; it is the plain-text paste for a payload the DOM paste would convert. The `plainmark.paste.convertRichText` setting (`PASTE-H-6`) is the durable opt-out.
  _Example:_ a chat answer pasted with Ctrl+V lands as Markdown; the same clipboard pasted from the right-click menu lands as the flattened plain text.

---

## H — Rich-text conversion

- **PASTE-H-1** `[smoke]` — With rich-text conversion enabled (`PASTE-H-6`), a document-level paste whose non-empty `text/html` flavor, after parsing with `<script>`, `<style>`, `<template>`, and `<noscript>` elements removed, contains at least one **semantic** element MUST insert the converted Markdown (`PASTE-H-2`..`PASTE-H-4`) instead of the plain flavor. Semantic elements are `h1`–`h6`, `ul`, `ol`, `blockquote`, `pre`, `hr`, `table`, `img`, `strong`, `b`, `em`, `i`, `code`, `del`, `s`, `strike`, an `a` with an `href`, and a KaTeX TeX annotation (`annotation[encoding="application/x-tex"]`); a `b` or `strong` whose inline style sets `font-weight` to `normal` or `400` does not count (Google Docs wraps its whole payload in one). Paragraphs, `div`s, `span`s, `br`s, and style attributes alone MUST NOT qualify, so a text-editor copy (colour spans in `div`s) and a Google Docs paragraph (style-mapped spans) stay on the plain-text path. When the gate passes the whole payload converts; the flavors are never mixed.
  _Example:_ `<p>Use <strong>pnpm</strong> here.</p>` → `Use **pnpm** here.`; `<div><span style="color:#569cd6">const</span> x = 1;</div>` → the plain flavor, unchanged.

- **PASTE-H-2** — Block mapping. `h1`–`h6` MUST become ATX headings of the same level with their content on one line; `p` (and `figcaption`, `summary`, `dt`, `dd`, `address`) a paragraph; `ul` items `- ` bullets and `ol` items sequential `1.` `2.` … honouring `start`, an item whose first content is a checkbox `input` taking `- [ ] ` / `- [x] `; a list nested in an item MUST indent to the parent marker's content column (2 under `- `, 3 under `1. `), directly after the item's text (tight), while a paragraph following another block inside an item is separated by a blank line; `blockquote` MUST prefix every interior line with `> ` (a blank interior line becomes `>`; nesting stacks `> > `); `pre` MUST become a fenced code block whose body is the text of its single `code` child when one exists (dropping the toolbar chrome chat UIs place beside the code inside the same `pre`) and the `pre` text otherwise, one trailing newline stripped, the language taken from a `language-`/`lang-` class on either element, and the fence lengthened past any backtick run in the body; `hr` MUST become `---`; a `table` MUST convert per `TBL-I-36`'s cell rules (spans, ragged rows, and a lone cell decline) and, when declined, fall back to its rows as space-joined text lines; `div`, `section`, `article`, `main`, `header`, `footer`, `nav`, `aside`, `figure`, `details`, `form`, `fieldset`, `center`, `dl`, and unknown elements are transparent containers, as is any inline element that wraps block elements.
  _Example:_ `<ol><li>Install<ul><li>run <em>pnpm i</em></li></ul></li><li>Build</li></ol>` → `1. Install\n   - run *pnpm i*\n2. Build`; `<blockquote><p>one</p><p>two</p></blockquote>` → `> one\n>\n> two`.

- **PASTE-H-3** — Inline mapping, shared with the table cell conversion (`TBL-I-36`). `strong`/`b` MUST become `**`, `em`/`i` `*`, `del`/`s`/`strike` `~~`, with markers shifted off surrounding whitespace (`CTX-I-6` parity); `code` outside `pre` a backtick span whose run is one longer than any backtick run in its content; `a[href]` `[text](href)`, or `<href>` when the text is empty and the `href` carries a scheme; `img` `![alt](src)` with the remote `src` kept as-is (no download, `IMG-I-6` parity), a `data:` `src` reduced to the alt text; `br` a newline inside its paragraph; a KaTeX element carrying a TeX annotation `$tex$`, or `$$tex$$` for `.katex-display` (a KaTeX element holds each formula twice, as MathML text and as visual layout, so its text content is never used); every other inline element (`u`, `mark`, `sup`, `sub`, `kbd`, `small`, `span`, …) contributes its text only.
  _Example:_ `Energy: <span class="katex">…<annotation encoding="application/x-tex">E = mc^2</annotation>…</span> holds.` → `Energy: $E = mc^2$ holds.`; `<code>a`b</code>` → ``` ``a`b`` ```.

- **PASTE-H-4** — Output shape. Whitespace runs inside inline content MUST collapse to one space (non-breaking spaces included), every paragraph line MUST be trimmed, empty blocks MUST be dropped, and top-level blocks MUST be separated by exactly one blank line — paragraphs included, so two pasted paragraphs stay two paragraphs for every renderer (**Prettify document**, `PARA-I-7`, tightens seams afterwards on request). Code-block bodies are the exception: their text is preserved verbatim.
  _Example:_ `<h1>\n  Title  </h1><p></p><p>one\n  two&nbsp;three</p>` → `# Title\n\none two three`.

- **PASTE-H-5** `[smoke]` — Placement. A result that is a single line and does not start with a block marker (`#`, `- `, `1. `, `> `, `---`, a fence, `|`) MUST replace the selection inline, exactly as a plain-text paste does. Any other result MUST land on its own lines: a leading `\n` when the selection start is not at a line start, the same trailing separation as `TBL-I-35` (one `\n` unless the next byte is already `\n`, plus a second when the following line is non-blank), and the caret at the start of the line directly after the pasted blocks — never at a pasted table's end offset (`TBL-I-21`). When the selection start sits on a blockquote or callout line, the own-line result MUST pass through the `BQ-I-13` re-prefix so every pasted line stays inside the quote. The insertion MUST be one transaction tagged `input.paste`, so one Ctrl+Z reverts it.
  _Example:_ `keep |keep` → paste `<p>Use <strong>pnpm</strong></p>` → `keep Use **pnpm**keep`; `alpha|beta` → paste `<h2>H</h2><p>text</p>` → `alpha\n## H\n\ntext\n|\nbeta` (the caret at the start of the blank line below the blocks); `> alpha|\n> beta` → the same paste → `> alpha\n> ## H\n> \n> text\n> \n> beta`.

- **PASTE-H-6** `[smoke]` — The conversion MUST be governed by `plainmark.paste.convertRichText` (boolean, `scope: resource`, default `true`): the host resolves it per-document and injects it at boot as `window.__plainmark_paste_rich_text`; the webview MUST treat an absent value as enabled (headless-harness parity). A change MUST reload the webview (`TBL-I-31`). When disabled, every paste the rich-text handler would have taken MUST fall through to the rest of the chain (`PASTE-C-1`).
  _Example:_ set `plainmark.paste.convertRichText: false` → the chat-answer paste from `PASTE-H-1` inserts the flattened plain text.

- **PASTE-H-7** `[accepted]` — Style-mapped inline formatting is NOT converted: a `span` carrying `font-weight: 700` or `font-style: italic` (the Google Docs and Notion clipboard shape) contributes plain text, and a payload whose only formatting is style-mapped stays on the plain-text path (`PASTE-H-1`). Unmapped inline elements degrade to their text rather than to raw HTML. Whether Ctrl+Shift+V reaches the webview as a plain-text paste on VS Code Desktop is unverified; the context-menu Paste (`PASTE-C-2`) is the documented plain-text escape.
  _Example:_ a Google Docs paragraph with bold words pastes as its plain text; a Google Docs bulleted list pastes as a Markdown list with the bold words plain.

---

## SP — Source preservation

- **PASTE-SP-1** `[inherits:INV-SP-1]` — The rich-text conversion MUST only ever insert new bytes at the selection; every byte outside the replaced range MUST be preserved verbatim, and no other source byte may change.
