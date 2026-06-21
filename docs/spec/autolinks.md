---
prefix: AUTO
title: Autolinks
kind: construct
---

# Autolinks — Specification

Normative behavior for the two autolink forms Plainmark recognizes: the
CommonMark angle-bracket autolink (`<https://example.com>`, `<user@host>`) and
the GFM bare/extended autolink (raw `https://example.com`, bare `www.`, bare
email, `mailto:`, `xmpp:`). These are a separate construct from Markdown links
(`[text](url)`, prefix `LINK` in `links.md`), images (`![alt](url)`), and
footnotes — but they live in the same decoration module
and share the `plainmark-link` content mark, the `plainmark-inline-marker-hidden`
hide mark, the `plainmark-link-marker` reveal mark, the selection-reveal
predicate, and the click-to-navigate handler. This spec covers only the autolink
code paths; shared infrastructure is referenced rather than re-specified.

The two forms produce different lezer node shapes and are handled by two
different `NodeHandler`s:

- **`autolink_handler`** — keyed on the `Autolink` node (CommonMark
  `<scheme:body>` and `<email>`), shape `Autolink → [LinkMark <, URL, LinkMark >]`.
- **`bare_url_handler`** — keyed on the `URL` node (GFM bare URL), which the GFM
  parser emits as a top-level `URL` with no `Autolink` wrapper and no `LinkMark`
  children. A parent filter narrows it to genuine bare-URL cases.

Both attach `data-plainmark-href`; navigation is identical to `links.md` and is
referenced, not duplicated.

The selection-reveal predicate `should_reveal_for_selection` is shared with the other inline constructs (links,
emphasis, inline code); autolink clauses reference it rather than re-specifying
its rules (see `links.md` LINK-I-3, `inline-code.md` CODE-I-1).

Example notation: `|` = caret, `→` = action/result, `\n` = newline (see README §2).

## R · Rendering

- **AUTO-R-1** — A CommonMark angle-bracket autolink MUST be handled by `autolink_handler`, keyed on the lezer `Autolink` node. The handler MUST require a `URL` child, a first `LinkMark` child, and a distinct last `LinkMark` child (`open !== close`); a node failing any of these MUST produce no decorations.
  _Example:_ `<https://example.com>` parses as `Autolink → [LinkMark <, URL, LinkMark >]` and is decorated; a degenerate `Autolink` missing a `URL` child produces nothing.

- **AUTO-R-2** — The `URL` child byte range of an `Autolink` MUST receive a `Decoration.mark` with class `plainmark-link` carrying a `data-plainmark-href` attribute whose value is the verbatim document slice of that `URL` child (the inner text between `<` and `>`). This mark is emitted in both the revealed and hidden states.
  _Example:_ `<https://example.com>` → mark over `https://example.com` (offsets 1–20) with `data-plainmark-href="https://example.com"`.

- **AUTO-R-3** — When the angle-bracket autolink is not revealed, the opening `<` and closing `>` `LinkMark`s MUST each be hidden by a `plainmark-inline-marker-hidden` mark over their respective ranges, leaving only the URL text visible.
  _Example:_ `see <https://x> end` off-caret → hide `[4,5)` and `[14,15)`, rendering `see https://x end`.

- **AUTO-R-4** — A GFM bare URL MUST be handled by `bare_url_handler`, keyed on the lezer `URL` node. The handler MUST emit exactly one `plainmark-link` `Decoration.mark` over the whole `URL` node range, carrying `data-plainmark-href` equal to the verbatim node slice. There are no markers to hide or reveal.
  _Example:_ `see https://example.com end` → one `plainmark-link` mark over `https://example.com` with `data-plainmark-href="https://example.com"`; no hide marks.

- **AUTO-R-5** — `bare_url_handler` MUST return `[]` when the `URL` node's parent name is in `URL_PARENT_OWNED` (`{Link, Image, Autolink, LinkReference}`), so it never double-decorates a `URL` already owned by the link, image, angle-bracket-autolink, or reference handlers. Any `URL` whose parent is outside that set is, by exhaustion of the GFM parser's `URL` contexts, a bare autolink and MUST be decorated.
  _Example:_ in `[t](https://x)` the `URL` parent is `Link` → `bare_url_handler` skips it; in `https://x` the `URL` parent is `Paragraph` → decorated.

- **AUTO-R-6** `[smoke]` — Both forms' content MUST render as a link: the `plainmark-link` class applies color `--plainmark-link-color` (chain `--vscode-textLink-foreground` → `currentColor`), text-decoration `--plainmark-link-decoration` (default `underline`), and cursor `--plainmark-link-cursor` (default `text`, not `pointer`). On hover, color resolves from `--plainmark-link-color-hover` and decoration from `--plainmark-link-decoration-hover` (default `underline`); the default hover MUST NOT advertise "click to follow" (dual-trigger model). Same mark and theme rules as `links.md` LINK-R-6 / LINK-R-7.
  _Example:_ `https://example.com` renders underlined in the theme's link color with a text (I-beam) cursor.

