---
prefix: HR
title: Horizontal Rules
kind: construct
---

# Horizontal Rules — Specification

Normative behavior for thematic-break (horizontal-rule) rendering, interaction,
and byte guarantees. A horizontal rule is a CommonMark thematic break: a line of
three or more `-`, `*`, or `_` characters, optionally interspersed with spaces.

Example notation: `|` = caret, `→` = action/result, `\n` = newline (see README §2).

## R · Rendering

- **HR-R-1** — A line that the parser classifies as a `HorizontalRule` node MUST receive a `Decoration.line` carrying classes `plainmark-hr` and `plainmark-collapse-adjacent`, anchored at the start of the rule's line.
  _Example:_ `---\n` → the line element carries `class="plainmark-hr plainmark-collapse-adjacent"`.

- **HR-R-2** — The three thematic-break spellings `---`, `***`, and `___` MUST each produce one and only one `plainmark-hr` line decoration.
  _Example:_ `---`, `***`, and `___` each render as a single rule line; no spelling is skipped.

- **HR-R-3** `[smoke]` — The raw rule source bytes MUST be visually hidden by rendering the line text `color: transparent`; the visible bar is drawn separately (HR-R-4), not by styling the characters themselves.
  _Example:_ `***` shows a horizontal bar with no visible `*` glyphs.

- **HR-R-4** `[smoke]` — The visible rule MUST be drawn by a `::before` pseudo-element on the `plainmark-hr` line: a full-width `border-top` positioned at the line's vertical centre (`top: 50%`, `left: 0`, `right: 0`, `position: absolute`), with the line itself `position: relative`.
  _Example:_ a single hairline spans the full editor width, centred vertically within the rule's line box.

- **HR-R-5** — Rendering MUST be reveal-agnostic: there is no caret-on-line vs caret-off-line axis. The decoration and `::before` bar are emitted identically regardless of caret position.
  _Example:_ `---` renders the same bar whether the caret is elsewhere or sitting inside the `---` line.

- **HR-R-6** `[smoke]` — Vertical spacing around the rule MUST be applied as `padding` (not `margin`) on the `plainmark-hr` line, driven by `--plainmark-hr-padding-y` (default `0.4em`) on the block axis with zero inline padding, so CM6's `.cm-line` height map measures the spacing. A non-doc-top rule additionally stacks the paragraph gap on its padding-top (PARA-R-7; (0,5,0) over the tripled gap rule), and the drawn bar re-centres on the source glyph line via `top: calc(50% + gap / 2)` — plain `top: 50%` of the now top-heavy padded box would sit the bar `gap / 2` above the hidden `---` bytes.
  _Example:_ `text\n***\ntext` shows a paragraph gap plus `padding-y` above the bar and `padding-y` below it; the bar stays centred on its own source line.

- **HR-R-7** — The bar's thickness MUST come from `--plainmark-hr-width` (default `1px`) and its colour from `--plainmark-hr-color`, which defaults through `--vscode-textSeparator-foreground` → `--vscode-contrastBorder` → `currentColor`.
  _Example:_ overriding `--plainmark-hr-color: red` repaints the bar red; with no override it follows the active VS Code theme's separator colour.

## I · Interaction

- **HR-I-1** `[smoke]` — Placing the caret on the rule line MUST NOT reveal the raw `---` / `***` / `___` source; the bytes stay `color: transparent` and the bar stays visible (consequence of HR-R-5).
  _Example:_ click onto the `---` line → the caret sits on the line but the markers remain hidden and the bar remains shown.

- **HR-I-2** — The horizontal rule contributes no construct-specific keymap, autocomplete, click target, or command; all caret motion and editing on the rule line MUST follow default CodeMirror behavior.
  _Example:_ ArrowDown / ArrowUp / Backspace on the `---` line behave exactly as on any plain line; no HR-specific override fires.

- **HR-I-3** — Editing the rule's text so it no longer matches a thematic break MUST drop the `plainmark-hr` decoration on the next decoration build (the line reverts to plain rendering); restoring a valid break re-applies it.
  _Example:_ `---|` → type `x` → `---x` renders as plain text (no bar); deleting the `x` restores the rule.

## SP · Source preservation

- **HR-SP-1** `[inherits:INV-SP-1]` — Horizontal-rule rendering is render-only. No HR decoration or theme rewrites any source bytes; bytes outside the rule's line are preserved verbatim through any edit.
  _Example:_ in `intro\n\n---\n\noutro`, interacting with the rule leaves `intro`, the blank lines, and `outro` byte-identical.

- **HR-SP-2** `[inherits:INV-SP-2]` — The rule MUST NOT normalize its own spelling, length, or spacing: `-----`, `* * *`, and `___` are left exactly as authored; only the table widget may re-serialize source.
  _Example:_ a `- - -` rule is never rewritten to `---`; the bytes on disk are unchanged after rendering.

## E · Edge cases

- **HR-E-1** — A `---` line directly under a non-blank text line MUST be treated as a setext heading underline, not a horizontal rule: the parser yields a heading (no `plainmark-hr` decoration).
  _Example:_ `Title\n---\n` → setext H2 (`Title`), no rule bar; `Title\n\n---\n` (blank line between) → paragraph + horizontal rule.

- **HR-E-2** — A leading `---` that opens YAML frontmatter MUST be governed by the frontmatter parse, not the horizontal-rule handler; a `---` fence that participates in frontmatter MUST NOT receive `plainmark-hr`.
  _Example:_ `---\ntitle: x\n---\n# Body` → the opening/closing `---` are frontmatter fences, not rules.

- **HR-E-3** — Spaced thematic-break forms MUST render as rules: internal spaces between markers do not disqualify the break.
  _Example:_ `- - -`, `* * *`, and `___ ___ ___`-style spaced forms each render one rule bar.

- **HR-E-4** — A break of more than three markers MUST render identically to the three-marker form (one bar, same chrome); marker count beyond three is not significant.
  _Example:_ `-----` and `**********` each render the same single rule as `---`.

- **HR-E-5** `[smoke]` — An empty line immediately adjacent to the rule MUST collapse via the shared `plainmark-collapse-adjacent` class (the same trap-line collapse used by blockquotes), so the rule does not accrue a doubled vertical gap from a neighbouring blank line.
  _Example:_ `text\n\n---\n` — the blank line above the rule collapses to ~0px when the caret is off it, leaving the rule's own padding (paragraph gap + `padding-y`, HR-R-6) as the sole gap.

- **HR-E-6** — The rule line decoration MUST be anchored at the line start derived from the node's `from` (`doc.lineAt(node.from).from`), so leading-whitespace variants still decorate the whole line.
  _Example:_ a thematic break parsed with a small leading indent still receives the `plainmark-hr` line decoration on its line.
