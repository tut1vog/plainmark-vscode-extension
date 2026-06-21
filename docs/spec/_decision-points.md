# Decision Points — Accepted Compromises & Deferrals

Authored. Every clause tagged `[accepted]` MUST appear here. These are behaviors
the project owner previously accepted as deliberate scope or deferred. They
default to **blessed / conforming**; the owner walks this list and marks each
**bless** (keep as-is) or **reopen** (move to `_backlog.md` as a fix). `spec:check`
warns if an `[accepted]` clause is missing here.

Status legend: `pending` (awaiting owner ratification) · `blessed` · `reopened`.

| Clause | Compromise | Origin | Status |
|---|---|---|---|
| BQ-I-10 | No `Mod-Shift-B` blockquote-toggle shortcut; deferred to a unified command surface rather than added piecemeal per construct. | docs/spec/blockquotes.md (T16, Q4=A) | pending |
| HEAD-I-4 | No heading-specific Enter/Backspace continuation and no `Mod-1`..`Mod-6` level-toggle command; headings use default key handling. | T14 (decoration-only handler) | pending |
| HEAD-E-4 | Setext headings (`Title\n===`) receive no styling at all (handler registers only `ATXHeading1..6`). `[unknown]` conformance — never formally decided whether setext should style. Needs a smoke check + owner ruling. | T14 (ATX-only scope) | pending |
| HEAD-E-5 | Seven-or-more `#` is not treated as a heading (standard CommonMark cap; lezer emits no `ATXHeading`). `[unknown]` — confirm intended. | CommonMark §4.2 | pending |
| FM-E-7 | Setext-shaped `text\n---` at document start is not frontmatter and renders as inert prose + meta `---` (not a styled HR); inherits the T14 setext deferral. | docs/spec/frontmatter.md | pending |
| FM-E-8 | Non-YAML frontmatter flavors (TOML `+++`, JSON) and mid-document Pandoc metadata blocks are out of scope; only line-1 YAML `---` is recognized. | docs/spec/frontmatter.md | pending |
| CODE-I-6 | No inline-code-specific keybinding (no backtick-wrap toggle, no autoclose); inline code uses default key handling. | T9.7 reveal policy | pending |
| EMPH-R-8 | On reveal, emphasis markers return to natural width and shift following text right ("Issue 3") — accepted layout-shift tradeoff after Track A/B alternatives were F5-rejected. | docs/spec/text-styles.md | pending |
| EMPH-E-10 | CJK-friendly emphasis renders bold/italic/strikethrough that GitHub and VS Code's built-in preview show as literal markers (strict superset of CommonMark; only CJK-adjacent cases gain emphasis). | docs/spec/text-styles.md | blessed |
| LINK-I-11 | No link-specific keybinding (no insert-link command, no autoclose); the generic selection-wrap surrounds a selection with `[ ]` but adds no `(url)` slot. | links.ts | pending |
| AUTO-I-9 | No autolink-specific keybinding ships. | links.ts | pending |
| IMG-I-5 | No image click handler, keybinding, or command, and no drag-and-drop insert; widget is a plain non-interactive `<img>`. Paste-to-insert now ships (IMG-I-6..IMG-I-10), so the former paste/drop deferral is reopened. | image.ts | reopened |
| IMG-I-5 | Drag-and-drop image insertion deferred — paste is the only v1 insert trigger; the paste save pipeline (IMG-I-6..IMG-I-10) is reused when drag-drop lands. | image.ts (paste handler) | pending |
| IMG-E-4 | Reference-style images (`![alt][ref]`) unsupported — detection needs a direct `URL` child the reference form lacks. | image.ts | pending |
| IMG-E-8 | No `title` attribute parsed (`![alt](url "title")`); alt regex + `URL` child are the only inputs. | image.ts | pending |
| IMG-E-9 | Non-`file`-scheme docs (untitled/virtual) get a `null` image base, so relative images don't render (absolute http(s) still do). | provider.ts compute_document_dir_uri | pending |
| HTML-E-3 | Inline/block `ProcessingInstruction` renders chrome but no inner highlighting (no `parseMixed` overlay); rare input. | docs/spec/html.md | pending |
| HTML-E-4 | Inline HTML in table cells treated as opaque literal text; the static cell path wraps it to match main-view DOM. | docs/spec/html.md | pending |
| HTML-E-5 | Live HTML rendering (cursor-out DOMPurify widget) deferred; v1 ships styled source. The major HTML deferral. | docs/spec/html.md | pending |
| FN-R-9 | No rendered back-reference (`↩`) affordance on definitions; jump-from-definition is via the click-popover "Jump to definition" button instead. | docs/spec/footnotes.md | pending |
| CALL-I-7 | No callout-specific exit/continuation keymap; exit inherits the blockquote keymap (BQ-I-1/I-2/I-4). No `Mod-Shift-B`-style callout-wrap shortcut and no interactive type-change menu in the MVP. | docs/spec/callouts.md | pending |
| CALL-E-5 | Obsidian pipe-metadata syntax (`[!NOTE\|meta]`) is not parsed; the `\|` breaks the type match so the line renders as a plain blockquote. Pipe-metadata deferred. | docs/spec/callouts.md (2026-05-18) | pending |
| CALL-E-6 | Nested callouts receive no inner callout chrome (matches GitHub "callouts cannot be nested"); Obsidian-style nesting deferred. | docs/spec/callouts.md | pending |
| LIST-R-3 | Bullet glyph cycles by depth bucket (`●`/`○`/`■`), superseding the single-`•`-all-depths plan. | docs/spec/lists.md (T19.7.4) | pending |
| LIST-I-11 | Tab/Shift-Tab is generic `indentWithTab`, not a list-grammar-aware indent (no list-specific Tab handler). | lists wiring | pending |
| LIST-I-12 | No list-toggle command and no keyboard checkbox toggle (checkbox is mouse-only). | lists wiring | pending |
| LIST-SP-4 | Ordered siblings are never auto-renumbered after edit/insert/delete; source digits are the rendered form. | docs/spec/lists.md | pending |
| CBLK-I-10 | No copy button on code blocks in v1 (widget + clipboard + caret-trap defense deferred). | docs/spec/code-blocks.md | pending |
| MATH-E-8 | LaTeX passed verbatim to MathJax; markdown inside math is not re-parsed. | math.ts | pending |
| MATH-E-9 | TeX surface limited to bundled packages (base + AMS + newcommand; no `autoload`/`\require`). | docs/spec/math.md | pending |
| MATH-E-13 | Block math (`$$…$$`) nested in a blockquote/callout is not typeset — the `BlockMath` node straddles the inner `>` markers, which the render layer doesn't strip, so source extraction and the block widget both break. Deferred (Obsidian parity); inline math in a blockquote still works. | math.ts (find_block_math_source / build_decorations) | pending |
| MMD-I-5 | No zoom/pan/export/click-callback affordances; mermaid runs at `securityLevel: strict`. | docs/spec/mermaid.md | pending |
| MMD-E-3 | No per-fence attribute syntax (` ```mermaid {theme=dark} `); global theme only. | docs/spec/mermaid.md | pending |
| MMD-E-9 | Diagram colors baked by mermaid's theme, not the `--plainmark-*` surface; only container sizing uses plainmark vars. | docs/spec/mermaid.md | pending |
| TBL-I-19 | Paste is limited to the free paths PA/PB/PC (markdown-source at doc level, plain-text and multi-line plain-text into a cell); HTML-`<table>`, TSV/CSV, and multi-cell distribute paste (PD–PG) are deferred and fall back to plain-text insertion. | docs/spec/tables.md | pending |
| TBL-E-7 | A pipe-bearing line directly under a table is absorbed as a table row (GFM continuation semantics) and the first edit MC1-normalizes it, dropping cells past the header column count — silent data loss accepted rather than fighting the parser. A blank line is the user's separator. | docs/spec/tables.md (2026-06-02, option A) | blessed |
| MRS-W-7 | Selection wrap inserts exactly one delimiter per side per invocation; reaching the strong `**` form requires a second wrap (no auto-double). | selection_wrap.ts | pending |
| NAV-N-5 | Caret-reveal block constructs (image, math, mermaid) register no atomic ranges; the caret enters their source range to reveal/edit rather than skipping past them. | image.ts / math.ts / mermaid.ts (relates to IMG-I-1/I-4) | pending |
| NAV-S-5 | Table cell subviews are not wired into the main-view cursor-sync listener; reported caret position falls back to the table's main-view source range while a cell subview is focused. | cursor_sync.ts (table-cell cursor precision deferred) | pending |
| SYNC-P-4 | Under `files.autoSave: afterDelay`, the dirty indicator may linger per edit; Plainmark adds no extension-side self-save to mask it (no API to suppress the indicator). | docs/spec/sync-and-persistence.md | pending |
| THEME-V-7 | Mermaid diagram interior colors come from mermaid's own theme engine, not the `--plainmark-*` surface; only the outer container variables are themable. Mirrors the construct-level MMD-E-9. | docs/spec/mermaid.md | pending |
| SHELL-X-14 | Residual scroll-jump: (1) first render of a never-measured async block widget reflows by `\|actual − reserve\|` (cold mermaid reserves a 200px default; math/image reserve only when warm — no a-priori formula); (2) during an active native-scrollbar drag the browser overwrites CM6's scroll correction (only the on-release snap is fixed; full removal needs a custom scrollbar, not pursued). Same class of bug open in Obsidian 1.12.5. | docs/spec/editor-shell.md | pending |

## Conformance-unknown — smoke to confirm (batch 2)

These `[unknown]` clauses describe composition / parser / cold-mount / live-wiring
behavior the headless unit suite does not pin. They default to *plausibly
conforming* and need a smoke check at the T29.8 close-out (those also tagged
`[smoke]` already appear in the manual-smoke list).

| Clause | What needs confirming | Status |
|---|---|---|
| CODE-E-2 | Empty inline-code span (` `` `): zero-length content mark, both fences hidden. | pending |
| CODE-E-3 | Lone/unmatched backtick run renders literally (no `InlineCode` node). | pending |
| CODE-E-4 | Inline code nested in blockquote/list still styled. | pending |
| CODE-E-5 | Cold-mount node-scoped reveal when offset 0 is outside the span. | pending |
| EMPH-I-5 | Pointer-down reveal-suppression live mouse wiring (`[smoke]`). | pending |
| EMPH-E-3 | Underscore forms `_x_`/`__x__` handled identically to asterisk forms. | pending |
| EMPH-E-4 | Emphasis nested in blockquote/list/heading still styled. | pending |
| EMPH-E-5 | Unmatched/malformed delimiters not styled. | pending |
| EMPH-E-6 | Cold-mount node-scoped reveal. | pending |
| EMPH-E-8 | Strikethrough gated on GFM (shipped parser has GFM) (`[smoke]`). | pending |
| LINK-E-6 | Link nested in blockquote/list still decorated. | pending |
| LINK-E-7 | Cold-mount node-scoped reveal. | pending |
| AUTO-E-4 | Bare URL in blockquote/list still decorated. | pending |
| AUTO-E-5 | Bare URL in ATX heading still decorated. | pending |
| AUTO-E-7 | Cold-mount angle-bracket reveal. | pending |

## Conformance-unknown — smoke to confirm (batch 3)

| Clause | What needs confirming | Status |
|---|---|---|
| IMG-I-4 | Caret/arrow behavior into the `contenteditable=false` image block widget reveals source rather than trapping the caret (`[smoke]`). | pending |
| FN-E-8 | Footnote reference inside callout/blockquote/table-cell — reveal interaction with the surrounding construct's reveal model. | pending |
| CALL-E-3 | Nested callouts (`> > [!NOTE]`) rendering. | pending |
| CALL-E-5 | Collapsed callout (`-`) actually hides its body in the live webview. | pending |

## Conformance-unknown — smoke to confirm (batch 4)

| Clause | What needs confirming | Status |
|---|---|---|
| LIST-E-5 | Multi-line-selection caret/reveal across mixed item types + list-in-container composition (`> - item`). | pending |
| CBLK-E-5 | Unrecognized/absent language renders un-tokenized monospace (no token colors). | pending |
| MATH-R-8 | Typeset-failure path: widget stays dimmed `plainmark-math-pending` (no error glyph). | pending |
| MATH-I-4 | Click on a math widget places the caret to enter edit mode. | pending |
| MMD-R-3 | Pending placeholder shows while the diagram renders. | pending |
| MMD-R-4 | Successful render contains the mermaid SVG. | pending |
| MMD-R-5 | Render-error chrome (last-good dimmed / error box), no throw. | pending |
| MMD-E-10 | Theme switch with both-theme cache swaps without a re-render flash. | pending |
