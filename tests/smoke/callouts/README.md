# Callout chrome — smoke fixtures

16 markdown files for manual F5 verification of callout chrome. Open each in the Extension Development Host and verify the rendering / interaction against the table below.

**Invariants** (must hold for every file):
- Source bytes never mutated by Plainmark. Save → `git diff` shows zero changes (no callout-side carve-out per `docs/spec/callouts.md`).
- Raw `>` quote markers never visible — chrome replaces them (inherited from blockquote chrome).
- Blockquote multi-bar chrome does NOT appear on callout lines (`docs/spec/callouts.md`); plain blockquotes still get it.
- Per-type accent color comes from `--vscode-charts-<color>` — change VS Code theme (Cmd+K Cmd+T → Dark Modern / Light Modern / High Contrast) and the accents follow the theme palette.

## How to F5

1. Open the repo in VS Code.
2. Press **F5** → "Run Extension" (Extension Development Host launches).
3. In the EDH, open one of the fixture files (`File → Open` → navigate to `tests/smoke/callouts/`).
4. Right-click the file in the EDH → `Open With...` → `Plainmark Editor` (or set Plainmark as default for `.md` in the EDH window).
5. Verify against the case row below.

## Passive-render cases

| # | File | What to verify |
|---|---|---|
| 1 | `01-five-canonical-types.md` | Five distinct accent colors + five distinct icons. Note=blue (info), Tip=green (light-bulb), Important=purple (report), Warning=yellow (alert-triangle), Caution=red (stop). Title text under each icon. |
| 2 | `02-bare-callout.md` | Header line renders with icon + "Note" title; NO body chrome below (the paragraph after is plain text, not styled). |
| 3 | `03-custom-title.md` | Custom titles render in place of the canonical "Note" / "Warning". The `[!TYPE] <title>` source bytes are hidden. |
| 4 | `04-case-insensitive.md` | All three render identically (note accent + "Note" title). Lowercase source preserved on save. |
| 5 | `05-unknown-type.md` | All three render as callouts with a muted-gray accent (the `descriptionForeground` neutral) and a question-mark-style icon. Titles: "Hint", "Failure", "Info". |
| 6 | `06-fold-markers.md` | Header shows a static chevron after the title: `▸` for `-`, `▾` for `+`. Hover the chevron → tooltip "Collapsibility coming in a later release". **Body remains visible** (fold is visual-only in v1, no click handler). |
| 7 | `07-whitespace-variants.md` | All three detect as callouts (the marker-prefix regex tolerates one space, no space, and trailing space). The trailing-whitespace caution has no custom title. |
| 8 | `08-multi-paragraph.md` | Continuous accent chrome across all five lines including the blank `>` separators. |
| 9 | `09-suppression-vs-plain-blockquote.md` | Visually inspect: plain blockquotes show the multi-bar gradient bar; the callout in the middle does NOT have it. Plain blockquote chrome returns after the callout. |
| 10 | `10-marker-on-wrong-line.md` | Renders as a plain blockquote (multi-bar chrome). `[!NOTE]` on line 2 is NOT recognized — strongest cross-engine invariant (CALL-E-2). |
| 11 | `11-pipe-syntax.md` | **Doc-vs-impl divergence checkpoint.** Renders as a plain blockquote, NOT as an unknown-type callout. CALL-E-5 in `docs/spec/callouts.md` records the supersession. |
| 12 | `12-nested-callout.md` | First block: outer is the NOTE callout; the inner `> >` does not stack additional callout chrome. Second block: plain blockquote at depth 1 + plain blockquote at depth 2 (no callout chrome — matches GitHub "cannot be nested"). |

## Interaction cases

### Reveal cycle (use `13-reveal-cycle.md`)
- [ ] Park caret on the body line. Header shows icon + title widget; raw `[!NOTE]` hidden.
- [ ] Click into the header line. Widget collapses; raw `[!NOTE] Title to edit` reappears.
- [ ] Edit the type to `[!WARNING]` in-place. Still revealed.
- [ ] Arrow off the line. Widget re-renders with the new accent + icon for `Warning`.
- [ ] **Quote marker `>` stays hidden** in revealed state. The chrome is the marker.

### Empty-quote-line exit inside a callout (use `14-empty-quote-exit.md`)
- [ ] Park caret at the end of the empty `> ` line.
- [ ] Press **Enter once**. The empty `> ` marker should strip in a single keystroke; caret should land on a new plain line below the callout.
- [ ] Add `> > ` (nested) on top of an existing callout and repeat — single Enter at any depth.

### Enter-at-doc-start affordance (use `16-enter-at-doc-start.md`)
- [ ] Place caret at offset 0 (line 1 col 0, before the callout chrome).
- [ ] Press **Enter once**. The document grows by `\n` at the top; the caret lands on the new empty line 1 above the callout (NOT on the callout line itself).
- [ ] Type a few characters — they land on the new line 1.
- [ ] Cmd+Z reverts the insertion in one undo (single atomic transaction).
- [ ] Try the same in `01-five-canonical-types.md`, `02-bare-callout.md` — affordance is construct-agnostic and project-wide; works for any top-of-doc construct (heading, blockquote, list, HR, math block, code block, table, plain paragraph).
- [ ] Press Enter at offset 5 (mid-line) — default Enter behavior fires (markdown continuation / blockquote-empty-line-exit / etc.). The doc-start affordance only fires at offset 0.

