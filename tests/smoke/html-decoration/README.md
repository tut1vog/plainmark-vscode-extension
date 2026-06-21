# HTML block + inline raw HTML decoration chrome — smoke fixtures

12 markdown files for manual F5 verification of HTML decoration chrome. Open each in the Extension Development Host and verify the rendering / interaction against the table below.

**Invariants** (must hold for every file):
- Source bytes never mutated by Plainmark. Save → `git diff` shows zero changes (no HTML-side carve-out per `docs/spec/html.md`).
- No widget — chrome is decoration-only (`Decoration.line` on blocks, `Decoration.mark` on inline tags). The cursor enters and edits HTML bytes directly.
- No reveal model — fence-like markers and inline tags are always visible regardless of caret position (`docs/spec/html.md`; mirrors fenced-code and frontmatter).
- No `data-language` attribute on `.plainmark-html-block` lines (F8 — raw HTML has no fence-info-string analog; redundant noise).
- No DOMPurify / no rendered HTML widget — Path B v1 only. Path C (cursor-out reveal rendering) is pre-costed in `docs/spec/html.md` for a future ratification.

## How to F5

1. Open the repo in VS Code.
2. Press **F5** → "Run Extension" (Extension Development Host launches).
3. In the EDH, open one of the fixture files (`File → Open` → navigate to `tests/smoke/html-decoration/`).
4. Right-click the file in the EDH → `Open With...` → `Plainmark Editor` (or set Plainmark as default for `.md` in the EDH window).
5. Verify against the case row below.

## Passive-render cases — block nodes

| # | File | What to verify |
|---|---|---|
| 1 | `01-block-generic.md` | Generic `<div>` block (CommonMark §4.6 type 6). Single-line block: one `.cm-line.plainmark-html-block`. Multi-line block: 6 `.plainmark-html-block` lines (opening `<div>` through closing `</div>`). Background inset from editor edge (`--plainmark-html-margin-x` default `0.5em`). Monospace font. No language label in top-right. |
| 2 | `02-block-script.md` | `<script>`, `<pre>`, `<style>` blocks (type 1). Each gets the same `.plainmark-html-block` chrome. JS source inside `<script>` is NOT syntax-highlighted (no `parseMixed` for type-1 content — only outer-tag tokens get lang-html coloring). |
| 3 | `03-block-comment.md` | `CommentBlock` chrome (type 2). Single-line, multi-line, and no-blank-line-after variants all carry `.plainmark-html-block`. Inner comment text colored via `.plainmark-syntax-comment` (lang-html overlay sees `Comment` node and tags it `tags.blockComment`). |
| 4 | `04-block-processing-instruction.md` | `ProcessingInstructionBlock` chrome (type 3). Same `.plainmark-html-block` family. NO inner-token coloring (no `parseMixed` overlay on `ProcessingInstructionBlock` per `docs/spec/html.md` "Gap"). |
| 5 | `05-block-doctype-and-cdata.md` | `<!DOCTYPE>` declaration (type 4) and CDATA (type 5) both fall through to `HTMLBlock` with the same chrome. `docs/spec/html.md` "DOCTYPE styling" + "CDATA styling". |

## Passive-render cases — inline nodes

| # | File | What to verify |
|---|---|---|
| 6 | `06-inline-tags.md` | `HTMLTag` inline mark on each tag (`<kbd>`, `<sub>`, `<sup>`, `<mark>`, `<abbr>`, `<q>`, `<span>`). Each is a separate `<span class="plainmark-html-inline">` around the atomic tag bytes (not the inner content). Typography-only: monospace + dim color; NO background, NO padding, NO margin (preserves paragraph flow). Tag-name colored via `.plainmark-syntax-tag`; attribute name via `.plainmark-syntax-property`; quoted attribute value via `.plainmark-syntax-string`. |
| 7 | `07-inline-self-closing.md` | XHTML `<br/>`, HTML5 `<br>` (void), `<img/>`, `<hr/>` (inline) all get `.plainmark-html-inline`. Self-closing tags render the same as open+close pairs visually. |
| 8 | `08-inline-comment-and-processing-instruction.md` | Inline `<!-- ... -->` and `<? ... ?>` (mid-paragraph) get `.plainmark-html-inline` mark chrome. NO inner-token coloring — inline `Comment` and `ProcessingInstruction` are not covered by the `parseMixed` overlay (only `CommentBlock` is, per `docs/spec/html.md` "Gap"). |

## Block-vs-inline isolation

| # | File | What to verify |
|---|---|---|
| 9 | `09-block-vs-inline-isolation.md` | Verify the asymmetry: block chrome is line-level (background, padding); inline chrome is mark-level (typography only). Plain prose lines never carry `.plainmark-html-block`. Inline marks never appear inside block-level HTML content (the lang-markdown parser does not re-enter inline parsing inside `HTMLBlock`). |

