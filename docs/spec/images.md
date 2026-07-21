---
prefix: IMG
title: Images
kind: construct
---

# Images — Specification

Normative behavior for markdown image rendering, interaction, and byte
guarantees. Covers the standalone inline-syntax image `![alt](url)` when it is
the sole content of a LINE of a top-level paragraph; that line promotes to a
block `Decoration.replace` widget (the lezer `Image` node lives inside the
paragraph — line-scoped promotion, ADR-0013; an image-only paragraph is the
single-line special case). Does NOT cover links `[text](url)` (`links.md`,
prefix LINK) or autolinks (`autolinks.md`, prefix AUTO).

Reference-style images (`![alt][ref]` + a link-reference definition) are NOT
supported and are specified as an edge case (IMG-E-4).

The image widget is a StateField block widget (one of image / math / table),
distinct from the ViewPlugin inline/line scaffold. It is wired into the
production editor: `image_extension` is in `editor_extensions_core`, the host
computes a per-document base URI and posts it, and the webview entry point
dispatches `set_image_base_effect` after view construction.

Example notation: `|` = caret, `→` = action/result, `\n` = newline (see README §2).

## R · Rendering

- **IMG-R-1** — The image extension (`image_extension` = `image_base_field` + `image_widgets_field` + `image_theme`) MUST be registered in the production editor's extension set. It is included in `editor_extensions_core`, so it runs in both the live webview and the Tier B harness.
  _Example:_ opening a document whose sole paragraph is `![alt](https://cdn/x.png)` renders an `<img>`, not the raw `![…]` source.

- **IMG-R-2** — Each doc line of a top-level paragraph whose only non-whitespace content is a single `Image` node confined to that line MUST be replaced by a block widget spanning the line range `[line.from, line.to)` (ADR-0013; CommonMark lazy continuation merges adjacent lines into one paragraph, so an image directly against a text line is a paragraph child — it still promotes, scoped to its own line). The replace decoration MUST carry `block: true`. An `Image` wrapping across lines MUST NOT promote.
  _Example:_ `![alt](cover.png)\n` → one `Decoration.replace({block:true})` over offsets `[0, 17)`; `text\n![alt](cover.png)` (one merged paragraph) → the image line alone promotes, `text` stays an ordinary line.

- **IMG-R-3** — The paragraph MUST be a direct child of the `Document` node to promote; an `Image` nested in any other block (list item, blockquote, …) MUST NOT promote.
  _Example:_ `- ![alt](cover.png)` and `> ![alt](cover.png)` each emit no image widget.

- **IMG-R-4** `[smoke]` — The widget DOM MUST be a `div.plainmark-image-block` containing a single `<img>` whose `src` is the resolved URL and whose `alt` is the parsed alt text.
  _Example:_ `![cover](cover.png)` → `<div class="plainmark-image-block"><img src="https://…/cover.png" alt="cover"></div>`.

- **IMG-R-5** — The alt text MUST be parsed from the literal source between `![` and the closing `]` via the regex `/^!\[((?:[^\]\\]|\\.)*)\]/u`, supporting backslash escapes inside the brackets; when no match is found the alt MUST default to the empty string.
  _Example:_ `![a\]b](x.png)` → alt `a\]b`; `![](x.png)` → alt `""`.

- **IMG-R-6** — The image URL MUST be the effective destination of the `Image` node's child `URL` node — same stripping rule as LINK-R-3 (ADR-0008); a paragraph whose `Image` has no `URL` child MUST NOT promote.
  _Example:_ `![alt](cover.png)` → url `cover.png`; `![alt](<img a.png>)` → url `img a.png`; an `Image` with an empty `()` and no `URL` node emits no widget.

- **IMG-R-7** — URL resolution MUST pass absolute `http://` / `https://` URLs through unchanged; a relative URL MUST resolve against the image base via `new URL(raw, base)`; a relative URL with a `null` base MUST resolve to `null`. A `null` resolution MUST suppress the widget (no broken `<img>` is emitted).
  _Example:_ base `https://example.com/notes/`: `./cover.png` → `https://example.com/notes/cover.png`; `https://cdn/x.png` → unchanged; `cover.png` with base `null` → no widget.

