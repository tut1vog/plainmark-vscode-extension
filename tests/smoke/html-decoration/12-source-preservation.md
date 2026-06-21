# Source preservation roundtrip

Open this file. **Do not edit.** Save (Cmd+S / Ctrl+S). In a terminal: `git diff tests/smoke/html-decoration/12-source-preservation.md`. Output: empty.

Standard block:

<div class="x" id="y" data-z="z">
  <p>multi-line</p>
  <span>preserved verbatim</span>
</div>

Comment block:

<!--
multi-line
HTML comment
-->

Inline tags:

Paragraph with <kbd>Ctrl+C</kbd>, <sub>n</sub>, <sup>2</sup>, <mark>highlight</mark>, and <br/>.

Inline comment: text <!-- inline --> continues.

Quoted attribute: <span class="a-b" data-x="1 2 3">value with spaces</span>.

Self-closing without space: <br/>and<img src="x.png"/>at end of line.

HTML inside fenced code (should render as code, not HTML chrome):

```html
<div>this is code, not an HTML block</div>
<kbd>also not an inline HTMLTag — it's code</kbd>
```

HTML inside inline code (also not an HTMLTag):

The `<kbd>` tag is used for keyboard input.

Verify:

- `git diff` after a no-op save shows zero changes.
- The fenced-code block renders with `.plainmark-fenced-code` chrome (`data-language="html"` label), NOT `.plainmark-html-block`.
- The inline backtick code renders with `.plainmark-inline-code` chrome, NOT `.plainmark-html-inline`.

INV-SP-1 invariant: zero source mutation by the HTML handler.
