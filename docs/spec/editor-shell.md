---
prefix: SHELL
title: Editor Shell
kind: cross-cutting
---

# Editor Shell

The "shell" wires the Plainmark webview together: the host-emitted HTML scaffold
and Content-Security-Policy, the CodeMirror 6 extension assembly composed into
the single main `EditorView`, the webview bootstrap/mount, the shell-level
host↔webview message routing, command registration and `package.json`
contributions, and extension activation across the dual Node / Web host targets.

This file owns the *scaffold and wiring*, not the behaviors that ride on it:

- **Sync semantics** (whole-doc replace, echo suppression, dirty / save,
  `resolveCustomTextEditor` lifecycle subscriptions) are owned by
  `sync-and-persistence.md` (`SYNC-*`). This file describes only the message
  *routing surface* the shell registers, not the sync payload contract.
- **Caret-position sync** (`cursor_changed`) is owned by
  `caret-and-navigation.md` §S (`NAV-S-*`).
- **Marker reveal / selection** is owned by `marker-reveal-and-selection.md`
  (`MRS-*`); this file only states *that* those extensions are composed and in
  what precedence, not what they do.
- **Theming / CSS-variable surface** is owned by `theming.md`; the
  `:root` defaults `<style>`, the `plainmark.styles` user `<link>` injection,
  and the per-construct theme extensions are referenced here, not restated.
- **Host / Web code separation** is `invariants.md` `INV-HOST-1`; shell clauses
  that are that invariant are tagged `[inherits:INV-HOST-1]`.
- **Outline navigation** — the `tut1vog.plainmark.outline` TreeView, its
  `scrollToHeading` command, and the `scroll_to_heading` routing are owned by
  `outline.md` (`OUT-*`), not restated as shell contributions or routing here.

Section codes: `W` webview scaffold / CSP / nonce / resource roots · `X`
extension assembly & composition precedence · `M` shell-level message routing ·
`C` commands & `package.json` contributions · `A` activation & dual host target.

Notation in examples: `|` = caret, `→` = action/result, `\n` = literal newline.

## W — webview scaffold, CSP, nonce, resource roots

How the host (`PlainmarkEditorProvider.getHtml`) emits the webview document and
locks it down. Section code `W`.

- **SHELL-W-1** `[smoke]` — The host MUST emit a single-document HTML scaffold containing exactly one `<div id="editor">` mount point, into which the webview bootstrap mounts the CM6 `EditorView`.
  _Example:_ `getHtml` returns `<body><div id="editor"></div>…<script…>` with one editor host element.

- **SHELL-W-2** `[smoke]` — The scaffold MUST carry a `Content-Security-Policy` `<meta>` whose `default-src` is `'none'`, so nothing loads unless an explicit narrower directive re-permits it.
  _Example:_ the CSP string begins `default-src 'none'; …`.

- **SHELL-W-3** `[smoke]` — `script-src` MUST be restricted to a per-resolve nonce (`script-src 'nonce-<nonce>'`); every `<script>` tag the scaffold emits MUST carry that same `nonce` attribute, and no third-party / inline script without the nonce may execute.
  _Example:_ `<script nonce="ab12…" src="…">` loads; an injected inline `<script>` without the nonce is blocked.

- **SHELL-W-4** — The nonce MUST be generated with Web Crypto (`crypto.getRandomValues` over a 16-byte buffer, hex-encoded), never `node:crypto`, so the Web host bundle resolves. A fresh nonce MUST be generated on every `getHtml` call.
  _Example:_ `getNonce()` fills a `Uint8Array(16)` via `crypto.getRandomValues` and returns a 32-char hex string; two resolves yield different nonces.

- **SHELL-W-5** `[smoke]` — `style-src` MUST permit `'unsafe-inline'` plus `${webview.cspSource}` so the inline `:root` defaults `<style nonce>` and user `plainmark.styles` `<link>` tags load; `img-src` MUST permit `${webview.cspSource}` and `https:`; `font-src` MUST permit `${webview.cspSource}`.
  _Example:_ a relative-path image resolves under `${webview.cspSource}`; a remote `https://` image is permitted by `img-src`.

- **SHELL-W-6** — The webview's `localResourceRoots` MUST always include the extension's bundle-output directory (so the webview, MathJax, and Mermaid scripts and the bundled fonts are loadable), plus the document's directory (when the URI has a meaningful parent) and any resolved `plainmark.styles` resource roots.
  _Example:_ overriding `localResourceRoots` without the bundle-output root would 401-block the webview script; the provider always prepends `dist_uri`.

