# Block-vs-inline isolation

Inline tag in prose: paragraph with <kbd>Ctrl+C</kbd> shortcut.

<div class="block-just-after-prose">block-level chrome here</div>

Another prose paragraph with <sub>n</sub> subscript — should NOT inherit block chrome.

<!-- a block comment with NO inline marks inside its content -->

Final prose with <mark>inline mark</mark>.

Verify:

- `.plainmark-html-block` appears on the `<div>` line and on the `<!-- -->` line.
- `.plainmark-html-inline` appears around `<kbd>`, `</kbd>`, `<sub>`, `</sub>`, `<mark>`, `</mark>` — NOT around any text inside the block-level constructs.
- The prose lines (1, 3, 6) have no `.plainmark-html-block` class.
