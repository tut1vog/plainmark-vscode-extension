---
prefix: LINK
title: Links
kind: construct
---

# Links — Specification

Normative behavior for Markdown inline links (`[text](url)`, with optional
link-title), their marker reveal, styling, and click-to-navigate handling.
Covers the lezer `Link` node only. Autolinks (`<url>`, GFM bare URLs) are a
separate construct (`autolinks.md`) though they share the link handler, the
`plainmark-link` mark, and the click handler; images (`![alt](url)`) and
footnotes (`[^1]`) are separate constructs. Reference links (`[text][ref]`)
and reference definitions (`[ref]: url`) are **not** handled — see LINK-E-2 /
LINK-E-3. Links are inline decorations emitted by the `link_handler`
`NodeHandler`: one content `Decoration.mark` over the bracketed
text plus selection-aware marker decorations. No block widget, no source rewrite.

The selection-reveal predicate `should_reveal_for_selection` is shared with the
other inline constructs (emphasis, inline code, autolinks); link clauses
reference it rather than re-specifying its rules (see `inline-code.md` CODE-I-1).

Example notation: `|` = caret, `→` = action/result, `\n` = newline (see README §2).

## R · Rendering

- **LINK-R-1** — An inline link MUST be handled by `link_handler`, keyed on the lezer `Link` node. Its `LinkMark` children MUST be at least four in count (`[`, `]`, `(`, `)`); a `Link` node with fewer than four `LinkMark` children MUST produce no decorations.
  _Example:_ in `see [t](u) end`, the `Link` spans `[4,10)` with `LinkMark` at `[`=4, `]`=6, `(`=7, `)`=9.

- **LINK-R-2** — The bracketed link text (between the opening `[` and the closing `]`, i.e. `[open.to, close_bracket.from)`) MUST receive a `Decoration.mark` with class `plainmark-link` carrying a `data-plainmark-href` attribute whose value is the document slice of the `URL` child (empty string when there is no `URL` child).
  _Example:_ `[t](u)` → mark over `t` (offsets 5–6) with `data-plainmark-href="u"`.

- **LINK-R-3** — The href attribute MUST be the verbatim `URL`-child slice; absolute and relative targets are captured as-is, with resolution deferred to the host.
  _Example:_ `[Plainmark](https://example.com)` → `data-plainmark-href="https://example.com"`; `[docs](./guide)` → `data-plainmark-href="./guide"`.

- **LINK-R-4** — When the link is not revealed, the opening `[` MUST be hidden by a `plainmark-inline-marker-hidden` mark over `[open.from, open.to)`, and everything from the closing `]` through the closing `)` MUST be hidden by a single `plainmark-inline-marker-hidden` mark over `[close_bracket.from, close_paren.to)`. Only the bracketed text remains visible.
  _Example:_ `see [t](u) end` off-caret → hide `[4,5)` and `[6,10)`, rendering `see t end`.

- **LINK-R-5** — The single trailing hide range MUST cover the closing bracket, the parenthesized target, and the link title together: `]`, `(`, the `URL`, any `LinkTitle`, and `)` are all collapsed by the one `[close_bracket.from, close_paren.to)` mark. There is no separate title decoration.
  _Example:_ `[t](u "the title")` off-caret → the `](u "the title")` run is hidden as one unit; only `t` shows.

- **LINK-R-6** `[smoke]` — The `plainmark-link` content MUST render as a link: color `--plainmark-link-color` (chain `--vscode-textLink-foreground` → `currentColor`), text-decoration `--plainmark-link-decoration` (default `underline`), and cursor `--plainmark-link-cursor` (default `text`, not `pointer`).
  _Example:_ `[t](u)` renders `t` underlined in the theme's link color with a text (I-beam) cursor.

- **LINK-R-7** `[smoke]` — On hover the content MUST resolve color from `--plainmark-link-color-hover` (chain `--vscode-textLink-activeForeground` → `--vscode-textLink-foreground` → `currentColor`) and decoration from `--plainmark-link-decoration-hover` (default `underline`). The default hover is a no-op-styled override (it MUST NOT advertise "click to follow", per the dual-trigger model).
  _Example:_ hovering `[t](u)` keeps the underline and shifts to the active-link color; the cursor stays a text cursor, not a pointer.