- **SHELL-W-7** — Script and asset URIs MUST be passed through `webview.asWebviewUri` rather than embedded as raw filesystem paths, so they resolve under the webview's sandboxed origin.
  _Example:_ `scriptUri = webview.asWebviewUri(…)` is interpolated into the `<script src>`.

- **SHELL-W-8** `[smoke]` — The MathJax font base URL and the Mermaid module URL + nonce MUST be injected as nonce-scoped inline bootstrap `<script>` globals (`window.__mathjax_font_url`, `window.__plainmark_mermaid`) BEFORE the MathJax and main webview scripts load.
  _Example:_ `<script nonce>window.__mathjax_font_url = "…"</script>` precedes `<script src="…">`.

- **SHELL-W-9** — The `:root` defaults `<style>` MUST precede the user `plainmark.styles` `<link>` tags in document order, and both MUST precede the script tags, so user CSS overrides defaults and CM6's runtime style insertion stays lower-precedence. (Theme cascade detail owned by `theming.md`.)
  _Example:_ `<style nonce>:root{…}</style>` then `<link data-plainmark-style …>` then `<script>` tags, in that order.

- **SHELL-W-10** — Attribute values interpolated into the scaffold (user `<link>` hrefs) MUST be escaped (`&`, `"`, `<`) before injection.
  _Example:_ a style href containing `"` is emitted as `&quot;`, not a raw quote that would break out of the attribute.

## X — extension assembly & composition precedence

How the production CM6 extension list (`editor_extensions`) is composed and
mounted by the webview bootstrap. Order and `Prec` are load-bearing. Section code `X`.

- **SHELL-X-1** — The webview MUST mount one main `EditorView` whose state is built from the exported `editor_extensions` array plus the per-context update listener and cursor-sync extension; the same `editor_extensions` array MUST be the single source of truth shared with the Tier B visual harness.
  _Example:_ `new EditorView({ state: EditorState.create({ extensions: [...editor_extensions, updateListener, cursor_sync_extension] }) })`; the Tier B visual harness imports the same `editor_extensions`.

- **SHELL-X-2** — The core extension set (`editor_extensions_core`) MUST include CM6 `history()`, `drawSelection()`, `EditorView.lineWrapping`, the markdown language (`@codemirror/lang-markdown` with `GFM` + the math / footnote / frontmatter grammar extensions), `syntaxHighlighting`, autocomplete, and the full set of per-construct decoration / widget extensions.
  _Example:_ `markdown({ codeLanguages: languages, extensions: [GFM, math_grammar_extension, footnote_grammar_extension, frontmatter_grammar_extension] })` is in the core list.

- **SHELL-X-3** — `drawSelection()` MUST be composed so CM6 draws its own caret and suppresses native selection (browser-dependent and unreliable adjacent to block-replace widgets); the selection *rectangles*, however, are drawn by the custom clipped selection layer (SHELL-X-10), while `drawSelection`'s own selection rectangles are CSS-suppressed so the two do not double-draw.
  _Example:_ the core list contains `drawSelection()`; the `.cm-cursor` border color binds to `--vscode-editorCursor-foreground`; stock `.cm-selectionBackground` is `display:none`.

- **SHELL-X-4** — Plainmark's block-construct key handlers (blockquote / list / block-autoclose Enter and Backspace exits, plus `marker_aware_backspace`) MUST be registered at `Prec.highest` so they pre-empt `@codemirror/lang-markdown`'s auto-wired `markdownKeymap` (at `Prec.high`). (Behavior of `marker_aware_backspace` is owned by `MRS-B-*`.)
  _Example:_ the `Prec.highest(keymap.of([{ key: 'Backspace', run: marker_aware_backspace }, …]))` block sits before `markdown(...)` and wins over `deleteMarkupBackward`.

- **SHELL-X-5** — Exactly ONE `autocompletion()` call MUST be composed, with all completion sources passed through its single `override` array, because CM6's completion config facet is first-defined-wins on `override` and a second call would silently drop sources.
  _Example:_ `autocompletion({ override: [table_completions, callout_completions] })` is the only `autocompletion()` in the list.

