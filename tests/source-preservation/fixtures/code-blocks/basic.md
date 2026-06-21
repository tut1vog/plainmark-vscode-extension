# Code Block Source Preservation

Fenced block with info string:

```ts
const greeting = (name: string): string => `Hello, ${name}!`;
console.log(greeting('world'));
```

Fenced block, no info string:

```
plain text
no language
```

Fenced block with unknown language:

```doesnotexist
custom syntax
```

Fenced block with whitespace-padded info:

```  python  
def hello():
    pass
```

Indented (4-space) block:

    const indented = true;
    if (indented) {
      run();
    }

Block with nested backtick lines (single backticks inside a triple-fenced block):

```js
const example = `template ${literal}`;
const inline = `not a fence`;
```

Block ending without trailing newline-then-fence, just bytes:

```
final line
```
