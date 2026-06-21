---
prefix: FM
title: YAML Frontmatter
kind: construct
---

# YAML Frontmatter — Specification

Normative behavior for the `---`…`---` YAML frontmatter block at document start:
rendering, interaction, and byte guarantees. Frontmatter is a **styled-source**
construct — the rendered view IS the source bytes with
chrome layered on top; no widget swap, no source mutation. The `---` fence
markers hide-and-reveal Typora-style exactly as fenced code does (FM-I-4/FM-I-5);
the YAML body is always visible.

Example notation: `|` = caret, `→` = action/result, `\n` = newline (see README §2).

## R · Rendering

- **FM-R-1** — A frontmatter block MUST be recognized only when its opening `---` line begins at document offset 0 (`cx.parsedPos === 0`): no leading whitespace, no leading blank line, no BOM bypass. The block parser emits a `FrontMatter` block node spanning the opening fence line through the closing fence line.
  _Example:_ `---\nfoo: bar\n---\n# Heading` → one `FrontMatter` node `[0, …]`; `text\n\n---\nfoo: bar\n---` → no `FrontMatter` node.

- **FM-R-2** — The `FrontMatter` node MUST contain three children: two `FrontMatterMark` inline nodes (the opening line and the closing line) and one `FrontMatterContent` node spanning the YAML body between them.
  _Example:_ in `---\nfoo: bar\n---\n`, the two `---` lines are `FrontMatterMark` nodes and `foo: bar` is the `FrontMatterContent` node.

- **FM-R-3** — The opening `---` line MUST preempt the default `HorizontalRule` parser, so a document-start `---…---` block parses as frontmatter and NOT as a horizontal rule (`before: 'HorizontalRule'`).
  _Example:_ `---\nfoo: bar\n---\n` → zero `HorizontalRule` nodes; the leading `---` is the frontmatter opener.

- **FM-R-4** — The decoration handler MUST emit one `Decoration.line` per frontmatter line with exactly one of three position classes: `plainmark-frontmatter-header` on the opening line, `plainmark-frontmatter` on each body line, `plainmark-frontmatter-footer` on the closing line. These line decorations MUST be emitted on every render regardless of reveal state. The handler uses NO `Decoration.replace` and NO widget; its only reveal-driven output is a zero-font `Decoration.mark` over the two `---` lines when the block is not caret-revealed (FM-I-4/FM-I-5).
  _Example:_ `---\nfoo: bar\n---\n` → line 1 `plainmark-frontmatter-header`, line 2 `plainmark-frontmatter`, line 3 `plainmark-frontmatter-footer`; `foo: bar` is always on screen while the `---` markers hide/show with caret proximity.

- **FM-R-5** — The header line MUST carry a `data-language="yaml"` attribute (consumed by a CSS `::before` label).
  _Example:_ the `plainmark-frontmatter-header` line element carries `data-language="yaml"`.

- **FM-R-6** — The YAML body MUST always be visible regardless of caret position; the two `---` fence markers, by contrast, MUST hide by default and reveal together when the caret or selection touches the block — the Typora-style fence reveal of fenced code (CBLK-I-1/CBLK-I-2), applied to frontmatter via the same `should_reveal_for_selection` MRS predicate path. (This reverses the original always-visible stance.)
  _Example:_ caret on `foo: bar` → both `---` shown; move the caret to a line below the block → both `---` hide while `foo: bar` stays visible.

- **FM-R-7** — YAML syntax highlighting MUST be applied inside the block by mounting `yamlLanguage.parser` as a `parseMixed` overlay scoped to `FrontMatterContent` only; the outer `FrontMatter` / `FrontMatterMark` nodes remain in the markdown tree for the handler to walk. YAML tokens are colored by the shared `HighlightStyle`.
  _Example:_ in `---\ntitle: My Doc\n---`, `title` highlights as a property and `My Doc` as a value (YAML scalar), while the `---` lines stay plain markdown nodes.

- **FM-R-8** `[smoke]` — Frontmatter chrome MUST paint a fenced-code-style background, padding, and the top-right `yaml` language label via the dedicated `--plainmark-frontmatter-*` CSS-variable family (each defaulting to chain through its `--plainmark-fenced-code-*` / `--plainmark-code-*` equivalent). Background uses a stacked `linear-gradient` (padding-only `.cm-line`, no margin) to keep CM6's height map in sync.
  _Example:_ a 3-line frontmatter block renders one continuous code-style panel with `yaml` labelled top-right; setting `--plainmark-frontmatter-background` restyles it without touching fenced code.

