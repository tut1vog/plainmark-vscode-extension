---
prefix: CBLK
title: Code blocks (fenced + indented)
kind: construct
---

# Code blocks

Covers block-level code — **fenced code blocks** (lezer `FencedCode`, opened/closed
by a ` ``` ` or `~~~` run with an optional info string) and **indented (4-space)
code blocks** (lezer `CodeBlock`) — as handled by
the code-block decoration handler. Inline code (`` `code` ``) is a separate
construct (`inline-code.md`, prefix CODE).

Code blocks are **decoration-only styled source**: the body bytes render verbatim
in monospace with background chrome; syntax coloring layers on top via the
`@codemirror/lang-markdown` `codeLanguages` sub-parser and a bundled
`HighlightStyle`. No widget replaces the block; no source byte is rewritten. The
fence lines themselves hide by default (Typora-style) and reveal when the caret
or selection enters the block (MRS-R-2/MRS-R-4). A language label is painted
top-right from the raw info string. There is no copy button. Two editing affordances (Enter auto-close,
Backspace delete-empty-block) are provided.

Example notation: `|` = caret, `→` = action/result, `\n` = newline (see README §2).

---

## R · Rendering

- **CBLK-R-1** — Each line spanned by a `FencedCode` node MUST receive one `Decoration.line`. The handler iterates from `state.doc.lineAt(node.from).number` through `state.doc.lineAt(node.to).number` inclusive, emitting exactly one line decoration per line.
  _Example:_ ` ```ts\nfoo\n``` ` (3 lines) → 3 line decorations (header, body, footer).

- **CBLK-R-2** — The opening fence line MUST carry class `plainmark-fenced-code plainmark-fenced-code-header`; interior body lines `plainmark-fenced-code`; the closing-fence line `plainmark-fenced-code plainmark-fenced-code-footer`. In an unclosed block (no closing `CodeMark`) the last line is code content, not a fence, and receives class `plainmark-fenced-code plainmark-fenced-code-content-end`, which carries the `padding-y` band the reserved closing-fence line would otherwise provide (CBLK-R-5).
  _Example:_ ` ```ts\nfoo\n``` ` → header on line 1, body (`plainmark-fenced-code`, no `-header`/`-footer`) on line 2, footer on line 3.

- **CBLK-R-3** — Each line spanned by an indented `CodeBlock` node MUST receive one `Decoration.line` with class `plainmark-indented-code`; the first line additionally `plainmark-indented-code-first` and the last line `plainmark-indented-code-last`. A single-line indented block receives the `-first` class.
  _Example:_ `paragraph\n\n    a\n    b\n` → 2 line decorations: `plainmark-indented-code-first` then `plainmark-indented-code-last`.

- **CBLK-R-4** `[smoke]` — Block chrome (`.plainmark-fenced-code` and `.plainmark-indented-code` share one rule object) MUST apply a background tint, monospace font, body foreground color, configured line-height, font-size, and left/right padding. The background is painted as a stacked `linear-gradient` via `background-image` (not `margin`), inset by `--plainmark-fenced-code-margin-x`, to avoid desyncing CM6's height map.
  _Example:_ a ` ```js ` block renders as a shaded monospace surface spanning the content width.

- **CBLK-R-5** `[smoke]` — The vertical inset (`padding-bottom` on `-content-end`, `padding-top` on `-indented-code-first`, `padding-bottom` on `-indented-code-last`) MUST resolve from `--plainmark-fenced-code-padding-y` (implementation fallback `0.5em`); horizontal padding from `--plainmark-fenced-code-padding-x` (fallback `1em`); line-height `--plainmark-fenced-code-line-height` (fallback `1.45`); font-size `--plainmark-fenced-code-size` (fallback `1em`). The closed-block header and footer carry NO `padding-y` — their reserved full-height fence line is the top / bottom band (CBLK-I-2).
  _Example:_ overriding `--plainmark-fenced-code-padding-y` to `1em` thickens the band of indented blocks and the unclosed-fence tail; a closed fenced block's band is the reserved fence line, unaffected.

- **CBLK-R-6** `[smoke]` — The block background MUST resolve from `--plainmark-code-background` (chaining `--vscode-textCodeBlock-background` → `--vscode-textPreformat-background` → transparent), foreground from `--plainmark-code-color` (chaining `--vscode-foreground` → inherit), and font from `--plainmark-font-code` (fallback `monospace`). These shared `--plainmark-code-*` primitives also feed inline code, so setting one knob recolors both surfaces.
  _Example:_ setting `--plainmark-code-background` once via `plainmark.styles` tints both fenced blocks and inline-code chips.

- **CBLK-R-7** `[smoke]` — When the opening fence has a non-empty trimmed info string, the header line decoration MUST carry attribute `data-language="<info>"`, and CSS `.plainmark-fenced-code-header::before { content: attr(data-language); }` paints the raw info string as a label positioned top-right (`top: 0.25em; right: 0.75em`), colored by `--plainmark-fenced-code-language-label-color` (default `--vscode-descriptionForeground`) at size `--plainmark-fenced-code-language-label-size` (default `0.75em`), with `pointer-events: none` and `user-select: none`.
  _Example:_ ` ```ts ` → a small dim `ts` label in the block's top-right corner.

- **CBLK-R-8** — The language label MUST show the user's RAW info string verbatim, never the canonical language name. The handler slices `CodeInfo` and `.trim()`s it for the attribute; no alias resolution or canonicalization is applied to the displayed/stored value.
  _Example:_ ` ```ts ` shows the label `ts`, not `typescript`; an unrecognized ` ```doesnotexist ` shows `doesnotexist`.

- **CBLK-R-9** — An empty info string MUST produce no `data-language` attribute, hence no label (CSS `::before` resolves to empty). Indented code blocks never carry a label (they have no info string).
  _Example:_ ` ```\nfoo\n``` ` → header line with no `data-language`, no corner label.

- **CBLK-R-10** `[smoke]` — Inner code tokens surfaced by the `codeLanguages` `parseMixed` overlay on `CodeText` MUST receive their color from the bundled `plainmark_highlight_style`, which maps ~30 lezer tags into 12 classes (`plainmark-syntax-keyword`, `-comment`, `-string`, `-number`, `-function`, `-variable`, `-type`, `-property`, `-tag`, `-meta`, `-punctuation`, `-invalid`). Each class's color comes from the matching `--plainmark-syntax-<class>-color` variable with a light-palette hex inline fallback (the shared syntax-palette helper; THEME-V-5 / THEME-D-6), so tokens stay colored even if the `:root` defaults injection is absent.
  _Example:_ inside a ` ```js ` block, `const` colors as `var(--plainmark-syntax-keyword-color, #0000ff)` and `"x"` as `var(--plainmark-syntax-string-color, #a31515)`.

- **CBLK-R-11** `[smoke]` — Syntax-color CSS rules MUST be scoped under `.plainmark-fenced-code` / `.plainmark-indented-code` parents, NOT applied globally. The global `HighlightStyle` also tags markdown's own `ListMark` / `CodeMark` with `tags.meta`; scoping prevents list bullets and fence ticks from being recolored.
  _Example:_ a `tags.meta`-tagged `ListMark` outside any code block stays unstyled; the same tag inside a fenced block colors as `--plainmark-syntax-meta-color`.

- **CBLK-R-12** `[smoke]` — Syntax highlighting MUST be wired globally via `syntaxHighlighting(plainmark_highlight_style)`, with `markdown({ codeLanguages: match_code_language })` (`language_aliases.ts`) providing the per-language sub-parser: the `@codemirror/language-data` registry front-loaded with the CBLK-R-16 fence-tag alias layer. `defaultCodeLanguage` is left undefined, so untagged or unrecognized fences render as un-tokenized monospace.
  _Example:_ ` ```\nplain text\n``` ` (no info string) renders as monospace with no token colors.

- **CBLK-R-13** `[smoke]` — While a not-yet-loaded grammar resolves, the block MUST render as plain monospace (no token colors, no flicker, full source text visible); the highlight overlay arrives on the next parse pass. (Under the project's iife webview build esbuild inlines dynamic `import()`, so grammars are bundled rather than lazy-loaded; the no-flicker first-paint behavior holds regardless.)
  _Example:_ opening a doc with a ` ```rust ` block shows the code as monospace immediately, with Rust colors applied on the following idle parse.

- **CBLK-R-14** `[smoke]` — Block chrome MUST NOT emit a `border-radius` rule. `--plainmark-fenced-code-border-radius` is designed-but-not-wired (rounding multi-line `.cm-line` chrome requires clip-path; same constraint as callout / HTML-block chrome).
  _Example:_ a multi-line fenced block paints square corners regardless of any `--plainmark-fenced-code-border-radius` override.

- **CBLK-R-15** — The shared `plainmark_highlight_style` MUST NOT map `tags.content` to a syntax-token class. `tags.content` is the lezer tag for markdown prose — `Paragraph`, GFM `TableCell`, and (via the `@lezer/highlight` `heading1..6 → heading → content` tag hierarchy) every heading — so mapping it would wrap all prose in a `plainmark-syntax-*` class document-wide, independent of the CBLK-R-11 color scoping. Code-language text content carried by `tags.content` (e.g. markup-language text runs inside a fenced block) consequently renders in the default code foreground rather than a token color.
  _Example:_ a `# Heading` line and a body paragraph contain no `.plainmark-syntax-variable` span; in a ` ```html ` block, `<p>text</p>` shows `text` in the default code color while the `<p>` tag still colors via `--plainmark-syntax-tag-color`.

- **CBLK-R-16** `[smoke]` — The `codeLanguages` matcher (`match_code_language`) MUST resolve additional commonly-typed fence tags onto grammars `@codemirror/language-data` already bundles, via wrapper `LanguageDescription`s that delegate `load()` to the base entry — same `LanguageSupport` instance, no new grammar imports (e.g. `asm`/`assembly`/`nasm`/`x86asm` → Gas, `wasm` → WebAssembly, `matlab` → Octave, `py` → Python; full table in `language_aliases.ts`). The alias layer participates in EXACT name/alias matching only, then falls back to the stock registry with its default fuzzy matching — an alias must never fuzzy-capture an unrelated tag (```armasm is a different instruction set and stays unresolved). An alias lands only when documented by highlight.js, Linguist, or Typora, or when the tag names a dedicated bundled grammar; cross-language approximations (`asm` → GAS AT&T-syntax grammar, `tsql` → MS SQL, `gradle` → Groovy DSL) follow shipped precedent in those sources (ADR-0009).
  _Example:_ ` ```asm\nmovl $1, %eax  # exit\n``` ` colors the comment via the Gas grammar; ` ```armasm ` renders un-tokenized monospace.

## I · Interaction

- **CBLK-I-1** — The opening and closing fence text MUST be hidden by default (Typora-style) and revealed **together** while the caret or selection touches the block — opening fence, body, or closing fence. Reveal is computed at whole-node granularity by `should_reveal_for_selection(state, node.from, node.to)` (the MRS predicate path, including its pointer-down freeze MRS-P-1/P-2); a caret or selection outside the block hides both fences.
  _Example:_ ` ```ts\nfoo|\n``` ` (caret in body) → both fences shown; a caret on a line outside the block → both fences hidden.

- **CBLK-I-2** — Hiding a fence MUST use a zero-font `Decoration.mark` (`plainmark-fenced-code-marker`, `font-size: 0`) over the fence line's text range, NOT a `Decoration.replace` and NOT a line-height collapse. `font-size: 0` hides the glyphs while the fence line keeps its full line-height strut, so the hidden fence **reserves a full line of space** and revealing/hiding it reflows nothing (zero layout shift). That reserved fence line doubles as the block's top / bottom band, so the closed-block header / footer carry no `padding-y` (CBLK-R-5). A line-leading replace widget would flicker `drawSelection` under `lineWrapping` (the drawSelection wrapped-line flicker defect).
  _Example:_ an off-caret ` ``` ` footer hides its glyphs but keeps a full empty line of reserved height; caret-entry reveals ` ``` ` in that same space with no reflow.

- **CBLK-I-3** — A non-empty selection MUST reveal the fences per the MRS-R-4 non-strict-cover rule: any selection touching, partially overlapping, inside, or boundary-equal to the block reveals both fences; only a selection that strictly extends past the block on BOTH sides (select-all-like cover) leaves them collapsed. During a mouse drag the pointer-down freeze (MRS-P-1) holds the pre-press reveal state, so fences do not flicker mid-drag.
  _Example:_ select the ` ```ts ` fence line → both fences shown; select-all across `a\n```ts\nfoo\n```\nb` → both fences stay hidden.

- **CBLK-I-4** — The header line decoration (carrying `data-language` and the label `::before`) MUST be emitted on every render regardless of reveal state; only the fence-text hide-mark is toggled by whole-node reveal (there is no separate collapsed line class). The hidden opener still carries `plainmark-fenced-code-header` and its `data-language`, so the top-right label paints even while the fence glyphs are hidden.
  _Example:_ with the caret outside the block, the opener fence glyphs are hidden yet the top-right `ts` label still paints.

- **CBLK-I-5** — In an unclosed block (single `CodeMark`, no closing fence) there MUST be no closing-fence hide; only the opening fence participates in reveal, and the trailing content line gets the `plainmark-fenced-code-content-end` class (with `padding-y`, no reserved fence line).
  _Example:_ ` ```ts\nfoo\n` (no closer) → opener hidden while the caret is outside, revealed while it is inside; no second hide-mark emitted.

- **CBLK-I-6** — Pressing Enter at the end of an unclosed opening-fence line (empty selection, caret at line end, 0–3 leading spaces, a run of ≥3 backticks or tildes, info string with no further fence char, and the `FencedCode` node holding a single `CodeMark`) MUST auto-append a blank line plus a closing fence copying the opener's fence char, length, and indent; the caret stays on the (now-empty) body line. The same command also auto-closes a `$$` math block.
  _Example:_ ` ```ts|` → Enter → ` ```ts\n|\n``` `.

- **CBLK-I-7** — The Enter auto-close MUST NOT fire on a 4-space-indented fence-like line (the 0–3-space cap keeps it off indented code blocks) and MUST NOT fire when the block already has a matching closing `CodeMark` (`marks.length > 1`).
  _Example:_ ` ```ts\nfoo\n```| ` already closed → Enter inserts an ordinary newline, no extra fence.

- **CBLK-I-8** — Backspace on the empty content line of a three-line fully-closed empty block (opener / blank / closer) MUST delete the whole block — opener and closer together — rather than orphaning the closing fence. The match requires the previous line to parse as an opening fence and the next line to be a closing fence of the same char and ≥ length.
  _Example:_ ` ```ts\n|\n``` ` → Backspace → empty document (the whole block is removed in one edit).

- **CBLK-I-9** — Editing inside a code block's body MUST behave as ordinary text editing: typing, deletion, and caret motion operate directly on the source bytes with no construct-specific keymap beyond the Enter/Backspace block affordances above and the Tab/Backspace code-indent affordances (CBLK-I-13, CBLK-I-14). There is no copy button, no language picker, and no per-block soft-wrap toggle.
  _Example:_ `f|oo` inside a body line → type `x` → `fx|oo`, byte inserted literally.

- **CBLK-I-10** `[accepted]` — A copy button on code blocks is NOT shipped in v1. Adding one (widget + clipboard handler + caret-trap defense + focus management) is deferred to a post-MVP task.
  _Example:_ hovering a code block shows no copy affordance.

- **CBLK-I-11** — Typing the third backtick or tilde MUST auto-append a matching closing fence on the next line, leaving the caret at the end of the opening fence line for inline language entry. The trigger is an empty selection, a plain caret insertion (`from === to === head`) of a single ``` ` ``` or `~` at the end of an otherwise-empty line whose text (with the keystroke applied) is exactly 0–3 leading spaces plus a run of exactly three of that fence char. The inserted text is a newline plus a closing fence copying the opener's fence char and indent. Wired as an `EditorView.inputHandler` (`fence_autopair_input`), distinct from the CBLK-I-6 Enter auto-close, which remains as a fallback for fences that arrive any other way.
  _Example:_ ` ``| ` → type ``` ` ``` → ` ```|\n``` ` (caret at opener end). ` ~~| ` → type `~` → ` ~~~|\n~~~ `.

- **CBLK-I-12** — The CBLK-I-11 auto-pair MUST be suppressed when the immediate next line is already a matching closing fence (same fence char, run length ≥ the opener's); the keystroke then inserts the lone fence char with no closer, so adding a fence above existing code does not orphan a duplicate. Only the immediate next line is consulted — a closer further down does not suppress (the accepted heuristic boundary; the wider case is the papercut Obsidian itself ships).
  _Example:_ ` ``|\n``` ` → type ``` ` ``` → ` ```|\n``` ` (no second closer). ` ``|\n~~~ ` → type ``` ` ``` → still fires (different fence char).

- **CBLK-I-13** — Inside a `FencedCode` node, Tab MUST indent by four spaces and Shift-Tab MUST strip up to four leading spaces, independent of the editor's 2-space `indentUnit` (LIST-I-11). With an empty selection Tab inserts four spaces at the caret — not the line start — and advances the caret past them; with a selection Tab prepends four spaces to each selected line and Shift-Tab removes up to four leading spaces from each. This is the sole code-block exception to CBLK-I-9. Outside a fenced code block, or for a multi-range selection, Tab/Shift-Tab fall through to the editor-wide whole-line indent (`indentWithTab` → `indentMore`/`indentLess`). Indented (non-fenced) code blocks are unaffected.
  _Example:_ caret at `let x|=1` inside a code fence → Tab → `let x    |=1` (four spaces at the caret, not the line start).

- **CBLK-I-14** — Inside a `FencedCode` node, Backspace with a collapsed caret MUST delete exactly one character (`deleteCharBackwardStrict`), never a whole indent unit. CM6's default `deleteCharBackward` deletes back to the previous `indentUnit` tab stop when the caret is in leading whitespace, which after the four-space code indent (CBLK-I-13) strips two spaces per press; the strict delete keeps code backspacing predictable. The empty-block delete (CBLK-I-8) still takes precedence on a truly empty block body; elsewhere Backspace keeps the editor default.
  _Example:_ four-space indent inside a code fence, caret after the spaces → Backspace → three spaces (one removed, not a 2-space indent unit).

## SP · Source preservation

- **CBLK-SP-1** `[inherits:INV-SP-1]` — Code-block rendering MUST be decoration-only. The handler emits only `Decoration.line` (chrome) and `Decoration.mark` (fence hiding); it performs NO `Decoration.replace`, NO widget, NO info-string canonicalization, and NO source-byte mutation. The `codeLanguages` overlay only sub-parses for coloring; it never rewrites or re-serializes source.
  _Example:_ ` ```TS  \nfoo\n``` ` (uppercase tag, trailing spaces) round-trips byte-for-byte; chrome and `ts`-family colors layer on top without normalizing the info string.

- **CBLK-SP-2** — The code body bytes MUST be preserved verbatim — code is exactly what the user typed. Markdown constructs inside the body MUST NOT be re-interpreted (lezer treats `CodeText` as opaque to the outer markdown grammar; only the inner-language overlay descends).
  _Example:_ a body line `[link](x)` inside a ` ```md ` block keeps the literal `[link](x)` bytes; it is not turned into a markdown link.

- **CBLK-SP-3** — Fence hiding MUST be a view-layer mark only; the fence bytes (` ``` ` / `~~~` and the info string) MUST remain in the document and reappear when the fence line is caret-revealed.
  _Example:_ ` ```ts\nfoo\n``` ` rendered with fences hidden, then opener revealed → source is still ` ```ts\nfoo\n``` ` byte-for-byte.

- **CBLK-SP-4** — The Enter auto-close and Backspace delete-empty-block affordances are ordinary keystroke edits dispatched as single CM6 transactions (`userEvent: 'input'` / `'delete'`); they MUST NOT canonicalize or rewrite bytes beyond inserting the copied closing fence (Enter) or removing the matched block range (Backspace).
  _Example:_ ` ```ts|` → Enter inserts exactly `\n```` (newline + three backticks copying the opener), nothing else changes.

- **CBLK-SP-5** `[inherits:INV-SP-1]` — The CBLK-I-11 type-triggered auto-pair is an ordinary keystroke edit dispatched as a single CM6 transaction (`userEvent: 'input'`); it MUST NOT canonicalize or rewrite bytes beyond inserting the typed fence char plus a newline and the copied closing fence.
  _Example:_ ` ~~| ` → type `~` inserts exactly `~\n~~~` (the typed tilde, a newline, and a tilde fence copying the opener), nothing else changes.

## E · Edge cases

- **CBLK-E-1** — Indented code blocks MUST be styled identically to fenced (CommonMark conformance; matches Obsidian), minus the language-label affordance. The known papercut — 4 leading spaces inside a list silently becoming a `CodeBlock` — is acknowledged; an opt-out setting is deferred.
  _Example:_ `paragraph\n\n    const x = 1;` → the indented line renders with `.plainmark-indented-code` chrome.

- **CBLK-E-2** — A `~~~`-fenced block MUST be handled identically to a ` ``` `-fenced block (lezer emits `FencedCode` for both); the Enter auto-close copies whichever fence char (`` ` `` or `~`) the opener used.
  _Example:_ `~~~py|` → Enter → `~~~py\n|\n~~~` (tilde fence preserved, not converted to backticks).

- **CBLK-E-3** `[smoke]` — A `mermaid` fenced block is ceded to the Mermaid block widget: when the info string lower-cases to `mermaid` and the selection does NOT overlap the block range, the code-block handler returns NO decorations (the widget renders it). When the caret/selection IS inside the block, the handler falls through and applies ordinary code-block chrome so the source is editable.
  _Example:_ ` ```mermaid\ngraph TD\n``` ` off-caret → no code-block chrome (diagram shown); caret inside → code chrome + fence reveal for editing.

- **CBLK-E-4** — A fence line whose text range is empty (`line.from === line.to`) MUST NOT receive a hide-mark (a `Decoration.mark` over an empty range is illegal in CM6); the handler guards both opener and closer hides with `line.from < line.to`.
  _Example:_ a degenerate zero-width fence line → line chrome only, no hide-mark.

- **CBLK-E-5** `[unknown]` — An unrecognized or absent language MUST render the body as un-tokenized monospace (no `defaultCodeLanguage` fallback); the block chrome and any verbatim label still apply.
  _Example:_ ` ```wat\nfoo\n``` ` (no such grammar) → monospace body, top-right `wat` label, no token colors.

- **CBLK-E-6** `[smoke]` — Per-language token-color depth (e.g. distinct color for `class` vs `if`) is NOT provided; the 12-group palette is the v1 surface. Finer per-language overrides are deferred.
  _Example:_ in a ` ```js ` block, `class` and `if` both color as `--plainmark-syntax-keyword-color`.

- **CBLK-E-7** `[smoke]` — Opaque block-chrome backgrounds coexist with CM6's `drawSelection` layer only because a project-wide override elevates the selection layer above the chrome tint (shared with HTML-block / frontmatter chrome). Without it, click-drag selection over a code block would hide behind the tint.
  _Example:_ click-dragging across a code block shows the selection highlight on top of the block tint, not behind it.