- **IMG-R-8** `[smoke]` — The `<img>` MUST be styled `display:block; margin:0 auto` (horizontally centered) with `max-width: var(--plainmark-image-max-width, 100%)` and `max-height: var(--plainmark-image-max-height, none)`; the container MUST have `margin:0`.
  _Example:_ a wide image is capped to the editor content width and centered; a theme may shrink it via `--plainmark-image-max-width`.

- **IMG-R-9** `[smoke]` — Image sizing MUST resolve from the `:root` defaults `--plainmark-image-max-width` (default `100%`) and `--plainmark-image-max-height` (default `none`), declared in `ROOT_DEFAULTS_CSS` and consumed only by the image widget.
  _Example:_ with no theme override, images cap at `100%` of the content column with no height cap.

- **IMG-R-10** — Multiple qualifying image-only paragraphs in one document MUST each emit their own block widget.
  _Example:_ `![a](1.png)\n\n![b](2.png)\n` → two widgets, urls `1.png` and `2.png`.

- **IMG-R-11** `[smoke]` — An image widget replacing any line other than doc line 1 MUST carry `plainmark-block-gap-above`, taking the paragraph gap (`var(--plainmark-paragraph-gap, 0.75em)`) as widget padding-top — the image container has no breathing of its own, so the gap is the whole padding (PARA-R-7 / ADR-0010; mirrors the table and block-math widgets). A doc-top image takes none. The in-flow preview (IMG-I-11) never takes it — the revealed source line above it carries its own gap. `gap_above` participates in `ImageWidget.eq`, so an edit moving the image across the doc-top boundary redraws the widget.
  _Example:_ `hello\n![alt](cover.png)` → the rendered image sits one prose gap below `hello`; the same image as the document's first line sits flush at the top.

## I · Interaction