## Inline HTML inside other constructs

| # | File | What to verify |
|---|---|---|
| 10 | `10-html-in-containers.md` | Inline HTML works inside heading, list, task list, blockquote, callout, and table cell. The OUTER construct's chrome (heading size, list marker, blockquote bar, callout accent, table cell) is preserved; inline `.plainmark-html-inline` marks are added on top. Table cell coverage matters: `HTMLTag` nodes inside `TableCell` get marks via the existing `NodeHandler` traversal (the table widget treats them as opaque text bytes — `docs/spec/html.md` "HTML inside table cells"). |

## Multi-line and edge cases

| # | File | What to verify |
|---|---|---|
| 11 | `11-blank-line-terminates-block.md` | Obsidian "multi-line HTML rendering" papercut. Per CommonMark §4.6 types 6 and 7, a blank line terminates the block. Plainmark's styled-source v1 makes the parse boundary visible: lines before the blank get block chrome; the paragraph after does not; the lone `</div>` after the gap becomes its own one-line `HTMLBlock`. This is a CommonMark-correct, lezer-markdown-correct behavior — not a Plainmark bug. |

## Source preservation

| # | File | What to verify |
|---|---|---|
| 12 | `12-source-preservation.md` | Open the file. **Do not edit.** Press Save (Cmd+S / Ctrl+S). In a terminal: `git diff tests/smoke/html-decoration/12-source-preservation.md`. Output: empty. Repeat with files 1, 3, 6, 10, 11. The fenced-code block `<div>...</div>` inside file 12 should render as plain fenced-code with `data-language="html"`, NOT as `.plainmark-html-block` (`FencedCode` parser wins over `HTMLBlock` per CommonMark order). The inline backtick `` `<kbd>` `` should render as `.plainmark-inline-code`, NOT `.plainmark-html-inline`. |

## DevTools spot-checks

