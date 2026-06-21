# Blockquote depth-aware chrome — smoke fixtures

10 markdown files, one per smoke test case for blockquote depth-aware chrome. Open each in the Extension Development Host (F5) and verify the rendering against the table below.

**Invariant**: in no file should the raw `>` byte ever render. The chrome (bars + indent) IS the marker.

## Cases

| # | File | Expected render |
|---|---|---|
| 1 | `01-single-level.md` | 1 bar at depth 1; content indented ~1em past the bar |
| 2 | `02-nested-two-deep.md` | **2 stacked bars** at offsets 0 and 1em; content indented ~2em |
| 3 | `03-nested-three-deep.md` | 3 bars at 0, 1em, 2em; content at ~3em |
| 4 | `04-cap-at-depth-six.md` | 6 bars cap (depth 7 stays at depth-6 visual) |
| 5 | `05-multi-line-continuous.md` | bars appear continuous across all 3 lines (no vertical gap) |
| 6 | `06-lazy-continuation.md` | line 2 (no `>` prefix in source) shares the depth-1 chrome — Lezer's lazy continuation per CommonMark §5.1 rule 2 |
| 7 | `07-blank-line-inside.md` | continuous depth-1 chrome across all 3 lines; middle line empty |
| 8 | `08-two-adjacent.md` | **two separate** chromes; blank line between them is plain |
| 9 | `09-mixed-depth.md` | line 1: 1 bar; line 2: 2 bars; line 3: 1 bar |
| 10 | `10-no-space-marker.md` | depth-1 chrome; `foo` immediately after the (hidden) `>` |

## Theming axis

Open DevTools on the EDH webview, inspect a depth-2 line in `02-nested-two-deep.md`, and confirm computed style:

- `padding-left: 2em` (resolves from `calc(2 * 1em)`)
- `padding-top: 0.5em` and `padding-bottom: 0.5em`
- `background-image` shows two `linear-gradient(...)` entries
- `background-position: 0px 0px, 16px 0px` (16px ≈ 1em at default editor font-size)

## Regression axis

- Tables in any of these files (none included intentionally) should still edit normally.
- Headings, links, lists, task lists render unchanged.
- Typing into a normal paragraph should not surface blockquote chrome.

## NOT in scope here — empty-quote-line editing affordances

- Enter on `> first` auto-prefixing the next line with `> ` — currently produces a raw newline.
- Enter on an empty `> ` exiting the blockquote in one keypress — currently requires manual edit.
- Backspace at the marker stripping `> ` atomically — currently strips one (hidden) byte at a time.

These all unlock with the `markdownKeymap` wiring for empty-quote-line editing.