- **AUTO-R-7** `[smoke]` — Marker hiding for the angle-bracket form MUST use the shared zero-width `inline-block` hide (`width:0; overflow:hidden; vertical-align:top; white-space:nowrap`) via `plainmark-inline-marker-hidden`, never a `Decoration.replace`, so `drawSelection`/`coordsAtPos` keep valid rects and line height stays constant across hide/reveal. Same technique as `links.md` LINK-R-8 / `inline-code.md` CODE-R-5.
  _Example:_ `<https://x>` hidden vs revealed → the line does not change height.

- **AUTO-R-8** — On reveal, the angle-bracket markers MUST instead carry a `plainmark-link-marker` mark (a dimmed-color marker resolving `--plainmark-link-marker-color` → `--vscode-descriptionForeground` → `currentColor`); the hide marks are not emitted. The `URL`-range `plainmark-link` mark is unchanged.
  _Example:_ `<https://x|>` (caret inside) → renders `<https://x>` with `<` and `>` shown dimmed; the URL stays link-styled.

## I · Interaction

- **AUTO-I-1** — For the angle-bracket form, reveal MUST be computed per node by `should_reveal_for_selection(state, node.from, node.to, pointer_down)`: a bare caret anywhere in `[from, to]` reveals; a non-empty selection overlapping the autolink reveals; a selection that strictly covers it on both sides (anchor `< from` AND head `> to`) MUST NOT reveal; boundaries exactly equal to `from`/`to` count as overlap (reveal).
  _Example:_ caret inside `<https://x>` → `<` `>` shown; triple-click-style cover of the whole line → markers stay hidden.

- **AUTO-I-2** — Angle-bracket reveal MUST be node-scoped, not line-scoped: a caret on the autolink's line but outside `[node.from, node.to)` MUST keep `<` and `>` hidden.
  _Example:_ `see <https://x> end|` (caret after `end`) → still renders `see https://x end` with `<` `>` hidden.

- **AUTO-I-3** — Moving the selection off the angle-bracket autolink MUST re-emit the two hide marks on the next decoration rebuild (selection-set update), restoring the collapsed rendering.
  _Example:_ caret moves from inside `<https://x>` to another line → the `<` `>` collapse back to hidden.

- **AUTO-I-4** `[smoke]` — Angle-bracket reveal MUST also be suppressed while a pointer button is held (`pointer_down_field` threaded into the predicate): an in-progress drag keeps `<` and `>` hidden until mouseup. (Headless tests pass `pointer_down` explicitly; live mouse wiring is smoke-verified.) Same gate as `links.md` LINK-I-5.
  _Example:_ press-drag across `<https://x>` → `<` `>` stay hidden mid-drag, reveal on release.

- **AUTO-I-5** — A bare URL has no markers, so it has no reveal state: `bare_url_handler` never consults `should_reveal_for_selection`, never emits hide or marker marks, and its rendering MUST be identical whether or not the caret is inside it.
  _Example:_ caret inside `https://example.com` vs on another line → both render the same underlined URL; nothing appears or disappears.

- **AUTO-I-6** `[smoke]` — Cmd/Ctrl+Click anywhere on either autolink's `plainmark-link` span MUST navigate: the shared click handler dispatches a bubbling `plainmark-link-click` `CustomEvent` whose `detail.href` is the mousedown-snapshot href, and calls `preventDefault`. No autolink-specific click code exists. Same handler as `links.md` LINK-I-6.
  _Example:_ Cmd+Click on `https://example.com` → a `plainmark-link-click` event with `detail.href === "https://example.com"` is dispatched.

- **AUTO-I-7** `[smoke]` — A plain (no-modifier) click on an autolink MUST NOT navigate; it MUST defer to caret placement (return false, no event), regardless of which line held the caret before the click. Navigation requires the Cmd/Ctrl modifier (AUTO-I-6). The mousedown-snapshot href still drives a modified click, stable across the mouseup reveal shift (`links.md` LINK-I-7 / LINK-I-8).
  _Example:_ click `<https://x>` with no modifier → caret moves, no navigation; Cmd+Click `<https://x>` → navigates.

- **AUTO-I-8** `[smoke]` — The full navigation bridge MUST carry the href to the host and open it: the webview document listener forwards `plainmark-link-click` as a `{ type: 'link_click', href }` host message and the host calls `vscode.env.openExternal` on the resolved target. An empty href MUST be dropped at both bridge ends. Same bridge and degenerate-href handling as `links.md` LINK-I-9 / LINK-I-12.
  _Example:_ Cmd+Click on `<mailto:a@b.com>` → opens `mailto:a@b.com`; a `link_click` with empty href → no `openExternal`.