### Source preservation (use `15-source-preservation.md`)
- [ ] Open the file. **Do not edit.** Press Save (Cmd+S / Ctrl+S).
- [ ] In a terminal: `git diff tests/smoke/callouts/15-source-preservation.md`. Output: empty.
- [ ] Repeat with `01-five-canonical-types.md`, `06-fold-markers.md`, `12-nested-callout.md`.
- [ ] The fenced code block `> [!NOTE]` inside `15-source-preservation.md` should render as plain code text, not as a callout (Lezer parses it as `FencedCode`, the Blockquote handler doesn't fire).

## DevTools spot-checks

Open DevTools on the EDH webview (`Help → Toggle Developer Tools` in the EDH window — note that the `console.log` calls go to the EDH's own DevTools, not the launching VS Code window).

Inspect a callout header line in `01-five-canonical-types.md` and confirm:

- Tag is `<div>` with `class="cm-line plainmark-callout plainmark-callout-header"`.
- `data-callout-type="note"` (etc. for the other types).
- `role="note"`, `aria-label="Note"` (or the custom title).
- Computed style: `border-left: 4px solid var(--vscode-charts-blue, #4dafff)` for Note; appropriate accent for each type.
- Background uses `color-mix(in srgb, ..., 10%, transparent)` — ~10% tint of the accent.

Inspect the title widget (`.plainmark-callout-title` span) and confirm:

- Contains a `.plainmark-callout-icon` span with `aria-hidden="true"` and an inline `<svg>` with `width="16" height="16" fill="currentColor"`.
- Contains a `.plainmark-callout-title-text` span with the title string.
- For fold-marker callouts (file 6): also a `.plainmark-callout-fold-marker` span with `▸` or `▾`, `aria-hidden="true"`, `title="Collapsibility coming in a later release"`.

Inspect a body line and confirm:

- `class="cm-line plainmark-callout plainmark-callout-body"`.
- `data-callout-type` matches the header.
- Same accent border-left + tinted background.
- No `data-blockquote-depth` attribute (blockquote multi-bar chrome must be absent).

Confirm a plain blockquote line (e.g. in `09-suppression-vs-plain-blockquote.md`) still has:

- `class="cm-line plainmark-blockquote"`.
- `data-blockquote-depth="1"` (or higher).
- Stacked background bars.

## Theme-switching axis

- [ ] Switch to **Light Modern** (`Cmd+K Cmd+T`). Accents follow `--vscode-charts-*` palette — Note=blue, Tip=green, etc. should remain visually distinct. **Known WCAG defect**: Warning's title text may be marginally low-contrast on Light Modern (~4.3:1 vs 4.5:1 AA bar) — same as VS Code's own warning squiggles. Accepted.
- [ ] Switch to **High Contrast Dark**. Background tint may render fully transparent (HC Dark's `textBlockQuote-background` is `null`); accent border alone provides the visual.
- [ ] Switch to **High Contrast Light**. Same expectations.

## Regression axis

- [ ] Plain blockquotes in `09-suppression-vs-plain-blockquote.md` and `10-marker-on-wrong-line.md` still get blockquote multi-bar chrome.
- [ ] Empty-quote-line exit still works on a plain (non-callout) blockquote — pick any `tests/smoke/blockquote-chrome/` file.
- [ ] Tables, headings, links, lists, task lists, footnotes, horizontal rules render unchanged.
- [ ] No `console.error` / `console.warn` in the EDH webview DevTools.

## VS Code Web (`vscode.dev`) sanity

- [ ] Open `01-five-canonical-types.md` in `vscode.dev` with Plainmark loaded. Accents render. Icons render (inline SVGs — no `font-src` widening required).
- [ ] No `fs` / `path` / `child_process` boot errors in the webview DevTools console.

## What's intentionally NOT covered

- **`> [!` autocomplete** for type selection — deferred.
- **Full collapsibility UX** (click chevron to fold body) — deferred per `docs/spec/callouts.md`.
- **Obsidian-extended type catalog** (13 types + 14 aliases) — deferred per `docs/spec/callouts.md`. `[!HINT]` renders as unknown, not as tip alias.
- **`data-callout-metadata` pipe syntax** — deferred per `docs/spec/callouts.md`. Renders as plain blockquote (file 11).
- **Interactive type-change UX** (right-click gutter menu) — deferred per `docs/spec/callouts.md`. Users edit type bytes directly via reveal cycle.
- **Nested callout chrome on the inner Blockquote** — explicit non-goal per `docs/spec/callouts.md` (matches GitHub).

## Padded-adjacency caveat

Callout header/body lines stack their own padding the same way headings, HR, and footnote definitions do (the `plainmark-collapse-adjacent` spacing model — THEME-S-2 / THEME-S-3). A callout immediately followed by a heading or HR will compound paddings; cosmetic, not a bug. The project-wide fix is deferred until the full construct set lands.