- **IMG-I-1** — When the canonical reveal predicate (`should_reveal_for_selection`, MRS-R-2…R-5: any selection range touching the image's LINE range reveals, EXCEPT a non-empty selection strictly covering it on both sides; pointer-down evaluates the frozen pre-press selection) holds for the image line's range, the replace widget MUST NOT be emitted, revealing the raw `![alt](url)` source for editing — with an in-flow preview below it (IMG-I-11, ADR-0013). Reveal is keyed to the image's line, so a caret on a sibling line of the same merged paragraph keeps the widget rendered. Unified via DEF-7 (2026-06-12): select-all keeps the image rendered; a drag entering the image does not flash raw source mid-drag.
  _Example:_ `![alt](cover.png)` with the caret placed at offset 3 → the widget disappears and the raw source `![alt](cover.png)` is shown and editable (preview below); in `text\n![alt](cover.png)`, a caret inside `text` keeps the image widget; Ctrl+A keeps the image rendered.

- **IMG-I-2** — Decorations MUST be rebuilt whenever the document changes, the selection changes, the image base changes (`set_image_base_effect`), or the pointer-freeze fields flip (MRS-R-7); otherwise the prior decoration set is reused.
  _Example:_ moving the caret off an image paragraph re-promotes it to a widget on the next transaction.

- **IMG-I-3** — The image base MUST be supplied by the host: the host computes the document's directory webview URI (`asWebviewUri(joinPath(document.uri, '..'))`, trailing-slash-normalized) for `file`-scheme documents and `null` otherwise, posts it in the bootstrap payload, and the webview entry point dispatches `set_image_base_effect.of(document_dir_webview_uri ?? null)` after view construction. `localResourceRoots` MUST include the document directory and, when the document belongs to a workspace folder, that workspace folder, so the webview can load both document-relative images and other images stored within the workspace.
  _Example:_ a `file`-scheme document in `…/notes/` containing `![](cover.png)` resolves the image against `vscode-webview://…/notes/` and renders; the same doc opened as an untitled (non-`file`) buffer gets a `null` base and the relative image does not render.

- **IMG-I-4** `[smoke]` `[unknown]` — A block `Decoration.replace` widget is `contenteditable=false`; placing the caret adjacent to it and arrowing into its range MUST reveal the source via IMG-I-1 rather than trapping the caret. Confirming the live caret/arrow behavior requires a smoke check.
  _Example:_ ArrowDown from the line above into the image line moves the selection onto the paragraph range, which reveals the source.

- **IMG-I-5** `[accepted]` — No image-specific keybinding, click handler, command, or drag-and-drop affordance ships, and the rendered widget stays a plain non-interactive `<img>` (no click-to-edit, no alt-text editor, no resize handle). Pasting an image from the clipboard is the sole insertion affordance (IMG-I-6); click, keybinding, command, and drag-drop remain deferred.
  _Example:_ clicking the rendered image does nothing image-specific and there is no "insert image" command; pasting a screenshot does insert one.

- **IMG-I-6** `[smoke]` — When one or more image blobs are present on the clipboard at paste time, the paste handler MUST suppress the default paste, read each blob's bytes and MIME type, and request a host-side save; on a successful save it MUST insert `![](relative-path)` with empty alt text at the caret. The inserted path MUST be the saved file's location expressed relative to the document's folder, so it resolves through the image base (IMG-I-3, IMG-R-7). When no image blob is present (plain text or a URL only), paste MUST fall through to default handling — no remote image is downloaded or localized.
  _Example:_ pasting a screenshot into a saved document writes a file and inserts `![](image-20260621-101500.png)`; pasting a copied URL inserts the URL text unchanged.

- **IMG-I-7** — The save location MUST come from the `plainmark.imagePasteLocation` setting (default `.`, the document's own folder). The value MAY use `${documentWorkspaceFolder}` (the document's workspace-folder root) and `${documentBaseName}` (the document's file name without extension). A relative value MUST resolve against the document's folder; `${documentWorkspaceFolder}` MUST resolve against the workspace root and MUST fall back to the document's folder when the document is not inside a workspace.
  _Example:_ `${documentWorkspaceFolder}/assets` saves every pasted image under the workspace `assets` folder; `assets/${documentBaseName}` gives each note its own image folder beside it.

- **IMG-I-8** `[smoke]` — When the target file system is not writable — an untitled buffer, a window with no folder open, or any document scheme reporting `isWritableFileSystem` false — the host MUST NOT attempt a write; it MUST reply with an error and surface an actionable message ("Save this document to a folder before pasting images"). A data-URI fallback is explicitly deferred as a possible later opt-in.
  _Example:_ pasting an image into an unsaved (untitled) buffer inserts nothing and shows the "save this document to a folder" warning.

- **IMG-I-9** — Saved files MUST be named `image-YYYYMMDD-HHMMSS.<ext>`, where `<ext>` derives from the blob's MIME type (png by default; jpeg, gif, and webp respected). A name collision MUST NOT overwrite an existing file; the host MUST append `-2`, `-3`, … to the base name until it is free.
  _Example:_ two pastes within the same second produce `image-20260621-101500.png` and `image-20260621-101500-2.png`.

- **IMG-I-10** — A single paste carrying multiple image blobs MUST save each blob to its own file and insert one `![](relative-path)` per line, in clipboard order.
  _Example:_ pasting two images at once writes two files and inserts two `![](…)` lines.

- **IMG-I-11** `[smoke]` — Whenever IMG-I-1 reveals an image line's source, in place of the replace widget the field MUST emit a `block: true` in-flow preview widget (`div.plainmark-image-block-preview`, `side: 1`) anchored at the line's end, rendering the same resolved image below the editable source — the picture never disappears while the path or alt text is edited (ADR-0013; mirrors the block-math preview, MATH-I-6). The preview tracks edits live (each keystroke rebuilds it against the current path — no debounce), applies the same `<img>` styling as the replace widget (IMG-R-8), shows the broken-image placeholder on load failure (IMG-E-6), and is suppressed exactly when the replace widget would be (unresolvable URL, IMG-R-7).
  _Example:_ caret inside `![alt](cover.png)` → the raw source renders with the image below it; editing `cover.png` → `cover2.png` swaps the preview to the new file; moving the caret off the line re-renders the replace widget.

## SP · Source preservation

- **IMG-SP-1** `[inherits:INV-SP-1]` — Image rendering MUST be decoration-only: a view-layer `Decoration.replace` over the paragraph range with no document edit. The widget MUST NOT re-serialize, normalize, or rewrite any source byte (only the table widget may rewrite source). The `![alt](url)` source is preserved verbatim and re-exposed unchanged on cursor-on-line reveal.
  _Example:_ `![ alt ](./Cover.PNG?v=2)` opened and closed without edits saves byte-identical; revealing it shows exactly those bytes.

- **IMG-SP-2** `[inherits:INV-SP-1]` — Bytes outside the image paragraph's range MUST be preserved verbatim across any image rendering or reveal.
  _Example:_ in `intro\n\n![a](x.png)\n\noutro`, promoting/revealing the image leaves `intro` and `outro` byte-identical.

- **IMG-SP-3** `[inherits:INV-SP-1]` — The caret insertion of `![](relative-path)` on paste MUST be a single ordinary editor transaction that adds only the link text at the caret; every byte outside the inserted range MUST be preserved verbatim. Writing the image file is a file-system side effect, never a source rewrite, so no other source byte may change.
  _Example:_ pasting an image at the end of `intro\n` yields `intro\n![](image.png)` with `intro\n` byte-identical and nothing else rewritten.

## E · Edge cases

- **IMG-E-1** — A line mixing an image with text on the SAME line MUST NOT promote; it is left as raw source. Text on OTHER lines of the same merged paragraph does not block promotion (ADR-0013, line-scoped — see IMG-R-2).
  _Example:_ `Hello ![alt](cover.png) world` → no widget, the whole line stays raw; `Hello\n![alt](cover.png)` → the image line promotes.

- **IMG-E-2** — A line containing two or more images MUST NOT promote (each image sees the other in its line gap — non-whitespace aborts). Image-only lines promote independently, so adjacent image-only lines in one merged paragraph each emit their own widget (ADR-0013).
  _Example:_ `![a](1.png) ![b](2.png)` → no widget; `![a](1.png)\n![b](2.png)` → two widgets.

- **IMG-E-3** — Leading or trailing non-whitespace around the image on its line MUST abort promotion of that line; only whitespace gaps are tolerated (`sliceString(...).trim().length > 0` check against the line bounds).
  _Example:_ `x ![a](1.png)` and `![a](1.png) .` → no widget; `  ![a](1.png)  ` (whitespace only) → widget.

- **IMG-E-4** `[accepted]` — Reference-style images (`![alt][ref]` with a separate link-reference definition) are NOT supported; detection requires a direct `URL` child of the `Image` node, which the reference form lacks, so it MUST NOT promote and is left as raw source.
  _Example:_ `![alt][cover]\n\n[cover]: cover.png` → no widget; raw source shown.

- **IMG-E-5** — An image whose alt text is empty MUST still promote (alt defaults to `""`); emptiness of alt MUST NOT block rendering.
  _Example:_ `![](https://cdn/x.png)` → widget with `alt=""`.

- **IMG-E-6** — When the `<img>` fails to load (missing file, 404, or an undecodable source), the widget (replace widget or in-flow preview, IMG-I-11) MUST replace it with a broken-image placeholder: the container gains the `plainmark-image-broken` class and holds a broken-image icon, an "Image not found" label, and the image's source path. A bare broken `<img>` — especially with the empty alt that pasted images carry — otherwise collapses to an invisible block in the webview. There is still no loading/spinner state, and a load failure MUST NOT alter source bytes.
  _Example:_ `![](missing.png)` whose file is absent renders the placeholder box showing `missing.png`, not an empty block; clicking it reveals the source for editing.

- **IMG-E-7** — Changing the image base (`set_image_base_effect`) MUST re-resolve relative URLs and rebuild the affected widgets; `ImageWidget.eq` compares `alt`, `url`, and `resolved_src`, so a base change that alters `resolved_src` MUST produce a new widget instance.
  _Example:_ base `https://a/` → `https://b/dir/`: `![x](cover.png)` re-resolves `resolved_src` from `https://a/cover.png` to `https://b/dir/cover.png`.

- **IMG-E-8** `[accepted]` — Only the inline `![alt](url)` form is recognized via the lezer `Image` node; no `title` attribute (`![alt](url "title")`) is parsed or applied — the alt regex and the `URL` child are the sole inputs, and any title segment is ignored for rendering purposes.
  _Example:_ `![a](x.png "My title")` → widget with `alt="a"`; the `"My title"` is not surfaced.

- **IMG-E-9** `[accepted]` — A non-`file`-scheme document (untitled buffer, virtual FS) yields a `null` image base, so every relative-URL image in it MUST NOT render (resolves to `null`, IMG-R-7); absolute `http(s)` images in the same document still render.
  _Example:_ in an untitled buffer, `![](cover.png)` shows raw source while `![](https://cdn/x.png)` renders.