- **SHELL-X-6** — The base body typography keystone (`font-size` `var(--plainmark-font-size, 16px)`, `line-height`, prose `font-family`) MUST be set on `.cm-content` via an `EditorView.theme`, and the CM6 focus-ring outline MUST be removed (`&.cm-focused { outline: none }`). (CSS-variable surface owned by `theming.md`.)
  _Example:_ the core `EditorView.theme` sets `.cm-content { fontSize: var(--plainmark-font-size, 16px); … }` and `&.cm-focused { outline: none }`.

- **SHELL-X-7** — The prose-column constraint (`prose_column_theme`) and the table widget extensions (`table_extension`, `table_undo_rebase`, the table-entry keymap) MUST be appended AROUND `editor_extensions_core`, and the cell-subview facet MUST be seeded with `editor_extensions_core` (NOT the full list) so table cell subviews render with the same core extensions minus the prose-column / table machinery.
  _Example:_ `editor_extensions = [...editor_extensions_core, prose_column_theme, table_extension, …, cell_subview_extensions.of(editor_extensions_core)]`.

- **SHELL-X-8** `[smoke]` — Mounting the production extension list MUST instantiate a working editor without throwing; the assembled view MUST be exposed on `window.__plainmark_view` for webview-DevTools diagnostics.
  _Example:_ after boot, `window.__plainmark_view` is the live `EditorView`.

- **SHELL-X-9** `[smoke]` — CM6's stock `drawSelection()` derives one selection-rectangle horizontal bound (`leftSide`/`rightSide`) from the FIRST visible `.cm-line`'s padding (`@codemirror/view`'s `rectanglesForRange`), so a differently-padded block would misalign — the reason Plainmark draws selection rectangles via the custom clipped layer (SHELL-X-10) instead. The clipped layer derives every rectangle edge from `view.coordsAtPos` (each row's left edge is the measured glyph coord at that row's start), so block-style blocks with real interior `padding` (fenced code, frontmatter, HTML) and an indented block at the viewport top both align. The bar-style net-to-zero hanging indent (BQ-R-12, CALL-R-10, list) positions content at the editor content-left for layout. (Upstream CM6 declined per-line clipping: CM5 #4791, CM6 dev #1096.)
  _Example:_ select across a plain paragraph and a `> [!NOTE]` callout, or within a fenced code block scrolled to the viewport top → every line's highlight left x tracks that line's own text content-left.

- **SHELL-X-10** `[smoke]` — Plainmark MUST draw multi-line selection highlights with a custom selection `layer()` (`clipped_selection_layer`, in `editor_extensions_core`), with `drawSelection`'s own selection rectangles CSS-suppressed (`.cm-selectionBackground { display:none }`) and its caret layer retained. The layer splits each non-empty selection range at logical-line boundaries, then subdivides each logical-line segment into its visual (wrapped) rows. Every rectangle edge MUST be derived from `view.coordsAtPos` in the SAME `getBoundingClientRect` client-coordinate space as the layer origin (mirroring CM6's private `getBase`), NOT from `rectanglesForRange` / `RectangleMarker.forRange`, whose mix of zoom-scaled `getBoundingClientRect` values and unscaled `getComputedStyle` padding misplaces row edges at fractional device-pixel ratios. Each row's left edge is the measured glyph coord at the row start (tracking the line's own content-left, hanging indents included); interior wrapped rows extend to the content-column right edge while the segment's final visual row clips to its text/selection end, so a selected glyph is never left unhighlighted at any DPR. An inline replace-widget whose rendered box itself wraps across visual rows (inline math does, via the `mjx-break` boxes MathJax inserts at relations/operators, which break the formula even under the container's `white-space: nowrap`) replaces a single atomic `$…$` range that offers no document position at the wrapped row's left edge, so the position-based walk seeds that row after the widget and would leave its wrapped continuation unhighlighted; each selection row rectangle MUST therefore be extended to engulf the wrapped-widget box sharing its visual row. Engulfing never covers an unselected widget, because a rendered inline widget overlapped by a selection is always strictly covered by it — any partial overlap reveals the raw source instead (MATH-I-1) — so a rendered widget box abutting a selection row is necessarily fully selected. Visual-row membership MUST be determined by strict vertical-interval overlap with a non-degenerate seed caret rect, NOT by top-equality-within-epsilon: one row legitimately mixes inline box heights and tops (task-checkbox replace widget, `font-size: 0` hidden-marker span, text), and top-comparison splits such a row font-dependently into spurious full-width "wrapped rows" that double-paint over the final clipped rectangle. A zero-height caret rect (a `font-size: 0` span collapses to a point on the baseline) MUST NOT seed a row — the row walk skips degenerate positions — and each row's rectangle MUST cover the vertical union of the row's sampled start/end boxes (guarded to the seed's row at wrap boundaries), so a row seeded by a shorter box still paints at full text height. A blank selected line (empty OR whitespace-only) MUST draw one uniform fixed-width thin stub (a fraction of a character, thinner than any text line) so lines differing only in trailing whitespace do not get different selection widths; a selection ending exactly at a line break paints nothing on that final line. Because the layer lives in the core list, table cell subviews render identically.
  _Example:_ select `ddfd\nd` from the start of line 1 into line 2 → line 1's highlight clips at the `d` of `ddfd`; selecting a paragraph that wraps to three rows highlights the first two rows full-width to the content edge and clips the third at its last glyph, with every row's left edge flush to the text; selecting across three `- [ ] …` task items paints exactly one full-text-height rectangle per line covering checkbox and text — never a separate band per inline-box height.

