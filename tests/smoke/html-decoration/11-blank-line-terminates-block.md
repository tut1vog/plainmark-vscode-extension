# Blank line terminates types 6 and 7 (CommonMark §4.6)

Per CommonMark, types 6 and 7 (generic tag blocks) terminate on a blank line. Plainmark inherits this from `@lezer/markdown`.

A `<div>` block that terminates at the blank line below:

<div class="example">
  inner text on line 2

This paragraph is NOT inside the `<div>` — the blank line above terminated the HTML block. The paragraph should render as plain prose.

</div>

The closing `</div>` above is ALSO not part of the original HTML block; it renders as a one-line HTMLBlock (the parser sees an opening generic-tag-on-its-own-line and the trailing blank line below).

Plain prose at the end.

Verify:

- Lines 1–2 of the `<div>` block carry `.plainmark-html-block` chrome.
- "This paragraph is NOT inside..." does NOT carry `.plainmark-html-block` — plain prose.
- The lone `</div>` line carries `.plainmark-html-block` chrome on its own.

This is the Obsidian "multi-line HTML rendering correctly in live preview but not in render mode" papercut. Plainmark's styled-source v1 makes the disconnect visible — users see the block boundary in the source itself.