- **LINK-R-8** `[smoke]` — Marker hiding MUST be a zero-width `inline-block` (`width:0; overflow:hidden; vertical-align:top; white-space:nowrap`) via `plainmark-inline-marker-hidden`, never a `Decoration.replace`, so `drawSelection`/`coordsAtPos` keep valid rects and line height stays constant across hide/reveal.
  _Example:_ `[t](u)` hidden vs revealed → the line does not change height.

## I · Interaction

- **LINK-I-1** — When the link is revealed, all four `LinkMark` ranges (`[`, `]`, `(`, `)`) MUST instead receive a `plainmark-link-marker` mark (no hide marks emitted), so the full raw syntax becomes visible while the bracketed text keeps its `plainmark-link` style. Reveal is computed per node by `should_reveal_for_selection(state, node.from, node.to, pointer_down)`.
  _Example:_ `see [t|](u) end` (caret in the text) → renders `[t](u)` with all brackets/parens shown; `t` stays link-styled.

- **LINK-I-2** — Reveal MUST be node-scoped, not line-scoped: a caret on the link's line but outside `[node.from, node.to)` MUST keep the markers hidden.
  _Example:_ `see [t](u) end|` (caret after `end`, same line) → still renders `see t end` with brackets/target hidden.

- **LINK-I-3** — Reveal MUST follow the shared selection predicate: a bare caret anywhere in `[from, to]` reveals; a non-empty selection overlapping the link reveals; a selection that strictly covers the link on both sides (anchor `< from` AND head `> to`) MUST NOT reveal; selection boundaries exactly equal to `from`/`to` count as overlap (reveal).
  _Example:_ select offsets 0–14 over `see [t](u) end` → link stays hidden (strict cover); select exactly 4–10 → revealed (boundary-equal).

- **LINK-I-4** — Moving the selection off the link MUST re-emit the two hide marks on the next decoration rebuild (selection-set update), restoring the collapsed rendering.
  _Example:_ caret moves from inside `[t](u)` to another line → the link collapses back to `t`.

- **LINK-I-5** `[smoke]` — Reveal MUST also be suppressed while a pointer button is held (`pointer_down_field` threaded into the predicate): an in-progress drag keeps the markers hidden until mouseup. (Headless tests pass `pointer_down` explicitly; live mouse wiring is smoke-verified.)
  _Example:_ press-drag across `[t](u)` → brackets stay hidden mid-drag, reveal on release.

- **LINK-I-6** `[smoke]` — Cmd/Ctrl+Click anywhere on the link span MUST navigate: the click handler dispatches a `plainmark-link-click` DOM `CustomEvent` (bubbling) whose `detail.href` is the mousedown-snapshot href, and calls `preventDefault`.
  _Example:_ Cmd+Click on `t` in `[t](u)` → a `plainmark-link-click` event with `detail.href === "u"` is dispatched.

- **LINK-I-7** `[smoke]` — A plain (no-modifier) click on a link MUST NOT navigate; it MUST defer to caret placement (the click handler returns false and dispatches no event), regardless of which line held the caret before the click. Navigation requires the Cmd/Ctrl modifier (LINK-I-6).
  _Example:_ click `[t](u)` with no modifier → caret moves into the text, no navigation; Cmd+Click `[t](u)` → navigates.

- **LINK-I-8** `[smoke]` — The click target href MUST come from the `mousedown` snapshot, not from re-resolving the element under the cursor at `click` time, because the mouseup-triggered reveal shifts DOM layout (hidden markers flip to inline) before `click` fires.
  _Example:_ press-release on `[t](u)` where mouseup reveals the markers → navigation still targets `u` even though the element under the final coords changed.

- **LINK-I-9** `[smoke]` — An empty href MUST be dropped at both bridge ends: the webview listener drops a missing/empty `detail.href`, and the host drops a missing/empty `link_click` message href, so a degenerate link never reaches `openExternal`.
  _Example:_ a `plainmark-link-click` with `detail.href === ""` → logged and dropped, no host message; a `link_click` host message with empty href → no `openExternal`.

- **LINK-I-10** — A link click on a span whose `mousedown` target carries no `data-plainmark-href`, or a non-primary mouse button, MUST NOT navigate (the handler returns false, leaving default handling).
  _Example:_ right-click on `[t](u)` → no `plainmark-link-click` event.