- **SHELL-X-11** — CM6's `drawSelection()` ships a `Prec.highest` rule (`hideNativeSelection`) that re-enables the opaque system `Highlight` color for native `::selection` inside any *focused descendant* of `.cm-content` (`.cm-content :focus ::selection`). A table cell subview is exactly such a descendant, so without intervention its selection paints opaque `Highlight` over the translucent clipped layer (SHELL-X-10) — diverging from the main view, whose `.cm-content` holds focus directly and never trips the rule. `editor_extensions_core` MUST re-hide native selection for nested focused content with a `Prec.highest`, higher-specificity `!important` rule (`.cm-content .cm-content:focus ::selection { background-color: transparent !important }`), leaving the clipped layer the only selection paint so cell-subview selection matches outside-table selection.
  _Example:_ select text inside a table cell → the highlight is the same translucent `--vscode-editor-selectionBackground` as selecting outside the table, not the opaque system `Highlight`.

- **SHELL-X-12** `[smoke]` — The webview MUST make CM6's own `.cm-scroller` the scroll container, NOT the page body: the scaffold MUST height-bound `html, body, #editor` (in `ROOT_DEFAULTS_CSS`) and the composition MUST add a theme giving `.cm-editor` `height: 100%` and `.cm-scroller` `overflow: auto`, at `Prec.lowest` so an explicit height (a user stylesheet, or a height-constraining test harness) still overrides it. CM6's scroll-stabilization measure loop runs only when it owns the scroller (`scroll == scrollDOM || hasFocus || a recent wheel event`); with the body scrolling, a native scrollbar drag with no prior editor focus gets no stabilization and the height-map correction snaps the viewport back on release. Main view only — `scroller_theme` is appended to `editor_extensions`, NOT `editor_extensions_core`, so table cell subviews keep their natural content height.
  _Example:_ fast-drag the scrollbar through a long document and release → the viewport stays where dragged instead of flashing back to a stale position.

- **SHELL-X-13** `[smoke]` — Variable / async-height block widgets (math, mermaid, image, table) MUST seed CM6's height map instead of defaulting to one line-height (`WidgetType.estimatedHeight === -1`), so off-screen content the user scrolls past is sized roughly right. Each MUST return a measured height from a shared source-keyed cache (populated from `getBoundingClientRect` after render / image load) once warm; while cold, a table MUST estimate a-priori from `row_count × ~37px` and mermaid MUST use a conservative 200px default. Async widgets (math, mermaid) and the image widget MUST reserve that height as their placeholder `min-height` so the resolved content lands without reflowing content below it.
  _Example:_ scroll into a region of mermaid diagrams a second time → they appear at their reserved height with no downward shove of the text below.

- **SHELL-X-14** `[accepted]` — Two scroll-jump residuals are accepted. (1) The FIRST render of a never-measured async widget still reflows by `|actual − reserve|`: mermaid has no a-priori height formula, so a cold diagram reserves the 200px default and shifts by the difference once measured (math / image reserve only when warm). (2) DURING an active native-scrollbar drag the browser overwrites CM6's per-frame scroll correction (browser physics — only a custom JS scrollbar would remove it); SHELL-X-12 fixes only the on-release snap. Matches the broader CM6 ecosystem — the same class of bug is open in Obsidian 1.12.5.
  _Example:_ open a large document and immediately fast-drag into an unread region of large diagrams → it may shift once as those diagrams first measure; a second pass is stable.