Open DevTools on the EDH webview (`Help → Toggle Developer Tools` in the EDH window — note that `console.log` calls go to the EDH's own DevTools, not the launching VS Code window).

Inspect a `<div>` block line in `01-block-generic.md` and confirm:

- Tag is `<div>` with `class="cm-line plainmark-html-block"`.
- **NO `data-language` attribute** (the F8 design intent — unlike `.plainmark-fenced-code-header` which carries `data-language="html"`).
- Computed style: `background-image: linear-gradient(...)` stacked layer (blockquote / callout / fenced-code / frontmatter precedent); `background-position` offset by `--plainmark-html-margin-x` (default `0.5em`); `font-family: var(--plainmark-font-code, monospace)`; `font-size: var(--plainmark-html-size, var(--plainmark-fenced-code-size, 0.9em))`.
- Default chains to fenced-code: setting `--plainmark-fenced-code-margin-x: 2em` via `plainmark.styles` propagates to HTML block.

Inspect an inline `<kbd>` tag in `06-inline-tags.md` and confirm:

- Mark is `<span class="plainmark-html-inline">` wrapping the opening `<kbd>` bytes.
- A separate `<span class="plainmark-html-inline">` wrapping the closing `</kbd>` bytes.
- Inner `<span class="plainmark-syntax-tag">` wraps the `<`, `kbd`, `>` tokens (lang-html overlay × fenced-code HighlightStyle × `.plainmark-html-inline .plainmark-syntax-tag` scoping rule).
- Computed style on the outer mark: `font-family: var(--plainmark-font-code, monospace)`; `color: var(--plainmark-html-inline-color, var(--plainmark-html-color, ...))`; NO `background`, NO `padding`, NO `margin`.

Inspect a `<span class="x">` block tag in `01-block-generic.md` (line 2 of the multi-line block) and confirm:

- Inside `.plainmark-html-block`, the lang-html overlay emits:
  - `<span class="plainmark-syntax-tag">&lt;</span>` for the `<`
  - `<span class="plainmark-syntax-tag">div</span>` for the tag name
  - `<span class="plainmark-syntax-property">class</span>` for the attribute name
  - `<span class="plainmark-syntax-string">"example"</span>` for the quoted value
  - `<span class="plainmark-syntax-tag">&gt;</span>` for the `>`
- Each `.plainmark-syntax-*` carries its `--plainmark-syntax-*-color` color rule (via the scope rules in `src/webview/decorations/html.ts` `build_html_theme`).

Confirm a plain prose line outside any HTML construct has:

- `class="cm-line"` (no `.plainmark-html-block`).
- `<span class="plainmark-syntax-variable">` wraps around prose text runs (frontmatter cascade — visually inert outside scoped contexts; `docs/spec/frontmatter.md`).
- NO `.plainmark-html-inline` marks anywhere on the line.

## Theme-switching axis

- [ ] Switch to **Light Modern** (`Cmd+K Cmd+T`). HTML chrome background lightens (chains through `--plainmark-code-background` → `--vscode-textCodeBlock-background`). Token colors flip to VS Code Light+ palette via `:root` defaults.
- [ ] Switch to **Dark Modern**. Token colors flip to VS Code Dark+ palette via `body.vscode-dark` overrides. CSS-only gating, no webview reload.
- [ ] Switch to **High Contrast Dark**. Background tint may render fully transparent (HC theme tokens often `null`); token colors still legible via `:root` defaults.
- [ ] Switch to **High Contrast Light**. Same expectations.

## `plainmark.styles` customization axis

Create a workspace `.vscode/settings.json` with `"plainmark.styles": [".vscode/custom.css"]` and a `.vscode/custom.css` containing:

```css
:root {
  --plainmark-html-background: #fff3cd;
  --plainmark-html-color: #856404;
  --plainmark-html-inline-color: #c0392b;
}
```

Then open `01-block-generic.md`:
- [ ] Block surface tints yellow with brown text — independent override of `--plainmark-html-background`.
- [ ] Inline tags in `06-inline-tags.md` turn red — `--plainmark-html-inline-color` override.
- [ ] Fenced code in `12-source-preservation.md` is **unchanged** — `--plainmark-fenced-code-background` is independent (F7 / `docs/spec/html.md` independent-override property).
- [ ] Edit the `.vscode/custom.css` file in another VS Code editor; the HTML chrome updates without reloading the webview (cache-bust live reload).

## Regression axis

- [ ] Fenced code blocks in `12-source-preservation.md` still get `.plainmark-fenced-code` + `data-language="html"` chrome.
- [ ] Inline code (`` `<kbd>` ``) in `12-source-preservation.md` still gets `.plainmark-inline-code` chrome — does NOT become an HTMLTag.
- [ ] Frontmatter, callouts, blockquotes, tables, lists, headings, footnotes, HR all render unchanged on any fixture.
- [ ] Theme switch (Cmd+K Cmd+T) does not require webview reload (CSS-only gating per THEME-R-11).
- [ ] No `console.error` / `console.warn` in the EDH webview DevTools.
- [ ] `console.log('[widget]', ...)` calls during HTML rendering: NONE (the decoration handler is silent — no per-render logs).

## VS Code Web (`vscode.dev`) sanity

- [ ] Open `01-block-generic.md` in `vscode.dev` with Plainmark loaded. Block chrome renders. Inline tags in `06-inline-tags.md` render.
- [ ] lang-html overlay colors render — `parseMixed` is webview-only and works the same on Web.
- [ ] No `fs` / `path` / `child_process` boot errors in the webview DevTools console (host-code separation honored).
- [ ] No new dependency loaded for HTML — `@codemirror/lang-html` is already in the bundle closure.

## What's intentionally NOT covered (Path C deferred per `docs/spec/html.md`)

- **Rendering on cursor-out (Obsidian-style)** — Path C is pre-costed in `docs/spec/html.md` for a future ratification. v1 ships decoration-only.
- **DOMPurify dependency** — never reached in v1. The library, config, bundle pattern, hooks, and zero-CSP-delta are all pre-costed in `docs/spec/html.md` for the future ratification.
- **`<iframe>` policy** — moot until rendering lands. DOMPurify-default strips iframes; Plainmark's CSP has no `frame-src` directive so iframe loads fail anyway (double defense).
- **Inline tag pair-matching** — SilverBullet's `htmlInlinePlugin` pair-matcher is the only known pattern for rendering `<sub>x</sub>` as `ₓ`. Block-only is the cheapest Path C scope.
- **`data-language="html"` label on block chrome** — F8 / `docs/spec/html.md`. Raw HTML has no fence-info-string analog. Users wanting an HTML-labeled code surface already have `` ```html ``.
- **`MarkdownExtension` for HTML** — unnecessary. The six lezer-markdown HTML node names + the `parseMixed` overlay are already provided by `@codemirror/lang-markdown`'s default `parseCode` config. This adds zero grammar code.
- **HighlightStyle palette amendment** — unnecessary. The fenced-code 12-group palette already binds every Lezer tag lang-html emits (`docs/spec/html.md`). Unlike frontmatter's `tags.content` addition.

## Padded-adjacency caveat

The `.plainmark-html-block` line decoration does not currently opt into the `plainmark-collapse-adjacent` marker class. Two adjacent HTML blocks separated by a blank line will compound paddings; cosmetic, not a bug. A future task can opt-in if user feedback surfaces, mirroring the padded-adjacency pattern (THEME-S-2 / THEME-S-3).