- **AUTO-I-9** `[accepted]` — No autolink-specific keybinding ships (no `<`-wrap toggle, no insert-autolink command, no autoclose handled here); autolinks use the editor's default key handling. → DECISION-POINTS.
  _Example:_ pressing a hypothetical Mod-key on a selection does nothing autolink-specific.

## SP · Source preservation

- **AUTO-SP-1** `[inherits:INV-SP-1]` — Autolink rendering MUST be decoration-only (`Decoration.mark` for content, marker hide, and marker reveal); the `<`, `>`, URL, and any bare-URL bytes are preserved verbatim, and bytes outside the autolink are never touched. No carve-out, no source rewrite.
  _Example:_ `<https://example.com>` and a bare `https://example.com` opened and closed without edits save byte-identical.

- **AUTO-SP-2** — Angle-bracket marker hiding MUST be a view-layer mark only; the `<` and `>` bytes MUST remain in the document and reappear on reveal.
  _Example:_ `<https://x>` rendered (collapsed to `https://x`) then caret-revealed → the source is still `<https://x>` byte-for-byte.

## E · Edge cases

- **AUTO-E-1** — The GFM parser's URL-boundary rules MUST be inherited verbatim, since the href and decoration span come directly from the `URL` node range: trailing punctuation is stripped from the node, and balanced trailing parens are included. Plainmark adds no boundary logic of its own.
  _Example:_ `end. https://x.co.` → the `URL` node (and thus the link span + href) ends at `x.co`, excluding the trailing `.`; `https://x/(a)b` → the whole `https://x/(a)b` is the URL.

- **AUTO-E-2** — A bare email or `www.` / `mailto:` / `xmpp:` autolink recognized by the GFM extension MUST be decorated by `bare_url_handler` the same as a bare `http(s)` URL, because all of them emit a top-level `URL` node under the inline-content parent.
  _Example:_ `contact user@example.com today` → `user@example.com` rendered as a link with `data-plainmark-href="user@example.com"`.

- **AUTO-E-3** — An angle-bracket email autolink (`<user@host>`) MUST be handled by `autolink_handler` like a scheme autolink: the `URL` child carries the href and the `<` / `>` `LinkMark`s hide/reveal.
  _Example:_ `<a@b.com>` off-caret → `<` `>` hidden, `a@b.com` rendered as a link with `data-plainmark-href="a@b.com"`.

- **AUTO-E-4** `[unknown]` — A bare URL inside another block construct (e.g. a blockquote or list item) MUST still be decorated, since the `URL` node's parent is the inner `Paragraph` (not in `URL_PARENT_OWNED`) and the handler fires regardless of further ancestors.
  _Example:_ `> see https://x` → blockquote chrome plus a rendered link around `https://x`.

- **AUTO-E-5** `[unknown]` — A bare URL appearing in an ATX heading MUST still be decorated: the GFM parser emits the `URL` node under `ATXHeading1..6`, which is outside `URL_PARENT_OWNED`, so `bare_url_handler` claims it.
  _Example:_ `# Title https://x` → heading styling plus a rendered link around `https://x`.

- **AUTO-E-6** — A link reference definition's URL (`[ref]: https://x`) MUST NOT be decorated as a bare autolink: its `URL` child's parent is `LinkReference`, which is in `URL_PARENT_OWNED`, so `bare_url_handler` skips it (and no other autolink handler matches). This mirrors `links.md` LINK-E-3 — reference definitions render as plain text.
  _Example:_ `[r]: https://x.io` → renders verbatim, no link styling.

- **AUTO-E-7** `[unknown]` — On the initial cold mount with the default `{anchor: 0}` selection, an angle-bracket autolink not containing offset 0 MUST render collapsed (reveal is node-scoped); one spanning offset 0 renders revealed. A bare URL renders identically regardless of the cold-mount caret (it has no reveal state).
  _Example:_ document `x <https://y>` opened cold (caret at 0, outside) → `<` `>` hidden; `<https://y>` opened cold (caret at 0, on `<`) → revealed.

- **AUTO-E-8** — When both forms appear on one line, each is owned by its own handler with no overlap: the angle-bracket `URL` child has an `Autolink` parent (skipped by `bare_url_handler`), and the bare `URL` has a non-owned parent (claimed by `bare_url_handler`).
  _Example:_ `<https://a> and https://b` → `<https://a>` gets the angle-bracket treatment (markers hide/reveal); `https://b` gets a plain bare-URL link mark.