- **SHELL-X-15** `[smoke]` — The webview MUST stabilize CM6's height-oracle line-height so a tall line can never become its sample: a `ViewPlugin` (`oracle_line_height_pin`, appended to `editor_extensions`, main view only — NOT `editor_extensions_core`) MUST override `docView.measureTextSize` to return CM6's own synthetic-line (body-height) fallback, pinning `oracle.lineHeight`/`charWidth`/`textHeight` to the body measurement (cached, invalidated on `geometryChanged`). CM6 otherwise samples the FIRST short (≤20-char), all-text, printable-ASCII rendered line as the document-wide `oracle.lineHeight`; a revealed heading or callout title is exactly such a line and is tall, so as the viewport crosses between tall and prose regions the sample flips, a >0.3px change makes `HeightOracle.refresh` rebuild the entire height map from the new average, the estimated total swings ~2000px, the viewport relocates bistably, and the measure loop bails mid-correction ("Measure loop restarted more than 5 times") — the visible snap. The override MUST install lazily (plugin values are created before `docView` exists) and MUST degrade to a safe no-op if the internal method is renamed in a future CM6. Resolves the snap still open in Obsidian #112103.
  _Example:_ cold-load a long document with a Mermaid block and scroll the diagram into view → the viewport stays put with no "Measure loop restarted" console warning, instead of snapping back to before the diagram.

## M — shell-level message routing

The host↔webview message *routing* the shell registers. The sync payload
semantics are owned by `sync-and-persistence.md`. Section code `M`. The
webview→host types are `ready`,
`update`, `cursor_changed`, `link_click`, `style_load_error`, `table_edit_error`;
the host→webview types are `sync`, `insert_table`, `insert_footnote`, `style_reload`.

- **SHELL-M-1** — The webview MUST install a single `window` `message` listener that dispatches by `msg.type`, ignoring any payload that is not an object, and MUST route `sync`, `insert_table`, `insert_footnote`, and `style_reload` to their respective handlers.
  _Example:_ a `{ type: 'insert_table' }` message → `insert_table_at_caret(view)`; a malformed non-object payload → ignored.

- **SHELL-M-2** — On the host side, `onDidReceiveMessage` MUST give the shell-owned sideband handlers (`link_click`, `style_load_error`, `table_edit_error`) first refusal before forwarding to the sync loop; a message consumed by a sideband handler MUST NOT reach `loop.handle_webview_message`.
  _Example:_ a `{ type: 'link_click', href }` is handled by `try_handle_link_click` and returns before the sync loop sees it.

- **SHELL-M-3** — A `link_click` with an RFC-3986 scheme MUST be opened with `vscode.env.openExternal`; a document-relative href MUST be resolved against the document directory and opened with `vscode.open`; a bare `#fragment` MUST be ignored; a relative href on a parentless (e.g. `untitled:`) document MUST be dropped.
  _Example:_ `link_click` `https://x` → `openExternal`; `./img.png` → `vscode.open(joinPath(docDir,'./img.png'))`; `#sec` → ignored.

- **SHELL-M-4** — The webview MUST translate a DOM `plainmark-link-click` CustomEvent into a `link_click` host message, dropping events with an empty href.
  _Example:_ a link widget dispatches `plainmark-link-click` with `{ href }` → webview posts `{ type: 'link_click', href }`.

- **SHELL-M-5** `[smoke]` — On a user `plainmark.styles` `<link>` failing to load (detected via the `error` listener or a null `link.sheet` after `window.load`), the webview MUST post `style_load_error` exactly once per href, and the host MUST surface it as a warning message.
  _Example:_ a 404 stylesheet → webview posts `{ type: 'style_load_error', href }` once → host shows "failed to load style …".

- **SHELL-M-6** — On the `ready` handshake, the webview MUST post `{ type: 'ready' }` after constructing the view; the host's response (`sync` of the document) is owned by `sync-and-persistence.md` (`SYNC-H-7`).
  _Example:_ end of webview-bootstrap boot → `post_message({ type: 'ready' })`.