- **LINK-I-11** `[accepted]` — No link-specific keybinding ships (no insert-link command producing `[text](url)`, no autoclose handled here); links use the editor's default key handling. The construct-agnostic selection-wrap (MRS-W-1) does surround a selection with `[ ]`, but that is not link-aware — it inserts brackets only, never the `(url)` slot.
  _Example:_ pressing a hypothetical Mod-K on a selection does nothing link-specific; typing `[` over `text` yields `[text]` (plain bracket wrap), not `[text]()`. → DECISION-POINTS.

- **LINK-I-12** `[smoke]` — The full navigation bridge MUST carry the href to the host and open it: the webview document listener forwards the `plainmark-link-click` event as a `{ type: 'link_click', href }` host message, and the host calls `vscode.env.openExternal` on the resolved target. A scheme-bearing href (`https:`, `mailto:`, `file:`, …) opens verbatim; a relative href resolves against the document URI's directory.
  _Example:_ Cmd+Click on `[Plainmark](https://example.com)` → opens `https://example.com`; Cmd+Click on `[docs](./guide)` in `/proj/page` → opens `/proj/guide`.

## SP · Source preservation

- **LINK-SP-1** `[inherits:INV-SP-1]` — Link rendering MUST be decoration-only (`Decoration.mark` for content, markers, and marker-hiding); the `[`, `]`, `(`, `)`, URL, and title bytes are preserved verbatim, and bytes outside the link are never touched.
  _Example:_ `[t](u "title")` opened and closed without edits saves byte-identical.

- **LINK-SP-2** — Marker hiding MUST be a view-layer mark only; the syntax bytes MUST remain in the document and reappear on reveal.
  _Example:_ `[t](u)` rendered (collapsed to `t`) then caret-revealed → the source is still `[t](u)` byte-for-byte.

## E · Edge cases

- **LINK-E-1** — A link whose opening `[` is not at `node.from`, or whose closing `)` is not at `node.to`, MUST produce no decorations; the same holds for an empty bracketed text (`open.to >= close_bracket.from`).
  _Example:_ `[](u)` (empty text) → no link decoration; the literal `[](u)` renders as plain text.

- **LINK-E-2** `[divergent]` — A reference link `[text][ref]` MUST currently receive no `plainmark-link` decoration: the handler only matches the inline `Link` shape requiring four `LinkMark` children ending in `)`, so the `LinkReference` node is unhandled and the raw `[text][ref]` renders as plain text. Correct behavior would render reference links as links and reveal/hide their markers like inline links. → BACKLOG.
  _Example:_ `[text][ref]` → renders the literal `[text][ref]` with no link styling and no marker hiding.

- **LINK-E-3** `[divergent]` — A link reference definition `[ref]: url` MUST currently receive no link decoration: its `URL` child has a `LinkReference` parent (in `URL_PARENT_OWNED`), so the bare-URL handler skips it and no other handler claims it. Correct behavior would at minimum style or hide the definition consistently with the reference links it backs. → BACKLOG.
  _Example:_ `[r]: https://x.io` → renders verbatim as plain text, no link styling.

- **LINK-E-4** — A link title (`[t](u "title")`) MUST NOT be separately extracted or styled; it is swallowed by the trailing hide range (LINK-R-5) when collapsed and shown verbatim when revealed. The href is taken from the `URL` child only, never the title.
  _Example:_ `[t](u "x")` revealed → `(u "x")` shown verbatim; href is `u`, not `u "x"`.

- **LINK-E-5** — An image `![alt](url)` MUST NOT be decorated by this handler: lezer parses it as an `Image` node (not `Link`), so `link_handler` never fires and the URL child is owned by the image construct.
  _Example:_ `![a](pic.png)` → no `plainmark-link` decoration from this handler.

- **LINK-E-6** `[unknown]` — A link nested inside another block construct (e.g. a blockquote or list item) MUST still be decorated, since the handler fires on any `Link` node reached during viewport iteration regardless of ancestor.
  _Example:_ `> see [t](u)` → blockquote chrome plus a rendered, collapsible link around `t`.

- **LINK-E-7** `[unknown]` — On the initial cold mount with the default `{anchor: 0}` selection, a link not containing offset 0 MUST render collapsed (reveal is node-scoped); a link spanning offset 0 renders revealed.
  _Example:_ document `x [t](u)` opened cold (caret at 0, outside the link) → collapsed to `x t`; document `[t](u)` opened cold (caret at 0, on `[`) → revealed.
