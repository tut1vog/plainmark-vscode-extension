Mixed labels: numeric[^1], string[^foo], dashed[^bar-2], alphanumeric[^A_B_3].

Reference inside a code span: `[^1]` — should NOT render as a footnote.

```
fenced code: [^1] should NOT render as a footnote here either
```

Trailing text after the fenced block.

[^1]: numeric
[^foo]: string label
[^bar-2]: dashed and digit
[^A_B_3]: alnum with underscores