- **SHELL-M-7** `[inherits:INV-SP-1]` — Shell-level message routing MUST be transport only; routing a message MUST NOT itself mutate document bytes outside the construct the user is editing (mutation, if any, happens in the routed handler under its own construct's contract).
  _Example:_ routing `insert_table` invokes the table-insert command at the caret; no other bytes change.

- **SHELL-M-8** `[smoke]` — The webview MUST translate a DOM `plainmark-table-edit-error` CustomEvent into a `table_edit_error` host message, posting at most once per distinct reason string, and the host MUST surface it as an error notification. The failure's byte guarantee is owned by `TBL-E-12`.
  _Example:_ a table edit-path catch dispatches `plainmark-table-edit-error` with `{ reason }` → webview posts `{ type: 'table_edit_error', reason }` once → host shows "Plainmark: a table edit could not be applied and was discarded (…)".

## C — commands & package.json contributions

Command registration in the host provider and the `contributes` block in
`package.json`. Section code `C`. Every command below is verified to be both
declared in `package.json` `contributes.commands` AND registered via
`vscode.commands.registerCommand` in `PlainmarkEditorProvider.register`.

- **SHELL-C-1** `[smoke]` — The extension MUST contribute a `customEditors` entry with `viewType` `tut1vog.plainmark`, selecting `*.md` and `*.markdown`, at `priority: "option"` (so it does not seize markdown files from the default text editor).
  _Example:_ opening a `.md` file offers Plainmark via "Reopen Editor With…", not as the forced default.

- **SHELL-C-2** — The provider MUST register the custom editor with `register(context)` returning a single composite `Disposable` aggregating the editor registration and every contributed command, so deactivation disposes them together.
  _Example:_ `vscode.Disposable.from(editor, noop_undo, noop_redo, insert_table, insert_footnote, open_in_text_editor, open_in_plainmark)`.

- **SHELL-C-3** `[smoke]` — `tut1vog.plainmark.insertTable` MUST be registered and, when invoked, MUST post `{ type: 'insert_table' }` to the active Plainmark panel's webview.
  _Example:_ Command Palette → "Plainmark: Insert table" → active panel receives `insert_table`.

- **SHELL-C-4** `[smoke]` — `tut1vog.plainmark.insertFootnote` MUST be registered, post `{ type: 'insert_footnote' }` to the active panel, and be bound to `ctrl+shift+6` / `cmd+shift+6` when `activeCustomEditorId == 'tut1vog.plainmark'`.
  _Example:_ Cmd+Shift+6 in a Plainmark tab → active panel receives `insert_footnote`.

- **SHELL-C-5** — `tut1vog.plainmark.noop_undo` and `tut1vog.plainmark.noop_redo` MUST be registered as inert commands and bound (via `keybindings`, `when: activeCustomEditorId == 'tut1vog.plainmark'`) to the platform undo/redo chords, to muzzle the workbench undo/redo while Plainmark is active. (Undo-ownership rationale owned by `INV-UNDO-2` / `SYNC-H-6`.)
  _Example:_ Ctrl+Z in a Plainmark tab fires `noop_undo` (a log-only no-op); CM6 owns the actual undo.

- **SHELL-C-6** `[smoke]` — `tut1vog.plainmark.openInTextEditor` MUST be registered, contributed to `editor/title` and a keybinding, gated by the `tut1vog.plainmark.editorIsActive` context key, and MUST toggle the active document to the built-in text editor (`vscode.openWith … 'default'`) then close the Plainmark source tab.
  _Example:_ title-bar `$(code)` button in a Plainmark tab → the same document opens in the default text editor and the Plainmark tab closes.

- **SHELL-C-7** `[smoke]` — `tut1vog.plainmark.openInPlainmark` MUST be registered, contributed to `editor/title` and a keybinding gated by `(resourceExtname == .md || resourceExtname == .markdown) && activeCustomEditorId == ''`, and MUST toggle a markdown text editor to Plainmark (`vscode.openWith … viewType`) then close the source text tab. The gate keys on file extension, NOT `resourceLangId == markdown`, so the button stays present when VS Code assigns a markdown-syntax `.md` file a non-`markdown` language (e.g. the chat **Instructions** / prompt-file languages on `.md` files under a configured instructions-files location) — matching the file set the `customEditors` `*.md` / `*.markdown` selector already opens.
  _Example:_ title-bar Plainmark icon button (SHELL-C-11) on a `.md` text editor — including one VS Code labels as the **Instructions** language — opens in Plainmark and closes the text tab.

- **SHELL-C-8** — The `tut1vog.plainmark.editorIsActive` context key MUST be maintained via `setContext` and refreshed on view-state changes and panel disposal, so the `openInTextEditor` menu/keybinding `when` clause is accurate.
  _Example:_ focusing a Plainmark panel sets `editorIsActive` true; closing the last Plainmark panel sets it false.

- **SHELL-C-9** — The extension MUST contribute a `plainmark.styles` array configuration (resource scope) whose changes are observed per-document by the provider; the config-change reload behavior is owned by `sync-and-persistence.md` (`SYNC-P-12`).
  _Example:_ `contributes.configuration` declares `plainmark.styles` with `scope: "resource"` and `default: []`.

- **SHELL-C-10** — The active-panel resolver MUST prefer the last-active visible panel and fall back to scanning tracked panels for an active+visible one, so command dispatch (`insertTable` / `insertFootnote`) targets the correct webview when multiple Plainmark tabs are open.
  _Example:_ with two Plainmark tabs, `insertTable` posts to the focused one, not the first-registered one.

- **SHELL-C-11** `[smoke]` — The `openInPlainmark` `editor/title` contribution MUST use Plainmark's own light/dark SVG icon pair, NOT a built-in preview codicon, so the button is visually distinct from VS Code's built-in markdown preview buttons sharing the same title bar; both SVGs MUST ship in the packaged VSIX.
  _Example:_ a `.md` text editor's title bar shows the built-in preview codicons and Plainmark's "P↓" mark side by side, visually distinct; `vsce ls` includes both icon SVGs.

## A — activation & dual host target

Extension activation entry points and the dual Node / Web bundles. Section code
`A`. The host-no-Node-builtins constraint is `INV-HOST-1`.

- **SHELL-A-1** `[build]` — The package MUST declare BOTH a Node entry (`main`) and a Web entry (`browser`), so the extension activates on VS Code Desktop and on vscode.dev / github.dev.
  _Example:_ `package.json` declares a `main` entry and a `browser` entry.

- **SHELL-A-2** `[build]` — The build MUST emit three bundles: the Node host (esbuild `platform: 'node'`, `format: 'cjs'`, `external: ['vscode']`), the Web host (`platform: 'browser'`, `format: 'cjs'`), and the shared webview (browser target).
  _Example:_ the build script declares the Node-host entry → Node-host bundle (node) and the Web-host entry → Web-host bundle (browser) plus the webview-bootstrap entry → webview bundle.

- **SHELL-A-3** `[build]` `[inherits:INV-HOST-1]` — The Node and Web activation entry points and all host-side modules MUST NOT import Node built-ins; the browser-target bundle enforces this at bundle time via `build:check`.
  _Example:_ adding `import { readFileSync } from 'node:fs'` to the host provider fails the Web build.

- **SHELL-A-4** — Both activation entry points MUST activate by pushing `PlainmarkEditorProvider.register(context)` onto `context.subscriptions`; the two entry points MUST share the same provider implementation.
  _Example:_ each `activate(context)` calls `context.subscriptions.push(PlainmarkEditorProvider.register(context))`.

- **SHELL-A-5** `[smoke]` — Activation MUST NOT throw and MUST emit zero `console.error` during cold boot on the Web host; opening a `.md` document with `vscode.openWith` MUST NOT throw.
  _Example:_ T28.8 web-smoke: extension activates, the `console.error` spy stays zero, `vscode.openWith('.md')` resolves.

- **SHELL-A-6** `[build]` — `activationEvents` MUST be empty; activation is driven implicitly by the `customEditors` contribution (resolving a Plainmark editor activates the extension).
  _Example:_ `package.json` `"activationEvents": []`; opening a Plainmark editor triggers `activate`.

- **SHELL-A-7** `[build]` — The Web host bundle MUST be emitted with a `.cjs` extension even though `package.json` `type` is `module`, because the web-worker extension host loads any non-`.cjs` path as ESM and then throws "ESM modules are not supported".
  _Example:_ the web bundle uses a `.cjs` extension (as does the integration web suite), per T28.8.

- **SHELL-A-8** `[smoke]` — On the Node host, after `openWith`, the document MUST be clean (`isDirty == false`); an `applyEdit` MUST mark it dirty and `getText()` MUST reflect the edit; and `executeCommand('undo')` MUST be a no-op while Plainmark is the active custom editor.
  _Example:_ T28.7 host-smoke asserts the open→edit→undo-muzzle sequence on the Electron host.