- **FM-R-9** — YAML unquoted scalars (lang-yaml's `tags.content`, e.g. `Literal` / `BlockLiteralContent`) MUST be colored by binding `tags.content` into the shared `plainmark-syntax-variable` palette group, NOT a dedicated 13th variable — so frontmatter values inherit `--plainmark-syntax-variable-color`. Without this binding the bulk of typical values (`title: …`, `date: …`) would render unstyled. Because `@codemirror/lang-markdown` also emits `tags.content` on prose nodes (`Paragraph` / `TableCell` / `Superscript` / `Subscript`), this binding MUST rely on parent-context CSS scoping (see CBLK-R-11) to stay visually inert outside styled-source containers.
  _Example:_ in `---\ntitle: My Doc\n---`, `My Doc` colors as a variable-class value; an ordinary paragraph below the block is unaffected.

## I · Interaction

- **FM-I-1** — Frontmatter has no dedicated keymap, autocomplete, or structural commands of its own. Editing inside the block MUST behave as ordinary text editing on visible source bytes; generic `@codemirror/lang-yaml` completions apply but no Plainmark-specific affordance is added.
  _Example:_ `---\ntitle: |\n---`, type ` foo` after `title:` → `title: foo|`, a plain text insertion; no continuation, redirect, or widget intercept fires.

- **FM-I-2** `[smoke]` — Syntax highlighting MUST update live as the YAML body is edited: typing a new key/value reflows the YAML overlay parse and recolors tokens on the next render.
  _Example:_ typing `count: 3` on a new body line colors `count` as a property and `3` as a number without re-opening the document.

- **FM-I-3** `[smoke]` — The caret MUST be freely placeable on any frontmatter line, including directly on the `---` fence characters. The fence text is hidden by a zero-font mark (FM-I-5), NOT a `Decoration.replace`, so each `---` line stays an ordinary caret target with no marker-atomicity jump; clicking a hidden fence places the caret there and reveals it.
  _Example:_ clicking the (hidden) opening `---` line places the caret between the hyphens and reveals the fence; no atomic-range skip occurs.

- **FM-I-4** — The opening and closing `---` fence text MUST be hidden by default and revealed **together** while the caret or selection touches the block (opening fence, YAML body, or closing fence). Reveal is computed at whole-node granularity by `should_reveal_for_selection(state, node.from, node.to)` — the shared MRS predicate path (MRS-R-2/MRS-R-4 non-strict-cover plus the MRS-P-1 pointer-down freeze) that fenced code uses (CBLK-I-1). The YAML body is never hidden.
  _Example:_ `---\nfoo: ba|r\n---` (caret in body) → both `---` shown; a caret on a line outside the block → both `---` hidden.

- **FM-I-5** — Hiding a fence MUST use a zero-font `Decoration.mark` (`plainmark-frontmatter-marker`, `font-size: 0`) over the fence line's text range, NOT a `Decoration.replace` and NOT a line-height collapse — identical to fenced code (CBLK-I-2). `font-size: 0` hides the glyphs while the `---` line keeps its full line-height strut, so the hidden fence reserves a full line of space and revealing/hiding it reflows nothing; that reserved line doubles as the block's top / bottom band, so the header / footer carry no `padding-y` (FM-R-8). A fence line whose text range is empty receives no hide-mark (a `Decoration.mark` over an empty range is illegal in CM6).
  _Example:_ an off-caret opening `---` hides its glyphs but keeps a full empty line of reserved height; caret-entry reveals `---` in that same space with no reflow.

## SP · Source preservation

- **FM-SP-1** `[inherits:INV-SP-1]` — Frontmatter rendering is decoration-only; every byte of the frontmatter block and every byte outside it MUST be preserved verbatim through any edit cycle. No source mutation, no YAML reformatting, no info-string canonicalization.
  _Example:_ opening `---\ntitle: foo\ntags: [a, b]\n---\n\nProse.` and editing prose leaves the entire frontmatter block byte-identical.

- **FM-SP-2** `[inherits:INV-SP-1]` — The closing-fence bytes MUST be preserved as authored: a `...` closer round-trips as `...` and a `---` closer as `---`; Plainmark MUST NOT canonicalize one to the other.
  _Example:_ `---\nauthor: x\n...\n` saves back with the `...` closer intact, not rewritten to `---`.

- **FM-SP-3** `[inherits:INV-SP-4]` — The open→(no user input)→close cycle on a document containing frontmatter MUST emit zero edits and leave the buffer byte-identical (no phantom edit on load).
  _Example:_ open the frontmatter sample fixture, click around without typing, close → document is never marked dirty.

- **FM-SP-4** `[inherits:INV-SP-1]` — Fence hiding MUST be a view-layer mark only; the `---` (or `...`) fence bytes MUST remain in the document and reappear when the fence line is caret-revealed (mirrors CBLK-SP-3).
  _Example:_ `---\nfoo: bar\n---\n` rendered with fences hidden, then opener revealed → source is still `---\nfoo: bar\n---\n` byte-for-byte.

## E · Edge cases

- **FM-E-1** — A closing fence MUST be accepted as either `---` or `...`, with trailing whitespace tolerated on fence lines (`/^(?:---|\.\.\.)\s*$/`). The opening fence MUST be `---` only.
  _Example:_ `---\nfoo: bar\n...\n` parses as frontmatter; `---  \nfoo: bar\n---\t\n` parses (trailing spaces/tabs tolerated).

- **FM-E-2** — Empty frontmatter (`---\n---\n`) MUST parse: one `FrontMatter` node, two `FrontMatterMark` nodes, no body line. The handler emits header + footer decorations and no body decoration.
  _Example:_ `---\n---\n` → `plainmark-frontmatter-header` then `plainmark-frontmatter-footer`, with `data-language="yaml"` on the header.

- **FM-E-3** — A `---` (or `...`) NOT on line 1 MUST NOT be treated as frontmatter; mid-document fences and post-blank-line fences are ignored by the parser.
  _Example:_ `# Heading\n---\nfoo: bar\n---\n` → no `FrontMatter` node; `text\n\n---\nfoo: bar\n---\n` → no `FrontMatter` node.

- **FM-E-4** — Unclosed frontmatter (opening `---` with no `---`/`...` closer before EOF) MUST NOT parse as frontmatter and MUST NOT crash the parser; the block parser aborts (returns false) at EOF or on a non-advancing line.
  _Example:_ `---\nfoo: bar\nno-closer-here\n` → zero `FrontMatter` nodes, no throw; `---\nfoo\n` → no `FrontMatter`.

- **FM-E-5** — Frontmatter detection MUST tolerate CRLF line endings.
  _Example:_ `---\r\nfoo: bar\r\n---\r\n` parses as one `FrontMatter` node.

- **FM-E-6** — A body line whose text is a YAML value containing or shaped like `---` MUST NOT terminate the block early; only a full closing-fence line (`---`/`...`, trailing whitespace only) closes it.
  _Example:_ `---\nsep: "---"\n---\n` → one frontmatter block; the quoted `---` value is body, the final `---` is the closer.

- **FM-E-7** `[accepted]` — Setext-shaped `text\n---` at document start is NOT frontmatter (no `---` on line 1) and MUST render as plain prose plus a visually inert `---` (lang-markdown's `HeaderMark`), inheriting the T14-deferred Setext-heading limitation. Users wanting an HR insert a blank line (`text\n\n---`).
  _Example:_ `Title\n---\n` → `Title` as prose and `---` shown as inert meta text, not frontmatter and not a styled HR.

- **FM-E-8** `[accepted]` — Non-YAML frontmatter flavors (TOML `+++`, JSON, etc.) and mid-document Pandoc-style YAML metadata blocks are out of scope; only line-1 YAML `---` frontmatter is recognized.
  _Example:_ `+++\ntitle = "x"\n+++\n` → no frontmatter chrome (treated as ordinary markdown).

- **FM-E-9** `[accepted]` — A frontmatter block always begins at document offset 0, so no selection can strictly extend past it on BOTH sides; a select-all (or any selection anchored at offset 0) therefore always REVEALS the `---` fences, whereas the same gesture over a mid-document fenced-code block leaves its fences hidden (MRS-R-4 strict-cover). This is the one reveal predicate applied to different geometry, not a divergence, and is accepted as-is.
  _Example:_ select-all over `---\nfoo: bar\n---\nProse` → the `---` fences reveal (an offset-0 anchor cannot strict-cover); the analogous select-all over a mid-document code block keeps its ` ``` ` hidden.
